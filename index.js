document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
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
    const matchCaseBtn = document.getElementById('match-case');
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');
    const textLayer = document.getElementById('text-layer');
    const highlightLayer = document.getElementById('highlight-layer');

    // === STATE ===
    let keywords = [];
    let replacedKeywords = [];  // từ thay thế mới (ưu tiên cao)
    let currentMode = 'default';
    const SETTINGS_KEY = 'replace_settings';
    const HIGHLIGHT_CLASSES = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];
    let lastText = '';

    // === DEBOUNCE & THROTTLE ===
    const debounce = (fn, delay = 16) => {
        let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
    };
    const throttle = (fn, delay = 16) => {
        let t; return (...a) => { if (!t) { t = setTimeout(() => { fn(...a); t = null; }, delay); } };
    };

    // === UTILS ===
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapeHtml = text => { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; };
    const isWordChar = ch => ch && (/[\p{L}\p{N}_]/u.test(ch) || /[A-Za-z0-9_]/.test(ch));

    // === SYNC FONT & STYLE ===
    const syncFontStyle = () => {
        const s = getComputedStyle(textLayer);
        highlightLayer.style.fontFamily = s.fontFamily;
        highlightLayer.style.fontSize = s.fontSize;
        highlightLayer.style.lineHeight = s.lineHeight;
        highlightLayer.style.letterSpacing = s.letterSpacing;
    };

    // === RENDER HIGHLIGHT (chuẩn công nghiệp) ===
    const renderHighlight = debounce(() => {
        const text = textLayer.innerText || '';
        if (text === lastText) return;
        lastText = text;

        const matches = [];

        // Keywords (ưu tiên thấp)
        keywords.forEach((kw, i) => {
            if (!kw) return;
            const flags = matchCaseCb.checked ? 'gu' : 'giu';
            const pattern = wholeWordsCb.checked ? `\\b${escapeRegex(kw)}\\b` : escapeRegex(kw);
            const regex = new RegExp(pattern, flags);
            let m;
            while ((m = regex.exec(text)) !== null) {
                matches.push({ start: m.index, end: m.index + m[0].length, className: HIGHLIGHT_CLASSES[i % HIGHLIGHT_CLASSES.length], priority: 100 });
            }
        });

        // Replaced keywords (ưu tiên cao)
        replacedKeywords.forEach((kw, i) => {
            if (!kw) return;
            const flags = matchCaseCb.checked ? 'gu' : 'giu';
            const pattern = wholeWordsCb.checked ? `\\b${escapeRegex(kw)}\\b` : escapeRegex(kw);
            const regex = new RegExp(pattern, flags);
            let m;
            while ((m = regex.exec(text)) !== null) {
                matches.push({ start: m.index, end: m.index + m[0].length, className: HIGHLIGHT_CLASSES[(keywords.length + i) % HIGHLIGHT_CLASSES.length], priority: 500 });
            }
        });

        // Sort + loại chồng lấn
        matches.sort((a, b) => b.priority - a.priority || a.start - b.start);
        const filtered = [];
        let lastEnd = 0;
        for (const m of matches) {
            if (m.start >= lastEnd) { filtered.push(m); lastEnd = m.end; }
        }

        // Build HTML
        let html = '', pos = 0;
        filtered.forEach(m => {
            if (m.start > pos) html += escapeHtml(text.slice(pos, m.start));
            html += `<span class="${m.className}">${escapeHtml(text.slice(m.start, m.end))}</span>`;
            pos = m.end;
        });
        if (pos < text.length) html += escapeHtml(text.slice(pos));
        highlightLayer.innerHTML = html;
    }, 16);

    // === SYNC SCROLL ===
    const syncScroll = throttle(() => {
        highlightLayer.scrollTop = textLayer.scrollTop;
        highlightLayer.scrollLeft = textLayer.scrollLeft;
    }, 16);

    // === PASTE AN TOÀN ===
    const handlePaste = e => {
        e.preventDefault();
        const plain = e.clipboardData.getData('text/plain');
        if (!plain) return;

        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();

        const node = document.createTextNode(plain);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        requestAnimationFrame(() => { lastText = ''; renderHighlight(); });
    };

    // === KEYWORDS ===
    const addKeywordsFromInput = () => {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        vals.forEach(v => {
            if (v && !keywords.includes(v)) {
                keywords.push(v);
                addKeywordTag(v);
            }
        });
        keywordsInput.value = '';
        lastText = ''; renderHighlight();
    };

    const addKeywordTag = word => {
        const tag = document.createElement('div');
        tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
        tag.innerHTML = `${word} <span class="remove-tag cursor-pointer">×</span>`;
        tag.querySelector('.remove-tag').onclick = e => {
            e.stopPropagation();
            keywords = keywords.filter(k => k !== word);
            tag.remove();
            lastText = ''; renderHighlight();
        };
        keywordsTags.appendChild(tag);
    };

    keywordsInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKeywordsFromInput(); } });
    keywordsInput.addEventListener('input', () => { if (keywordsInput.value.includes(',')) addKeywordsFromInput(); });
    searchBtn.onclick = () => { lastText = ''; renderHighlight(); };
    clearBtn.onclick = () => { keywords = []; replacedKeywords = []; keywordsTags.innerHTML = ''; lastText = ''; renderHighlight(); };

    // === FONT CHANGE ===
    fontFamily.onchange = () => { textLayer.style.fontFamily = fontFamily.value; highlightLayer.style.fontFamily = fontFamily.value; syncFontStyle(); renderHighlight(); };
    fontSize.onchange = () => { textLayer.style.fontSize = fontSize.value; highlightLayer.style.fontSize = fontSize.value; syncFontStyle(); renderHighlight(); };

    // === REPLACE ALL ===
    replaceAllBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (!pairs.length) return showNotification('Chưa có cặp!', 'error');

        let text = textLayer.innerText;
        let changed = false;
        pairs.forEach(p => {
            const flags = matchCaseCb.checked ? 'gu' : 'giu';
            const pattern = wholeWordsCb.checked ? `\\b${escapeRegex(p.find)}\\b` : escapeRegex(p.find);
            const regex = new RegExp(pattern, flags);
            if (regex.test(text)) { text = text.replace(regex, p.replace); changed = true; }
        });

        if (!changed) return showNotification('Không tìm thấy!', 'info');
        textLayer.innerText = text;
        replacedKeywords = pairs.filter(p => p.replace).map(p => p.replace);
        lastText = ''; renderHighlight();
        showNotification('Đã thay thế!', 'success');
    };

    // === MODE & SETTINGS (giữ nguyên) ===
    const loadModes = () => {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
        modeSelect.innerHTML = '';
        Object.keys(settings.modes).sort().forEach(m => modeSelect.add(new Option(m, m)));
        modeSelect.value = currentMode;
        loadPairs();
        updateModeButtons();
    };

    const loadPairs = () => {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        const data = settings.modes[currentMode] || { pairs: [], matchCase: false };
        punctuationList.innerHTML = '';
        data.pairs.forEach(p => addPair(p.find, p.replace));
        if (!data.pairs.length) addPair();
        matchCaseCb.checked = data.matchCase;
        matchCaseBtn.textContent = data.matchCase ? 'Case: Bật' : 'Case: Tắt';
        matchCaseBtn.classList.toggle('bg-green-500', data.matchCase);
    };

    const addPair = (find = '', replace = '') => {
        const item = document.createElement('div');
        item.className = 'punctuation-item flex gap-1 mb-1 items-center text-xs';
        item.innerHTML = `
            <input type="text" class="find flex-1 p-1 border rounded" placeholder="Tìm..." value="${find}">
            <input type="text" class="replace flex-1 p-1 border rounded" placeholder="Thay bằng..." value="${replace}">
            <button class="remove w-6 h-6 bg-red-500 text-white rounded hover:bg-red-600">×</button>
        `;
        item.querySelector('.remove').onclick = () => { item.remove(); if (!punctuationList.children.length) addPair(); };
        punctuationList.appendChild(item);
    };

    const saveSettings = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        settings.modes[currentMode] = { pairs, matchCase: matchCaseCb.checked };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        showNotification('Đã lưu!', 'success');
    };

    modeSelect.onchange = () => { currentMode = modeSelect.value; loadPairs(); };
    addModeBtn.onclick = () => { /* giữ nguyên */ };
    copyModeBtn.onclick = () => { /* giữ nguyên */ };
    matchCaseBtn.onclick = () => {
        matchCaseCb.checked = !matchCaseCb.checked;
        matchCaseBtn.textContent = matchCaseCb.checked ? 'Case: Bật' : 'Case: Tắt';
        matchCaseBtn.classList.toggle('bg-green-500', matchCaseCb.checked);
        lastText = ''; renderHighlight();
    };
    addPairBtn.onclick = () => addPair();
    saveSettingsBtn.onclick = saveSettings;

    const updateModeButtons = () => { /* giữ nguyên */ };
    const showNotification = (msg, type = 'success') => { /* giữ nguyên */ };

    // === EVENTS ===
    textLayer.addEventListener('input', () => { lastText = ''; renderHighlight(); });
    textLayer.addEventListener('scroll', syncScroll);
    textLayer.addEventListener('paste', handlePaste);

    // === INIT ===
    loadModes();
    syncFontStyle();
    requestAnimationFrame(() => { lastText = ''; renderHighlight(); });
});
