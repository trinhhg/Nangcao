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
    const textLayer = document.getElementById('text-layer'); // contenteditable

    // === STATE ===
    let currentKeywords = [];           // Từ khóa tìm kiếm
    let replacedKeywords = [];          // Từ thay thế (ưu tiên cao hơn)
    let currentMode = 'default';
    const SETTINGS_KEY = 'replace_settings';
    const HIGHLIGHT_CLASSES = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];

    // === HIGHLIGHT ENGINE (không overlay) ===
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    function saveSelection() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        return { start: range.startOffset, end: range.endOffset, node: range.startContainer };
    }

    function restoreSelection(saved) {
        if (!saved) return;
        const sel = window.getSelection();
        const range = document.createRange();
        try {
            range.setStart(saved.node, saved.start);
            range.setEnd(saved.node, saved.end);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) { /* ignore */ }
    }

    function removeHighlights() {
        const marks = textLayer.querySelectorAll('mark[data-hl]');
        marks.forEach(m => {
            const text = document.createTextNode(m.textContent);
            m.replaceWith(text);
        });
        textLayer.normalize();
    }

    function highlightKeywords() {
        const saved = saveSelection();
        removeHighlights();

        const allKeywords = [
            ...currentKeywords.map((k, i) => ({ text: k, priority: 100, class: HIGHLIGHT_CLASSES[i % HIGHLIGHT_CLASSES.length] })),
            ...replacedKeywords.map((k, i) => ({ text: k, priority: 500, class: HIGHLIGHT_CLASSES[(currentKeywords.length + i) % HIGHLIGHT_CLASSES.length] }))
        ];

        if (!allKeywords.length) {
            restoreSelection(saved);
            return;
        }

        allKeywords.sort((a, b) => b.priority - a.priority || b.text.length - a.text.length);

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
                    const idx = match.index;
                    if (idx > lastIndex) {
                        frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
                    }
                    const mark = document.createElement('mark');
                    mark.setAttribute('data-hl', '1');
                    mark.className = kw.class;
                    mark.textContent = match[0];
                    frag.appendChild(mark);
                    lastIndex = idx + match[0].length;
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
        restoreSelection(saved);
    }

    // === PASTE KHÔNG LAG (chuẩn Google Docs) ===
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);

        // Highlight chạy sau khi browser rảnh → KHÔNG LAG
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => highlightKeywords());
        } else {
            setTimeout(highlightKeywords, 0);
        }
    });

    // === INPUT DEBOUNCE (mượt khi gõ) ===
    let inputTimeout;
    textLayer.addEventListener('input', () => {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(highlightKeywords, 16);
    });

    // === KEYWORDS INPUT ===
    const addKeywordsFromInput = () => {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        vals.forEach(v => {
            if (v && !currentKeywords.includes(v)) {
                currentKeywords.push(v);
                addKeywordTag(v);
            }
        });
        keywordsInput.value = '';
        highlightKeywords(); // BẮT BUỘC chạy ngay
    };

    const addKeywordTag = word => {
        const tag = document.createElement('div');
        tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
        tag.innerHTML = `${word} <span class="remove-tag cursor-pointer">×</span>`;
        tag.querySelector('.remove-tag').onclick = () => {
            tag.remove();
            currentKeywords = currentKeywords.filter(k => k !== word);
            highlightKeywords();
        };
        keywordsTags.appendChild(tag);
    };

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addKeywordsFromInput(); }
    });
    keywordsInput.addEventListener('input', () => {
        if (keywordsInput.value.includes(',')) addKeywordsFromInput();
    });

    searchBtn.onclick = () => highlightKeywords();
    clearBtn.onclick = () => {
        keywordsTags.innerHTML = '';
        currentKeywords = [];
        replacedKeywords = [];
        highlightKeywords();
    };

    // === FONT CHANGE ===
    const syncFont = () => {
        const font = fontFamily.value;
        const size = fontSize.value;
        textLayer.style.fontFamily = font;
        textLayer.style.fontSize = size;
        highlightKeywords();
    };
    fontFamily.onchange = syncFont;
    fontSize.onchange = syncFont;

    // === REPLACE ALL → TỪ MỚI THÀNH KEYWORD ===
    replaceAllBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (!pairs.length) return showNotification('Chưa có cặp!', 'error');

        let changed = false;
        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
            let text = node.nodeValue;
            pairs.forEach(p => {
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const pattern = wholeWordsCb.checked ? `\\b${escapeRegex(p.find)}\\b` : escapeRegex(p.find);
                const regex = new RegExp(pattern, flags);
                if (regex.test(text)) {
                    text = text.replace(regex, p.replace);
                    changed = true;
                }
            });
            if (text !== node.nodeValue) node.nodeValue = text;
        });

        if (changed) {
            replacedKeywords = pairs.filter(p => p.replace).map(p => p.replace);
            highlightKeywords();
            showNotification('Đã thay thế!', 'success');
        } else {
            showNotification('Không tìm thấy!', 'info');
        }
    };

    // === MODE & SETTINGS (giữ nguyên 100%) ===
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
        highlightKeywords();
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

    // === KHỞI ĐỘNG ===
    loadModes();
    requestAnimationFrame(highlightKeywords);
});
