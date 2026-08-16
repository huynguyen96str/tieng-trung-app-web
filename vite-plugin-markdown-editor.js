import fs from 'fs';
import path from 'path';

export default function markdownEditorPlugin() {
  return {
    name: 'markdown-editor-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/edit-markdown' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body);
              const { action, type, lessonTitle, oldChinese, oldPinyin, oldTranslation, newChinese, newPinyin, newTranslation } = payload;
              
              const dbDir = path.resolve(process.cwd(), 'src/Database');
              const files = fs.readdirSync(dbDir).filter(f => f.endsWith('.md'));
              
              let targetFile = null;
              
              for (const file of files) {
                const filePath = path.join(dbDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const firstLine = content.split(/\r?\n/)[0];
                let title = file.replace('.md', '').replace(/_/g, ' ');
                if (firstLine.startsWith('# ')) {
                   title = firstLine.substring(2).trim();
                }
                
                if (title === lessonTitle) {
                   targetFile = filePath;
                   break;
                }
              }
              
              if (!targetFile) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Lesson file not found' }));
                return;
              }
              
              const lines = fs.readFileSync(targetFile, 'utf-8').split(/\r?\n/);
              let updated = false;
              const newLines = [];
              
              for (let i = 0; i < lines.length; i++) {
                 const line = lines[i];
                 let lineMatched = false;
                 
                 if (type === 'Vocab') {
                    // Match pattern: | STT | Tiếng Trung | Phiên Âm | Nghĩa |
                    if (line.includes(`| ${oldChinese} |`) || (line.includes(`|`) && line.includes(oldChinese) && line.includes(oldTranslation))) {
                       lineMatched = true;
                       if (action === 'edit') {
                           // Try to preserve the STT number
                           const match = line.match(/^\|\s*(\d+)\s*\|/);
                           const stt = match ? match[1] : '1';
                           newLines.push(`| ${stt} | ${newChinese} | ${newPinyin} | ${newTranslation} |`);
                       }
                    }
                 } else if (type === 'Match') {
                    // Match pattern: - Tiếng Trung (Pinyin) - Nghĩa
                    if (line.includes(`- ${oldChinese}`) || (line.includes(`-`) && line.includes(oldChinese) && line.includes(oldTranslation))) {
                       lineMatched = true;
                       if (action === 'edit') {
                           newLines.push(`- ${newChinese} (${newPinyin || oldPinyin}) - ${newTranslation}`);
                       }
                    }
                 }
                 
                 if (!lineMatched) {
                    newLines.push(line);
                 } else {
                    updated = true;
                 }
              }
              
              res.setHeader('Content-Type', 'application/json');
              if (updated) {
                 fs.writeFileSync(targetFile, newLines.join('\n'), 'utf-8');
                 res.statusCode = 200;
                 res.end(JSON.stringify({ success: true }));
              } else {
                 res.statusCode = 400;
                 res.end(JSON.stringify({ error: 'Item not found in file' }));
              }
              
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
}
