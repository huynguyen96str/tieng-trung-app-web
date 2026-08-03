import { describe, it, expect } from 'vitest';
import { MarkdownParser } from './MarkdownParser';

describe('MarkdownParser', () => {
    it('should parse lesson title and vocabulary correctly', () => {
        const markdown = `
# Bài 1: Xin chào
## Từ vựng cơ bản
| STT | Tiếng Trung | Phiên Âm | Nghĩa |
| 1 | 你好 | nǐ hǎo | Xin chào |
| 2 | 谢谢 | xièxiè | Cảm ơn |

## Câu giao tiếp
- A: 你好 (nǐ hǎo) - Xin chào bạn
- B: 谢谢 (xièxiè) - Cảm ơn nhé
        `;

        const parser = new MarkdownParser();
        const lesson = parser.parseContent(markdown);

        expect(lesson.Title).toBe('Bài 1: Xin chào');
        
        expect(lesson.Vocabularies).toHaveLength(2);
        expect(lesson.Vocabularies[0].Chinese).toBe('你好');
        expect(lesson.Vocabularies[0].Meaning).toBe('Xin chào');
        
        expect(lesson.Sentences).toHaveLength(2);
        expect(lesson.Sentences[0].Chinese).toBe('你好');
        expect(lesson.Sentences[0].Vietnamese).toBe('Xin chào bạn');
        expect(lesson.Sentences[0].GrammarContext).toBe('Câu giao tiếp');
    });
});
