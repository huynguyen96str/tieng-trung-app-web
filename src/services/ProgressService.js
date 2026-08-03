export class ProgressService {
    getProgress(key) {
        const data = localStorage.getItem('progress_' + key);
        if (data) {
            return JSON.parse(data);
        }
        return { CorrectCount: 0, WrongCount: 0 };
    }

    updateProgress(key, isCorrect) {
        const progress = this.getProgress(key);
        if (isCorrect) {
            progress.CorrectCount++;
        } else {
            progress.WrongCount++;
        }
        localStorage.setItem('progress_' + key, JSON.stringify(progress));
    }

    resetProgress() {
        // Only clear keys starting with progress_
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('progress_')) {
                keysToRemove.push(k);
            }
        }
        for (const k of keysToRemove) {
            localStorage.removeItem(k);
        }
    }
}
