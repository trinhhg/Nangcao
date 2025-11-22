document.addEventListener('DOMContentLoaded', () => {
    const textLayer = document.getElementById('text-layer');
    const highlightLayer = document.getElementById('highlight-layer');
    const keywordsInput = document.getElementById('keywords-input');
    const keywordsTags = document.getElementById('keywords-tags');
    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const wholeWordsCb = document.getElementById('wholeWords');
    const matchCaseCb = document.getElementById('matchCase');
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');

    let currentKeywords = [];
    let replacedWords = new Set(); // Lưu từ đã replace để highlight vàng
    let highlightTimer;

    // ==================== HIGHLIGHT SIÊU MƯỢT ====================
    function highlightAll() {
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => {
            const text = textLayer.textContent || '';
            if (!text) {
                highlightLayer.innerHTML = '';
                return;
            }

            saveSelection();
            highlightLayer.innerHTML = '';

            const matches = [];

            // 1. Từ đã replace → vàng đậm nhất
            if (replacedWords.size > 0) {
                const regex = new RegExp(Array.from(replacedWords).map(escapeRegex).join('|'), 'gi');
                let m;
                while ((m = regex.exec(text)) !== null) {
                    matches.push({ start: m.index, end: m.index + m[0].length, cls: 'hl-yellow', priority: 999 });
                }
            }

            // 2. Keywords thường
            const flags = matchCaseCb.checked ? 'g' : 'gi';
            currentKeywords.forEach((kw, i) => {
                let regex;
                if (wholeWordsCb.checked) {
                    const bound = '(^|[^\\p{L}\\p{N}])';
                    regex = new RegExp(`\( {bound}( \){escapeRegex(kw)})(\( {bound}| \))`, 'u' + flags);
                } else {
                    regex = new RegExp(escapeRegex(kw), 'u' + flags);
                }

                let m;
                while ((m = regex.exec(text)) !== null) {
                    const start = wholeWordsCb.checked ? m.index + m[1].length : m.index;
                    const end = start + kw.length;
                    matches.push({ start, end, cls: ['hl-pink','hl-blue','hl-green','hl-orange','hl-purple'][i % 5], priority: 100 });
                }
            });

            // Sort + loại overlap
            matches.sort((a, b) => a.start - b.start || b.priority - a.priority);
            const final = [];
            let last = 0;
            for (const m of matches) {
                if (m.start >= last) {
                    final.push(m);
                    last = m.end;
                }
            }

            // Build DOM
            const frag = document.createDocumentFragment();
            let pos = 0;
            for (const m of final) {
                if (m.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, m.start)));
                const span = document.createElement('span');
                span.className = m.cls;
                span.textContent = text.slice(m.start, m.end);
                frag.appendChild(span);
                pos = m.end;
            }
            if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
            highlightLayer.appendChild(frag);

            restoreSelection();
        }, 100);
    }

    // ==================== PASTE + SỬA MƯỢT NHƯ WORD ====================
    let savedRange = null;
    function saveSelection() {
        const sel = window.getSelection();
        savedRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    }
    function restoreSelection() {
        if (!savedRange) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
    }

    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        saveSelection();

        const text = (e.clipboardennieData || window.clipboardData).getData('text/plain');
        const lines = text.replace(/\r\n/g, '\n').split('\n');

        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        range.deleteContents();

        if (lines.length === 1) {
            range.insertNode(document.createTextNode(lines[0]));
            range.collapse(false);
        } else {
            lines.forEach((line, i) => {
                if (i > 0) range.insertNode(document.createElement('br'));
                if (line) range.insertNode(document.createTextNode(line));
            });
            range.collapse(false);
        }

        sel.removeAllRanges();
        sel.addRange(range);
        highlightAll();
    });

    // Sửa mượt, không nhảy con trỏ
    textLayer.addEventListener('input', () => {
        // Normalize: tránh <div>, chỉ cho <br> và text
        const normalizeNode = (node) => {
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') {
                const parent = node.parentNode;
                while (node.firstChild) parent.insertBefore(node.firstChild, node);
                parent.removeChild(node);
            }
        };
        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_ELEMENT);
        let n;
        while (n = walker.nextNode()) normalizeNode(n);

        highlightAll();
    });

    // ==================== REPLACE + TỰ ĐỘNG HIGHLIGHT VÀNG ====================
    function replaceAllSafe() {
        saveSelection();
        const mode = getCurrentReplaceMode();
        if (!mode?.pairs?.length) return showNotification('Chưa có cặp thay thế!', 'error');

        replacedWords.clear();
        let text = textLayer.textContent;

        mode.pairs.forEach(p => {
            if (!p.find || !p.replace) return;
            const regex = new RegExp(escapeRegex(p.find), mode.options?.matchCase ? 'g' : 'gi');
            text = text.replace(regex, match => {
                replacedWords.add(p.replace.trim()); // Lưu từ mới để highlight vàng
                return p.replace;
            });
        });

        textLayer.textContent = text;
        highlightAll();
        showNotification(`Đã thay thế xong! Đang highlight ${replacedWords.size} từ mới`, 'success');
        restoreSelection();
    }

    // ==================== NÚT TÌM KIẾM + ĐẾM ====================
    searchBtn.onclick = () => {
        currentKeywords = Array.from(keywordsTags.children).map(t => t.textContent.replace('×', '').trim());
        const count = currentKeywords.reduce((sum, kw) => {
            const regex = new RegExp(escapeRegex(kw), matchCaseCb.checked ? 'g' : 'gi');
            return sum + (textLayer.textContent.match(regex) || []).length;
        }, 0);
        highlightAll();
        showNotification(count > 0 ? `Tìm thấy ${count} kết quả!` : 'Không tìm thấy từ khóa nào!', count > 0 ? 'success' : 'error');
    };

    // ==================== KHỞI ĐỘNG ====================
    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function showNotification(msg, type = 'success') {
        const n = document.createElement('div');
        n.className = `notification ${type}`;
        n.textContent = msg;
        document.getElementById('notification-container').prepend(n);
        setTimeout(() => n.remove(), 3000);
    }

    // Sync scroll mượt
    let raf;
    textLayer.addEventListener('scroll', () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            highlightLayer.scrollTop = textLayer.scrollTop;
            highlightLayer.scrollLeft = textLayer.scrollLeft;
        });
    }, { passive: true });

    // Các nút khác
    clearBtn.onclick = () => {
        currentKeywords = [];
        replacedWords.clear();
        keywordsTags.innerHTML = '';
        highlightAll();
    };

    replaceAllBtn.onclick = replaceAllSafe;

    // Keywords tags
    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = keywordsInput.value.trim();
            if (val && !currentKeywords.includes(val)) {
                currentKeywords.push(val);
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.innerHTML = `${val} <span class="remove-tag">×</span>`;
                tag.querySelector('.remove-tag').onclick = () => {
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x => x !== val);
                    highlightAll();
                };
                keywordsTags.appendChild(tag);
            }
            keywordsInput.value = '';
            highlightAll();
        }
    });

    // Khởi động
    textLayer.focus();
    highlightAll();
});
