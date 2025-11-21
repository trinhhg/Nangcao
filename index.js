document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    const keywordsInput    = document.getElementById('keywords-input');
    const keywordsTags     = document.getElementById('keywords-tags');
    const searchBtn        = document.getElementById('search');
    const clearBtn         = document.getElementById('clear');
    const fontFamily       = document.getElementById('fontFamily');
    const fontSize         = document.getElementById('fontSize');
    const matchCaseCb      = document.getElementById('matchCase');
    const wholeWordsCb     = document.getElementById('wholeWords');
    const replaceAllBtn    = document.getElementById('replace-all');
    const punctuationList  = document.getElementById('punctuation-list');
    const textLayer        = document.getElementById('text-layer');
    const highlightLayer   = document.getElementById('highlight-layer');

    // Replace mode elements
    const modeSelect       = document.getElementById('mode-select');
    const addModeBtn       = document.getElementById('add-mode');
    const matchCaseReplaceBtn = document.getElementById('match-case');
    const deleteModeBtn    = document.getElementById('delete-mode-btn');
    const renameModeBtn    = document.getElementById('rename-mode');
    const addPairBtn       = document.getElementById('add-pair');
    const saveSettingsBtn  = document.getElementById('save-settings');

    // === STATE ===
    let currentKeywords = [];
    let replacedRanges = []; // Vị trí mới sau replace (fix highlight full)
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    // Replace modes
    const REPLACE_MODES_KEY = 'replaceModes';
    const ACTIVE_MODE_NAME_KEY = 'activeReplaceMode';
    let replaceModes = {};
    let activeModeName = 'Mặc định';

    // === UTILS ===
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let savedRange = null;
    function saveSelection() {
        const sel = window.getSelection();
        if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
    }
    function restoreSelection() {
        if (!savedRange) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
        savedRange = null;
    }

    function showNotification(message, type = 'success') {
        const container = document.getElementById('notification-container');
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        container.prepend(notif);
        setTimeout(() => notif.remove(), 3000);
    }

    function buildRegex(word, wholeWords = false, matchCase = false) {
        if (!word) return null;
        const escaped = escapeRegex(word);
        let pattern = escaped;
        if (wholeWords) {
            // Fix giống Word: boundary non-alphanumeric
            pattern = `(^|[^a-zA-Z0-9])(\( {escaped})( \)|[^a-zA-Z0-9])`;
        }
        const flags = matchCase ? 'g' : 'gi';
        return new RegExp(pattern, flags);
    }

    // === HIGHLIGHT CHUẨN (2-layer, fix HierarchyError + full highlight) ===
    function highlightKeywords() {
        saveSelection();
        const text = textLayer.textContent || '';
        highlightLayer.innerHTML = ''; // Chỉ clear layer highlight, không đụng text-layer (fix error)

        const searchWholeWords = wholeWordsCb.checked;
        const searchMatchCase = matchCaseCb.checked;

        const keywordsToHighlight = [
            // Từ đã replace: vàng, ưu tiên cao (loop full)
            ...replacedRanges.map(r => ({ start: r.start, end: r.end, cls: 'hl-yellow', priority: 999 })),
            // Keywords: màu khác
            ...currentKeywords.map((t, i) => ({ 
                text: t, 
                cls: HIGHLIGHT_CLASSES[(i + 1) % 6], 
                priority: 100 
            }))
        ];

        if (!keywordsToHighlight.length || !text) {
            restoreSelection();
            return;
        }

        const matches = [];
        keywordsToHighlight.forEach(kw => {
            if (kw.start !== undefined) {
                // Replaced: thêm trực tiếp
                matches.push({ start: kw.start, end: kw.end, cls: kw.cls, priority: kw.priority });
            } else {
                // Keywords: loop full exec
                const regex = buildRegex(kw.text, searchWholeWords, searchMatchCase);
                if (!regex) return;
                let m;
                while ((m = regex.exec(text)) !== null) {
                    const matchStart = searchWholeWords ? m.index + m[1].length : m.index;
                    const matchEnd = matchStart + kw.text.length;
                    matches.push({ start: matchStart, end: matchEnd, cls: kw.cls, priority: kw.priority });
                }
            }
        });

        // Sort + filter overlap
        matches.sort((a, b) => a.start - b.start || b.priority - a.priority || b.end - a.end);
        const finalMatches = [];
        let lastEnd = 0;
        for (const m of matches) {
            if (m.start >= lastEnd) {
                finalMatches.push(m);
                lastEnd = m.end;
            }
        }

        // Rebuild highlight-layer (không đụng text-layer, fix error)
        const frag = document.createDocumentFragment();
        let pos = 0;
        for (const m of finalMatches) {
            if (m.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, m.start)));
            const mark = document.createElement('mark');
            mark.className = m.cls;
            mark.setAttribute('data-hl', '1');
            mark.textContent = text.slice(m.start, m.end);
            frag.appendChild(mark);
            pos = m.end;
        }
        if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
        highlightLayer.appendChild(frag);

        // Sync font
        highlightLayer.style.fontFamily = textLayer.style.fontFamily;
        highlightLayer.style.fontSize = textLayer.style.fontSize;

        setTimeout(restoreSelection, 0); // Defer fix cursor jump
    }

    // === REPLACE ALL (lưu vị trí mới, full highlight) ===
    function replaceAllSafe() {
        saveSelection();
        const text = textLayer.textContent || '';
        const mode = replaceModes[activeModeName];
        if (!mode) return showNotification('Chưa chọn chế độ!', 'error');

        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item'))
            .map(el => ({
                find: el.querySelector('.find').value.trim(),
                replace: el.querySelector('.replace').value
            }))
            .filter(p => p.find);

        if (!pairs.length) return showNotification('Chưa có cặp thay thế!', 'error');

        pairs.sort((a, b) => b.find.length - a.find.length);
        const matchCase = mode.options?.matchCase || false;

        let newText = text;
        replacedRanges = []; // Reset
        let offset = 0;

        pairs.forEach(pair => {
            const regex = buildRegex(pair.find, false, matchCase);
            if (!regex) return;
            newText = newText.replace(regex, (match, index) => {
                const start = index + offset;
                const end = start + pair.replace.length;
                replacedRanges.push({ start, end }); // Lưu vị trí mới (fix full highlight)
                offset += pair.replace.length - match.length;
                return pair.replace;
            });
        });

        textLayer.textContent = newText;
        highlightKeywords();

        if (replacedRanges.length) {
            showNotification('Thay thế thành công!', 'success');
        } else {
            replacedRanges = [];
            highlightKeywords();
            showNotification('Không tìm thấy từ nào để thay thế.', 'error');
        }

        restoreSelection();
    }

    // === KEYWORDS TAG SYSTEM ===
    function addKeywords() {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        vals.forEach(v => {
            if (v && !currentKeywords.includes(v)) {
                currentKeywords.push(v);
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.innerHTML = `${v} <span class="remove-tag">×</span>`;
                tag.querySelector('.remove-tag').onclick = (e) => {
                    e.stopPropagation();
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x => x !== v);
                    highlightKeywords();
                };
                keywordsTags.appendChild(tag); // Append fix order
            }
        });
        keywordsInput.value = '';
        keywordsInput.focus();
        highlightKeywords();
    }

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addKeywords();
        }
    });
    keywordsInput.addEventListener('blur', () => {
        if (keywordsInput.value.trim()) addKeywords();
    });

    // === PASTE & INPUT (giữ format, fix reversed) ===
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const htmlData = (e.clipboardData || window.clipboardData).getData('text/html');
        const plainData = (e.clipboardData || window.clipboardData).getData('text/plain');

        if (htmlData) {
            // Parse HTML giữ format selective
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlData, 'text/html');
            // Giữ strong, em, br; bỏ style
            doc.querySelectorAll('*').forEach(el => {
                if (!['STRONG', 'EM', 'BR'].includes(el.tagName)) {
                    el.replaceWith(...el.childNodes);
                } else {
                    el.removeAttribute('style');
                }
            });
            const frag = document.createDocumentFragment();
            frag.append(...Array.from(doc.body.childNodes));
            document.execCommand('insertHTML', false, frag.innerHTML); // Insert giữ structure
        } else {
            document.execCommand('insertText', false, plainData);
        }
        setTimeout(highlightKeywords, 100);
    });

    let highlightTimer;
    textLayer.addEventListener('input', () => {
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(highlightKeywords, 150);
    });

    // === FONT SYNC ===
    function syncFont() {
        const family = fontFamily.value;
        const size = fontSize.value;
        textLayer.style.fontFamily = highlightLayer.style.fontFamily = family;
        textLayer.style.fontSize = highlightLayer.style.fontSize = size;
        highlightKeywords();
    }
    fontFamily.onchange = fontSize.onchange = syncFont;

    matchCaseCb.onchange = wholeWordsCb.onchange = highlightKeywords;

    // === REPLACE MODE MANAGEMENT (fix order: append khi load, prepend khi add) ===
    function loadModes() {
        try {
            const data = localStorage.getItem(REPLACE_MODES_KEY);
            replaceModes = data ? JSON.parse(data) : {};
            activeModeName = localStorage.getItem(ACTIVE_MODE_NAME_KEY) || 'Mặc định';

            if (!replaceModes['Mặc định']) {
                replaceModes['Mặc định'] = { pairs: [], options: { matchCase: false, wholeWords: false } };
            }
            if (!replaceModes[activeModeName]) activeModeName = Object.keys(replaceModes)[0];
        } catch (e) {
            replaceModes = { 'Mặc định': { pairs: [], options: { matchCase: false, wholeWords: false } } };
            activeModeName = 'Mặc định';
        }
        saveModes();
        updateUI();
    }

    function saveModes() {
        localStorage.setItem(REPLACE_MODES_KEY, JSON.stringify(replaceModes));
        localStorage.setItem(ACTIVE_MODE_NAME_KEY, activeModeName);
    }

    function updateUI() {
        modeSelect.innerHTML = '';
        Object.keys(replaceModes).forEach(name => {
            const opt = new Option(name, name, false, name === activeModeName);
            modeSelect.add(opt);
        });

        const isDefault = activeModeName === 'Mặc định';
        deleteModeBtn.classList.toggle('hidden', isDefault);
        renameModeBtn.classList.toggle('hidden', isDefault);

        const opt = replaceModes[activeModeName].options || { matchCase: false };
        matchCaseReplaceBtn.textContent = opt.matchCase ? 'Case: BẬT' : 'Case: TẮT';
        matchCaseReplaceBtn.classList.toggle('bg-green-600', opt.matchCase);
        matchCaseReplaceBtn.classList.toggle('bg-gray-500', !opt.matchCase);

        punctuationList.innerHTML = '';
        (replaceModes[activeModeName].pairs || []).forEach(p => addPairUI(p.find, p.replace, false)); // Append khi load (giữ thứ tự)
    }

    function addPairUI(find = '', replace = '', focus = true) {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `
            <input type="text" class="find" placeholder="Tìm" value="${find}">
            <input type="text" class="replace" placeholder="Thay bằng" value="${replace}">
            <button class="remove-pair" title="Xóa">×</button>
        `;
        div.querySelector('.remove-pair').onclick = () => div.remove();
        punctuationList.prepend(div); // Prepend khi add mới (mới lên đầu)
        if (focus) div.querySelector('.find').focus();
    }

    function saveCurrentMode() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        }));
        replaceModes[activeModeName].pairs = pairs;
        saveModes();
        showNotification(`Đã lưu chế độ "${activeModeName}"`, 'success');
    }

    // === EVENTS ===
    searchBtn.onclick = () => { replacedRanges = []; highlightKeywords(); };
    clearBtn.onclick = () => {
        currentKeywords = [];
        replacedRanges = [];
        keywordsTags.innerHTML = '';
        highlightKeywords();
    };
    replaceAllBtn.onclick = replaceAllSafe;
    addPairBtn.onclick = () => addPairUI('', '', true);
    saveSettingsBtn.onclick = saveCurrentMode;

    modeSelect.onchange = () => {
        activeModeName = modeSelect.value;
        saveModes();
        replacedRanges = [];
        updateUI();
        highlightKeywords();
    };

    addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ mới:')?.trim();
        if (!name || replaceModes[name]) {
            if (name) showNotification('Tên đã tồn tại!', 'error');
            return;
        }
        replaceModes[name] = { pairs: [], options: { matchCase: false, wholeWords: false } };
        activeModeName = name;
        saveModes();
        updateUI();
    };

    deleteModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định' || !confirm(`Xóa chế độ "${activeModeName}"?`)) return;
        delete replaceModes[activeModeName];
        activeModeName = Object.keys(replaceModes)[0];
        saveModes();
        updateUI();
    };

    renameModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định') return;
        const newName = prompt(`Đổi tên "${activeModeName}" thành:`, activeModeName)?.trim();
        if (!newName || newName === activeModeName || replaceModes[newName]) return;
        replaceModes[newName] = replaceModes[activeModeName];
        delete replaceModes[activeModeName];
        activeModeName = newName;
        saveModes();
        updateUI();
    };

    matchCaseReplaceBtn.onclick = () => {
        const opt = replaceModes[activeModeName].options ||= {};
        opt.matchCase = !opt.matchCase;
        saveModes();
        updateUI();
    };

    // === KHỞI ĐỢNG ===
    syncFont();
    loadModes();
    textLayer.textContent = '';
    highlightKeywords();
});
