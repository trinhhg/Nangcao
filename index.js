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
        } catch(e) { savedRange = null; }
    }

    // Xóa highlight cũ
    function removeHighlights() {
        textLayer.querySelectorAll('mark[data-hl]').forEach(m => {
            m.replaceWith(document.createTextNode(m.textContent));
        });
        textLayer.normalize();
    }

    // Highlight chính xác, không làm hỏng text node
    function highlightKeywords() {
        saveSelection();
        removeHighlights();

        const keywordsToHighlight = [
            ...replacedKeywords.map((k,i) => ({text: k, priority: 999, cls: HIGHLIGHT_CLASSES[i%6]})),
            ...currentKeywords.map((k,i) => ({text: k, priority: 100, cls: HIGHLIGHT_CLASSES[(replacedKeywords.length+i)%6]}))
        ];

        if (!keywordsToHighlight.length) { restoreSelection(); return; }

        // Sắp xếp theo độ ưu tiên và độ dài
        keywordsToHighlight.sort((a,b) => b.priority - a.priority || b.text.length - a.text.length);

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
            let text = node.nodeValue;
            if (!text.trim()) return;

            let offset = 0;
            const fragment = document.createDocumentFragment();

            while (offset < text.length) {
                let matched = false;

                for (const kw of keywordsToHighlight) {
                    const flags = matchCaseCb.checked ? 'g' : 'gi';
                    const boundary = wholeWordsCb.checked ? '\\b' : '';
                    const regex = new RegExp(`^\( {boundary} \){escapeRegex(kw.text)}${boundary}`, flags);
                    const match = regex.exec(text.slice(offset));

                    if (match) {
                        // Thêm phần trước khi match
                        if (match.index > 0) {
                            fragment.appendChild(document.createTextNode(text.slice(offset, offset + match.index)));
                        }

                        // Thêm <mark>
                        const mark = document.createElement('mark');
                        mark.setAttribute('data-hl', '1');
                        mark.className = kw.cls;
                        mark.textContent = match[0];
                        fragment.appendChild(mark);

                        offset += match.index + match[0].length;
                        matched = true;
                        break;
                    }
                }

                if (!matched) {
                    // Không match → thêm 1 ký tự
                    fragment.appendChild(document.createTextNode(text[offset]));
                    offset++;
                }
            }

            if (fragment.childNodes.length > 0) {
                node.parentNode.replaceChild(fragment, node);
            }
        });

        textLayer.normalize();
        restoreSelection();
    }

    // === PASTE GIỮ NGUYÊN ĐOẠN ===
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();

        const lines = text.split(/\r\n|\r|\n/);
        const frag = document.createDocumentFragment();
        lines.forEach((line, i) => {
            if (i > 0) frag.appendChild(document.createElement('br'));
            if (line) frag.appendChild(document.createTextNode(line));
        });

        range.insertNode(frag);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);

        requestIdleCallback ? requestIdleCallback(highlightKeywords) : setTimeout(highlightKeywords, 0);
    });

    // === INPUT DEBOUNCE ===
    let debounce;
    textLayer.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(highlightKeywords, 50);
    });

    // === KEYWORDS – TỰ FOCUS 100% ===
    const addKeywords = () => {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        vals.forEach(v => {
            if (v && !currentKeywords.includes(v)) {
                currentKeywords.push(v);
                const tag = document.createElement('div');
                tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
                tag.innerHTML = `${v} <span class="remove-tag cursor-pointer">×</span>`;
                tag.querySelector('.remove-tag').onclick = () => {
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x => x !== v);
                    highlightKeywords();
                };
                keywordsTags.appendChild(tag);
            }
        });
        keywordsInput.value = '';
        highlightKeywords();

        // TỰ FOCUS LẠI NGAY LẬP TỨC
        requestAnimationFrame(() => keywordsInput.focus());
    };

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addKeywords();
        }
    });
    keywordsInput.addEventListener('blur', () => {
        if (keywordsInput.value.trim()) setTimeout(addKeywords, 100);
    });

    searchBtn.onclick = () => { replacedKeywords = []; highlightKeywords(); };
    clearBtn.onclick = () => {
        keywordsTags.innerHTML = '';
        currentKeywords = []; replacedKeywords = [];
        highlightKeywords();
    };

    // === FONT ===
    const syncFont = () => {
        textLayer.style.fontFamily = fontFamily.value;
        textLayer.style.fontSize = fontSize.value;
        highlightKeywords();
    };
    fontFamily.onchange = syncFont;
    fontSize.onchange = syncFont;

    // === REPLACE ALL – HOẠT ĐỘNG CHUẨN 100% ===
    replaceAllBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (!pairs.length) return alert('Chưa có cặp thay thế!');

        let changed = false;
        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        const nodes = [];

        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
            let text = node.nodeValue;

            pairs.forEach(p => {
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const boundary = wholeWordsCb.checked ? '\\b' : '';
                const regex = new RegExp(`\( {boundary} \){escapeRegex(p.find)}${boundary}`, flags);
                if (regex.test(text)) {
                    text = text.replace(regex, p.replace);
                    changed = true;
                }
            });

            if (text !== node.nodeValue) node.nodeValue = text;
        });

        if (changed) {
            replacedKeywords = pairs.map(p => p.replace).filter(Boolean);
            highlightKeywords();
            alert('Đã thay thế tất cả!');
        } else {
            alert('Không tìm thấy từ nào để thay!');
        }
    };

    // === KHỞI ĐỘNG ===
    requestAnimationFrame(highlightKeywords);
});
