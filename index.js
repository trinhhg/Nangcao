document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    const textInput = document.getElementById('textInput');
    const keywordsInput = document.getElementById('keywords-input');
    const keywordsTags = document.getElementById('keywords-tags');
    const searchBtn = document.getElementById('search');
    const clearBtn = document.get bạnId('clear');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    const matchCaseCb = document.getElementById('matchCase');
    const wholeWordsCb = document.getElementById('wholeWords');

    // Settings Panel
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

    // === STATE ===
    let keywords = [];
    let currentMode = 'default';
    let matchCaseEnabled = false;
    const SETTINGS_KEY = 'replace_settings';
    const highlightNames = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];

    // === CSS CUSTOM HIGHLIGHT API ===
    function clearAllHighlights() {
        if (CSS.highlights) CSS.highlights.clear();
    }

    function applyHighlight() {
        if (!CSS.highlights) {
            console.warn('CSS Custom Highlight API không được hỗ trợ');
            return;
        }
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
                    if (match.index === undefined) return;
                    const range = new Range();
                    range.setStart(textNode, match.index);
                    range.setEnd(textNode, match.index + match[0].length);
                    highlight.add(range);
                });
            });

            if (highlight.size > 0) {
                CSS.highlights.set(name, highlight);
            }
        });
    }

    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            applyHighlight();
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
            applyHighlight();
        }
    });

    searchBtn.onclick = applyHighlight;
    clearBtn.onclick = () => {
        keywords = [];
        keywordsTags.innerHTML = '';
        clearAllHighlights();
    };

    fontFamily.onchange = () => textInput.style.fontFamily = fontFamily.value;
    fontSize.onchange = () => textInput.style.fontSize = fontSize.value;

    textInput.addEventListener('input', () => setTimeout(applyHighlight, 50));

    // === FIND & REPLACE PANEL ===
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
        punctuationList.insertBefore(item, punctuationList.firstChild); // Thêm vào đầu
    }

    function saveSettings() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        settings.modes[currentMode] = { pairs, matchCase: matchCaseEnabled };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        showNotification('Đã lưu cài đặt!', 'success');
    }

    // === THAY THẾ GIỮ NGUYÊN DÒNG + HIGHLIGHT LẠI ===
    replaceAllBtn.onclick = () => {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        if (pairs.length === 0) return showNotification('Chưa có cặp nào!', 'error');

        // Lấy nội dung, giữ nguyên xuống dòng
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
        applyHighlight(); // Highlight lại sau khi thay
        showNotification('Đã thay thế tất cả!', 'success');
    };

    // === SỰ KIỆN ===
    modeSelect.onchange = () => {
        currentMode = modeSelect.value;
        loadPairs();
    };

    addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ mới:');
        if (!name || name === 'default') return showNotification('Tên không hợp lệ!', 'error');
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        if (settings.modes[name]) return showNotification('Tên đã tồn tại!', 'error');
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

    // === EXPORT / IMPORT ===
    exportBtn.onclick = () => {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { modes: {} };
        let csv = '\uFEFFfind,replace,mode\n';
        Object.keys(settings.modes).forEach(m => {
            settings.modes[m].pairs.forEach(p => {
                csv += `"${p.find.replace(/"/g, '""')}","${(p.replace || '').replace(/"/g, '""')}","${m}"\n`;
            });
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'replace_settings.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    importBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const lines = ev.target.result.trim().split('\n');
                    const newSettings = { modes: {} };
                    for (let i = 1; i < lines.length; i++) {
                        const [find, replace, mode] = lines[i].split(',').map(s => s.replace(/^"|"$/g, '').replace(/""/g, '"'));
                        if (!find) continue;
                        if (!newSettings.modes[mode]) newSettings.modes[mode] = { pairs: [], matchCase: false };
                        newSettings.modes[mode].pairs.push({ find, replace });
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

    function updateModeButtons() {
        const isDefault = currentMode === 'default';
        renameModeBtn.classList.toggle('hidden', isDefault);
        deleteModeBtn.classList.toggle('hidden', isDefault);
    }

    function showNotification(msg, type = 'success') {
        const n = document.createElement('div');
        n.className = `notification ${type}`;
        n.textContent = msg;
        document.getElementById('notification-container').appendChild(n);
        setTimeout(() => n.remove(), 2800);
    }

    // === KHỞI TẠO ===
    loadModes();
    applyHighlight();
});
