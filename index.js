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
    let currentKeywords  = [];           // Sửa lỗi cú pháp
    let replacedKeywords = [];           // Sửa lỗi cú pháp
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

    // === 1. TẠO REGEX CHUẨN ===
    function buildRegex(word) {
        if (!word) return null;
        const escaped = escapeRegex(word);
        const flags = matchCaseCb.checked ? 'g' : 'gi';
        const pattern = wholeWordsCb.checked ? `\\b${escaped}\\b` : escaped;
        return new RegExp(pattern, flags);
    }

    // === 2. XÓA HIGHLIGHT AN TOÀN ===
    function removeHighlightsSafe(root = textLayer) {
        root.querySelectorAll('mark[data-hl]').forEach(mark => {
            mark.replaceWith(document.createTextNode(mark.textContent));
        });
        root.normalize();
    }

    // === 3. HIGHLIGHT CHUẨN ===
    function highlightKeywords() {
        saveSelection();
        removeHighlightsSafe();

        // Từ khóa đã được thay thế (ưu tiên cao nhất)
        const keywordsToHighlight = [
            // Priority 999: Các từ đã được replace (nếu có)
            ...replacedKeywords.map((t, i) => ({ 
                text: t, 
                cls: HIGHLIGHT_CLASSES[i % 6], 
                priority: 999 
            })),
            // Priority 100: Các từ khóa đang tìm kiếm
            ...currentKeywords.map((t, i) => ({ 
                text: t, 
                cls: HIGHLIGHT_CLASSES[(replacedKeywords.length + i) % 6], 
                priority: 100 
            }))
        ];

        if (!keywordsToHighlight.length) {
            restoreSelection();
            return;
        }

        // Sắp xếp: priority cao trước → từ dài trước (tránh overlap sai)
        keywordsToHighlight.sort((a, b) => 
            b.priority - a.priority || b.text.length - a.text.length
        );

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while (node = walker.nextNode()) {
            const originalText = node.nodeValue;
            let hasMatch = false;
            let bestFragment = null;

            for (const kw of keywordsToHighlight) {
                const regex = buildRegex(kw.text);
                if (!regex) continue;

                const allMatches = [];                     // Sửa lỗi cú pháp
                let match;
                regex.lastIndex = 0;
                while ((match = regex.exec(originalText)) !== null) {
                    allMatches.push({ 
                        index: match.index, 
                        length: match[0].length,        // match[0] là chuỗi khớp
                        content: match[0], 
                        cls: kw.cls 
                    });
                    hasMatch = true;
                }

                if (hasMatch) {
                    allMatches.sort((a, b) => a.index - b.index);

                    let lastIndex = 0;
                    const tempFragment = document.createDocumentFragment();

                    allMatches.forEach(m => {
                        if (m.index > lastIndex) {
                            tempFragment.appendChild(
                                document.createTextNode(originalText.substring(lastIndex, m.index))
                            );
                        }
                        const mark = document.createElement('mark');
                        mark.className = m.cls;
                        mark.setAttribute('data-hl', '1');
                        mark.textContent = m.content;
                        tempFragment.appendChild(mark);

                        lastIndex = m.index + m.length;
                    });

                    if (lastIndex < originalText.length) {
                        tempFragment.appendChild(
                            document.createTextNode(originalText.substring(lastIndex))
                        );
                    }

                    bestFragment = tempFragment;
                    break; // Đã tìm được từ khóa ưu tiên cao nhất → thoát vòng lặp keywords
                }
            }

            if (bestFragment) {
                node.replaceWith(bestFragment);
            }
        }

        restoreSelection();
    }

    // === 4. REPLACE ALL SIÊU AN TOÀN ===
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
            let originalText = text;

            pairs.forEach(pair => {
                const regex = buildRegex(pair.find);
                if (!regex) return;
                text = text.replace(regex, () => {
                    changed = true;
                    return pair.replace;
                });
            });

            if (text !== originalText) {
                node.nodeValue = text;
            }
        }

        if (changed) {
            replacedKeywords = pairs.map(p => p.replace).filter(Boolean);
            highlightKeywords();
            alert('Đã thay thế tất cả thành công!');
        } else {
            highlightKeywords();
            alert('Không tìm thấy từ nào để thay thế.');
        }

        restoreSelection();
    }

    // === PASTE SẠCH ===
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

        setTimeout(highlightKeywords, 0);
    });

    // === INPUT DEBOUNCE ===
    let highlightTimeout;
    textLayer.addEventListener('input', () => {
        clearTimeout(highlightTimeout);
        highlightTimeout = setTimeout(highlightKeywords, 100);
    });

    // === KEYWORDS TAG SYSTEM ===
    const addKeywords = () => {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        if (!vals.length) {
            keywordsInput.value = '';
            return;
        }

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
        setTimeout(() => keywordsInput.focus(), 0);
    };

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {   // Sửa lỗi cú pháp: dùng ||
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
        replacedKeywords = [];          // Reset replaced khi tìm mới
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
        textLayer.style.fontSize   = fontSize.value;
        document.getElementById('highlight-layer').style.fontFamily = fontFamily.value;
        document.getElementById('highlight-layer').style.fontSize   = fontSize.value;
    };
    fontFamily.onchange = syncFont;
    fontSize.onchange   = syncFont;

    // === KHỞI ĐỘNG ===
    syncFont();
    highlightKeywords();
});
