export class SpeechRecognitionService {
    constructor() {
        this.recognition = null;
    }

    startRecording(onResult, onError, onEnd) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            onError("Trình duyệt của bạn không hỗ trợ tính năng Ghi âm (Speech Recognition). Vui lòng dùng Chrome, Edge hoặc Safari (phiên bản mới).");
            return;
        }

        // Khởi tạo lại mỗi lần để tránh lỗi crash hoặc ngắt lập tức trên iOS
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        // Bật lại interimResults để iOS nhận được partial transcript trước khi user bấm Stop
        this.recognition.interimResults = true;
        this.recognition.lang = 'zh-CN';

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
