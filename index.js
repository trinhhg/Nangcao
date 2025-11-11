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
    let replacementKeywords = [];
    let currentMode = 'default';
    const SETTINGS_KEY = 'replace_settings';
    const highlightClasses = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];

    // === HÀM KIỂM TRA WORD CHARACTER (TIẾNG VIỆT, TRUNG, NHẬT...) ===
    function isWordChar(ch) {
        if (!ch) return false;
        try {
            return /\p{L}|\p{N}/u.test(ch);
        } catch (e) {
            return /[A-Za-z0-9_]/.test(ch);
        }
    }

    // === HIGHLIGHT TẤT CẢ – ƯU TIÊN KEYWORD > REPLACEMENT + WHOLE WORD UNICODE ===
    function applyAllHighlights() {
        clearAllHighlights();

        const walker = document.createTreeWalker(textInput, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);

        // keywords trước → ưu tiên thu thập
        const allKeywords = [
            ...keywords.filter(k => k && k.trim()),
            ...replacementKeywords.filter(k => k && k.trim())
        ];
        if (allKeywords.length === 0) return;

        const kwClass = [];
        for (let i = 0; i < allKeywords.length; i++) {
            const kw = allKeywords[i];
            const source = i < keywords.length ? 'keyword' : 'replacement';
            kwClass.push({ kw, className: highlightClasses[i % highlightClasses.length], source });
        }

        textNodes.forEach(textNode => {
            const parent = textNode.parentNode;
            if (!parent || !textInput.contains(parent)) return;

            const text = textNode.textContent;
            if (!text) return;

            const matches = [];

            kwClass.forEach(({ kw, className, source }) => {
                if (!kw) return;
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const pattern = escapeRegExp(kw);

                if (wholeWordsCb.checked) {
                    // Manual whole word check (Unicode-aware)
                    const rx = new RegExp(pattern, flags);
                    let m;
                    while ((m = rx.exec(text)) !== null) {
                        const start = m.index;
                        const end = start + m[0].length;
                        const before = text[start - 1];
                        const after = text[end];

                        if (!isWordChar(before) && !isWordChar(after)) {
                            matches.push({
                                index: start,
                                length: m[0].length,
                                keyword: m[0],
                                className,
                                source
                            });
                        }
                        if (m.index === rx.lastIndex) rx.lastIndex++;
                    }
                } else {
                    const rx = new RegExp(pattern, flags);
                    let m;
                    while ((m = rx.exec(text)) !== null) {
                        matches.push({
                            index: m.index,
                            length: m[0].length,
                            keyword: m[0],
                            className,
                            source
                        });
                        if (m.index === rx.lastIndex) rx.lastIndex++;
                    }
                }
            });

            if (matches.length === 0) return;

            // Sắp xếp: index → source (keyword > replacement) → độ dài
            matches.sort((a, b) => {
                if (a.index !== b.index) return a.index - b.index;
                if (a.source !== b.source) return (a.source === 'keyword' ? -1 : 1);
                return b.length - a.length;
            });

            // Lọc overlap: ưu tiên keyword
            const filtered = [];
            let lastEnd = -1;
            for (let i = 0; i < matches.length; i++) {
                const m = matches[i];
                if (m.index >= lastEnd) {
                    filtered.push(m);
                    lastEnd = m.index + m.length;
                } else {
                    const prev = filtered[filtered.length - 1];
                    if (m.source === 'keyword' && prev.source === 'replacement') {
                        filtered[filtered.length - 1] = m;
                        lastEnd = m.index + m.length;
                    }
                }
            }

            // Build fragment
            const frag = document.createDocumentFragment();
            let lastIdx = 0;
            filtered.forEach(m => {
                if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
                const span = document.createElement('span');
                span.className = m.className;
                span.textContent = text.slice(m.index, m.index + m.length);
                frag.appendChild(span);
                lastIdx = m.index + m.length;
            });
            if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));

            parent.replaceChild(frag, textNode);
        });
    }

    // === XÓA HIGHLIGHT ===
    function clearAllHighlights() {
        const spans = textInput.querySelectorAll('.' + highlightClasses.join(', .'));
        spans.forEach(span => {
            span.replaceWith(...Array.from(span.childNodes));
        });
        textInput.normalize();
    }

    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // === REPLACE + HIGHLIGHT TỪ MỚI ===
    function replaceAndHighlight() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (pairs.length === 0) return showNotification('Chưa có cặp!', 'error');

        const walker = document.createTreeWalker(textInput, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);

        textNodes.forEach(textNode => {
            let text = textNode.textContent;
            pairs.forEach(p => {
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const regex = new RegExp(escapeRegExp(p.find), flags);
                text = text.replace(regex, p.replace);
            });
            textNode.textContent = text;
        });

        replacementKeywords = pairs.map(p => p.replace).filter(r => r.trim());
        applyAllHighlights();
        showNotification('Đã thay thế & highlight từ mới!', 'success');
    }

    // === TỪ KHÓA ===
    function addKeywordTag(word) {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `${word} <span class="remove-tag">×</span>`;
        tag.querySelector('.remove-tag').onclick = (e) => {
            e.stopPropagation();
            keywords = keywords.filter(k => k !== word);
            tag.remove();
            applyAllHighlights();
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
            applyAllHighlights();
        }
    });

    searchBtn.onclick = applyAllHighlights;
    clearBtn.onclick = () => {
        keywords = [];
        replacementKeywords = [];
        keywordsTags.innerHTML = '';
        clearAllHighlights();
    };

    fontFamily.onchange = () => textInput.style.fontFamily = fontFamily.value;
    fontSize.onchange = () => textInput.style.fontSize = fontSize.value;

    // === CON TRỎ ĐẦU DÒNG ===
    let firstClick = true;
    textInput.addEventListener('click', () => {
        if (firstClick && textInput.textContent.trim() === '') {
            const range = document.createRange();
            const sel = window.getSelection();
            range.setStart(textInput, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            firstClick = false;
        }
    });

    textInput.addEventListener('input', () => {
        setTimeout(applyAllHighlights, 50);
    });

    replaceAllBtn.onclick = replaceAndHighlight;

    // === XUẤT / NHẬP CSV ===
    exportBtn.onclick = () => {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        let csv = '\uFEFFfind,replace,mode,matchCase\n';
        Object.keys(settings.modes).forEach(m => {
            const mode = settings.modes[m];
            mode.pairs.forEach(p => {
                csv += `"${p.find.replace(/"/g, '""')}","${(p.replace || '').replace(/"/g, '""')}","${m}","${mode.matchCase}"\n`;
            });
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'replace_settings.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    importBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.csv';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const lines = ev.target.result.trim().split('\n');
                    const newSettings = { modes: {} };
                    for (let i = 1; i < lines.length; i++) {
                        const [find, replace, mode, matchCaseStr] = lines[i].split(',').map(s => s.replace(/^"|"$/g, '').replace(/""/g, '"'));
                        if (!find) continue;
                        const matchCase = matchCaseStr === 'true';
                        if (!newSettings.modes[mode]) newSettings.modes[mode] = { pairs: [], matchCase: false };
                        newSettings.modes[mode].pairs.push({ find, replace });
                        newSettings.modes[mode].matchCase = matchCase;
                    }
                    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
                    loadModes();
                    showNotification('Nhập thành công!', 'success');
                } catch (err) {
                    console.error(err);
                    showNotification('Lỗi file CSV!', 'error');
                }
            };
            reader.readAsText(file, 'UTF-8');
        };
        input.click();
    };

    // === CÁC HÀM KHÁC ===
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
        item.className = 'punctuation-item';
        item.innerHTML = `
            <input type="text" class="find" placeholder="Tìm..." value="${find}">
            <input type="text" class="replace" placeholder="Thay bằng..." value="${replace}">
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
        applyAllHighlights();
    };

    addPairBtn.onclick = () => addPair();
    saveSettingsBtn.onclick = saveSettings;

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
    applyAllHighlights();
});
