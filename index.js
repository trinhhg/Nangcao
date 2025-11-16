document.addEventListener('DOMContentLoaded', () => {
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

    let keywords = [];
    let lastReplacedPairs = [];
    let currentMode = 'default';
    const SETTINGS_KEY = 'replace_settings';
    const highlightClasses = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];
    let lastText = '';

    // === DEBOUNCE ===
    let highlightTimeout;
    const triggerHighlight = (withReplace = false) => {
        clearTimeout(highlightTimeout);
        highlightTimeout = setTimeout(() => applyAllHighlights(withReplace), 100);
    };

    // === HIGHLIGHT ===
    function applyAllHighlights(highlightReplace = false) {
        const currentText = textLayer.innerText || '';
        if (currentText === lastText && !highlightReplace) return;
        lastText = currentText;

        highlightLayer.innerHTML = '';
        if (!currentText.trim()) return;

        const matches = [];

        // KEYWORDS
        keywords.forEach((kw, i) => {
            if (!kw) return;
            const flags = matchCaseCb.checked ? 'g' : 'gi';
            const regex = new RegExp(escapeRegExp(kw), flags);
            let m;
            while ((m = regex.exec(currentText)) !== null) {
                const start = m.index, end = start + m[0].length;
                const before = currentText[start - 1], after = currentText[end];
                const isWhole = !wholeWordsCb.checked || (!isWordChar(before) && !isWordChar(after));
                if (isWhole) {
                    matches.push({ start, end, className: highlightClasses[i % highlightClasses.length], priority: 1000 });
                }
            }
        });

        // REPLACE
        if (highlightReplace && lastReplacedPairs.length) {
            lastReplacedPairs.forEach((p, i) => {
                if (!p.replace) return;
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const regex = new RegExp(escapeRegExp(p.replace), flags);
                let m;
                while ((m = regex.exec(currentText)) !== null) {
                    const start = m.index, end = start + m[0].length;
                    const before = currentText[start - 1], after = currentText[end];
                    const isWhole = !wholeWordsCb.checked || (!isWordChar(before) && !isWordChar(after));
                    if (isWhole) {
                        matches.push({ start, end, className: highlightClasses[(keywords.length + i) % highlightClasses.length], priority: 500 });
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

        let html = '';
        let pos = 0;
        filtered.forEach(m => {
            if (m.start > pos) html += escapeHtml(currentText.slice(pos, m.start));
            html += `<span class="${m.className}">${escapeHtml(currentText.slice(m.start, m.end))}</span>`;
            pos = m.end;
        });
        if (pos < currentText.length) html += escapeHtml(currentText.slice(pos));
        highlightLayer.innerHTML = html;
    }

    function escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    function isWordChar(ch) { return ch && (/[\p{L}\p{N}_]/u.test(ch) || /[A-Za-z0-9_]/.test(ch)); }

    // === PASTE: CHỈ LẤY TEXT THUẦN ===
    function handlePaste(e) {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);

        setTimeout(() => triggerHighlight(false), 0);
    }

    // === KEYWORDS ===
    keywordsInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addKeywordsFromInput();
        }
    });

    function addKeywordsFromInput() {
        const val = keywordsInput.value.trim();
        if (val && !keywords.includes(val)) {
            keywords.push(val);
            addKeywordTag(val);
        }
        keywordsInput.value = '';
        lastText = ""; // Buộc highlight chạy lại
        triggerHighlight(false);
    }

    function addKeywordTag(word) {
        const tag = document.createElement('div');
        tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
        tag.innerHTML = `${word} <span class="remove-tag cursor-pointer">×</span>`;
        tag.querySelector('.remove-tag').onclick = (e) => {
            e.stopPropagation();
            keywords = keywords.filter(k => k !== word);
            tag.remove();
            lastText = "";
            triggerHighlight(false);
        };
        keywordsTags.appendChild(tag);
    }

    // === EVENTS ===
    textLayer.addEventListener('input', () => triggerHighlight(false));
    textLayer.addEventListener('paste', handlePaste);

    searchBtn.onclick = () => { lastText = ""; triggerHighlight(false); };
    clearBtn.onclick = () => {
        keywords = []; lastReplacedPairs = []; keywordsTags.innerHTML = '';
        lastText = ""; triggerHighlight(false);
    };

    fontFamily.onchange = () => {
        const font = fontFamily.value;
        textLayer.style.fontFamily = font;
        highlightLayer.style.fontFamily = font;
    };
    fontSize.onchange = () => {
        const size = fontSize.value;
        textLayer.style.fontSize = size;
        highlightLayer.style.fontSize = size;
    };

    // === REPLACE ===
    replaceAllBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (!pairs.length) return showNotification('Chưa có cặp!', 'error');

        let text = textLayer.innerText;
        let changed = false;
        pairs.forEach(p => {
            const flags = matchCaseCb.checked ? 'g' : 'gi';
            const regex = new RegExp(escapeRegExp(p.find), flags);
            if (regex.test(text)) {
                text = text.replace(regex, p.replace);
                changed = true;
            }
        });

        if (!changed) return showNotification('Không tìm thấy!', 'info');
        textLayer.innerText = text;
        lastReplacedPairs = pairs.filter(p => p.replace);
        lastText = "";
        triggerHighlight(true);
        showNotification('Đã thay thế!', 'success');
    };

    // === MODE & SETTINGS ===
    function loadModes() {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
        modeSelect.innerHTML = '';
        Object.keys(settings.modes).sort().forEach(m => modeSelect.add(new Option(m, m)));
        modeSelect.value = currentMode;
        loadPairs();
        updateModeButtons();
    }

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
            if (!punctuationList.children.length) addPair();
        };
        punctuationList.appendChild(item);
    }

    function saveSettings() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        settings.modes[currentMode] = { pairs, matchCase: matchCaseCb.checked };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        showNotification('Đã lưu!', 'success');
    }

    modeSelect.onchange = () => { currentMode = modeSelect.value; loadPairs(); };
    addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ mới:');
        if (!name || name === 'default') return showNotification('Tên không hợp lệ!', 'error');
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        if (settings.modes[name]) return showNotification('Đã tồn tại!', 'error');
        settings.modes[name] = { pairs: [], matchCase: false };
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

    matchCaseBtn.onclick = () => {
        matchCaseCb.checked = !matchCaseCb.checked;
        matchCaseBtn.textContent = matchCaseCb.checked ? 'Case: Bật' : 'Case: Tắt';
        matchCaseBtn.classList.toggle('bg-green-500', matchCaseCb.checked);
        lastText = "";
        triggerHighlight(false);
    };

    addPairBtn.onclick = () => addPair();
    saveSettingsBtn.onclick = saveSettings;

    function updateModeButtons() {
        const isDefault = currentMode === 'default';
        const renameBtn = document.getElementById('rename-mode');
        const deleteBtn = document.getElementById('delete-mode');
        if (renameBtn) renameBtn.classList.toggle('hidden', isDefault);
        if (deleteBtn) deleteBtn.classList.toggle('hidden', isDefault);
    }

    function showNotification(msg, type = 'success') {
        const n = document.createElement('div');
        n.className = `notification fixed top-4 right-4 px-4 py-2 rounded text-white text-sm z-50 ${type === 'success' ? 'bg-green-600' : type === 'info' ? 'bg-blue-600' : 'bg-red-600'}`;
        n.textContent = msg;
        document.getElementById('notification-container').appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }

    loadModes();
    setTimeout(() => triggerHighlight(false), 200);
});
