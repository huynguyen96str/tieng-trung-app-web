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
        
        // Trên điện thoại (đặc biệt iOS) bắt buộc dùng false để tự ngắt khi nói xong
        // Trên máy tính dùng true để người dùng tự bấm Stop
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.recognition.continuous = !isMobile;
        
        // Bật lại interimResults để iOS nhận được partial transcript trước khi user bấm Stop
        this.recognition.interimResults = true;
        this.recognition.lang = 'zh-CN';

        this.isFinished = false;

        this.recognition.onresult = (event) => {
            let fullTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
                fullTranscript += event.results[i][0].transcript;
            }
            onResult(fullTranscript);
        };

        this.recognition.onerror = (event) => {
            if (this.isFinished) return; // Bỏ qua lỗi rác (như audio-capture) của Safari sau khi đã kết thúc
            onError(event.error);
        };

        this.recognition.onend = () => {
            this.isFinished = true;
            if(onEnd) onEnd();
        };

        try {
            this.recognition.start();
        } catch(e) {
            if (!this.isFinished) onError(e.message);
        }
    }

    stopRecording() {
        if (this.recognition) {
            this.recognition.stop();
        }
    }
}
