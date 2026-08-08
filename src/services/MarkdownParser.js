export class MarkdownParser {
    parseContent(content) {
        const lesson = {
            Title: '',
            Vocabularies: [],
            Sentences: []
        };
        
        const lines = content.split(/\r?\n/);
        let currentContext = "";
        
        // Regex cho bảng Từ Vựng: | STT | Tiếng Trung | Phiên Âm | Nghĩa |
        const vocabRegex = /^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/;
        
        // Regex cho Câu: - [A:] Chinese (Pinyin) - Vietnamese
        const sentenceRegex = /^-\s*(?:[A-Z]:\s*)?([^\(]+?)\s*\((.+?)\)\s*-\s*(.+?)$/;

        let vocabIdCounter = 1;
        let sentenceIdCounter = 1;

        for (const line of lines) {
            if (line.startsWith("# ")) {
                lesson.Title = line.substring(2).trim();
                continue;
            }

            if (line.startsWith("## ") || line.startsWith("### ")) {
                currentContext = line.replace(/^#+\s*/, "").trim();
                continue;
            }
            
            if (line.startsWith("**") && line.endsWith("**")) {
                currentContext = line.replace(/\*\*/g, "").trim();
                continue;
            }

            const vocabMatch = line.match(vocabRegex);
            if (vocabMatch) {
                lesson.Vocabularies.push({
                    Id: vocabIdCounter++,
                    Chinese: vocabMatch[1].trim(),
                    Pinyin: vocabMatch[2].trim(),
                    Meaning: vocabMatch[3].trim()
                });
                continue;
            }

            const sentenceMatch = line.match(sentenceRegex);
            if (sentenceMatch) {
                lesson.Sentences.push({
                    Id: sentenceIdCounter++,
                    Chinese: sentenceMatch[1].trim(),
                    Pinyin: sentenceMatch[2].trim(),
                    Vietnamese: sentenceMatch[3].trim(),
                    GrammarContext: currentContext,
                    SyntaxExplanation: ''
                });
                continue;
            }

            if (line.trim().startsWith("> ")) {
                if (lesson.Sentences.length > 0) {
                    let text = line.trim().substring(2).trim();
                    if (text.startsWith("Giải thích:")) text = text.substring(11).trim();
                    lesson.Sentences[lesson.Sentences.length - 1].SyntaxExplanation = text;
                }
                continue;
            }

            // Fallback: accumulate as grammar context if not matching any structural marker
            if (!line.startsWith("|") && !line.startsWith("#") && !line.startsWith("-") && !line.startsWith("* Từ vựng bổ sung") && !line.startsWith("*Gợi ý")) {
                if (currentContext) {
                    currentContext += "\n" + line.trim();
                } else {
                    currentContext = line.trim();
                }
            }
        }

        return lesson;
    }
}
