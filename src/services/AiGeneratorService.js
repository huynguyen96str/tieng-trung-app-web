export class AiGeneratorService {
    constructor() {
        this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""; // Gemini API Key from environment
    }

    async generateMarkdownFromPdfText(pdfText, lessonTitle) {
        const prompt = `Dưới đây là nội dung văn bản được trích xuất từ một bài học tiếng Trung. 
Nhiệm vụ của bạn là định dạng lại toàn bộ nội dung này thành một file Markdown (.md) theo cấu trúc chuẩn xác như sau:

Quy tắc 1: Tiêu đề bài học
Phải bắt đầu bằng 1 dấu thăng (#) và khoảng trắng. 
Tiêu đề cho bài này là: \`# ${lessonTitle}\`

Quy tắc 3: Bảng Từ Vựng
Tất cả các từ vựng phải được đưa vào một bảng Markdown có 4 cột theo đúng thứ tự: STT, Tiếng Trung, Phiên Âm, Nghĩa.
Ví dụ:
| STT | Tiếng Trung | Phiên Âm | Nghĩa |
|---|---|---|---|
| 1 | 你好 | nǐ hǎo | Xin chào |

Quy tắc 4: Mẫu câu
- [Tiếng Trung] ([Phiên Âm]) - [Nghĩa Tiếng Việt]

Quy tắc 5: Giải thích cú pháp (QUAN TRỌNG)
Dưới mỗi mẫu câu (ở Quy tắc 4), bạn HÃY TỰ PHÂN TÍCH và tự viết thêm một dòng giải thích ngữ pháp, cấu trúc hoặc cách dùng từ của câu đó. Dòng giải thích này phải thụt lề 2 dấu cách và bắt đầu bằng \`> Giải thích: \`.

Quy tắc 6: Giữ nguyên nội dung Ngữ pháp (RẤT QUAN TRỌNG)
Tuyệt đối KHÔNG được tóm tắt hay bỏ sót bất kỳ phần giải thích ngữ pháp, lý thuyết, công thức, hay lưu ý nào có trong file PDF. Toàn bộ nội dung lý thuyết, cấu trúc ngữ pháp phải được giữ nguyên vẹn chi tiết như bản gốc và trình bày rõ ràng dưới các mục ## hoặc ###.

Dữ liệu đầu vào:
${pdfText}`;

        const requestBody = {
            contents: [
                {
                    parts: [{ text: prompt }]
                }
            ]
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${this.apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Lỗi gọi API (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            let textResponse = data.candidates[0].content.parts[0].text;

            if (textResponse.startsWith("```markdown")) {
                textResponse = textResponse.substring("```markdown".length).trim();
                if (textResponse.endsWith("```")) {
                    textResponse = textResponse.substring(0, textResponse.length - 3).trim();
                }
            }

            return textResponse;
        } catch (ex) {
            console.error(ex);
            throw new Error(`Không thể tạo Markdown: ${ex.message}`);
        }
    }

    async chat(userMessage) {
        const requestBody = {
            contents: [{ parts: [{ text: userMessage }] }]
        };
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${this.apiKey}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) throw new Error(`Lỗi API: ${await response.text()}`);
            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (ex) {
            throw new Error(`AI Error: ${ex.message}`);
        }
    }

    async generateAdditionalSentences(vocabs, grammars, count = 5) {
        const vocabList = vocabs.join(', ');
        const grammarList = grammars.join('\n- ');
        const prompt = `Bạn là một giáo viên tiếng Trung. Nhiệm vụ của bạn là tạo thêm ${count} câu ví dụ tiếng Trung mới nhằm giúp học sinh luyện tập ghép câu.
Hãy ƯU TIÊN sử dụng các từ vựng sau (nhưng không bắt buộc phải dùng tất cả): ${vocabList}

Và các câu này nên xoay quanh các chủ đề ngữ pháp sau (BẮT BUỘC mỗi chủ đề ngữ pháp phải có ít nhất 1 câu ví dụ minh họa):
- ${grammarList}

Yêu cầu định dạng đầu ra (TUYỆT ĐỐI TUÂN THỦ):
Mỗi câu bạn tạo ra phải theo định dạng Markdown sau (với dấu gạch ngang ở đầu):
- [Tiếng Trung] ([Phiên Âm]) - [Nghĩa Tiếng Việt]
  > Giải thích: [Giải thích ngắn gọn về ngữ pháp hoặc cấu trúc của câu]

Ví dụ:
- 我爱你 (Wǒ ài nǐ) - Tôi yêu bạn
  > Giải thích: Cấu trúc Chủ ngữ + Động từ + Tân ngữ cơ bản.

Chỉ trả về danh sách các câu được tạo, KHÔNG bao gồm bất kỳ lời giải thích hay tiêu đề nào khác ở đầu hoặc cuối.`;

        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }]
        };
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${this.apiKey}`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                if (response.status === 429) throw new Error("Google AI đang quá tải, vui lòng thử lại sau.");
                throw new Error(`Lỗi kết nối AI (${response.status})`);
            }
            const data = await response.json();
            let textResponse = data.candidates[0].content.parts[0].text;
            if (textResponse.startsWith("```markdown")) {
                textResponse = textResponse.substring("```markdown".length).trim();
                if (textResponse.endsWith("```")) {
                    textResponse = textResponse.substring(0, textResponse.length - 3).trim();
                }
            }
            return textResponse.trim();
        } catch (ex) {
            throw new Error(`Lỗi tạo câu AI: ${ex.message}`);
        }
    }
}
