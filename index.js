document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    const keywordsInput     = document.getElementById('keywords-input');
    const keywordsTags      = document.getElementById('keywords-tags');
    const searchBtn         = document.getElementById('search');
    const clearBtn          = document.getElementById('clear');
    const fontFamily        = document.getElementById('fontFamily');
    const fontSize          = document.getElementById('fontSize');
    const matchCaseCb       = document.getElementById('matchCase');
    const wholeWordsCb      = document.getElementById('wholeWords');
    const modeSelect        = document.getElementById('mode-select');
    const addModeBtn        = document.getElementById('add-mode');
    const copyModeBtn       = document.getElementById('copy-mode');
    const matchCaseBtn      = document.getElementById('match-case');
    const addPairBtn        = document.getElementById('add-pair');
    const saveSettingsBtn   = document.getElementById('save-settings');
    const replaceAllBtn     = document.getElementById('replace-all');
    const punctuationList   = document.getElementById('punctuation-list');
    const textLayer         = document.getElementById('text-layer');

    // === STATE ===
    let currentKeywords   = [];   // Từ khóa tìm kiếm (KHÔNG bị xóa khi replace)
    let replacedKeywords  = [];   // Từ đã được thay thế (highlight riêng)
    let currentMode       = 'default';
    const SETTINGS_KEY    = 'replace_settings';
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    // === UTILS ===
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let savedRange = null;
    function saveSelection() {
        const sel = window.getSelection();
        if (sel.rangeCount === 0) return;
        savedRange = sel.getRangeAt(0).cloneRange();
    }
    function restoreSelection() {
        if (!savedRange) return;
        try {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
        } catch (e) { savedRange = null; }
    }

    function removeHighlights() {
        textLayer.querySelectorAll('mark[data-hl]').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
        textLayer.normalize();
    }

    function highlightKeywords() {
        saveSelection();
        removeHighlights();

        const allKeywords = [];
        // Từ đã thay thế → ưu tiên cao nhất
        replacedKeywords.forEach((k,i) => k && allKeywords.push({text:k, priority:999, class:HIGHLIGHT_CLASSES[i%6]}));
        // Từ khóa tìm kiếm hiện tại
        currentKeywords.forEach((k,i) => k && allKeywords.push({text:k, priority:100, class:HIGHLIGHT_CLASSES[(replacedKeywords.length+i)%6]}));

        if (!allKeywords.length) { restoreSelection(); return; }

        allKeywords.sort((a,b) => b.priority - a.priority || b.text.length - a.text.length);

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(textNode => {
            let text = textNode.nodeValue;
            if (!text.trim()) return;

            let lastIndex = 0;
            const frag = document.createDocumentFragment();

            for (const kw of allKeywords) {
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const pattern = wholeWordsCb.checked ? `\\b${escapeRegex(kw.text)}\\b` : escapeRegex(kw.text);
                const regex = new RegExp(pattern, flags);
                let match;
                while ((match = regex.exec(text)) !== null) {
                    if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                    const mark = document.createElement('mark');
                    mark.setAttribute('data-hl','1');
                    mark.className = kw.class;
                    mark.textContent = match[0];
                    frag.appendChild(mark);
                    lastIndex = match.index + match[0].length;
                }
            }
            if (lastIndex > 0 && lastIndex < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            }
            if (frag.childNodes.length > 0) {
                textNode.parentNode.replaceChild(frag, textNode);
            }
        });

        textLayer.normalize();
        restoreSelection();
    }

    // === PASTE GIỮ ĐOẠN ===
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();

        const lines = text.split(/\r\n|\r|\n/);
        const frag = document.createDocumentFragment();
        let lastNode = null;

        lines.forEach((line,i) => {
            if (i>0) { const br = document.createElement('br'); frag.appendChild(br); lastNode = br; }
            if (line) { const txt = document.createTextNode(line); frag.appendChild(txt); lastNode = txt; }
        });

        range.insertNode(frag);
        if (lastNode) { range.setStartAfter(lastNode); range.collapse(true); }
        sel.removeAllRanges();
        sel.addRange(range);

        requestIdleCallback ? requestIdleCallback(highlightKeywords) : setTimeout(highlightKeywords,0);
    });

    let inputTimeout;
    textLayer.addEventListener('input', () => {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(highlightKeywords, 16);
    });

    // === KEYWORDS – TỰ FOCUS ===
    const addKeywords = () => {
        const vals = keywordsInput.value.split(',').map(s=>s.trim()).filter(Boolean);
        vals.forEach(v => {
            if (v && !currentKeywords.includes(v)) {
                currentKeywords.push(v);
                const tag = document.createElement('div');
                tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
                tag.innerHTML = `${v} <span class="remove-tag cursor-pointer">×</span>`;
                tag.querySelector('.remove-tag').onclick = () => {
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x=>x!==v);
                    highlightKeywords();
                };
                keywordsTags.appendChild(tag);
            }
        });
        keywordsInput.value = '';
        highlightKeywords();
        keywordsInput.focus();
    };

    keywordsInput.addEventListener('keydown', e => { if (e.key==='Enter') { e.preventDefault(); addKeywords(); } });
    keywordsInput.addEventListener('input', () => { if (keywordsInput.value.includes(',')) addKeywords(); });

    searchBtn.onclick = () => { replacedKeywords = []; highlightKeywords(); };
    clearBtn.onclick  = () => {
        keywordsTags.innerHTML = '';
        currentKeywords = [];
        replacedKeywords = [];
        highlightKeywords();
    };

    const syncFont = () => {
        textLayer.style.fontFamily = fontFamily.value;
        textLayer.style.fontSize   = fontSize.value;
        highlightKeywords();
    };
    fontFamily.onchange = syncFont;
    fontSize.onchange   = syncFont;

    // === REPLACE ALL – ĐÃ FIX: KHÔNG XÓA KEYWORD, THAY THẾ THẬT SỰ ===
    replaceAllBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find:    el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value.trim()
        })).filter(p => p.find);

        if (!pairs.length) return showNotification('Chưa có cặp!', 'error');

        let changed = false;

        // Lấy tất cả text node
        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
            let text = node.nodeValue;

            // Duyệt từng cặp find → replace
            pairs.forEach(p => {
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const boundary = wholeWordsCb.checked ? '\\b' : '';
                const regex = new RegExp(`\( {boundary} \){escapeRegex(p.find)}${boundary}`, flags);
                if (regex.test(text)) {
                    text = text.replace(regex, p.replace);
                    changed = true;
                }
            });

            if (text !== node.nodeValue) {
                node.nodeValue = text;
            }
        });

        if (changed) {
            // Chỉ cập nhật từ đã replace để highlight, KHÔNG XÓA currentKeywords
            replacedKeywords = pairs.filter(p => p.replace).map(p => p.replace);
            highlightKeywords();
            showNotification('Đã thay thế tất cả!', 'success');
        } else {
            showNotification('Không tìm thấy từ nào để thay!', 'info');
        }
    };

    // === MODE & SETTINGS ===
    function loadModes() {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
        modeSelect.innerHTML = '';
        Object.keys(settings.modes).sort().forEach(m => modeSelect.add(new Option(m,m)));
        modeSelect.value = currentMode;
        loadPairs();
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

    function addPair(find='', replace='') {
        const item = document.createElement('div');
        item.className = 'punctuation-item flex gap-1 mb-1 items-center text-xs';
        item.innerHTML = `
            <input type="text" class="find flex-1 p-1 border rounded" placeholder="Tìm..." value="${find}">
            <input type="text" class="replace flex-1 p-1 border rounded" placeholder="Thay bằng..." value="${replace}">
            <button class="remove w-6 h-6 bg-red-500 text-white rounded hover:bg-red-600">×</button>
        `;
        item.querySelector('.remove').onclick = () => { item.remove(); if (!punctuationList.children.length) addPair(); };
        punctuationList.appendChild(item);
    }

    function saveSettings() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value.trim()
        })).filter(p => p.find);

        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        settings.modes[currentMode] = { pairs, matchCase: matchCaseCb.checked };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        showNotification('Đã lưu!', 'success');
    }

    modeSelect.onchange = () => { currentMode = modeSelect.value; loadPairs(); };
    matchCaseBtn.onclick = () => {
        matchCaseCb.checked = !matchCaseCb.checked;
        matchCaseBtn.textContent = matchCaseCb.checked ? 'Case: Bật' : 'Case: Tắt';
        matchCaseBtn.classList.toggle('bg-green-500', matchCaseCb.checked);
        highlightKeywords();
    };
    addPairBtn.onclick = () => addPair();
    saveSettingsBtn.onclick = saveSettings;

    function showNotification(msg, type='success') {
        const n = document.createElement('div');
        n.className = `notification fixed top-4 right-4 px-4 py-2 rounded text-white text-sm z-50 ${type==='success'?'bg-green-600':type==='info'?'bg-blue-600':'bg-red-600'}`;
        n.textContent = msg;
        document.getElementById('notification-container').appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }

    // === KHỞI ĐỘNG ===
    loadModes();
    requestAnimationFrame(highlightKeywords);
});
