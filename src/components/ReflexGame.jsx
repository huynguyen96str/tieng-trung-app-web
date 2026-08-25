import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ReflexGame.css';
import { ttsService } from '../services/TtsService';

export function ReflexGame({ lessons = [], selectedLesson, progressService, handleSpeak }) {
  // Game Configuration State
  const [selectedGameMode, setSelectedGameMode] = useState('Blitz'); // 'Blitz' | 'Audio' | 'Survival' | 'WeakWords'
  const [selectedScope, setSelectedScope] = useState('AllLessons'); // 'AllLessons' | 'CurrentLesson' | 'Sentences'
  const [blitzTimeSetting, setBlitzTimeSetting] = useState(3); // 3 or 5
  const [isAutoPronounce, setIsAutoPronounce] = useState(true);
  const [isTtsSpeaking, setIsTtsSpeaking] = useState(false);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('reflex_game_high_score');
    return saved ? parseInt(saved, 10) : 0;
  });

  useEffect(() => {
    const unsub = ttsService.subscribe((speaking) => {
      setIsTtsSpeaking(speaking);
    });
    return () => unsub();
  }, []);

  // State Machine: 'LOBBY' | 'PLAYING' | 'GAMEOVER'
  const [gameState, setGameState] = useState('LOBBY');
  const [isAnswering, setIsAnswering] = useState(false);

  // Statistics
  const [score, setScore] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [lives, setLives] = useState(3);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [totalResponseTime, setTotalResponseTime] = useState(0);

  // Current Question
  const [currentTarget, setCurrentTarget] = useState(null); // Vocab or Sentence
  const [isSentenceQuestion, setIsSentenceQuestion] = useState(false);
  const [displayPrompt, setDisplayPrompt] = useState('');
  const [displaySubPrompt, setDisplaySubPrompt] = useState('');
  const [displayAnswerMeaning, setDisplayAnswerMeaning] = useState('');
  const [isAudioOnlyPrompt, setIsAudioOnlyPrompt] = useState(false);
  const [options, setOptions] = useState([]);

  // Timer
  const [totalTime, setTotalTime] = useState(3.5);
  const [remainingTime, setRemainingTime] = useState(3.5);
  const [timeProgress, setTimeProgress] = useState(100);

  // Missed Words & Adaptive Queue
  const [missedItems, setMissedItems] = useState([]);
  const retestQueueRef = useRef([]);

  // Refs for timers & logic
  const timerIntervalRef = useRef(null);
  const questionStartTimeRef = useRef(0);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const isAnsweringRef = useRef(isAnswering);
  isAnsweringRef.current = isAnswering;
  const currentTargetRef = useRef(currentTarget);
  currentTargetRef.current = currentTarget;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const isAudioOnlyPromptRef = useRef(isAudioOnlyPrompt);
  isAudioOnlyPromptRef.current = isAudioOnlyPrompt;
  const totalTimeRef = useRef(totalTime);
  totalTimeRef.current = totalTime;
  const livesRef = useRef(lives);
  livesRef.current = lives;
  const selectedGameModeRef = useRef(selectedGameMode);
  selectedGameModeRef.current = selectedGameMode;
  const questionsAnsweredRef = useRef(questionsAnswered);
  questionsAnsweredRef.current = questionsAnswered;

  // Sound speak helper
  const playPromptAudio = useCallback((text) => {
    const speakText = text || currentTargetRef.current?.Chinese;
    if (speakText && handleSpeak) {
      handleSpeak(speakText);
    }
  }, [handleSpeak]);

  // Pool Helpers
  const getAllVocabs = useCallback(() => {
    if (selectedScope === 'CurrentLesson' && selectedLesson?.Vocabularies?.length) {
      return [...selectedLesson.Vocabularies];
    }
    const all = [];
    lessons.forEach(l => {
      if (Array.isArray(l.Vocabularies)) {
        all.push(...l.Vocabularies);
      }
    });
    return all;
  }, [lessons, selectedLesson, selectedScope]);

  const getAllSentences = useCallback(() => {
    if (selectedScope === 'CurrentLesson' && selectedLesson?.Sentences?.length) {
      return [...selectedLesson.Sentences];
    }
    const all = [];
    lessons.forEach(l => {
      if (Array.isArray(l.Sentences)) {
        all.push(...l.Sentences);
      }
    });
    return all;
  }, [lessons, selectedLesson, selectedScope]);

  const addMissedItem = (item, reason) => {
    if (!item) return;
    setMissedItems(prev => {
      if (prev.some(m => m.Chinese === item.Chinese)) return prev;
      return [
        ...prev,
        {
          Chinese: item.Chinese,
          Pinyin: item.Pinyin || '',
          Meaning: item.Meaning || item.Vietnamese || '',
          Reason: reason
        }
      ];
    });
  };

  // Stop Timer
  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // End Game
  const endGame = useCallback(() => {
    stopTimer();
    setGameState('GAMEOVER');
    setIsAnswering(false);

    setScore(prevScore => {
      if (prevScore > highScore) {
        setHighScore(prevScore);
        localStorage.setItem('reflex_game_high_score', prevScore.toString());
      }
      return prevScore;
    });
  }, [stopTimer, highScore]);

  // Handle Timeout
  const handleTimeout = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING' || isAnsweringRef.current) return;

    stopTimer();
    setIsAnswering(true);
    setQuestionsAnswered(q => q + 1);
    questionsAnsweredRef.current += 1;
    setTotalResponseTime(t => t + totalTimeRef.current);

    const target = currentTargetRef.current;
    const isAudioOnly = isAudioOnlyPromptRef.current;

    // Highlight correct option
    setOptions(prev => prev.map(o => o.isCorrect ? { ...o, state: 'correct' } : o));

    // Reveal audio prompt if hidden
    if (isAudioOnly && target) {
      setDisplayPrompt(target.Chinese);
      setDisplaySubPrompt(`${target.Pinyin || ''} - ${target.Meaning || target.Vietnamese || ''}`);
    }

    // Wrong penalty
    setWrongCount(w => w + 1);
    setCurrentStreak(0);

    if (target) {
      retestQueueRef.current.push(target);
      addMissedItem(target, 'Hết thời gian (Quá chậm)');
      if (progressService) {
        const key = target.Meaning ? target.Chinese : ('SEN_' + target.Chinese);
        progressService.updateProgress(key, false);
      }
    }

    if (isAutoPronounce && target?.Chinese) {
      playPromptAudio(target.Chinese);
    }

    if (selectedGameModeRef.current === 'Survival') {
      const newLives = livesRef.current - 1;
      setLives(newLives);
      livesRef.current = newLives;

      if (newLives <= 0) {
        setTimeout(() => {
          endGame();
        }, 900);
        return;
      }
    }

    setTimeout(() => {
      if (gameStateRef.current === 'PLAYING') {
        generateNextQuestion();
      }
    }, 900);
  }, [stopTimer, isAutoPronounce, playPromptAudio, progressService, endGame]);

  // Generate Next Question
  const generateNextQuestion = useCallback(() => {
    if (selectedGameModeRef.current === 'Survival' && livesRef.current <= 0) {
      endGame();
      return;
    }

    if (selectedGameModeRef.current !== 'Survival' && questionsAnsweredRef.current >= 20) {
      endGame();
      return;
    }

    setIsAnswering(false);
    isAnsweringRef.current = false;

    // Determine Time Limit
    let limit = 3.5;
    if (selectedGameModeRef.current === 'Survival') {
      // Accelerates from 4.0s down to 1.3s
      const calculated = 4.0 - Math.floor(questionsAnsweredRef.current / 4) * 0.3;
      limit = Math.max(1.3, calculated);
    } else if (selectedGameModeRef.current === 'Audio' || selectedGameModeRef.current === 'WeakWords') {
      limit = 4.0;
    } else {
      limit = blitzTimeSetting <= 0 ? 3.0 : blitzTimeSetting;
    }

    setTotalTime(limit);
    totalTimeRef.current = limit;
    setRemainingTime(limit);
    setTimeProgress(100);

    const isSentence = selectedScope === 'Sentences';
    setIsSentenceQuestion(isSentence);

    if (!isSentence) {
      // 1. Generate Vocab Question
      let allVocabs = getAllVocabs();
      if (allVocabs.length < 2) {
        allVocabs = lessons.flatMap(l => l.Vocabularies || []);
      }

      if (!allVocabs.length) {
        endGame();
        return;
      }

      let target = null;
      // Adaptive Retest Queue (33% chance if queue has items)
      if (retestQueueRef.current.length > 0 && Math.random() < 0.35) {
        target = retestQueueRef.current.shift();
      }

      if (!target && selectedGameModeRef.current === 'WeakWords') {
        const weakList = allVocabs.filter(v => {
          const prog = progressService ? progressService.getProgress(v.Chinese) : { WrongCount: 0 };
          return (prog.WrongCount || v.WrongCount) > 0;
        });
        if (weakList.length > 0) {
          target = weakList[Math.floor(Math.random() * weakList.length)];
        }
      }

      if (!target) {
        target = allVocabs[Math.floor(Math.random() * allVocabs.length)];
      }

      setCurrentTarget(target);
      currentTargetRef.current = target;

      const isAudio = selectedGameModeRef.current === 'Audio';
      setIsAudioOnlyPrompt(isAudio);
      isAudioOnlyPromptRef.current = isAudio;

      let promptP = '';
      let subP = '';
      let meaningP = '';
      let isHanziPrompt = true;

      if (isAudio) {
        promptP = '🔊 Đang phát âm...';
        subP = 'Chọn nghĩa tiếng Việt của từ bạn vừa nghe';
        meaningP = `${target.Chinese} [${target.Pinyin || ''}]: ${target.Meaning}`;
      } else {
        // 50% Hanzi -> Meaning, 50% Meaning -> Hanzi
        isHanziPrompt = Math.random() >= 0.5;
        if (isHanziPrompt) {
          promptP = target.Chinese;
          subP = target.Pinyin || '';
          meaningP = target.Meaning;
        } else {
          promptP = target.Meaning;
          subP = 'Chọn từ tiếng Trung tương ứng';
          meaningP = `${target.Chinese} (${target.Pinyin || ''})`;
        }
      }

      setDisplayPrompt(promptP);
      setDisplaySubPrompt(subP);
      setDisplayAnswerMeaning(meaningP);

      // Create 3 distractors
      const distractors = allVocabs
        .filter(v => v.Meaning !== target.Meaning && v.Chinese !== target.Chinese)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      const dummyVocabs = [
        { Chinese: '学习', Pinyin: 'xuéxí', Meaning: 'Học tập' },
        { Chinese: '工作', Pinyin: 'gōngzuò', Meaning: 'Làm việc' },
        { Chinese: '朋友', Pinyin: 'péngyou', Meaning: 'Bạn bè' },
        { Chinese: '时间', Pinyin: 'shíjiān', Meaning: 'Thời gian' }
      ];
      while (distractors.length < 3) {
        const dummy = dummyVocabs[distractors.length % dummyVocabs.length];
        if (!distractors.some(d => d.Meaning === dummy.Meaning) && dummy.Meaning !== target.Meaning) {
          distractors.push(dummy);
        }
      }

      const pool = [];
      if (isAudio || isHanziPrompt) {
        pool.push({ text: target.Meaning, isCorrect: true });
        distractors.forEach(d => pool.push({ text: d.Meaning, isCorrect: false }));
      } else {
        pool.push({ text: `${target.Chinese} (${target.Pinyin || ''})`, isCorrect: true });
        distractors.forEach(d => pool.push({ text: `${d.Chinese} (${d.Pinyin || ''})`, isCorrect: false }));
      }

      const shuffled = pool.sort(() => Math.random() - 0.5).map((item, idx) => ({
        index: idx + 1,
        keyLabel: (idx + 1).toString(),
        text: item.text,
        isCorrect: item.isCorrect,
        state: 'normal'
      }));

      setOptions(shuffled);
      optionsRef.current = shuffled;

      // Auto pronounce if prompt is Chinese
      if (isAutoPronounce && (isAudio || isHanziPrompt) && target.Chinese) {
        setTimeout(() => playPromptAudio(target.Chinese), 50);
      }
    } else {
      // 2. Generate Sentence Question
      let allSentences = getAllSentences();
      if (allSentences.length < 2) {
        allSentences = lessons.flatMap(l => l.Sentences || []);
      }

      if (!allSentences.length) {
        endGame();
        return;
      }

      const target = allSentences[Math.floor(Math.random() * allSentences.length)];
      setCurrentTarget(target);
      currentTargetRef.current = target;

      const isAudio = selectedGameModeRef.current === 'Audio';
      setIsAudioOnlyPrompt(isAudio);
      isAudioOnlyPromptRef.current = isAudio;

      if (isAudio) {
        setDisplayPrompt('🔊 Đang đọc câu...');
        setDisplaySubPrompt('Chọn câu dịch tiếng Việt đúng');
        setDisplayAnswerMeaning(`${target.Chinese} : ${target.Vietnamese}`);
      } else {
        setDisplayPrompt(target.Chinese);
        setDisplaySubPrompt(target.Pinyin || '');
        setDisplayAnswerMeaning(target.Vietnamese);
      }

      const distractors = allSentences
        .filter(s => s.Vietnamese !== target.Vietnamese && s.Chinese !== target.Chinese)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      const dummySentences = [
        { Chinese: '今天天气很好。', Vietnamese: 'Hôm nay thời tiết rất đẹp.' },
        { Chinese: '很高兴认识你。', Vietnamese: 'Rất vui được làm quen với bạn.' },
        { Chinese: '我想去喝咖啡。', Vietnamese: 'Tôi muốn đi uống cà phê.' }
      ];
      while (distractors.length < 3) {
        const dummy = dummySentences[distractors.length % dummySentences.length];
        if (!distractors.some(d => d.Vietnamese === dummy.Vietnamese) && dummy.Vietnamese !== target.Vietnamese) {
          distractors.push(dummy);
        }
      }

      const pool = [
        { text: target.Vietnamese, isCorrect: true },
        ...distractors.map(d => ({ text: d.Vietnamese, isCorrect: false }))
      ];

      const shuffled = pool.sort(() => Math.random() - 0.5).map((item, idx) => ({
        index: idx + 1,
        keyLabel: (idx + 1).toString(),
        text: item.text,
        isCorrect: item.isCorrect,
        state: 'normal'
      }));

      setOptions(shuffled);
      optionsRef.current = shuffled;

      if (isAutoPronounce && target.Chinese) {
        setTimeout(() => playPromptAudio(target.Chinese), 50);
      }
    }

    // Start Timer Interval (50ms tick)
    stopTimer();
    questionStartTimeRef.current = performance.now();
    let elapsed = 0;
    const interval = 50; // ms

    timerIntervalRef.current = setInterval(() => {
      elapsed += interval / 1000;
      const rem = Math.max(0, limit - elapsed);
      setRemainingTime(rem);
      setTimeProgress((rem / limit) * 100);

      if (rem <= 0) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
        handleTimeout();
      }
    }, interval);
  }, [selectedScope, blitzTimeSetting, getAllVocabs, getAllSentences, lessons, isAutoPronounce, playPromptAudio, progressService, stopTimer, handleTimeout, endGame]);

  // Start Game
  const startGame = useCallback((overrideMode) => {
    stopTimer();
    retestQueueRef.current = [];
    setMissedItems([]);

    setScore(0);
    setCurrentStreak(0);
    setMaxStreak(0);
    setLives(3);
    livesRef.current = 3;
    setQuestionsAnswered(0);
    questionsAnsweredRef.current = 0;
    setCorrectCount(0);
    setWrongCount(0);
    setTotalResponseTime(0);

    if (overrideMode) {
      setSelectedGameMode(overrideMode);
      selectedGameModeRef.current = overrideMode;
    }

    setGameState('PLAYING');
    gameStateRef.current = 'PLAYING';
    setIsAnswering(false);
    isAnsweringRef.current = false;

    // Small delay to ensure state transitions smoothly
    setTimeout(() => {
      generateNextQuestion();
    }, 100);
  }, [stopTimer, generateNextQuestion]);

  // Stop Game
  const stopGame = useCallback(() => {
    stopTimer();
    setGameState('LOBBY');
    gameStateRef.current = 'LOBBY';
    setIsAnswering(false);
    isAnsweringRef.current = false;
  }, [stopTimer]);

  // Handle Option Selection
  const selectOption = useCallback((selectedOpt) => {
    if (gameStateRef.current !== 'PLAYING' || isAnsweringRef.current || !selectedOpt) return;

    stopTimer();
    setIsAnswering(true);
    isAnsweringRef.current = true;

    setQuestionsAnswered(q => q + 1);
    questionsAnsweredRef.current += 1;

    const responseTimeSec = Math.max(0.1, (performance.now() - questionStartTimeRef.current) / 1000);
    setTotalResponseTime(t => t + responseTimeSec);

    const target = currentTargetRef.current;
    const isAudioOnly = isAudioOnlyPromptRef.current;
    const wasChinesePrompt = isAudioOnly || displayPrompt === target?.Chinese;

    // Update Option Highlights
    setOptions(prev => prev.map(opt => {
      if (opt.isCorrect) {
        return { ...opt, state: 'correct' };
      }
      if (opt.index === selectedOpt.index && !opt.isCorrect) {
        return { ...opt, state: 'wrong' };
      }
      return opt;
    }));

    // Reveal Audio Prompt
    if (isAudioOnly && target) {
      setDisplayPrompt(target.Chinese);
      setDisplaySubPrompt(`${target.Pinyin || ''} - ${target.Meaning || target.Vietnamese || ''}`);
    }

    if (selectedOpt.isCorrect) {
      setCorrectCount(c => c + 1);
      setCurrentStreak(s => {
        const newStreak = s + 1;
        setMaxStreak(m => Math.max(m, newStreak));

        // Combo Multiplier: 1, 2, 3, 5
        const multiplier = newStreak >= 10 ? 5 : newStreak >= 6 ? 3 : newStreak >= 3 ? 2 : 1;
        const speedRatio = Math.max(0, (totalTimeRef.current - responseTimeSec) / totalTimeRef.current);
        const speedBonus = Math.round(speedRatio * 100);
        const questionScore = (100 + speedBonus) * multiplier;

        setScore(sc => sc + questionScore);
        return newStreak;
      });

      // Hesitant memory (> 2.2s)
      if (responseTimeSec > 2.2 && target) {
        retestQueueRef.current.push(target);
        addMissedItem(target, `Phản xạ chậm (${responseTimeSec.toFixed(1)}s)`);
      }

      if (progressService && target) {
        const key = target.Meaning ? target.Chinese : ('SEN_' + target.Chinese);
        progressService.updateProgress(key, true);
      }
    } else {
      setWrongCount(w => w + 1);
      setCurrentStreak(0);

      if (target) {
        retestQueueRef.current.push(target);
        addMissedItem(target, 'Sai đáp án');
        if (progressService) {
          const key = target.Meaning ? target.Chinese : ('SEN_' + target.Chinese);
          progressService.updateProgress(key, false);
        }
      }

      if (selectedGameModeRef.current === 'Survival') {
        const newLives = livesRef.current - 1;
        setLives(newLives);
        livesRef.current = newLives;

        if (newLives <= 0) {
          setTimeout(() => {
            endGame();
          }, 850);
          return;
        }
      }
    }

    // Auto Reinforce Pronunciation
    if (isAutoPronounce && target?.Chinese) {
      if (!wasChinesePrompt || !selectedOpt.isCorrect) {
        playPromptAudio(target.Chinese);
      }
    }

    // Next Question Delay (850ms)
    setTimeout(() => {
      if (gameStateRef.current === 'PLAYING' && (selectedGameModeRef.current !== 'Survival' || livesRef.current > 0)) {
        generateNextQuestion();
      }
    }, 850);
  }, [stopTimer, displayPrompt, isAutoPronounce, playPromptAudio, progressService, endGame, generateNextQuestion]);

  const selectOptionByIndex = useCallback((idx) => {
    const opt = optionsRef.current.find(o => o.index === idx);
    if (opt) {
      selectOption(opt);
    }
  }, [selectOption]);

  // Keyboard Hotkeys Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat) return;

      if (gameStateRef.current === 'PLAYING' && !isAnsweringRef.current) {
        if (e.key === '1' || e.key === 'NumPad1' || e.code === 'Numpad1') {
          e.preventDefault();
          selectOptionByIndex(1);
        } else if (e.key === '2' || e.key === 'NumPad2' || e.code === 'Numpad2') {
          e.preventDefault();
          selectOptionByIndex(2);
        } else if (e.key === '3' || e.key === 'NumPad3' || e.code === 'Numpad3') {
          e.preventDefault();
          selectOptionByIndex(3);
        } else if (e.key === '4' || e.key === 'NumPad4' || e.code === 'Numpad4') {
          e.preventDefault();
          selectOptionByIndex(4);
        } else if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          playPromptAudio();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          stopGame();
        }
      } else if (gameStateRef.current === 'LOBBY' || gameStateRef.current === 'GAMEOVER') {
        if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          startGame();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectOptionByIndex, playPromptAudio, startGame, stopGame]);

  // Clean up on unmount
  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  // Computed Stats for Summary
  const accuracyPercentage = questionsAnswered === 0 ? 0 : Math.round((correctCount / questionsAnswered) * 100);
  const avgSpeed = questionsAnswered === 0 ? 0 : (totalResponseTime / questionsAnswered).toFixed(2);

  const getSummaryRating = () => {
    if (accuracyPercentage >= 90 && parseFloat(avgSpeed) <= 1.5) return '⚡ THẦN TỐC! Phản xạ xuất chúng!';
    if (accuracyPercentage >= 80) return '🔥 RẤT TỐT! Não bộ phản xạ rất nhạy!';
    if (accuracyPercentage >= 60) return '👍 KHÁ TỐT! Cố gắng tăng tốc độ hơn nữa!';
    return '💪 CẦN RÈN LUYỆN! Hãy làm quen với các từ hay sai.';
  };

  const getComboMultiplier = () => {
    if (currentStreak >= 10) return 5;
    if (currentStreak >= 6) return 3;
    if (currentStreak >= 3) return 2;
    return 1;
  };

  const getTimerFillColor = () => {
    if (timeProgress > 50) return 'green';
    if (timeProgress > 25) return 'yellow';
    return 'red';
  };

  return (
    <div className="reflex-game-container">
      {/* ================= VIEW 1: GAME LOBBY ================= */}
      {gameState === 'LOBBY' && (
        <div className="game-lobby-card">
          <div className="lobby-header">
            <div className="lobby-title">
              <span>🎮</span>
              <span>ĐẤU TRƯỜNG PHẢN XẠ</span>
            </div>
            <div className="lobby-subtitle">
              Rèn luyện phản xạ ngôn ngữ tốc độ cao qua thị giác và thính giác
            </div>
            {highScore > 0 && (
              <div className="highscore-badge">
                🏆 Điểm Kỷ Lục: {highScore}
              </div>
            )}
          </div>

          {/* Section 1: Game Modes */}
          <div className="lobby-section-title">1. CHỌN CHẾ ĐỘ CHƠI</div>
          <div className="game-mode-grid">
            {/* Blitz */}
            <div 
              className={`mode-card ${selectedGameMode === 'Blitz' ? 'active-blitz' : ''}`}
              onClick={() => setSelectedGameMode('Blitz')}
            >
              <div className="mode-icon">⚡</div>
              <div className="mode-name">Chớp Nhoáng</div>
              <div className="mode-tagline">3s mỗi câu</div>
            </div>

            {/* Audio */}
            <div 
              className={`mode-card ${selectedGameMode === 'Audio' ? 'active-audio' : ''}`}
              onClick={() => setSelectedGameMode('Audio')}
            >
              <div className="mode-icon">🎧</div>
              <div className="mode-name">Nghe Phản Xạ</div>
              <div className="mode-tagline">Ẩn mặt chữ</div>
            </div>

            {/* Survival */}
            <div 
              className={`mode-card ${selectedGameMode === 'Survival' ? 'active-survival' : ''}`}
              onClick={() => setSelectedGameMode('Survival')}
            >
              <div className="mode-icon">❤️</div>
              <div className="mode-name">Sinh Tồn</div>
              <div className="mode-tagline">3 Mạng - Tăng tốc</div>
            </div>

            {/* Weak Words */}
            <div 
              className={`mode-card ${selectedGameMode === 'WeakWords' ? 'active-weakwords' : ''}`}
              onClick={() => setSelectedGameMode('WeakWords')}
            >
              <div className="mode-icon">🎯</div>
              <div className="mode-name">Điểm Mù</div>
              <div className="mode-tagline">Từ hay sai</div>
            </div>
          </div>

          {/* Mode Description Box */}
          <div className="mode-desc-box">
            {selectedGameMode === 'Blitz' && '⚡ Chớp Nhoáng: 3s mỗi câu hỏi. Trả lời càng nhanh điểm càng cao! Luyện phản xạ tức thì giữa Chữ Hán và Tiếng Việt.'}
            {selectedGameMode === 'Audio' && '🎧 Nghe Phản Xạ: Ẩn mặt chữ, chỉ phát âm thanh tiếng Trung. Rèn luyện đôi tai và phản xạ ngôn ngữ tự nhiên.'}
            {selectedGameMode === 'Survival' && '❤️ Đấu Trường Sinh Tồn: Có 3 Mạng sống. Càng về sau thời gian đếm ngược càng rút ngắn cực gắt! Thử thách giới hạn não bộ.'}
            {selectedGameMode === 'WeakWords' && '🎯 Bắn Tỉa Điểm Mù: Tập trung toàn bộ vào các từ vựng bạn hay quên hoặc làm sai trước đây để khắc sâu trí nhớ.'}
          </div>

          {/* Section 2: Scope */}
          <div className="lobby-section-title">2. PHẠM VI LUYỆN TẬP</div>
          <div className="scope-grid">
            <button 
              className={`scope-btn ${selectedScope === 'AllLessons' ? 'active' : ''}`}
              onClick={() => setSelectedScope('AllLessons')}
            >
              📚 Toàn Bộ Bài Học (Khuyên dùng)
            </button>
            <button 
              className={`scope-btn ${selectedScope === 'CurrentLesson' ? 'active' : ''}`}
              onClick={() => setSelectedScope('CurrentLesson')}
            >
              📖 Chỉ Bài Đang Chọn
            </button>
            <button 
              className={`scope-btn ${selectedScope === 'Sentences' ? 'active' : ''}`}
              onClick={() => setSelectedScope('Sentences')}
            >
              💬 Luyện Câu Giao Tiếp
            </button>
          </div>

          {/* Section 3: Settings */}
          <div className="lobby-settings-row">
            <label className="setting-item">
              <input 
                type="checkbox" 
                checked={isAutoPronounce} 
                onChange={(e) => setIsAutoPronounce(e.target.checked)} 
              />
              <span>🔊 Tự động phát âm thanh tiếng Trung</span>
            </label>

            {selectedGameMode === 'Blitz' && (
              <div className="time-select-group">
                <span style={{fontSize: '13px', color: '#718096', fontWeight: 600}}>Thời gian:</span>
                <button 
                  className={`time-btn ${blitzTimeSetting === 3 ? 'active' : ''}`}
                  onClick={() => setBlitzTimeSetting(3)}
                >
                  ⚡ 3 Giây
                </button>
                <button 
                  className={`time-btn ${blitzTimeSetting === 5 ? 'active' : ''}`}
                  onClick={() => setBlitzTimeSetting(5)}
                >
                  ⏱️ 5 Giây
                </button>
              </div>
            )}
          </div>

          {/* Start Action */}
          <button className="btn-start-game" onClick={() => startGame()}>
            <span>🚀</span>
            <span>BẮT ĐẦU THỬ THÁCH (Phím Space / Enter)</span>
          </button>
        </div>
      )}

      {/* ================= VIEW 2: IN-GAME ARENA ================= */}
      {gameState === 'PLAYING' && (
        <div className="game-arena">
          {/* Top Status Bar */}
          <div className="arena-topbar">
            {/* Left: Mode & Lives */}
            <div className="arena-left">
              <div className="arena-mode-badge">
                {selectedGameMode === 'Blitz' && '⚡ Chớp Nhoáng'}
                {selectedGameMode === 'Audio' && '🎧 Nghe Phản Xạ'}
                {selectedGameMode === 'Survival' && '❤️ Sinh Tồn'}
                {selectedGameMode === 'WeakWords' && '🎯 Điểm Mù'}
              </div>

              {selectedGameMode === 'Survival' && (
                <div className="arena-lives">
                  {'❤️ '.repeat(Math.max(0, lives))}
                  {'🖤 '.repeat(Math.max(0, 3 - lives))}
                </div>
              )}
            </div>

            {/* Center: Combo & Score */}
            <div className="arena-center">
              {currentStreak >= 3 && (
                <div className="combo-streak-badge">
                  🔥 COMBO x{getComboMultiplier()} ({currentStreak})
                </div>
              )}
              <div className="arena-score-display">
                <span style={{fontSize: '12px', fontWeight: 700, color: '#718096'}}>ĐIỂM:</span>
                <span className="score-num">{score}</span>
              </div>
            </div>

            {/* Right: Stop Button */}
            <div className="arena-right">
              <button className="btn-stop-game" onClick={stopGame} title="Thoát về Menu (Esc)">
                ⏹️ Dừng (Esc)
              </button>
            </div>
          </div>

          {/* Countdown Timer Bar */}
          <div className="arena-timer-container">
            <div className="timer-info-row">
              <span>⏱️ Thời gian: {remainingTime.toFixed(1)}s</span>
              <span>Câu {questionsAnswered + 1}</span>
            </div>
            <div className="timer-track">
              <div 
                className={`timer-fill ${getTimerFillColor()}`}
                style={{ width: `${Math.max(0, Math.min(100, timeProgress))}%` }}
              />
            </div>
          </div>

          {/* Question Prompt Card */}
          <div className="prompt-card">
            <div className="prompt-main-row">
              <span className="prompt-chinese">{displayPrompt}</span>
              <button 
                className={`prompt-audio-icon ${isTtsSpeaking ? 'tts-playing' : ''}`}
                onClick={() => playPromptAudio()}
                title="Nghe lại âm thanh (Phím Space)"
              >
                🔊
              </button>
            </div>

            <div className="prompt-sub">{displaySubPrompt}</div>

            {isAudioOnlyPrompt && isAnswering && (
              <div className="prompt-revealed-meaning">
                {displayAnswerMeaning}
              </div>
            )}
          </div>

          {/* 4 Interactive Options (2x2 Grid) */}
          <div className="arena-options-grid">
            {options.map((opt) => (
              <button 
                key={opt.index}
                className={`game-option-btn ${opt.state}`}
                onClick={() => selectOption(opt)}
                disabled={isAnswering}
              >
                <div className="option-key-badge">{opt.keyLabel}</div>
                <div className="option-text-content">{opt.text}</div>
              </button>
            ))}
          </div>

          {/* Bottom Hotkey Hint */}
          <div className="arena-hotkey-hint">
            ⌨️ Bấm phím <b>1, 2, 3, 4</b> trên bàn phím để chọn nhanh • Phím <b>Space</b> để nghe lại âm thanh
          </div>
        </div>
      )}

      {/* ================= VIEW 3: GAME OVER / POST-MATCH ================= */}
      {gameState === 'GAMEOVER' && (
        <div className="game-over-card">
          <div className="game-over-header">
            <div className="summary-rating-title">{getSummaryRating()}</div>
            <div className="summary-mode-info">
              Chế độ: <b>{selectedGameMode}</b> • Tổng số câu: <b>{questionsAnswered}</b>
            </div>
          </div>

          {/* 4 Gold Stat Cards */}
          <div className="stat-cards-grid">
            {/* Score */}
            <div className="gold-stat-card">
              <div className="stat-label">🏆 Điểm Số</div>
              <div className="stat-value score">{score}</div>
            </div>

            {/* Speed */}
            <div className="gold-stat-card">
              <div className="stat-label">⚡ Tốc Độ TB</div>
              <div className="stat-value speed">{avgSpeed}s / từ</div>
            </div>

            {/* Accuracy */}
            <div className="gold-stat-card">
              <div className="stat-label">🎯 Chính Xác</div>
              <div className="stat-value accuracy">{accuracyPercentage}%</div>
            </div>

            {/* Max Combo */}
            <div className="gold-stat-card">
              <div className="stat-label">🔥 Max Combo</div>
              <div className="stat-value combo">x{maxStreak}</div>
            </div>
          </div>

          {/* Missed / Hesitant Words List */}
          {missedItems.length > 0 && (
            <div className="missed-words-section">
              <div className="missed-section-title">
                📝 DANH SÁCH TỪ CẦN KHẮC SÂU ({missedItems.length} từ Điểm Mù / Chậm):
              </div>
              <div className="missed-words-container">
                {missedItems.map((item, idx) => (
                  <div key={idx} className="missed-word-row">
                    <div className="missed-word-left">
                      <span className="missed-hanzi">{item.Chinese}</span>
                      <span className="missed-pinyin">{item.Pinyin}</span>
                      <span className="missed-meaning">{item.Meaning}</span>
                    </div>
                    <div className="missed-reason-badge">{item.Reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="game-over-actions">
            <button className="btn-replay-mode" onClick={() => startGame()}>
              🔁 Chơi Lại Chế Độ Này
            </button>
            {missedItems.length > 0 && (
              <button className="btn-replay-weak" onClick={() => startGame('WeakWords')}>
                🎯 Luyện Riêng Từ Hay Sai
              </button>
            )}
            <button className="btn-menu-back" onClick={stopGame}>
              🏠 Menu Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
