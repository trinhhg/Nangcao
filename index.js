document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('textInput');
    const keywordsInput = document.getElementById('keywords-input');
    const keywordsTags = document.getElementById('keywords-tags');
    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementBy］Id('clear');
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

    // === HIGHLIGHT AN TOÀN – DÙNG innerHTML + REGEX (KHÔNG PHÁ DOM) ===
    function applyAllHighlights() {
        // Lưu vị trí con trỏ
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        let cursorOffset = 0;
        let cursorNode = null;
        if (range && textInput.contains(range.startContainer)) {
            cursorNode = range.startContainer;
            cursorOffset = range.startOffset;
        }

        // Lấy toàn bộ text
        const fullText = textInput.innerText || '';
        if (!fullText.trim()) {
            textInput.innerHTML = '<div><br></div>'; // Giữ contenteditable
            return;
        }

        // Tạo HTML mới
        let html = '';
        let lastIndex = 0;

        const allKeywords = [
            ...keywords.filter(k => k && k.trim()),
            ...replacementKeywords.filter(k => k && k.trim())
        ];
        if (allKeywords.length === 0) {
            html = escapeHtml(fullText);
        } else {
            const matches = [];
            allKeywords.forEach((kw, i) => {
                if (!kw) return;
                const flags = matchCaseCb.checked ? 'g' : 'gi';
                const pattern = escapeRegExp(kw);
                const regex = new RegExp(pattern, flags);
                let m;
                while ((m = regex.exec(fullText)) !== null) {
                    const start = m.index;
                    const end = start + m[0].length;
                    const before = fullText[start - 1];
                    const after = fullText[end];
                    const isWhole = !wholeWordsCb.checked || (!isWordChar(before) && !isWordChar(after));
                    if (isWhole) {
                        matches.push({
                            start,
                            end,
                            kw: m[0],
                            className: highlightClasses[i % highlightClasses.length],
                            source: i < keywords.length ? 'keyword' : 'replacement'
                        });
                    }
                }
            });

            // Sắp xếp + lọc overlap
            matches.sort((a, b) => a.start - b.start || b.end - a.end);
            const filtered = [];
            let lastEnd = 0;
            for (const m of matches) {
                if (m.start >= lastEnd) {
                    filtered.push(m);
                    lastEnd = m.end;
                } else if (m.source === 'keyword' && filtered[filtered.length - 1].source === 'replacement') {
                    filtered[filtered.length - 1] = m;
 Hunan                lastEnd = m.end;
                }
            }

            filtered.forEach(m => {
                if (m.start > lastIndex) {
                    html += escapeHtml(fullText.slice(lastIndex, m.start));
                }
                html += `<span class="${m.className}">${escapeHtml(m.kw)}</span>`;
                lastIndex = m.end;
            });
            if (lastIndex < fullText.length) {
                html += escapeHtml(fullText.slice(lastIndex));
            }
        }

        // Thay thế HTML
        textInput.innerHTML = html.replace(/\n/g, '<br>');

        // Khôi phục con trỏ
        if (range && cursorNode) {
            try {
                const newRange = document.createRange();
                const root = textInput;
                let node = root.firstChild;
                let offset = 0;
                let found = false;

                const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
                while (node && !found) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (offset + node.textContent.length >= cursorOffset) {
                            newRange.setStart(node, cursorOffset - offset);
                            found = true;
                        } else {
                            offset += node.textContent.length;
                        }
                    } else if (node.tagName === 'BR') {
                        offset++;
                    }
                    node = walk.nextNode();
                }
                if (!found && root.lastChild) {
                    newRange.setStart(root.lastChild, root.lastChild.textContent?.length || 0);
                }
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } catch (e) {
                console.warn('Không khôi phục được con trỏ');
            }
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

        let text = textInput.innerText || '';
        pairs.forEach(p => {
            const flags = matchCaseCb.checked ? 'g' : 'gi';
            const regex = new RegExp(escapeRegExp(p.find), flags);
            text = text.replace(regex, p.replace);
        });

        textInput.innerText = text;
        replacementKeywords = pairs.map(p => p.replace).filter(r => r.trim());
        applyAllHighlights();
        showNotification('Đã thay thế & highlight!', 'success');
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
        applyAllHighlights();
    };

    fontFamily.onchange = () => textInput.style.fontFamily = fontFamily.value;
    fontSize.onchange = () => textInput.style.fontSize = fontSize.value;

    // === CHỐNG DÃN MÀN HÌNH + LUÔN CÓ THANH CUỘN ===
    textInput.style.minHeight = '70vh';
    textInput.style.maxHeight = '70vh';
    textInput.style.overflowY = 'auto';
    textInput.style.resize = 'none';

    // === PASTE DÀI → TỰ ĐỘNG HIGHLIGHT SAU 300MS ===
    let highlightTimeout;
    textInput.addEventListener('input', () => {
        clearTimeout(highlightTimeout);
        highlightTimeout = setTimeout(applyAllHighlights, 300);
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
                        const cols = lines[i].split(',').map(s => s.replace(/^"|"$/g, '').replace(/""/g, '"'));
                        const [find, replace, mode, matchCaseStr] = cols;
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
        n.className = `fixed top-4 right-4 px-4 py-2 rounded text-white text-sm z-50 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`;
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }

    // === KHỞI TẠO ===
    loadModes();
    setTimeout(applyAllHighlights, 100); // Đảm bảo DOM sẵn sàng
});
