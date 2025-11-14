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
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');

    let keywords = [];
    let lastReplacedPairs = [];
    let currentMode = 'default';
    const SETTINGS_KEY = 'replace_settings';
    const highlightClasses = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];

    // === DEBOUNCE + TRIGGER ===
    let highlightTimeout;
    const triggerHighlight = (withReplace = false) => {
        clearTimeout(highlightTimeout);
        highlightTimeout = setTimeout(() => applyAllHighlights(withReplace), 150);
    };

    // === PASTE GIỮ FORMAT + HIGHLIGHT SAU ===
    textInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const cd = e.clipboardData;
        const text = cd.getData('text/plain');
        const html = cd.getData('text/html');

        const range = window.getSelection().getRangeAt(0);
        range.deleteContents();

        if (html && /<[a-z][\s\S]*>/i.test(html)) {
            const div = document.createElement('div');
            div.innerHTML = html;
            const clean = div.innerHTML.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]*>/gi, m =>
                /^<(p|div|br|span|b|i|u)[ >]/i.test(m) ? m : ''
            );
            const fragment = range.createContextualFragment(clean);
            range.insertNode(fragment);
        } else {
            document.execCommand('insertText', false, text);
        }

        setTimeout(() => triggerHighlight(false), 50);
    });

    // === HIGHLIGHT (TỐI ƯU) ===
    function applyAllHighlights(highlightReplace = false) {
        textInput.querySelectorAll('span.hl-yellow, span.hl-pink, span.hl-blue, span.hl-green, span.hl-orange, span.hl-purple')
            .forEach(span => span.outerHTML = span.innerHTML);

        const walker = document.createTreeWalker(textInput, NodeFilter.SHOW_TEXT, null);
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) textNodes.push(node);
        if (!textNodes.length) return;

        const fullText = textNodes.map(n => n.textContent).join('');
        const matches = [];

        // 1. KEYWORDS
        keywords.forEach((kw, i) => {
            if (!kw) return;
            const flags = matchCaseCb.checked ? 'g' : 'gi';
            const regex = new RegExp(escapeRegExp(kw), flags);
            let m;
            while ((m = regex.exec(fullText)) !== null) {
                const start = m.index, end = start + m[0].length;
                const before = fullText[start - 1], after = fullText[end];
                const isWhole = !wholeWordsCb.checked || (!isWordChar(before) && !isWordChar(after));
                if (isWhole) {
                    matches.push({ start, end, text: m[0], className: highlightClasses[i % highlightClasses.length], priority: 1000 });
                }
            }
        });

        // 2. REPLACE
        if (highlightReplace && lastReplacedPairs.length) {
            lastReplacedPairs.forEach((p, i) => {
                if (!p.replace) return;
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const regex = new RegExp(escapeRegExp(p.replace), flags);
                let m;
                while ((m = regex.exec(fullText)) !== null) {
                    const start = m.index, end = start + m[0].length;
                    const before = fullText[start - 1], after = fullText[end];
                    const isWhole = !wholeWordsCb.checked || (!isWordChar(before) && !isWordChar(after));
                    if (isWhole) {
                        matches.push({ start, end, text: m[0], className: highlightClasses[(keywords.length + i) % highlightClasses.length], priority: 500 });
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

        let offset = 0;
        textNodes.forEach(node => {
            const local = filtered.filter(m => m.start >= offset && m.start < offset + node.textContent.length);
            if (!local.length) { offset += node.textContent.length; return; }

            const frag = document.createDocumentFragment();
            let last = 0;
            local.forEach(m => {
                const s = m.start - offset, e = m.end - offset;
                if (s > last) frag.appendChild(document.createTextNode(node.textContent.slice(last, s)));
                const span = document.createElement('span');
                span.className = m.className;
                span.textContent = node.textContent.slice(s, e);
                frag.appendChild(span);
                last = e;
            });
            if (last < node.textContent.length) {
                frag.appendChild(document.createTextNode(node.textContent.slice(last)));
            }
            node.parentNode.replaceChild(frag, node);
            offset += node.textContent.length;
        });
    }

    function escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function isWordChar(ch) { return ch && (/[\p{L}\p{N}_]/u.test(ch) || /[A-Za-z0-9_]/.test(ch)); }

    // === THÊM KEYWORD KHI ENTER ===
    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addKeywordsFromInput();
        }
    });

    keywordsInput.addEventListener('compositionend', () => {
        if (keywordsInput.value.includes(',')) addKeywordsFromInput();
    });

    function addKeywordsFromInput() {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(s => s);
        vals.forEach(v => {
            if (v && !keywords.includes(v)) {
                keywords.push(v);
                addKeywordTag(v);
            }
        });
        keywordsInput.value = '';
        lastReplacedPairs = [];
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
            triggerHighlight(false);
        };
        keywordsTags.appendChild(tag);
    }

    // === INPUT TRONG TEXTINPUT ===
    textInput.addEventListener('input', () => triggerHighlight(false));

    // === NÚT ===
    searchBtn.onclick = () => triggerHighlight(false);
    clearBtn.onclick = () => {
        keywords = []; lastReplacedPairs = []; keywordsTags.innerHTML = '';
        triggerHighlight(false);
    };

    fontFamily.onchange = () => textInput.style.fontFamily = fontFamily.value;
    fontSize.onchange = () => textInput.style.fontSize = fontSize.value;

    // === REPLACE ===
    replaceAllBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (!pairs.length) return showNotification('Chưa có cặp!', 'error');

        const walker = document.createTreeWalker(textInput, NodeFilter.SHOW_TEXT);
        let changed = false, node;
        while (node = walker.nextNode()) {
            let text = node.textContent;
            pairs.forEach(p => {
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const regex = new RegExp(escapeRegExp(p.find), flags);
                if (regex.test(text)) {
                    text = text.replace(regex, p.replace);
                    changed = true;
                }
            });
            if (text !== node.textContent) node.textContent = text;
        }

        if (!changed) return showNotification('Không tìm thấy!', 'info');
        lastReplacedPairs = pairs.filter(p => p.replace);
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
        n.className = `fixed top-4 right-4 px-4 py-2 rounded text-white text-sm z-50 ${type === 'success' ? 'bg-green-600' : type === 'info' ? 'bg-blue-600' : 'bg-red-600'}`;
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }

    loadModes();
    setTimeout(() => triggerHighlight(false), 200);
});
