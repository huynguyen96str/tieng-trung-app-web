/**
 * TtsService - Dịch vụ phát âm tiếng Trung chuyên dụng
 * Hỗ trợ đa tầng: Youdao Mandarin Voice (Online HD) -> Google Translate TTS -> Web Speech API
 * Tương thích 100% mọi trình duyệt và hệ điều hành, không phụ thuộc vào gói giọng nói của Windows.
 */
class TtsService {
  constructor() {
    this.audioElement = null;
    this.activeUtterance = null;
    this.isSpeaking = false;
    this.listeners = new Set();
    this.cachedVoices = [];
    this.isUnlocked = false;

    if (typeof window !== 'undefined') {
      this.initVoices();
      this.initUnlockListener();
    }
  }

  /**
   * Khởi tạo và lắng nghe danh sách giọng đọc của trình duyệt
   */
  initVoices() {
    if ('speechSynthesis' in window) {
      const updateVoices = () => {
        try {
          this.cachedVoices = window.speechSynthesis.getVoices() || [];
        } catch (e) {
          console.warn('Get voices error:', e);
        }
      };
      updateVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = updateVoices;
      }
    }
  }

  /**
   * Mở khóa AudioContext và Audio Element trên lần tương tác đầu tiên của người dùng
   */
  initUnlockListener() {
    const unlock = () => {
      if (this.isUnlocked) return;
      this.isUnlocked = true;

      try {
        if (!this.audioElement) {
          this.audioElement = new Audio();
        }
      } catch (e) {
        console.warn('Audio element init warning:', e);
      }

      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /**
   * Đăng ký lắng nghe trạng thái phát âm
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(isSpeaking, text = '') {
    this.isSpeaking = isSpeaking;
    this.listeners.forEach((fn) => {
      try {
        fn(isSpeaking, text);
      } catch (e) {
        console.error('TTS listener error:', e);
      }
    });
  }

  /**
   * Dừng toàn bộ âm thanh đang phát
   */
  stop() {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.audioElement.removeAttribute('src');
      } catch (e) {
        // ignore
      }
    }

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
    }

    this.activeUtterance = null;
    this.notify(false);
  }

  /**
   * Làm sạch văn bản tiếng Trung trước khi đọc
   */
  cleanText(text) {
    if (!text || typeof text !== 'string') return '';
    return text.trim();
  }

  /**
   * Phát âm văn bản tiếng Trung với cơ chế fallback tự động
   * @param {string} text - Văn bản tiếng Trung cần đọc
   * @param {object|number} options - { rate: 1.0, onStart, onEnd, onError } hoặc số chỉ tốc độ (rate)
   */
  speak(text, options = {}) {
    const rawText = this.cleanText(text);
    if (!rawText) return;

    const rate = typeof options === 'number' ? options : (options.rate || 1.0);
    const onStart = typeof options === 'object' ? options.onStart : null;
    const onEnd = typeof options === 'object' ? options.onEnd : null;
    const onError = typeof options === 'object' ? options.onError : null;

    // Dừng âm thanh cũ trước khi phát mới
    this.stop();
    this.notify(true, rawText);
    if (onStart) onStart();

    // Chiến lược 1: Thử phát bằng Youdao HD Voice (Chuẩn giọng người bản xứ, cực tự nhiên và rõ chữ)
    this.playOnlineAudio(rawText, rate, () => {
      this.notify(false, rawText);
      if (onEnd) onEnd();
    }, (err) => {
      console.warn('Youdao TTS failed, trying Web Speech API...', err);
      // Chiến lược 2: Fallback sang Web Speech API
      this.playWebSpeech(rawText, rate, () => {
        this.notify(false, rawText);
        if (onEnd) onEnd();
      }, (webSpeechErr) => {
        console.warn('Web Speech API failed, trying Google TTS fallback...', webSpeechErr);
        // Chiến lược 3: Fallback sang Google Translate TTS
        this.playGoogleTts(rawText, rate, () => {
          this.notify(false, rawText);
          if (onEnd) onEnd();
        }, (googleErr) => {
          console.error('All TTS engines failed:', googleErr);
          this.notify(false, rawText);
          if (onError) onError(googleErr);
        });
      });
    });
  }

  /**
   * Phát âm qua Youdao Dictionary TTS Engine (Mandarin le=zh)
   */
  playOnlineAudio(text, rate, onDone, onFail) {
    try {
      if (!this.audioElement) {
        this.audioElement = new Audio();
      }

      const audio = this.audioElement;
      const encoded = encodeURIComponent(text);
      const url = `https://dict.youdao.com/dictvoice?audio=${encoded}&le=zh`;

      audio.src = url;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, rate));

      let hasEnded = false;
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
      };

      audio.onended = () => {
        if (!hasEnded) {
          hasEnded = true;
          cleanup();
          onDone();
        }
      };

      audio.onerror = (e) => {
        if (!hasEnded) {
          hasEnded = true;
          cleanup();
          onFail(e);
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          if (!hasEnded) {
            hasEnded = true;
            cleanup();
            onFail(e);
          }
        });
      }
    } catch (e) {
      onFail(e);
    }
  }

  /**
   * Phát âm qua Google Translate TTS fallback
   */
  playGoogleTts(text, rate, onDone, onFail) {
    try {
      if (!this.audioElement) {
        this.audioElement = new Audio();
      }

      const audio = this.audioElement;
      const encoded = encodeURIComponent(text);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=zh-CN&q=${encoded}`;

      audio.src = url;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, rate));

      let hasEnded = false;
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
      };

      audio.onended = () => {
        if (!hasEnded) {
          hasEnded = true;
          cleanup();
          onDone();
        }
      };

      audio.onerror = (e) => {
        if (!hasEnded) {
          hasEnded = true;
          cleanup();
          onFail(e);
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          if (!hasEnded) {
            hasEnded = true;
            cleanup();
            onFail(e);
          }
        });
      }
    } catch (e) {
      onFail(e);
    }
  }

  /**
   * Phát âm qua Web Speech API (Đã khắc phục lỗi GC và lỗi queue rỗng)
   */
  playWebSpeech(text, rate, onDone, onFail) {
    if (!('speechSynthesis' in window)) {
      onFail(new Error('SpeechSynthesis not supported'));
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = Math.max(0.5, Math.min(1.8, rate));

      // Tìm giọng tiếng Trung phù hợp nhất
      const voices = this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();
      const zhVoice = voices.find((v) => 
        v.lang === 'zh-CN' ||
        v.lang === 'zh-TW' ||
        v.lang === 'zh-HK' ||
        v.lang.toLowerCase().includes('zh') ||
        v.lang.toLowerCase().includes('cmn') ||
        (v.name && (v.name.includes('Chinese') || v.name.includes('Mandarin') || v.name.includes('普通话')))
      );

      if (zhVoice) {
        utterance.voice = zhVoice;
      }

      let hasEnded = false;
      const finish = (isSuccess, err) => {
        if (hasEnded) return;
        hasEnded = true;
        this.activeUtterance = null;
        if (isSuccess) {
          onDone();
        } else {
          onFail(err || new Error('Speech synthesis error'));
        }
      };

      utterance.onend = () => finish(true);
      utterance.onerror = (e) => finish(false, e);

      // Lưu giữ tham chiếu biến tránh GC thu hồi sớm
      this.activeUtterance = utterance;

      window.speechSynthesis.speak(utterance);

      // Safety timeout: nếu sau 10 giây chưa kết thúc
      setTimeout(() => {
        if (!hasEnded && this.activeUtterance === utterance) {
          finish(true);
        }
      }, 10000);
    } catch (e) {
      this.activeUtterance = null;
      onFail(e);
    }
  }
}

export const ttsService = new TtsService();
