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
    const modeSelect = document.getElementById('mode-select');
    const addModeBtn = document.getElementById('add-mode');
    const copyModeBtn = document.getElementById('copy-mode');
    const deleteModeBtn = document.getElementById('delete-mode');
    const matchCaseBtn = document.getElementById('match-case');
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');

    // === TỪ KHÓA ===
    const keywordModeSelect = document.getElementById('keyword-mode-select');
    const addKeywordModeBtn = document.getElementById('add-keyword-mode');
    const deleteKeywordModeBtn = document.getElementById('delete-keyword-mode');
    const saveKeywordsBtn = document.getElementById('save-keywords-btn');

    let keywords = [];
    let lastReplacedPairs = [];
    let currentMode = 'default';
    let currentKeywordMode = 'default';
    const SETTINGS_KEY = 'replace_settings';
    const highlightClasses = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];

    // === NOTIFICATION ===
    function showNotification(msg, type = 'success') {
        const n = document.createElement('div');
        n.className = `fixed top-4 right-4 px-4 py-2 rounded text-white text-xs z-50 ${type === 'success' ? 'bg-green-600' : type === 'info' ? 'bg-blue-600' : 'bg-red-600'}`;
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }

    // === FOCUS + CON TRỎ ĐẦU (NHƯ WORD) ===
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

    // === PASTE + NHẬP KHÔNG LOẠN ===
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
            const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(s => s);
            vals.forEach(v => {
                if (v && !keywords.includes(v)) {
                    keywords.push(v);
                    addKeywordTag(v);
                }
            });
            keywordsInput.value = '';
            lastReplacedPairs = [];
            scheduleHighlight(false);
        }
    });

    searchBtn.onclick = () => scheduleHighlight(false);
    clearBtn.onclick = () => {
        keywords = [];
        lastReplacedPairs = [];
        keywordsTags.innerHTML = '';
        scheduleHighlight(false);
    };

    // === CHẾ ĐỘ TỪ KHÓA ===
    function loadKeywordModes() {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        keywordModeSelect.innerHTML = '<option value="">-- Chọn --</option>';
        Object.keys(settings.modes).sort().forEach(m => {
            const opt = new Option(m, m);
            keywordModeSelect.add(opt);
        });
        keywordModeSelect.value = currentKeywordMode;
    }

    function loadKeywordsForMode() {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        const modeData = settings.modes[currentKeywordMode];
        if (modeData?.keywords) {
            keywords = [...modeData.keywords];
            keywordsTags.innerHTML = '';
            keywords.forEach(addKeywordTag);
            scheduleHighlight(false);
        } else {
            keywords = [];
            keywordsTags.innerHTML = '';
        }
    }

    keywordModeSelect.onchange = () => {
        currentKeywordMode = keywordModeSelect.value;
        loadKeywordsForMode();
    };

    addKeywordModeBtn.onclick = () => {
        const name = prompt('Tên chế độ từ khóa mới:');
        if (!name || name === 'default') return showNotification('Tên không hợp lệ!', 'error');
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        if (settings.modes[name]) return showNotification('Đã tồn tại!', 'error');
        settings.modes[name] = { pairs: [], matchCase: false, keywords: [] };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        currentKeywordMode = name;
        loadKeywordModes();
        showNotification(`Đã tạo chế độ "${name}"`, 'success');
    };

    deleteKeywordModeBtn.onclick = () => {
        if (currentKeywordMode === 'default') return showNotification('Không xóa default!', 'error');
        if (!confirm(`Xóa chế độ "${currentKeywordMode}"?`)) return;
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        delete settings.modes[currentKeywordMode];
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        currentKeywordMode = 'default';
        loadKeywordModes();
        keywords = [];
        keywordsTags.innerHTML = '';
        showNotification('Đã xóa!', 'success');
    };

    saveKeywordsBtn.onclick = () => {
        if (!currentKeywordMode) return showNotification('Chọn chế độ!', 'error');
        if (!keywords.length) return showNotification('Chưa có từ khóa!', 'error');

        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        if (!settings.modes[currentKeywordMode]) settings.modes[currentKeywordMode] = { pairs: [], matchCase: false, keywords: [] };
        settings.modes[currentKeywordMode].keywords = [...new Set(keywords)];
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        showNotification(`Đã lưu vào "${currentKeywordMode}"!`, 'success');
    };

    // === LOAD PAIRS + MODES ===
    function loadPairs() {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        const data = settings.modes[currentMode] || { pairs: [], matchCase: false };
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

    function saveSettings() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        settings.modes[currentMode] = { pairs, matchCase: matchCaseCb.checked, keywords: keywords };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        showNotification('Đã lưu!', 'success');
    }

    function loadModes() {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: { default: { pairs: [], matchCase: false, keywords: [] } } };
        modeSelect.innerHTML = '';
        Object.keys(settings.modes).sort().forEach(m => modeSelect.add(new Option(m, m)));
        modeSelect.value = currentMode;
        loadPairs();
        loadKeywordModes();
        loadKeywordsForMode();
    }

    modeSelect.onchange = () => { currentMode = modeSelect.value; loadPairs(); };

    addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ mới:');
        if (!name || name === 'default') return showNotification('Tên không hợp lệ!', 'error');
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        if (settings.modes[name]) return showNotification('Đã tồn tại!', 'error');
        settings.modes[name] = { pairs: [], matchCase: false, keywords: [] };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        currentMode = name;
        loadModes();
    };

    copyModeBtn.onclick = () => {
        const name = prompt('Sao chép thành:');
        if (!name) return;
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        settings.modes[name] = JSON.parse(JSON.stringify(settings.modes[currentMode]));
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        currentMode = name;
        loadModes();
    };

    deleteModeBtn.onclick = () => {
        if (currentMode === 'default') return showNotification('Không xóa default!', 'error');
        if (!confirm(`Xóa chế độ "${currentMode}"?`)) return;
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        delete settings.modes[currentMode];
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        currentMode = 'default';
        loadModes();
        showNotification('Đã xóa!', 'success');
    };

    matchCaseBtn.onclick = () => {
        matchCaseCb.checked = !matchCaseCb.checked;
        matchCaseBtn.textContent = matchCaseCb.checked ? 'Case: Bật' : 'Case: Tắt';
        matchCaseBtn.classList.toggle('bg-green-500', matchCaseCb.checked);
        scheduleHighlight(false);
    };

    addPairBtn.onclick = () => addPair();
    saveSettingsBtn.onclick = saveSettings;
    replaceAllBtn.onclick = replaceAndHighlight;

    fontFamily.onchange = () => textInput.style.fontFamily = fontFamily.value;
    fontSize.onchange = () => textInput.style.fontSize = fontSize.value;

    textInput.addEventListener('input', () => scheduleHighlight(false));

    loadModes();
    setTimeout(() => scheduleHighlight(false), 200);
});
