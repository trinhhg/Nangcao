document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    const keywordsInput    = document.getElementById('keywords-input');
    const keywordsTags     = document.getElementById('keywords-tags');
    const searchBtn        = document.getElementById('search');
    const clearBtn         = document.getElementById('clear');
    const fontFamily       = document.getElementById('fontFamily');
    const fontSize         = document.getElementById('fontSize');
    const matchCaseCb      = document.getElementById('matchCase');
    const wholeWordsCb     = document.getElementById('wholeWords');
    const replaceAllBtn    = document.getElementById('replace-all');
    const punctuationList  = document.getElementById('punctuation-list');
    const textLayer        = document.getElementById('text-layer');

    // === STATE ===
    let currentKeywords  = [];
    let replacedKeywords = [];
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    // === UTILS ===
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Lưu/trả con trỏ an toàn
    let savedRange = null;
    function saveSelection() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        savedRange = sel.getRangeAt(0).cloneRange();
    }
    function restoreSelection() {
        if (!savedRange) return;
        try {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
        } catch(e) {
            savedRange = null;
        }
    }

    // === 1. TẠO REGEX CHUẨN KHÔNG LỖI
    function buildRegex(word) {
        if (!word) return null;
        const escaped = escapeRegex(word);
        const pattern = wholeWordsCb.checked ? `\\b${escaped}\\b` : escaped;
        return new RegExp(pattern, matchCaseCb.checked ? 'g' : 'gi');
    }

    // === 2. XÓA HIGHLIGHT AN TOÀN ===
    function removeHighlightsSafe(root = textLayer) {
        root.querySelectorAll('mark[data-hl]').forEach(mark => {
            mark.replaceWith(document.createTextNode(mark.textContent));
        });
        root.normalize();
    }

    // === 3. HIGHLIGHT CHUẨN NHƯ GOOGLE DOCS ===
    function highlightKeywords() {
        saveSelection();
        removeHighlightsSafe();

        const keywordsToHighlight = [
            ...replacedKeywords.map((t, i) => ({ text: t, cls: HIGHLIGHT_CLASSES[i % 6], priority: 999 })),
            ...currentKeywords.map((t, i) => ({ text: t, cls: HIGHLIGHT_CLASSES[(replacedKeywords.length + i) % 6], priority: 100 }))
        ];

        if (!keywordsToHighlight.length) {
            restoreSelection();
            return;
        }

        // Ưu tiên thay thế trước, rồi từ dài trước
        keywordsToHighlight.sort((a, b) => b.priority - a.priority || b.text.length - a.text.length);

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while (node = walker.nextNode()) {
            const text = node.nodeValue;

            // Duyệt từng từ khóa theo thứ tự ưu tiên
            for (const kw of keywordsToHighlight) {
                const regex = buildRegex(kw.text);
                if (!regex) continue;

                let match;
                // Reset lastIndex để tránh lỗi vòng lặp vô hạn
                regex.lastIndex = 0;

                while ((match = regex.exec(text)) !== null) {
                    // Tạo range chính xác
                    const range = document.createRange();
                    range.setStart(node, match.index);
                    range.setEnd(node, match.index + match[0].length);

                    // Tạo mark
                    const mark = document.createElement('mark');
                    mark.className = kw.cls;
                    mark.setAttribute('data-hl', '1');
                    mark.textContent = match[0];

                    // Thay thế nội dung range bằng mark
                    range.deleteContents();
                    range.insertNode(mark);

                    // Quan trọng: cập nhật lại lastIndex để tiếp tục tìm từ vị trí sau mark
                    regex.lastIndex = match.index + match[0].length;
                }
            }
        }

        textLayer.normalize();
        restoreSelection();
    }

    // === 4. REPLACE ALL SIÊU AN TOÀN & CHÍNH XÁC ===
    function replaceAllSafe() {
        saveSelection();
        removeHighlightsSafe();

        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item'))
            .map(el => ({
                find: el.querySelector('.find').value.trim(),
                replace: el.querySelector('.replace').value
            }))
            .filter(p => p.find);

        if (!pairs.length) return alert('Chưa có cặp thay thế nào!');

        let changed = false;
        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);

        while (walker.nextNode()) {
            let node = walker.currentNode;
            let text = node.nodeValue;

            pairs.forEach(pair => {
                const regex = buildRegex(pair.find);
                if (!regex) return;

                const newText = text.replace(regex, () => {
                    changed = true;
                    return pair.replace;
                });

                if (newText !== text) {
                    text = newText;
                }
            });

            if (text !== node.nodeValue) {
                node.nodeValue = text;
            }
        }

        if (changed) {
            replacedKeywords = pairs.map(p => p.replace).filter(Boolean);
            highlightKeywords();
            alert('Đã thay thế tất cả thành công!');
        } else {
            alert('Không tìm thấy từ nào để thay thế.');
        }

        restoreSelection();
    }

    // === PASTE SẠCH – GIỮ NGUYÊN ĐOẠN, KHÔNG DÍNH HTML ===
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        range.deleteContents();

        const lines = text.split(/\r?\n/);
        const frag = document.createDocumentFragment();

        lines.forEach((line, i) => {
            if (i > 0) frag.appendChild(document.createElement('br'));
            frag.appendChild(document.createTextNode(line));
        });

        range.insertNode(frag);
        range.collapse(false);

        // Highlight lại sau khi paste
        setTimeout(highlightKeywords, 0);
    });

    // === INPUT DEBOUNCE ===
    let highlightTimeout;
    textLayer.addEventListener('input', () => {
        clearTimeout(highlightTimeout);
        highlightTimeout = setTimeout(highlightKeywords, 100);
    });

    // === KEYWORDS TAG SYSTEM + FIX FOCUS ===
    const addKeywords = () => {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        vals.forEach(v => {
            if (v && !currentKeywords.includes(v)) {
                currentKeywords.push(v);

                const tag = document.createElement('div');
                tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
                tag.innerHTML = `${v} <span class="remove-tag cursor-pointer ml-1">×</span>`;

                tag.querySelector('.remove-tag').onclick = (e) => {
                    e.stopPropagation();
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x => x !== v);
                    highlightKeywords();
                };

                keywordsTags.appendChild(tag);
            }
        });

        keywordsInput.value = '';
        highlightKeywords();

        // FIX FOCUS – KHÔNG BỊ MẤT KHI NHẤN ENTER
        setTimeout(() => keywordsInput.focus(), 0);
    };

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addKeywords();
        }
    });

    keywordsInput.addEventListener('blur', () => {
        if (keywordsInput.value.trim()) {
            setTimeout(addKeywords, 100);
        }
    });

    // === BUTTONS ===
    searchBtn.onclick = () => {
        replacedKeywords = [];
        highlightKeywords();
    };

    clearBtn.onclick = () => {
        keywordsTags.innerHTML = '';
        currentKeywords = [];
        replacedKeywords = [];
        highlightKeywords();
    };

    replaceAllBtn.onclick = replaceAllSafe;

    // === FONT SETTINGS ===
    const syncFont = () => {
        textLayer.style.fontFamily = fontFamily.value;
        textLayer.style.fontSize = fontSize.value+ 'px';
    };
    fontFamily.onchange = syncFont;
    fontSize.onchange = syncFont;

    // === KHỞI ĐỘNG ===
    syncFont();
    highlightKeywords();
});
