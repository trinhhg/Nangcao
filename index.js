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
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');
    const saveKeywordsMode = document.getElementById('save-keywords-mode');
    const saveKeywordsBtn = document.getElementById('save-keywords-btn');

    let keywords = [];
    let lastReplacedPairs = [];
    let currentMode = 'default';
    const SETTINGS_KEY = 'replace_settings';
    const highlightClasses = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];

    // === FOCUS + CON TRỎ ĐẦU ===
    textInput.addEventListener('focus', () => {
        if (!textInput.innerHTML || textInput.innerHTML === '<br>') {
            textInput.innerHTML = '';
        }
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(textInput);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
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

    // === PASTE GIỮ FORMAT + KHÔNG LAG ===
    textInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const clipboardData = e.clipboardData || window.clipboardData;
        const text = clipboardData.getData('text/plain');
        const html = clipboardData.getData('text/html');

        const range = window.getSelection().getRangeAt(0);
        range.deleteContents();

        if (html && html.includes('<')) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const clean = temp.innerHTML.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '');
            const fragment = range.createContextualFragment(clean);
            range.insertNode(fragment);
        } else {
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
        }
        scheduleHighlight(false);
    });

    // === HIGHLIGHT ===
    function applyAllHighlights(highlightReplace = false) {
        // Xóa highlight cũ
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

        // Keywords
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

        // Replace
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

    // === INPUT + HIGHLIGHT MƯỢT ===
    textInput.addEventListener('input', () => scheduleHighlight(false));

    // === LƯU TỪ KHÓA VÀO CHẾ ĐỘ ===
    function updateSaveKeywordsDropdown() {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        saveKeywordsMode.innerHTML = '<option value="">-- Chọn chế độ --</option>';
        Object.keys(settings.modes).sort().forEach(m => {
            const opt = new Option(m, m);
            saveKeywordsMode.add(opt);
        });
    }

    saveKeywordsBtn.onclick = () => {
        const mode = saveKeywordsMode.value;
        if (!mode) return showNotification('Chọn chế độ!', 'error');
        if (!keywords.length) return showNotification('Chưa có từ khóa!', 'error');

        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        if (!settings.modes[mode]) settings.modes[mode] = { pairs: [], matchCase: false, keywords: [] };
        settings.modes[mode].keywords = [...new Set([...(settings.modes[mode].keywords || []), ...keywords])];
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        showNotification(`Đã lưu ${keywords.length} từ khóa vào "${mode}"!`, 'success');
    };

    // === LOAD KEYWORDS KHI CHỌN CHẾ ĐỘ ===
    function loadKeywordsForMode() {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        const modeData = settings.modes[currentMode];
        if (modeData?.keywords) {
            keywords = modeData.keywords;
            keywordsTags.innerHTML = '';
            keywords.forEach(addKeywordTag);
            scheduleHighlight(false);
        }
    }

    modeSelect.onchange = () => {
        currentMode = modeSelect.value;
        loadPairs();
        loadKeywordsForMode();
        updateSaveKeywordsDropdown();
    };

    // === CÁC HÀM KHÁC (giữ nguyên) ===
    function loadModes() {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
        modeSelect.innerHTML = '';
        Object.keys(settings.modes).sort().forEach(m => modeSelect.add(new Option(m, m)));
        modeSelect.value = currentMode;
        loadPairs();
        loadKeywordsForMode();
        updateModeButtons();
        updateSaveKeywordsDropdown();
    }

    // ... (loadPairs, addPair, saveSettings, v.v. giữ nguyên)

    fontFamily.onchange = () => textInput.style.fontFamily = fontFamily.value;
    fontSize.onchange = () => textInput.style.fontSize = fontSize.value;
    replaceAllBtn.onclick = replaceAndHighlight;

    loadModes();
    setTimeout(() => scheduleHighlight(false), 200);
});
