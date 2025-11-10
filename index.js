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
    const matchCaseBtn = document.getElementById('match-case');
    const exportBtn = document.getElementById('export-settings');
    const importBtn = document.getElementById('import-settings');
    const renameModeBtn = document.getElementById('rename-mode');
    const deleteModeBtn = document.getElementById('delete-mode');
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');

    let keywords = [];
    let currentMode = 'default';
    let matchCaseEnabled = false;
    const SETTINGS_KEY = 'replace_settings';
    const highlightNames = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];

    // === HIGHLIGHT ===
    function clearAllHighlights() { if (CSS.highlights) CSS.highlights.clear(); }

    function applyHighlight() {
        if (!CSS.highlights) return;
        clearAllHighlights();
        if (keywords.length === 0) return;

        const walker = document.createTreeWalker(textInput, NodeFilter.SHOW_TEXT, null);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) nodes.push(node);

        keywords.forEach((kw, i) => {
            if (!kw.trim()) return;
            const highlight = new Highlight();
            const name = highlightNames[i % highlightNames.length];
            const flags = matchCaseCb.checked ? 'g' : 'gi';
            const boundary = wholeWordsCb.checked ? '\\b' : '';
            const regex = new RegExp(boundary + escapeRegExp(kw) + boundary, flags);

            nodes.forEach(textNode => {
                const matches = [...textNode.textContent.matchAll(regex)];
                matches.forEach(match => {
                    const range = new Range();
                    range.setStart(textNode, match.index);
                    range.setEnd(textNode, match.index + match[0].length);
                    highlight.add(range);
                });
            });
            if (highlight.size > 0) CSS.highlights.set(name, highlight);
        });
    }

    function escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // === TỪ KHÓA ===
    function addKeywordTag(word) {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `${word} <span class="remove-tag">×</span>`;
        tag.querySelector('.remove-tag').onclick = (e) => {
            e.stopPropagation();
            keywords = keywords.filter(k => k !== word);
            tag.remove();
            applyHighlight();
        };
        keywordsTags.appendChild(tag);
    }

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(s => s);
            vals.forEach(v => { if (v && !keywords.includes(v)) { keywords.push(v); addKeywordTag(v); } });
            keywordsInput.value = '';
            applyHighlight();
        }
    });

    searchBtn.onclick = applyHighlight;
    clearBtn.onclick = () => { keywords = []; keywordsTags.innerHTML = ''; clearAllHighlights(); };

    fontFamily.onchange = () => textInput.style.fontFamily = fontFamily.value;
    fontSize.onchange = () => textInput.style.fontSize = fontSize.value;

    textInput.addEventListener('input', () => setTimeout(applyHighlight, 50));

    // === FIND & REPLACE ===
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
        matchCaseEnabled = data.matchCase;
        matchCaseBtn.textContent = matchCaseEnabled ? 'Case: Bật' : 'Case: Tắt';
        matchCaseBtn.classList.toggle('bg-green-500', matchCaseEnabled);
    }

    function addPair(find = '', replace = '') {
        const item = document.createElement('div');
        item.className = 'punctuation-item';
        item.innerHTML = `
            <input type="text" class="find" placeholder="Tìm" value="${find}">
            <input type="text" class="replace" placeholder="Thay" value="${replace}">
            <button class="remove">×</button>
        `;
        item.querySelector('.remove').onclick = () => {
            item.remove();
            if (punctuationList.children.length === 0) addPair();
        };
        punctuationList.insertBefore(item, punctuationList.firstChild);
    }

    function saveSettings() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        settings.modes[currentMode] = { pairs, matchCase: matchCaseEnabled };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        showNotification('Đã lưu!', 'success');
    }

    // === THAY THẾ + HIGHLIGHT LẠI ===
    replaceAllBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (pairs.length === 0) return showNotification('Chưa có cặp!', 'error');

        const lines = textInput.textContent.split('\n');
        const newLines = lines.map(line => {
            let newLine = line;
            pairs.forEach(p => {
                const flags = matchCaseEnabled ? 'g' : 'gi';
                const regex = new RegExp(escapeRegExp(p.find), flags);
                newLine = newLine.replace(regex, p.replace);
            });
            return newLine;
        });

        textInput.textContent = newLines.join('\n');
        applyHighlight(); // HIGHLIGHT LẠI NGAY
        showNotification('Đã thay thế!', 'success');
    };

    modeSelect.onchange = () => { currentMode = modeSelect.value; loadPairs(); };
    addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ:');
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
        matchCaseEnabled = !matchCaseEnabled;
        matchCaseBtn.textContent = matchCaseEnabled ? 'Case: Bật' : 'Case: Tắt';
        matchCaseBtn.classList.toggle('bg-green-500', matchCaseEnabled);
    };
    addPairBtn.onclick = () => addPair();
    saveSettingsBtn.onclick = saveSettings;

    exportBtn.onclick = () => { /* giữ nguyên */ };
    importBtn.onclick = () => { /* giữ nguyên */ };

    function updateModeButtons() {
        const isDefault = currentMode === 'default';
        if (renameModeBtn) renameModeBtn.classList.toggle('hidden', isDefault);
        if (deleteModeBtn) deleteModeBtn.classList.toggle('hidden', isDefault);
    }

    function showNotification(msg, type = 'success') {
        const n = document.createElement('div');
        n.className = `notification ${type}`;
        n.textContent = msg;
        document.getElementById('notification-container').appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }

    loadModes();
    applyHighlight();
});
