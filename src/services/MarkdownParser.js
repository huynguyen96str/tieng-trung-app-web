export class MarkdownParser {
    parseContent(content) {
        const lesson = {
            Title: '',
            Vocabularies: [],
            Sentences: []
        };
        
        const lines = content.split(/\r?\n/);
        let currentContext = "";
        
        // === VOCABULARY REGEXES ===
        // Format mới: | GUID | Tiếng Trung | Phiên Âm | Nghĩa | Diễn giải cách nhớ |
        const vocabRegexGuid5 = /^\|\s*([a-fA-F0-9\-]{36})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|$/;
        // Format GUID 4 cột: | GUID | Tiếng Trung | Phiên Âm | Nghĩa |
        const vocabRegexGuid4 = /^\|\s*([a-fA-F0-9\-]{36})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/;
        // Format cũ: | STT | Tiếng Trung | Phiên Âm | Nghĩa |
        const vocabRegexOld = /^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/;
        
        // === SENTENCE REGEXES ===
        // Format mới bảng: | GUID | Tiếng Trung | Phiên Âm | Nghĩa | Giải thích |
        const sentenceRegexTable5 = /^\|\s*([a-fA-F0-9\-]{36})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|$/;
        // Format cũ dạng list: - Chinese (Pinyin) - Vietnamese
        const sentenceRegexOld = /^-\s*(?:[A-Z]:\s*)?([^\(]+?)\s*\((.+?)\)\s*-\s*(.+?)$/;

        let vocabIdCounter = 1;
        let sentenceIdCounter = 1;

        for (const line of lines) {
            // === Title ===
            if (line.startsWith("# ")) {
                lesson.Title = line.substring(2).trim();
                continue;
            }

            // === Section headers ===
            if (line.startsWith("## ") || line.startsWith("### ")) {
                currentContext = line.replace(/^#+\s*/, "").trim();
                continue;
            }
            
            if (line.startsWith("**") && line.endsWith("**")) {
                currentContext = line.replace(/\*\*/g, "").trim();
                continue;
            }

            // Skip header/separator rows
            if (line.startsWith("|") && (line.includes("GUID") || line.includes("STT") || line.includes("---"))) {
                continue;
            }

            // === Parse table rows ===
            if (line.startsWith("|")) {
                // Determine section context
                const isVocabSection = currentContext.includes("TỪ VỰNG") || currentContext === "" || !currentContext.includes("MẪU CÂU");
                const isSentenceSection = currentContext.includes("MẪU CÂU") || currentContext.includes("HỘI THOẠI");

                // Try vocab patterns first (in vocab section)
                if (isVocabSection && !isSentenceSection) {
                    const matchGuid5 = line.match(vocabRegexGuid5);
                    if (matchGuid5) {
                        const ch = matchGuid5[2].trim();
                        if (!lesson.Vocabularies.some(v => v.Chinese === ch)) {
                            lesson.Vocabularies.push({
                                Id: vocabIdCounter++,
                                Guid: matchGuid5[1].trim(),
                                Chinese: ch,
                                Pinyin: matchGuid5[3].trim(),
                                Meaning: matchGuid5[4].trim(),
                                MemoryHint: matchGuid5[5].trim()
                            });
                        }
                        continue;
                    }

                    const matchGuid4 = line.match(vocabRegexGuid4);
                    if (matchGuid4) {
                        const ch = matchGuid4[2].trim();
                        if (!lesson.Vocabularies.some(v => v.Chinese === ch)) {
                            lesson.Vocabularies.push({
                                Id: vocabIdCounter++,
                                Guid: matchGuid4[1].trim(),
                                Chinese: ch,
                                Pinyin: matchGuid4[3].trim(),
                                Meaning: matchGuid4[4].trim(),
                                MemoryHint: ''
                            });
                        }
                        continue;
                    }

                    const matchOld = line.match(vocabRegexOld);
                    if (matchOld) {
                        const ch = matchOld[1].trim();
                        if (!lesson.Vocabularies.some(v => v.Chinese === ch)) {
                            lesson.Vocabularies.push({
                                Id: vocabIdCounter++,
                                Guid: '',
                                Chinese: ch,
                                Pinyin: matchOld[2].trim(),
                                Meaning: matchOld[3].trim(),
                                MemoryHint: ''
                            });
                        }
                        continue;
                    }
                }

                // Try sentence table pattern (in sentence section)
                if (isSentenceSection) {
                    const matchTable5 = line.match(sentenceRegexTable5);
                    if (matchTable5) {
                        const ch = matchTable5[2].trim();
                        const guid = matchTable5[1].trim();
                        if (!lesson.Sentences.some(s => s.Chinese === ch || s.Guid === guid)) {
                            lesson.Sentences.push({
                                Id: sentenceIdCounter++,
                                Guid: guid,
                                Chinese: ch,
                                Pinyin: matchTable5[3].trim(),
                                Vietnamese: matchTable5[4].trim(),
                                SyntaxExplanation: matchTable5[5].trim(),
                                GrammarContext: currentContext
                            });
                        }
                        continue;
                    }
                }

                // Fallback: try both vocab and sentence patterns regardless of section
                const matchGuid5 = line.match(vocabRegexGuid5);
                if (matchGuid5) {
                    const ch = matchGuid5[2].trim();
                    // Determine if it's vocab or sentence by checking if Chinese text contains punctuation
                    const hasPunctuation = /[。？！，、；：]/.test(ch);
                    if (hasPunctuation) {
                        if (!lesson.Sentences.some(s => s.Chinese === ch)) {
                            lesson.Sentences.push({
                                Id: sentenceIdCounter++,
                                Guid: matchGuid5[1].trim(),
                                Chinese: ch,
                                Pinyin: matchGuid5[3].trim(),
                                Vietnamese: matchGuid5[4].trim(),
                                SyntaxExplanation: matchGuid5[5].trim(),
                                GrammarContext: currentContext
                            });
                        }
                    } else {
                        if (!lesson.Vocabularies.some(v => v.Chinese === ch)) {
                            lesson.Vocabularies.push({
                                Id: vocabIdCounter++,
                                Guid: matchGuid5[1].trim(),
                                Chinese: ch,
                                Pinyin: matchGuid5[3].trim(),
                                Meaning: matchGuid5[4].trim(),
                                MemoryHint: matchGuid5[5].trim()
                            });
                        }
                    }
                    continue;
                }

                const matchOld = line.match(vocabRegexOld);
                if (matchOld) {
                    const ch = matchOld[1].trim();
                    if (!lesson.Vocabularies.some(v => v.Chinese === ch)) {
                        lesson.Vocabularies.push({
                            Id: vocabIdCounter++,
                            Guid: '',
                            Chinese: ch,
                            Pinyin: matchOld[2].trim(),
                            Meaning: matchOld[3].trim(),
                            MemoryHint: ''
                        });
                    }
                    continue;
                }
                
                continue;
            }

            // === Old sentence format (list style) ===
            const sentenceMatch = line.match(sentenceRegexOld);
            if (sentenceMatch) {
                const ch = sentenceMatch[1].trim();
                if (!lesson.Sentences.some(s => s.Chinese === ch)) {
                    lesson.Sentences.push({
                        Id: sentenceIdCounter++,
                        Guid: '',
                        Chinese: ch,
                        Pinyin: sentenceMatch[2].trim(),
                        Vietnamese: sentenceMatch[3].trim(),
                        GrammarContext: currentContext,
                        SyntaxExplanation: ''
                    });
                }
                continue;
            }

            // === Syntax explanation (blockquote) ===
            if (line.trim().startsWith("> ")) {
                if (lesson.Sentences.length > 0) {
                    let text = line.trim().substring(2).trim();
                    if (text.startsWith("Giải thích:")) text = text.substring(11).trim();
                    lesson.Sentences[lesson.Sentences.length - 1].SyntaxExplanation = text;
                }
                continue;
            }
        }

        return lesson;
    }
}
