document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('textInput');
    const keywordsInput = document.getElementById('keywords-input');
    const keywordsTags = document.getElementById('keywords-tags');
    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    const matchCaseCb = document.getElementById('matchCase');
    const wholeWordsCb = document.getElementById('wholeWords');

    // Từ khóa
    const keywordModeSelect = document.getElementById('keyword-mode-select');
    const addKeywordModeBtn = document.getElementById('add-keyword-mode');
    const deleteKeywordModeBtn = document.getElementById('delete-keyword-mode');
    const saveKeywordsBtn = document.getElementById('save-keywords-btn');

    // Thay thế
    const replaceModeSelect = document.getElementById('replace-mode-select');
    const addReplaceModeBtn = document.getElementById('add-replace-mode');
    const copyReplaceModeBtn = document.getElementById('copy-replace-mode');
    const deleteReplaceModeBtn = document.getElementById('delete-replace-mode');
    const matchCaseBtn = document.getElementById('match-case');
    const addPairBtn = document.getElementById('add-pair');
    const saveReplaceBtn = document.getElementById('save-replace-btn');
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');

    let keywords = [];
    let lastReplacedPairs = [];
    let currentKeywordMode = 'default';
    let currentReplaceMode = 'default';
    const KEYWORD_KEY = 'keyword_modes';
    const REPLACE_KEY = 'replace_modes';
    const highlightClasses = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];

    // === NOTIFICATION ===
    function showNotification(msg, type = 'success') {
        const n = document.createElement('div');
        n.className = `fixed top-4 right-4 px-4 py-2 rounded text-white text-xs z-50 ${type === 'success' ? 'bg-green-600' : type === 'info' ? 'bg-blue-600' : 'bg-red-600'}`;
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }

    // === FOCUS + CON TRỎ ĐẦU ===
    function setCursorToStart() {
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(textInput, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    textInput.addEventListener('focus', () => {
        if (!textInput.textContent.trim()) textInput.innerHTML = '';
        setTimeout(setCursorToStart, 0);
    });

    // === PASTE + NHẬP MƯỢT ===
    textInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        setTimeout(() => {
            scheduleHighlight(false);
            setCursorToStart();
        }, 0);
    });

    // === DEBOUNCE HIGHLIGHT ===
    let highlightScheduled = false;
    function scheduleHighlight(highlightReplace = false) {
        if (highlightScheduled) return;
        highlightScheduled = true;
        requestAnimationFrame(() => {
            applyAllHighlights(highlightReplace);
            highlightScheduled = false;
        });
    }

    // === HIGHLIGHT ===
    function applyAllHighlights(highlightReplace = false) {
        textInput.querySelectorAll('span.hl-yellow, span.hl-pink, span.hl-blue, span.hl-green, span.hl-orange, span.hl-purple').forEach(span => {
            span.outerHTML = span.innerHTML;
        });

        const walker = document.createTreeWalker(textInput, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);
        if (textNodes.length === 0) return;

        const fullText = textNodes.map(n => n.textContent).join('');
        const matches = [];

        keywords.forEach((kw, i) => {
            if (!kw) return;
            const flags = matchCaseCb.checked ? 'g' : 'gi';
            const regex = new RegExp(escapeRegExp(kw), flags);
            let m;
            while ((m = regex.exec(fullText)) !== null) {
                const start = m.index;
                const end = start + m[0].length;
                const before = fullText[start - 1];
                const after = fullText[end];
                const isWhole = !wholeWordsCb.checked || (!isWordChar(before) && !isWordChar(after));
                if (isWhole) {
                    matches.push({ start, end, kw: m[0], className: highlightClasses[i % highlightClasses.length], priority: 1000 });
                }
            }
        });

        if (highlightReplace && lastReplacedPairs.length > 0) {
            lastReplacedPairs.forEach((p, i) => {
                if (!p.replace) return;
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const regex = new RegExp(escapeRegExp(p.replace), flags);
                let m;
                while ((m = regex.exec(fullText)) !== null) {
                    const start = m.index;
                    const end = start + m[0].length;
                    const before = fullText[start - 1];
                    const after = fullText[end];
                    const isWhole = !wholeWordsCb.checked || (!isWordChar(before) && !isWordChar(after));
                    if (isWhole) {
                        matches.push({ start, end, kw: m[0], className: highlightClasses[(keywords.length + i) % highlightClasses.length], priority: 500 });
                    }
                }
            });
        }

        matches.sort((a, b) => b.priority - a.priority || a.start - b.start);
        const filtered = [];
        let lastEnd = 0;
        for (const m of matches) {
            if (m.start >= lastEnd) {
                filtered.push(m);
                lastEnd = m.end;
            }
        }

        let globalOffset = 0;
        textNodes.forEach(textNode => {
            const localMatches = filtered.filter(m => m.start >= globalOffset && m.start < globalOffset + textNode.textContent.length);
            if (!localMatches.length) {
                globalOffset += textNode.textContent.length;
                return;
            }

            const frag = document.createDocumentFragment();
            let lastIdx = 0;
            localMatches.forEach(m => {
                const localStart = m.start - globalOffset;
                const localEnd = m.end - globalOffset;
                if (localStart > lastIdx) {
                    frag.appendChild(document.createTextNode(textNode.textContent.slice(lastIdx, localStart)));
                }
                const span = document.createElement('span');
                span.className = m.className;
                span.textContent = textNode.textContent.slice(localStart, localEnd);
                frag.appendChild(span);
                lastIdx = localEnd;
            });
            if (lastIdx < textNode.textContent.length) {
                frag.appendChild(document.createTextNode(textNode.textContent.slice(lastIdx)));
            }
            textNode.parentNode.replaceChild(frag, textNode);
            globalOffset += textNode.textContent.length;
        });
    }

    function escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function isWordChar(ch) { return ch && (/\p{L}|\p{N}/u.test(ch) || /[A-Za-z0-9_]/.test(ch)); }

    // === REPLACE ===
    function replaceAndHighlight() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (!pairs.length) return showNotification('Chưa có cặp!', 'error');

        const walker = document.createTreeWalker(textInput, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) nodes.push(node);

        let changed = false;
        nodes.forEach(textNode => {
            let text = textNode.textContent;
            pairs.forEach(p => {
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const regex = new RegExp(escapeRegExp(p.find), flags);
                if (regex.test(text)) {
                    text = text.replace(regex, p.replace);
                    changed = true;
                }
            });
            if (text !== textNode.textContent) textNode.textContent = text;
        });

        if (!changed) return showNotification('Không tìm thấy!', 'info');

        lastReplacedPairs = pairs.filter(p => p.replace);
        scheduleHighlight(true);
        showNotification('Đã thay thế!', 'success');
    }

    // === TỪ KHÓA ===
    function addKeywordTag(word) {
        const tag = document.createElement('div');
        tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
        tag.innerHTML = `${word} <span class="remove-tag cursor-pointer">×</span>`;
        tag.querySelector('.remove-tag').onclick = (e) => {
            e.stopPropagation();
            keywords = keywords.filter(k => k !== word);
            tag.remove();
            scheduleHighlight(false);
        };
        keywordsTags.appendChild(tag);
    }

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(s => s);
            vals.forEach(v => {
                if (v && !keywords.includes(v)) {
                    keywords.push(v);
                    addKeywordTag(v);
                }
            });
            keywordsInput.value = '';
            scheduleHighlight(false);
        }
    });

    searchBtn.onclick = () => scheduleHighlight(false);
    clearBtn.onclick = () => {
        keywords = [];
        keywordsTags.innerHTML = '';
        scheduleHighlight(false);
    };

    // === CHẾ ĐỘ TỪ KHÓA ===
    function loadKeywordModes() {
        const modes = JSON.parse(localStorage.getItem(KEYWORD_KEY)) || { default: [] };
        keywordModeSelect.innerHTML = '<option value="">-- Chọn --</option>';
        Object.keys(modes).sort().forEach(m => keywordModeSelect.add(new Option(m, m)));
        keywordModeSelect.value = currentKeywordMode;
        loadKeywords();
    }

    function loadKeywords() {
        const modes = JSON.parse(localStorage.getItem(KEYWORD_KEY)) || { default: [] };
        keywords = (modes[currentKeywordMode] || []).slice();
        keywordsTags.innerHTML = '';
        keywords.forEach(addKeywordTag);
        scheduleHighlight(false);
    }

    keywordModeSelect.onchange = () => {
        currentKeywordMode = keywordModeSelect.value;
        loadKeywords();
    };

    addKeywordModeBtn.onclick = () => {
        const name = prompt('Tên chế độ từ khóa mới:');
        if (!name || name === 'default') return showNotification('Tên không hợp lệ!', 'error');
        const modes = JSON.parse(localStorage.getItem(KEYWORD_KEY)) || {};
        if (modes[name]) return showNotification('Đã tồn tại!', 'error');
        modes[name] = [];
        localStorage.setItem(KEYWORD_KEY, JSON.stringify(modes));
        currentKeywordMode = name;
        loadKeywordModes();
    };

    deleteKeywordModeBtn.onclick = () => {
        if (currentKeywordMode === 'default') return showNotification('Không xóa default!', 'error');
        if (!confirm(`Xóa chế độ "${currentKeywordMode}"?`)) return;
        const modes = JSON.parse(localStorage.getItem(KEYWORD_KEY)) || {};
        delete modes[currentKeywordMode];
        localStorage.setItem(KEYWORD_KEY, JSON.stringify(modes));
        currentKeywordMode = 'default';
        loadKeywordModes();
    };

    saveKeywordsBtn.onclick = () => {
        if (!currentKeywordMode) return showNotification('Chọn chế độ!', 'error');
        const modes = JSON.parse(localStorage.getItem(KEYWORD_KEY)) || {};
        modes[currentKeywordMode] = [...new Set(keywords)];
        localStorage.setItem(KEYWORD_KEY, JSON.stringify(modes));
        showNotification('Đã lưu từ khóa!', 'success');
    };

    // === CHẾ ĐỘ THAY THẾ ===
    function loadReplaceModes() {
        const modes = JSON.parse(localStorage.getItem(REPLACE_KEY)) || { default: { pairs: [], matchCase: false } };
        replaceModeSelect.innerHTML = '';
        Object.keys(modes).sort().forEach(m => replaceModeSelect.add(new Option(m, m)));
        replaceModeSelect.value = currentReplaceMode;
        loadReplacePairs();
    }

    function loadReplacePairs() {
        const modes = JSON.parse(localStorage.getItem(REPLACE_KEY)) || { default: { pairs: [], matchCase: false } };
        const data = modes[currentReplaceMode] || { pairs: [], matchCase: false };
        punctuationList.innerHTML = '';
        data.pairs.forEach(p => addPair(p.find, p.replace));
        if (!data.pairs.length) addPair();
        matchCaseCb.checked = data.matchCase;
        matchCaseBtn.textContent = data.matchCase ? 'Case: Bật' : 'Case: Tắt';
        matchCaseBtn.classList.toggle('bg-green-500', data.matchCase);
    }

    function addPair(find = '', replace = '') {
        const item = document.createElement('div');
        item.className = 'punctuation-item flex gap-1 mb-1 items-center text-xs';
        item.innerHTML = `
            <input type="text" class="find flex-1 p-1 border rounded" placeholder="Tìm..." value="${find}">
            <input type="text" class="replace flex-1 p-1 border rounded" placeholder="Thay bằng..." value="${replace}">
            <button class="remove w-6 h-6 bg-red-500 text-white rounded hover:bg-red-600">×</button>
        `;
        item.querySelector('.remove').onclick = () => {
            item.remove();
            if (punctuationList.children.length === 0) addPair();
        };
        punctuationList.appendChild(item);
    }

    replaceModeSelect.onchange = () => {
        currentReplaceMode = replaceModeSelect.value;
        loadReplacePairs();
    };

    addReplaceModeBtn.onclick = () => {
        const name = prompt('Tên chế độ thay thế mới:');
        if (!name || name === 'default') return showNotification('Tên không hợp lệ!', 'error');
        const modes = JSON.parse(localStorage.getItem(REPLACE_KEY)) || {};
        if (modes[name]) return showNotification('Đã tồn tại!', 'error');
        modes[name] = { pairs: [], matchCase: false };
        localStorage.setItem(REPLACE_KEY, JSON.stringify(modes));
        currentReplaceMode = name;
        loadReplaceModes();
    };

    copyReplaceModeBtn.onclick = () => {
        const name = prompt('Sao chép thành:');
        if (!name) return;
        const modes = JSON.parse(localStorage.getItem(REPLACE_KEY)) || {};
        modes[name] = JSON.parse(JSON.stringify(modes[currentReplaceMode]));
        localStorage.setItem(REPLACE_KEY, JSON.stringify(modes));
        currentReplaceMode = name;
        loadReplaceModes();
    };

    deleteReplaceModeBtn.onclick = () => {
        if (currentReplaceMode === 'default') return showNotification('Không xóa default!', 'error');
        if (!confirm(`Xóa chế độ "${currentReplaceMode}"?`)) return;
        const modes = JSON.parse(localStorage.getItem(REPLACE_KEY)) || {};
        delete modes[currentReplaceMode];
        localStorage.setItem(REPLACE_KEY, JSON.stringify(modes));
        currentReplaceMode = 'default';
        loadReplaceModes();
    };

    saveReplaceBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        const modes = JSON.parse(localStorage.getItem(REPLACE_KEY)) || {};
        modes[currentReplaceMode] = { pairs, matchCase: matchCaseCb.checked };
        localStorage.setItem(REPLACE_KEY, JSON.stringify(modes));
        showNotification('Đã lưu thay thế!', 'success');
    };

    matchCaseBtn.onclick = () => {
        matchCaseCb.checked = !matchCaseCb.checked;
        matchCaseBtn.textContent = matchCaseCb.checked ? 'Case: Bật' : 'Case: Tắt';
        matchCaseBtn.classList.toggle('bg-green-500', matchCaseCb.checked);
        scheduleHighlight(false);
    };

    addPairBtn.onclick = () => addPair();
    replaceAllBtn.onclick = replaceAndHighlight;

    fontFamily.onchange = () => textInput.style.fontFamily = fontFamily.value;
    fontSize.onchange = () => textInput.style.fontSize = fontSize.value;

    textInput.addEventListener('input', () => scheduleHighlight(false));

    loadKeywordModes();
    loadReplaceModes();
    setTimeout(() => scheduleHighlight(false), 200);
});
