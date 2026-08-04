export class SpeechRecognitionService {
    constructor() {
        this.recognition = null;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            // Bật continuous = false để sửa lỗi iOS tự động ngắt kết nối ghi âm ngay lập tức
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'zh-CN';
        }
    }

    startRecording(onResult, onError, onEnd) {
        if (!this.recognition) {
            onError("Trình duyệt của bạn không hỗ trợ tính năng Ghi âm (Speech Recognition). Vui lòng dùng Chrome hoặc Edge.");
            return;
        }

        this.recognition.onresult = (event) => {
            let fullTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
                fullTranscript += event.results[i][0].transcript;
            }
            onResult(fullTranscript);
        };

        this.recognition.onerror = (event) => {
            onError(event.error);
        };

        this.recognition.onend = () => {
            if(onEnd) onEnd();
        };

        try {
            this.recognition.start();
        } catch(e) {
            onError(e.message);
        }
    }

    stopRecording() {
        if (this.recognition) {
            this.recognition.stop();
        }
    }
}
