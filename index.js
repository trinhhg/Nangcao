// ====================================================================
// HIGHLIGHT TRONG DOM (KHÔNG OVERLAY) – CHUẨN GOOGLE DOCS / WORD
// Whole words | Replace All → highlight từ mới | Paste plaintext | No flicker
// ====================================================================

class TextHighlighter {
    constructor(container) {
        this.container = container;
        this.keywords = [];           // Từ khóa tìm kiếm
        this.replacedKeywords = [];   // Từ thay thế (ưu tiên cao hơn)
        this.matchCase = false;
        this.wholeWords = true;
        this.HIGHLIGHT_CLASSES = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];
    }

    // === UTILS ===
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    saveSelection() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        return { start: range.startOffset, end: range.endOffset, node: range.startContainer };
    }

    restoreSelection(saved) {
        if (!saved) return;
        const sel = window.getSelection();
        const range = document.createRange();
        try {
            range.setStart(saved.node, saved.start);
            range.setEnd(saved.node, saved.end);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) { /* ignore */ }
    }

    // === XÓA HIGHLIGHT CŨ ===
    removeHighlights() {
        this.container.querySelectorAll('mark[data-hl]').forEach(m => {
            const parent = m.parentNode;
            parent.replaceChild(document.createTextNode(m.textContent), m);
            parent.normalize();
        });
    }

    // === HIGHLIGHT THEO KEYWORDS ===
    highlight() {
        const saved = this.saveSelection();
        this.removeHighlights();

        const allKeywords = [
            ...this.keywords.map((k, i) => ({ text: k, priority: 100, class: this.HIGHLIGHT_CLASSES[i % this.HIGHLIGHT_CLASSES.length] })),
            ...this.replacedKeywords.map((k, i) => ({ text: k, priority: 500, class: this.HIGHLIGHT_CLASSES[(this.keywords.length + i) % this.HIGHLIGHT_CLASSES.length] }))
        ];

        if (!allKeywords.length) {
            this.restoreSelection(saved);
            return;
        }

        // Sort: priority ↓ → length ↓
        allKeywords.sort((a, b) => b.priority - a.priority || b.text.length - a.text.length);

        const walker = document.createTreeWalker(this.container, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(textNode => {
            let text = textNode.nodeValue;
            if (!text.trim()) return;

            let lastIndex = 0;
            const frag = document.createDocumentFragment();

            for (const kw of allKeywords) {
                const flags = this.matchCase ? 'g' : 'gi';
                const pattern = this.wholeWords ? `\\b${this.escapeRegex(kw.text)}\\b` : this.escapeRegex(kw.text);
                const regex = new RegExp(pattern, flags);
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const idx = match.index;
                    if (idx > lastIndex) {
                        frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
                    }
                    const mark = document.createElement('mark');
                    mark.setAttribute('data-hl', '1');
                    mark.className = kw.class;
                    mark.textContent = match[0];
                    frag.appendChild(mark);
                    lastIndex = idx + match[0].length;
                }
            }

            if (lastIndex > 0 && lastIndex < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            }

            if (frag.childNodes.length > 0) {
                textNode.parentNode.replaceChild(frag, textNode);
            }
        });

        this.container.normalize();
        this.restoreSelection(saved);
    }

    // === REPLACE ALL + HIGHLIGHT TỪ MỚI ===
    replaceAll(pairs = []) {
        if (!pairs.length) return false;

        const saved = this.saveSelection();
        let changed = false;

        const walker = document.createTreeWalker(this.container, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
            let text = node.nodeValue;
            pairs.forEach(p => {
                if (!p.find) return;
                const flags = this.matchCase ? 'g' : 'gi';
                const pattern = this.wholeWords ? `\\b${this.escapeRegex(p.find)}\\b` : this.escapeRegex(p.find);
                const regex = new RegExp(pattern, flags);
                if (regex.test(text)) {
                    text = text.replace(regex, p.replace);
                    changed = true;
                }
            });
            if (text !== node.nodeValue) node.nodeValue = text;
        });

        if (changed) {
            this.replacedKeywords = pairs
                .filter(p => p.replace && p.replace.trim())
                .map(p => p.replace.trim());
            this.highlight();
        }

        this.restoreSelection(saved);
        return changed;
    }

    // === PASTE CHỈ PLAINTEXT ===
    handlePaste(e) {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
        requestAnimationFrame(() => this.highlight());
    }

    // === CẬP NHẬT KEYWORDS ===
    setKeywords(words = []) {
        this.keywords = words.filter(Boolean);
        this.highlight();
    }

    addKeyword(word) {
        if (word && !this.keywords.includes(word)) {
            this.keywords.push(word);
            this.highlight();
        }
    }

    clearKeywords() {
        this.keywords = [];
        this.replacedKeywords = [];
        this.highlight();
    }

    // === CÀI ĐẶT ===
    setOptions({ matchCase = false, wholeWords = true } = {}) {
        this.matchCase = matchCase;
        this.wholeWords = wholeWords;
        this.highlight();
    }
}

// ====================================================================
// TÍCH HỢP VÀO APP HIỆN TẠI (giữ nguyên HTML cũ)
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    const textLayer = document.getElementById('text-layer');
    const keywordsInput = document.getElementById('keywords-input');
    const keywordsTags = document.getElementById('keywords-tags');
    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const matchCaseCb = document.getElementById('matchCase');
    const wholeWordsCb = document.getElementById('wholeWords');
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');

    // Khởi tạo highlighter
    const highlighter = new TextHighlighter(textLayer);

    // === PASTE ===
    textLayer.addEventListener('paste', e => highlighter.handlePaste(e));

    // === INPUT DEBOUNCE ===
    let inputTimeout;
    textLayer.addEventListener('input', () => {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => highlighter.highlight(), 16);
    });

    // === KEYWORDS ===
    const addKeywordsFromInput = () => {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        vals.forEach(v => highlighter.addKeyword(v));
        keywordsInput.value = '';
    };

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addKeywordsFromInput(); }
    });
    keywordsInput.addEventListener('input', () => {
        if (keywordsInput.value.includes(',')) addKeywordsFromInput();
    });

    const addKeywordTag = word => {
        const tag = document.createElement('div');
        tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
        tag.innerHTML = `${word} <span class="remove-tag cursor-pointer">×</span>`;
        tag.querySelector('.remove-tag').onclick = () => {
            tag.remove();
            highlighter.keywords = highlighter.keywords.filter(k => k !== word);
            highlighter.highlight();
        };
        keywordsTags.appendChild(tag);
    };

    searchBtn.onclick = () => highlighter.highlight();
    clearBtn.onclick = () => {
        keywordsTags.innerHTML = '';
        highlighter.clearKeywords();
    };

    // === CÀI ĐẶT ===
    matchCaseCb.onchange = () => highlighter.setOptions({ matchCase: matchCaseCb.checked });
    wholeWordsCb.onchange = () => highlighter.setOptions({ wholeWords: wholeWordsCb.checked });

    // === REPLACE ALL ===
    replaceAllBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (!pairs.length) return showNotification('Chưa có cặp!', 'error');
        const success = highlighter.replaceAll(pairs);
        showNotification(success ? 'Đã thay thế!' : 'Không tìm thấy!', success ? 'success' : 'info');
    };

    // === KHỞI ĐỘNG ===
    requestAnimationFrame(() => highlighter.highlight());
});
