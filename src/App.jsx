import { useState, useEffect, useRef } from 'react'
import './index.css'
import { ProgressService } from './services/ProgressService'
import { SpeechRecognitionService } from './services/SpeechRecognitionService'
import { AudioVisualizer } from './components/AudioVisualizer'
import { ReflexGame } from './components/ReflexGame'
import { pinyin } from 'pinyin-pro'

const progressService = new ProgressService();
const speechService = new SpeechRecognitionService();

// Helper to normalize pinyin for comparison (giữ nguyên dấu thanh, bỏ hoa/thường, khoảng trắng và dấu câu)
function normalizePinyin(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFC')              // Chuẩn hoá unicode dạng tổ hợp/dựng sẵn đồng nhất
    .replace(/[\s\-_,.'`"!?/\\;:]/g, '') // Bỏ khoảng cách và các ký tự phân tách/dấu câu
    .trim();
}

function App() {
  const [currentView, setCurrentView] = useState('Vocab');
  const [lessons, setLessons] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  
  // --- Vocab State ---
  const [vocabList, setVocabList] = useState([]);
  const [currentVocabIndex, setCurrentVocabIndex] = useState(0);
  const [isMeaningVisible, setIsMeaningVisible] = useState(false);
  const [vocabOptions, setVocabOptions] = useState([]);
  const [vocabFeedback, setVocabFeedback] = useState('');
  const [isVocabCorrect, setIsVocabCorrect] = useState(false);
  const [isListeningMode, setIsListeningMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // --- Vocab Practice Mode (MultipleChoice vs WritePinyin) ---
  const [vocabPracticeMode, setVocabPracticeMode] = useState('MultipleChoice'); // 'MultipleChoice' | 'WritePinyin'
  const [pinyinInputText, setPinyinInputText] = useState('');
  const [pinyinStatus, setPinyinStatus] = useState(null); // 'correct' | 'wrong' | null
  const pinyinInputRef = useRef(null);

  // --- Match State ---
  const [sentenceList, setSentenceList] = useState([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [matchDirection, setMatchDirection] = useState('Trung -> Việt'); // 'Trung -> Việt' or 'Việt -> Trung'
  
  // --- Refs & State ---
  const transcriptRef = useRef('');
  const [availablePieces, setAvailablePieces] = useState([]);
  const [selectedPieces, setSelectedPieces] = useState([]);
  const [sentenceFeedback, setSentenceFeedback] = useState('');

  // === VIEW STATES ===
  const [vocabDirection, setVocabDirection] = useState('Trung -> Việt');

  // === COMBO STATES ===
  const [combo, setCombo] = useState(0);
  const [showComboAnim, setShowComboAnim] = useState(false);

  // --- Analysis State ---
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisStats, setAnalysisStats] = useState(null);

  useEffect(() => {
    const jsonFiles = import.meta.glob('./Database/*.json', { eager: true });
    const parsedLessons = [];

    const sortedPaths = Object.keys(jsonFiles).sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    for (const path of sortedPaths) {
      if (path.includes('_VocabGroups') || path.includes('_SentenceGroups') || path.includes('progress')) continue;

      const fileData = jsonFiles[path];
      const lesson = fileData.default || fileData;
      if (lesson && typeof lesson === 'object') {
        const cleanLesson = {
          Title: lesson.Title || path.replace('./Database/', '').replace('.json', '').replace(/_/g, ' '),
          Vocabularies: Array.isArray(lesson.Vocabularies) ? lesson.Vocabularies : [],
          Sentences: Array.isArray(lesson.Sentences) ? lesson.Sentences : []
        };
        parsedLessons.push(cleanLesson);
      }
    }

    if (parsedLessons.length > 0) {
      setLessons(parsedLessons);
      setSelectedLesson(parsedLessons[0]);
    } else {
      // Fallback
      setLessons([{ Title: "Chưa có dữ liệu", Vocabularies: [], Sentences: [] }]);
    }

    // Global click listener to unlock Audio Engine on first interaction
    const unlockAudio = () => {
      if (!window.audioEngineInitialized && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const preloadMsg = new SpeechSynthesisUtterance('');
        preloadMsg.volume = 0;
        window.speechSynthesis.speak(preloadMsg);
        window.audioEngineInitialized = true;
        document.removeEventListener('click', unlockAudio);
      }
    };
    document.addEventListener('click', unlockAudio);
    
    return () => document.removeEventListener('click', unlockAudio);
  }, []);

  const initAudioEngine = () => {
    if (!window.audioEngineInitialized && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const preloadMsg = new SpeechSynthesisUtterance('');
      preloadMsg.volume = 0;
      window.speechSynthesis.speak(preloadMsg);
      window.audioEngineInitialized = true;
    }
  };

  // When Lesson Changes
  useEffect(() => {
    if (selectedLesson) {
      // 1. Prepare Vocab
      if (selectedLesson.Vocabularies?.length > 0) {
        let vList = selectedLesson.Vocabularies.map(v => {
          const prog = progressService.getProgress(v.Chinese);
          return { ...v, CorrectCount: prog.CorrectCount, WrongCount: prog.WrongCount };
        });
        vList = vList.sort(() => Math.random() - 0.5).sort((a, b) => ((b.WrongCount * 2) - b.CorrectCount) - ((a.WrongCount * 2) - a.CorrectCount));
        setVocabList(vList);
        setCurrentVocabIndex(0);
        generateVocabOptions(vList[0], vList);
      } else {
        setVocabList([]);
      }

      // 2. Prepare Sentences
      if (selectedLesson.Sentences?.length > 0) {
        let sList = selectedLesson.Sentences.map(s => {
          const prog = progressService.getProgress('SEN_' + s.Chinese);
          return { ...s, CorrectCount: prog.CorrectCount, WrongCount: prog.WrongCount };
        });
        sList = sList.sort(() => Math.random() - 0.5).sort((a, b) => ((b.WrongCount * 2) - b.CorrectCount) - ((a.WrongCount * 2) - a.CorrectCount));
        setSentenceList(sList);
        setCurrentSentenceIndex(0);
      } else {
        setSentenceList([]);
      }
    }
  }, [selectedLesson]);

  // When Sentence index or direction changes, rebuild pieces
  const lastPreparedSentenceRef = useRef(null);
  const lastMatchDirectionRef = useRef(null);
  const lastSentenceIndexRef = useRef(null);

  useEffect(() => {
    if (sentenceList.length > 0) {
      const sentence = sentenceList[currentSentenceIndex];
      if (sentence !== lastPreparedSentenceRef.current || 
          matchDirection !== lastMatchDirectionRef.current || 
          currentSentenceIndex !== lastSentenceIndexRef.current) {
        
        lastPreparedSentenceRef.current = sentence;
        lastMatchDirectionRef.current = matchDirection;
        lastSentenceIndexRef.current = currentSentenceIndex;
        prepareSentencePieces(sentence);
      }
    }
  }, [currentSentenceIndex, sentenceList, matchDirection]);

  // ===== VOCAB LOGIC =====
  const currentVocab = vocabList[currentVocabIndex];

  const resetVocabQuestionState = () => {
    setIsMeaningVisible(false);
    setVocabFeedback('');
    setIsVocabCorrect(false);
    setPinyinInputText('');
    setPinyinStatus(null);
  };

  const generateVocabOptions = (correctV, allV) => {
    resetVocabQuestionState();
    
    let options;
    if (vocabDirection === 'Trung -> Việt') {
      options = allV.map(v => v.Meaning).filter(m => m !== correctV.Meaning);
      options = options.sort(() => 0.5 - Math.random()).slice(0, 3);
      
      const dummyWords = ["Tuyệt vời", "Ngày mai", "Buổi sáng", "Quyển sách", "Giáo viên", "Học sinh", "Nhà hàng", "Đi chơi", "Uống cà phê", "Rất tốt", "Đồng ý", "Không sao", "Làm việc", "Gia đình", "Bạn bè"];
      while (options.length < 3) {
        const randomDummy = dummyWords[Math.floor(Math.random() * dummyWords.length)];
        if (!options.includes(randomDummy) && randomDummy !== correctV.Meaning) {
          options.push(randomDummy);
        }
      }
      options.push(correctV.Meaning);
    } else {
      options = allV.map(v => v.Chinese).filter(c => c !== correctV.Chinese);
      options = options.sort(() => 0.5 - Math.random()).slice(0, 3);
      
      const dummyWords = ["苹果", "香蕉", "咖啡", "老师", "学生", "餐厅", "去玩", "喝茶", "很好", "同意", "没关系", "工作", "家庭", "朋友", "明天"];
      while (options.length < 3) {
        const randomDummy = dummyWords[Math.floor(Math.random() * dummyWords.length)];
        if (!options.includes(randomDummy) && randomDummy !== correctV.Chinese) {
          options.push(randomDummy);
        }
      }
      options.push(correctV.Chinese);
    }
    
    options = options.sort(() => 0.5 - Math.random());
    setVocabOptions(options);

    if (isListeningMode && correctV) {
      setTimeout(() => handleSpeak(correctV.Chinese), 100);
    }
  };

  useEffect(() => {
    if (vocabList.length > 0) {
      generateVocabOptions(vocabList[currentVocabIndex], vocabList);
    }
  }, [currentVocabIndex, vocabList, vocabDirection, vocabPracticeMode]);

  // Focus input when switching to WritePinyin mode or changing index
  useEffect(() => {
    if (vocabPracticeMode === 'WritePinyin' && currentView === 'Vocab') {
      setTimeout(() => pinyinInputRef.current?.focus(), 100);
    }
  }, [vocabPracticeMode, currentVocabIndex, currentView]);

  // Trigger speech when listening mode is toggled manually
  useEffect(() => {
    if (isListeningMode && currentView === 'Vocab' && currentVocab && !isMeaningVisible) {
      handleSpeak(currentVocab.Chinese);
    }
  }, [isListeningMode]);

  const handleVocabAnswer = (selectedOption) => {
    const isCorrect = vocabDirection === 'Trung -> Việt' 
      ? selectedOption === currentVocab.Meaning
      : selectedOption === currentVocab.Chinese;
      
    if (isCorrect) {
      setVocabFeedback('Đúng rồi! 🎉');
      setIsVocabCorrect(true);
      setIsMeaningVisible(true);
      progressService.updateProgress(currentVocab.Chinese, true);
      handleSpeak(currentVocab.Chinese);
      
      setCombo(c => c + 1);
      setShowComboAnim(true);
      setTimeout(() => setShowComboAnim(false), 1000);

      setTimeout(() => {
        if (currentVocabIndex < vocabList.length - 1) {
          setCurrentVocabIndex(currentVocabIndex + 1);
        } else {
          setVocabFeedback('Hoàn thành bài học từ vựng!');
        }
      }, 1500);
    } else {
      setVocabFeedback('Sai rồi, thử lại!');
      setIsVocabCorrect(false);
      progressService.updateProgress(currentVocab.Chinese, false);
      setCombo(0);
    }
  };

  // Check Pinyin input
  const handleCheckPinyin = () => {
    if (!currentVocab || !pinyinInputText.trim()) return;

    const inputNorm = normalizePinyin(pinyinInputText);
    const targetNorm = normalizePinyin(currentVocab.Pinyin);
    // Also support generated pinyin from Chinese
    const autoPinyinNorm = normalizePinyin(pinyin(currentVocab.Chinese));

    const isCorrect = (inputNorm === targetNorm) || (inputNorm === autoPinyinNorm);

    if (isCorrect) {
      setPinyinStatus('correct');
      setVocabFeedback('Chính xác! 🎉');
      setIsVocabCorrect(true);
      setIsMeaningVisible(true);
      progressService.updateProgress(currentVocab.Chinese, true);
      handleSpeak(currentVocab.Chinese);

      setCombo(c => c + 1);
      setShowComboAnim(true);
      setTimeout(() => setShowComboAnim(false), 1000);

      setTimeout(() => {
        if (currentVocabIndex < vocabList.length - 1) {
          setCurrentVocabIndex(currentVocabIndex + 1);
        } else {
          setVocabFeedback('Hoàn thành bài học từ vựng!');
        }
      }, 1500);
    } else {
      setPinyinStatus('wrong');
      setVocabFeedback(`Chưa đúng! Đáp án gợi ý: ${currentVocab.Pinyin}`);
      setIsVocabCorrect(false);
      progressService.updateProgress(currentVocab.Chinese, false);
      setCombo(0);
    }
  };

  const setFeedback = (msg) => {
    if (currentView === 'Vocab') setVocabFeedback(msg);
    else setSentenceFeedback(msg);
  };

  const toggleRecording = () => {
    const targetText = currentView === 'Vocab' ? currentVocab.Chinese : currentSentence.Chinese;
    
    if (isRecording) {
      speechService.stopRecording();
      setIsRecording(false);
      setFeedback('⏳ Đang xử lý kết quả...');
    } else {
      transcriptRef.current = '';
      setIsRecording(true);
      setFeedback('🎤 Đang ghi âm... (Bấm Stop ⏹️ để kết thúc và xem kết quả)');
      speechService.startRecording(
        (transcript) => {
          transcriptRef.current = transcript;
        },
        (error) => {
          setIsRecording(false);
          if (error === 'not-allowed') {
             setFeedback('Lỗi: Bạn chưa cấp quyền sử dụng Micro!');
             alert("Vui lòng ấn 'Allow' (Cho phép) khi trình duyệt hỏi quyền sử dụng Microphone ở góc trên bên trái.");
          } else if (error === 'no-speech') {
             setFeedback('Không nghe thấy gì, vui lòng thử lại.');
          } else {
             setFeedback('Lỗi ghi âm: ' + error);
          }
        },
        () => {
          setIsRecording(false);
          const transcript = transcriptRef.current;
          const cleanInput = transcript.replace(/[^\u4e00-\u9fa5]/g, '');
          
          if (cleanInput === targetText) {
            setFeedback(`Chính xác! (Bạn đọc: ${cleanInput})`);
            if (currentView === 'Vocab') setIsVocabCorrect(true);
            progressService.updateProgress(currentView === 'Vocab' ? targetText : 'SEN_' + targetText, true);
          } else {
            const py = cleanInput ? pinyin(cleanInput) : '';
            const displayReading = cleanInput ? `${cleanInput} - ${py}` : (transcript || 'Chưa nghe thấy gì');
            setFeedback(`Sai rồi! (Bạn đọc: ${displayReading})`);
            if (currentView === 'Vocab') setIsVocabCorrect(false);
            progressService.updateProgress(currentView === 'Vocab' ? targetText : 'SEN_' + targetText, false);
          }
        }
      );
    }
  };

  const handleSpeak = (text, rate = 1.0) => {
    initAudioEngine();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      setTimeout(() => {
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'zh-CN';
        msg.rate = rate;
        
        const voices = window.speechSynthesis.getVoices();
        const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('cmn') || v.lang === 'zh-CN');
        if (zhVoice) {
           msg.voice = zhVoice;
        }

        window.speechSynthesis.speak(msg);
      }, 50);
    }
  };

  // ===== MATCH LOGIC =====
  const currentSentence = sentenceList[currentSentenceIndex];

  const prepareSentencePieces = (sentence) => {
    if (!sentence) return;
    setSelectedPieces([]);
    setSentenceFeedback('');

    let pieces = [];
    if (matchDirection === 'Trung -> Việt') {
      const words = sentence.Vietnamese.split(' ').filter(w => w.trim() !== '');
      pieces = words.map((w, i) => ({ id: i, text: w }));
    } else {
      const cleanChinese = sentence.Chinese.replace(/[^\u4e00-\u9fa5]/g, '');
      for (let i = 0; i < cleanChinese.length; i++) {
        pieces.push({ id: i, text: cleanChinese[i] });
      }
    }
    setAvailablePieces(pieces.sort(() => 0.5 - Math.random()));
  };

  const selectPiece = (piece) => {
    setAvailablePieces(availablePieces.filter(p => p.id !== piece.id));
    setSelectedPieces([...selectedPieces, piece]);
    setSentenceFeedback('');
  };

  const deselectPiece = (piece) => {
    setSelectedPieces(selectedPieces.filter(p => p.id !== piece.id));
    setAvailablePieces([...availablePieces, piece]);
    setSentenceFeedback('');
  };

  const checkSentence = () => {
    if (!currentSentence) return;
    const currentText = selectedPieces.map(p => p.text).join('');
    
    let targetText = '';
    if (matchDirection === 'Trung -> Việt') {
      targetText = currentSentence.Vietnamese.replace(/\s/g, '');
    } else {
      targetText = currentSentence.Chinese.replace(/[^\u4e00-\u9fa5]/g, '');
    }

    if (currentText === targetText) {
      setSentenceFeedback('Chính xác!');
      progressService.updateProgress('SEN_' + currentSentence.Chinese, true);
      setCombo(c => c + 1);
      setShowComboAnim(true);
      setTimeout(() => setShowComboAnim(false), 1000);
    } else {
      setSentenceFeedback('Sai rồi! (Câu này sẽ được lặp lại)');
      progressService.updateProgress('SEN_' + currentSentence.Chinese, false);
      setCombo(0);
      // Append sentence to repeat
      setSentenceList(prev => [...prev, currentSentence]);
    }
  };

  const handleSmartHint = () => {
    if (!currentSentence) return;
    let targetText = matchDirection === 'Trung -> Việt' 
      ? currentSentence.Vietnamese.replace(/\s/g, '') 
      : currentSentence.Chinese.replace(/[^\u4e00-\u9fa5]/g, '');
    
    const currentText = selectedPieces.map(p => p.text).join('');
    
    if (targetText.startsWith(currentText)) {
      const remainingTarget = targetText.substring(currentText.length);
      if (remainingTarget.length > 0) {
        const nextPiece = availablePieces.find(p => remainingTarget.startsWith(p.text));
        if (nextPiece) {
           selectPiece(nextPiece);
           return;
        }
      }
    }
    setSentenceFeedback('Gợi ý: Hãy gỡ các mảnh sai ra trước!');
  };

  // === KEYBOARD SHORTCUTS ===
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (currentView === 'Game') return;

      if (currentView === 'Vocab' && vocabPracticeMode === 'MultipleChoice' && vocabOptions.length > 0 && !isMeaningVisible) {
         if (e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key) - 1;
            if (vocabOptions[index]) {
               handleVocabAnswer(vocabOptions[index]);
            }
         }
      } else if (currentView === 'Match' && currentSentence) {
         if (e.key === 'Enter') {
            checkSentence();
         } else if (e.code === 'Space') {
            e.preventDefault();
            handleSpeak(currentSentence.Chinese);
         }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, vocabPracticeMode, vocabOptions, isMeaningVisible, selectedPieces, matchDirection, currentSentence]);

  const nextSentence = () => {
    if (currentSentenceIndex < sentenceList.length - 1) {
      setCurrentSentenceIndex(currentSentenceIndex + 1);
    }
  };

  const prevSentence = () => {
    if (currentSentenceIndex > 0) {
      setCurrentSentenceIndex(currentSentenceIndex - 1);
    }
  };

  const handleResetData = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử điểm số của ứng dụng không?")) {
      progressService.resetProgress();
      window.location.reload();
    }
  };

  const openAnalysis = () => {
    let totalCorrect = 0;
    let totalWrong = 0;
    let learnedCount = 0;
    let unlearnedCount = 0;
    
    let list = currentView === 'Vocab' ? [...vocabList] : [...sentenceList];
    
    list = list.map(item => {
      const key = currentView === 'Vocab' ? item.Chinese : ('SEN_' + item.Chinese);
      const prog = progressService.getProgress(key);
      return { ...item, CorrectCount: prog.CorrectCount, WrongCount: prog.WrongCount };
    });

    list.forEach(item => {
      totalCorrect += (item.CorrectCount || 0);
      totalWrong += (item.WrongCount || 0);
      
      if ((item.CorrectCount || 0) + (item.WrongCount || 0) > 0) {
        learnedCount++;
      } else {
        unlearnedCount++;
      }
    });

    const totalAttempts = totalCorrect + totalWrong;
    let percentage = 0;
    let evalText = "Bạn chưa làm bài nào. Hãy bắt đầu luyện tập nhé!";
    let evalColor = "#718096";

    if (totalAttempts > 0) {
      percentage = (totalCorrect / totalAttempts) * 100;
      if (percentage >= 80) {
        evalColor = "#38A169";
        evalText = `Tuyệt vời! Tỉ lệ đúng là ${percentage.toFixed(1)}%. Hãy tiếp tục phát huy nhé!`;
      } else if (percentage >= 50) {
        evalColor = "#DD6B20";
        evalText = `Khá tốt! Tỉ lệ đúng là ${percentage.toFixed(1)}%. Cố gắng thêm chút nữa!`;
      } else {
        evalColor = "#E53E3E";
        evalText = `Cần nỗ lực hơn! Tỉ lệ đúng là ${percentage.toFixed(1)}%. Hãy ôn lại các mục hay sai bên dưới.`;
      }
    }

    const topWrong = [...list].filter(x => x.WrongCount > 0)
      .sort((a, b) => ((b.WrongCount * 2) - b.CorrectCount) - ((a.WrongCount * 2) - a.CorrectCount))
      .slice(0, 5);

    setAnalysisStats({ totalCorrect, totalWrong, percentage, evalText, evalColor, topWrong, learnedCount, unlearnedCount, list, type: currentView });
    setShowAnalysis(true);
  };

  const isVocabRevealed = !isListeningMode || isVocabCorrect || isMeaningVisible;

  return (
    <div className="app-container">

      {/* MOBILE TOPBAR (Visible on <= 768px) */}
      <div className="mobile-topbar">
        <button 
          className="mobile-menu-btn" 
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          aria-label="Toggle menu"
        >
          {isMobileNavOpen ? '✕' : '☰'}
        </button>
        <div className="mobile-brand-title">
          {currentView === 'Vocab' ? '📝 Học Từ Vựng' : currentView === 'Match' ? '🧩 Ghép Câu' : '🎮 Đấu Trường'}
        </div>
        <div className="mobile-lesson-pill" onClick={() => setIsMobileNavOpen(true)}>
          {selectedLesson ? (selectedLesson.Title.length > 15 ? selectedLesson.Title.substring(0, 15) + '...' : selectedLesson.Title) : 'Bài học'} ▾
        </div>
      </div>

      {/* MOBILE BACKDROP OVERLAY */}
      {isMobileNavOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setIsMobileNavOpen(false)} 
        />
      )}

      {/* LEFT SIDEBAR (Desktop Fixed / Mobile Slide Drawer) */}
      <div className={`sidebar ${isMobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header-row">
          <div className="sidebar-title">Đường Tới HSK</div>
          <button className="sidebar-close-btn" onClick={() => setIsMobileNavOpen(false)}>✕</button>
        </div>
        
        <div className="sidebar-label">CHỌN BÀI HỌC</div>
        <select 
          className="sidebar-select" 
          value={selectedLesson ? selectedLesson.Title : ''}
          onChange={(e) => {
            const l = lessons.find(x => x.Title === e.target.value);
            if (l) setSelectedLesson(l);
            setIsMobileNavOpen(false);
          }}
        >
          {lessons.map((l, i) => (
            <option key={i} value={l.Title}>{l.Title}</option>
          ))}
        </select>

        <div className="sidebar-label">MENU CHỨC NĂNG</div>
        <button 
          className={`sidebar-btn ${currentView === 'Vocab' ? 'active' : ''}`}
          onClick={() => { setCurrentView('Vocab'); setIsMobileNavOpen(false); }}
        >
          📝 Học Từ Vựng
        </button>
        <button 
          className={`sidebar-btn ${currentView === 'Match' ? 'active' : ''}`}
          onClick={() => { setCurrentView('Match'); setIsMobileNavOpen(false); }}
        >
          🧩 Ghép / Dịch Câu
        </button>
        <button 
          className={`sidebar-btn ${currentView === 'Game' ? 'active' : ''}`}
          onClick={() => { setCurrentView('Game'); setIsMobileNavOpen(false); }}
        >
          🎮 Đấu Trường Phản Xạ
        </button>

        <div className="sidebar-label">CÀI ĐẶT</div>
        <button className="sidebar-btn sidebar-btn-danger" onClick={handleResetData}>
          🔄 Xóa dữ liệu học
        </button>
      </div>

      {/* RIGHT MAIN CONTENT */}
      <div className="main-content">
        
        {/* VOCAB VIEW */}
        {currentView === 'Vocab' && currentVocab && (
          <div>
            <div className="view-header">
              <div className="view-title">Học Từ Vựng</div>
              <div style={{display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap'}}>
                {/* Practice Mode Toggle */}
                <div className="practice-mode-toggle">
                  <button 
                    className={`mode-toggle-btn ${vocabPracticeMode === 'MultipleChoice' ? 'active' : ''}`}
                    onClick={() => setVocabPracticeMode('MultipleChoice')}
                  >
                    🔘 Trắc nghiệm
                  </button>
                  <button 
                    className={`mode-toggle-btn ${vocabPracticeMode === 'WritePinyin' ? 'active' : ''}`}
                    onClick={() => setVocabPracticeMode('WritePinyin')}
                  >
                    ⌨️ Viết Pinyin
                  </button>
                </div>

                <label style={{cursor: 'pointer', fontWeight: 'bold'}}>
                  <input type="checkbox" checked={isListeningMode} onChange={(e) => setIsListeningMode(e.target.checked)} style={{marginRight: '8px'}} />
                  🎧 Luyện Nghe
                </label>
                <button className="btn-generate" style={{padding: '10px 20px'}} onClick={openAnalysis}>📊 Phân Tích</button>
                
                {vocabPracticeMode === 'MultipleChoice' && (
                  <select className="sidebar-select" style={{marginBottom: 0, minWidth: '150px'}} value={vocabDirection} onChange={(e) => setVocabDirection(e.target.value)}>
                    <option value="Trung -> Việt">Trung {'>'} Việt</option>
                    <option value="Việt -> Trung">Việt {'>'} Trung</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flashcard">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div className="vocab-chinese" style={{ visibility: isVocabRevealed ? 'visible' : 'hidden' }}>
                  {vocabPracticeMode === 'WritePinyin' 
                    ? currentVocab.Chinese 
                    : (vocabDirection === 'Trung -> Việt' ? currentVocab.Chinese : currentVocab.Meaning)}
                </div>
                {(vocabPracticeMode === 'WritePinyin' || vocabDirection === 'Trung -> Việt') && (
                  <>
                    <button onClick={() => handleSpeak(currentVocab.Chinese)} style={{ background:'transparent', border:'none', fontSize:'40px', cursor:'pointer', marginLeft:'20px' }}>
                      🔊
                    </button>
                    <button onClick={toggleRecording} style={{ background:'transparent', border:'none', fontSize:'40px', cursor:'pointer', marginLeft:'10px', display: 'flex', alignItems: 'center' }}>
                      {isRecording ? '⏹️' : '🎤'}
                      {isRecording && <div style={{marginLeft: '10px'}}><AudioVisualizer isRecording={isRecording} /></div>}
                    </button>
                  </>
                )}
              </div>

              <div className="vocab-pinyin" style={{ visibility: isVocabRevealed ? 'visible' : 'hidden' }}>
                {currentVocab.Pinyin}
              </div>

              {/* Show Meaning in Pinyin mode when revealed */}
              {vocabPracticeMode === 'WritePinyin' && isMeaningVisible && (
                <div className="vocab-meaning">
                  {currentVocab.Meaning}
                </div>
              )}

              {/* Diễn giải cách nhớ / Memory Hint */}
              {isMeaningVisible && currentVocab.MemoryHint && (
                <div className="memory-hint">
                  💡 <strong>Cách nhớ:</strong> {currentVocab.MemoryHint}
                </div>
              )}
              
              {!isMeaningVisible ? (
                <button className="btn-show-meaning" onClick={() => {
                  setIsMeaningVisible(true);
                  setVocabFeedback('Đây là đáp án đúng:');
                }}>
                  👁️ Xem Kết Quả
                </button>
              ) : (
                <button className="btn-next" onClick={() => {
                  if (currentVocabIndex < vocabList.length - 1) {
                    setCurrentVocabIndex(currentVocabIndex + 1);
                    generateVocabOptions(vocabList[currentVocabIndex + 1], vocabList);
                  } else {
                    setVocabFeedback('Hoàn thành bài học từ vựng!');
                  }
                }}>
                  Tiếp theo ➔
                </button>
              )}
            </div>

            <div className={`feedback-text ${isVocabCorrect ? 'feedback-correct' : 'feedback-wrong'}`}>
              {vocabFeedback}
            </div>

            {/* WRITE PINYIN MODE */}
            {vocabPracticeMode === 'WritePinyin' ? (
              <div className="pinyin-input-container">
                <input
                  ref={pinyinInputRef}
                  type="text"
                  className={`pinyin-input ${pinyinStatus ? pinyinStatus : ''}`}
                  placeholder="Nhập pinyin có dấu (ví dụ: nǐ hǎo)..."
                  value={pinyinInputText}
                  onChange={(e) => setPinyinInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (!isMeaningVisible) {
                        handleCheckPinyin();
                      } else if (currentVocabIndex < vocabList.length - 1) {
                        setCurrentVocabIndex(currentVocabIndex + 1);
                        generateVocabOptions(vocabList[currentVocabIndex + 1], vocabList);
                      }
                    }
                  }}
                  disabled={isMeaningVisible && isVocabCorrect}
                />
                <div className="pinyin-actions">
                  <button 
                    className="btn-generate" 
                    style={{ background: '#3182CE', padding: '12px 30px' }}
                    onClick={handleCheckPinyin}
                    disabled={!pinyinInputText.trim()}
                  >
                    ✔️ Kiểm tra
                  </button>
                </div>
              </div>
            ) : (
              /* MULTIPLE CHOICE MODE */
              <div className="options-grid">
                {vocabOptions.map((opt, idx) => {
                  const isCorrectOption = vocabDirection === 'Trung -> Việt' 
                    ? opt === currentVocab.Meaning
                    : opt === currentVocab.Chinese;
                  
                  let optionStyle = {};
                  if (isMeaningVisible) {
                    if (isCorrectOption) {
                      optionStyle = { backgroundColor: '#48bb78', color: 'white', borderColor: '#48bb78' };
                    } else {
                      optionStyle = { opacity: 0.5 };
                    }
                  }

                  return (
                    <button 
                      key={idx} 
                      className="option-btn"
                      onClick={() => handleVocabAnswer(opt)}
                      disabled={isMeaningVisible}
                      style={optionStyle}
                    >
                      <span style={{marginRight: '8px', color: (isMeaningVisible && isCorrectOption) ? '#e2e8f0' : '#A0AEC0', fontSize: '14px'}}>{idx + 1}.</span>
                      {opt}
                      {vocabDirection === 'Việt -> Trung' && (
                        <div style={{fontSize: '13px', color: (isMeaningVisible && isCorrectOption) ? '#e2e8f0' : '#718096', marginTop: '4px'}}>
                          {pinyin(opt)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MATCH VIEW */}
        {currentView === 'Match' && currentSentence && (
          <div>
            <div className="view-header">
              <div className="view-title">Ghép / Dịch Câu</div>
              <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
                <button className="btn-generate" style={{padding: '10px 20px'}} onClick={openAnalysis}>📊 Phân Tích</button>
                <select className="sidebar-select" style={{marginBottom: 0, minWidth: '150px'}} value={matchDirection} onChange={(e) => setMatchDirection(e.target.value)}>
                  <option value="Trung -> Việt">Trung {'>'} Việt</option>
                  <option value="Việt -> Trung">Việt {'>'} Trung</option>
                </select>
              </div>
            </div>

            <div className="match-prompt-area" style={{textAlign: 'center'}}>
              <div className="match-prompt-header">
                <div style={{fontSize: '24px', fontWeight: 'bold', color: '#2B6CB0'}}>
                  {matchDirection === 'Trung -> Việt' ? currentSentence.Chinese : currentSentence.Vietnamese}
                </div>
                {matchDirection === 'Trung -> Việt' && (
                  <div className="icon-group">
                    <button onClick={() => handleSpeak(currentSentence.Chinese, 0.5)} style={{ background:'transparent', border:'none', fontSize:'24px', cursor:'pointer' }} title="Nghe chậm">🐌</button>
                    <button onClick={() => handleSpeak(currentSentence.Chinese)} style={{ background:'transparent', border:'none', fontSize:'24px', cursor:'pointer' }} title="Nghe">🔊</button>
                    <button onClick={() => {navigator.clipboard.writeText(currentSentence.Chinese); alert("Đã copy!")}} style={{ background:'transparent', border:'none', fontSize:'24px', cursor:'pointer' }} title="Copy">📋</button>
                    <button onClick={toggleRecording} style={{ background:'transparent', border:'none', fontSize:'24px', cursor:'pointer', display: 'flex', alignItems: 'center' }} title="Ghi âm">
                      {isRecording ? '⏹️' : '🎤'}
                      {isRecording && <div style={{marginLeft: '10px'}}><AudioVisualizer isRecording={isRecording} /></div>}
                    </button>
                  </div>
                )}
              </div>
              <div style={{fontSize: '18px', color: '#718096', marginTop: '10px'}}>
                {matchDirection === 'Trung -> Việt' ? currentSentence.Pinyin : ''}
              </div>

              {matchDirection === 'Việt -> Trung' && sentenceFeedback.includes('Chính xác') && (
                <div style={{marginTop: '15px', padding: '10px', background: '#F0FFF4', borderRadius: '8px', display: 'inline-block'}}>
                  <div style={{fontSize: '22px', fontWeight: 'bold', color: '#2F855A'}}>
                    {currentSentence.Chinese}
                  </div>
                  <div style={{fontSize: '16px', color: '#4A5568', margin: '5px 0'}}>
                    {currentSentence.Pinyin}
                  </div>
                  <button onClick={() => handleSpeak(currentSentence.Chinese, 0.5)} style={{ background:'transparent', border:'none', fontSize:'24px', cursor:'pointer' }} title="Nghe chậm">🐌</button>
                  <button onClick={() => handleSpeak(currentSentence.Chinese)} style={{ background:'transparent', border:'none', fontSize:'24px', cursor:'pointer' }} title="Nghe đáp án">🔊</button>
                </div>
              )}

              {/* Hiển thị Giải thích ngữ pháp & Cấu trúc câu */}
              {(currentSentence.SyntaxExplanation || currentSentence.syntaxExplanation || currentSentence.GrammarContext) && (
                <div className="grammar-explanation-box">
                  <div className="grammar-explanation-title">
                    <span>💡 Giải thích ngữ pháp:</span>
                    {currentSentence.GrammarContext && !currentSentence.GrammarContext.includes("MẪU CÂU") && (
                      <span style={{fontWeight: 'normal', color: '#A16207', fontSize: '13px'}}>
                        [{currentSentence.GrammarContext}]
                      </span>
                    )}
                  </div>
                  <div className="grammar-explanation-content">
                    {currentSentence.SyntaxExplanation || currentSentence.syntaxExplanation || "Xem cấu trúc và từ vựng trong câu để ghép chính xác."}
                  </div>
                </div>
              )}
            </div>

            <div className="match-board">
              <div className="match-box">
                <div style={{color: '#A0AEC0', marginBottom: '10px'}}>Đã chọn (Click để bỏ):</div>
                <div className="pieces-container">
                  {selectedPieces.map((p, i) => (
                    <button key={p.id + '-' + i} className="piece-btn" onClick={() => deselectPiece(p)}>
                      <div style={{fontSize: '20px'}}>{p.text}</div>
                      {matchDirection === 'Việt -> Trung' && (
                        <div style={{fontSize: '12px', marginTop: '5px', color: '#CBD5E0'}}>
                          <div>{pinyin(p.text)}</div>
                          <div onClick={(e) => {e.stopPropagation(); handleSpeak(p.text)}}>🔊</div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="match-box" style={{marginTop: '20px'}}>
                <div style={{color: '#A0AEC0', marginBottom: '10px'}}>Mảnh ghép:</div>
                <div className="pieces-container">
                  {availablePieces.map((p, i) => (
                    <button key={p.id + '-' + i} className="piece-btn available-piece" onClick={() => selectPiece(p)}>
                      <div style={{fontSize: '20px'}}>{p.text}</div>
                      {matchDirection === 'Việt -> Trung' && (
                        <div style={{fontSize: '12px', marginTop: '5px', color: '#A0AEC0'}}>
                          <div>{pinyin(p.text)}</div>
                          <div onClick={(e) => {e.stopPropagation(); handleSpeak(p.text)}}>🔊</div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {sentenceFeedback && (
                <div style={{marginTop: '20px', padding: '15px', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', backgroundColor: sentenceFeedback.includes('Chính xác') ? '#C6F6D5' : '#FED7D7', color: sentenceFeedback.includes('Chính xác') ? '#2F855A' : '#C53030'}}>
                  {sentenceFeedback}
                </div>
              )}

              <div className="match-action-buttons">
                <button className="btn-generate" style={{background: '#EDF2F7', color: '#4A5568'}} onClick={prevSentence}>Trước</button>
                <button className="btn-generate" style={{background: '#FBD38D', color: '#744210'}} onClick={handleSmartHint}>💡 Gợi ý</button>
                <button className="btn-generate" style={{background: '#3182CE'}} onClick={checkSentence}>✔️ Kiểm tra</button>
                <button className="btn-generate" style={{background: '#EDF2F7', color: '#4A5568'}} onClick={nextSentence}>Tiếp</button>
              </div>
            </div>
          </div>
        )}

        {/* REFLEX GAME VIEW */}
        {currentView === 'Game' && (
          <ReflexGame 
            lessons={lessons}
            selectedLesson={selectedLesson}
            progressService={progressService}
            handleSpeak={handleSpeak}
          />
        )}

      </div>

      {/* ANALYSIS MODAL */}
      {showAnalysis && analysisStats && (
        <div className="modal-overlay" onClick={() => setShowAnalysis(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">📊 Bảng Phân Tích Tiến Độ</div>
            
            <div className="analysis-stats-summary">
              <div className="stat-badge stat-badge-correct">
                <span className="stat-badge-label">Tổng câu ĐÚNG:</span>
                <span className="stat-badge-value">{analysisStats.totalCorrect}</span>
              </div>
              <div className="stat-badge stat-badge-wrong">
                <span className="stat-badge-label">Tổng câu SAI:</span>
                <span className="stat-badge-value">{analysisStats.totalWrong}</span>
              </div>
              <div className="stat-badge stat-badge-learned">
                <span className="stat-badge-label">Đã học:</span>
                <span className="stat-badge-value">{analysisStats.learnedCount}</span>
              </div>
              <div className="stat-badge stat-badge-unlearned">
                <span className="stat-badge-label">Chưa học:</span>
                <span className="stat-badge-value">{analysisStats.unlearnedCount}</span>
              </div>
            </div>

            <div className="analysis-table-container">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>{analysisStats.type === 'Vocab' ? 'Từ Mới' : 'Câu'}</th>
                    <th>{analysisStats.type === 'Vocab' ? 'Pinyin' : 'Tiếng Việt'}</th>
                    <th>Đúng</th>
                    <th>Sai</th>
                  </tr>
                </thead>
                <tbody>
                  {analysisStats.list.map((item, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>{item.Chinese}</td>
                      <td>{analysisStats.type === 'Vocab' ? item.Pinyin : item.Vietnamese}</td>
                      <td style={{color: '#48BB78', fontWeight: 'bold'}}>{item.CorrectCount || 0}</td>
                      <td style={{color: '#E53E3E', fontWeight: 'bold'}}>{item.WrongCount || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="btn-close-modal" style={{marginTop: '15px'}} onClick={() => setShowAnalysis(false)}>Đóng lại</button>
          </div>
        </div>
      )}

    </div>
  )
}

export default App

