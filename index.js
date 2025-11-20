document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const keywordsInput = document.getElementById('keywords-input');
    const keywordsTags = document.getElementById('keywords-tags');
    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    const matchCaseCb = document.getElementById('matchCase');
    const wholeWordsCb = document.getElementById('wholeWords');
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');
    const textLayer = document.getElementById('text-layer');

    // Replace mode elements
    const modeSelect = document.getElementById('mode-select');
    const addModeBtn = document.getElementById('add-mode');
    const matchCaseReplaceBtn = document.getElementById('match-case');
    const deleteModeBtn = document.getElementById('delete-mode-btn');
    const renameModeBtn = document.getElementById('rename-mode');
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');

    // State
    let currentKeywords = [];
    let replacedRanges = []; // {start, end} cho highlight vàng
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    const REPLACE_MODES_KEY = 'replaceModes';
    const ACTIVE_MODE_NAME_KEY = 'activeReplaceMode';
    let replaceModes = {};
    let activeModeName = 'Mặc định';

    // Utils
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Save/Restore cursor (fix đảo ngược)
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
        const pattern = wholeWords ? `\\b${escaped}\\b` : escaped;
        const flags = matchCase ? 'g' : 'gi';
        return new RegExp(pattern, flags);
    }

    // Highlight với cursor restore (fix lem + đảo ngược)
    function highlightKeywords() {
        saveSelection(); // Save trước
        const text = textLayer.textContent || '';
        textLayer.innerHTML = ''; // Clear an toàn

        const searchWholeWords = wholeWordsCb.checked;
        const searchMatchCase = matchCaseCb.checked;

        const keywordsToHighlight = [
            // Replaced: vàng, ưu tiên 999
            ...replacedRanges.map(r => ({ start: r.start, end: r.end, cls: 'hl-yellow', priority: 999 })),
            // Keywords: màu khác, ưu tiên 100
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
                matches.push({ start: kw.start, end: kw.end, cls: kw.cls, priority: kw.priority });
            } else {
                const regex = buildRegex(kw.text, searchWholeWords, searchMatchCase);
                if (!regex) return;
                let m;
                while ((m = regex.exec(text)) !== null) {
                    matches.push({ start: m.index, end: m.index + m[0].length, cls: kw.cls, priority: kw.priority });
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

        // Rebuild DOM
        const frag = document.createDocumentFragment();
        let pos = 0;
        for (const m of finalMatches) {
            if (m.start > pos) {
                frag.appendChild(document.createTextNode(text.slice(pos, m.start)));
            }
            const mark = document.createElement('mark');
            mark.className = m.cls;
            mark.setAttribute('data-hl', '1');
            mark.textContent = text.slice(m.start, m.end);
            frag.appendChild(mark);
            pos = m.end;
        }
        if (pos < text.length) {
            frag.appendChild(document.createTextNode(text.slice(pos)));
        }
        textLayer.appendChild(frag);

        setTimeout(restoreSelection, 0); // Defer restore
    }

    // Replace với log vị trí mới (fix không highlight replaced)
    function replaceAllSafe() {
        saveSelection();
        const text = textLayer.textContent || '';
        const mode = replaceModes[activeModeName];
        if (!mode) return showNotification('Chưa chọn chế độ!', 'error');

        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item'))
            .map(el => ({
                find: el.querySelector('.find').value.trim(),
                replace: el.querySelector('.replace').value
            })).filter(p => p.find);

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
                replacedRanges.push({ start, end }); // Log vị trí MỚI
                offset += pair.replace.length - match.length;
                return pair.replace;
            });
        });

        textLayer.textContent = newText;
        highlightKeywords();
        const changed = replacedRanges.length > 0;
        showNotification(changed ? 'Thay thế thành công!' : 'Không tìm thấy từ nào.', changed ? 'success' : 'error');
        restoreSelection();
    }

    // Keywords (fix Enter + focus)
    function addKeywords() {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        let added = false;
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
                keywordsTags.appendChild(tag); // Append để không đảo
                added = true;
            }
        });
        keywordsInput.value = '';
        if (added) highlightKeywords();
        keywordsInput.focus(); // Focus lại sau add
    }

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            e.stopPropagation(); // Chặn bubbling
            addKeywords();
        }
    });
    keywordsInput.addEventListener('blur', () => {
        if (keywordsInput.value.trim()) addKeywords();
    });

    // Paste giữ xuống dòng (fix dồn cục)
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text/plain');
        const lines = pastedText.split(/\r?\n/);
        const sel = window.getSelection();
        if (sel.rangeCount) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            lines.forEach((line, i) => {
                if (i > 0) range.insertNode(document.createElement('br'));
                if (line) range.insertNode(document.createTextNode(line));
            });
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        setTimeout(highlightKeywords, 0);
    });

    let highlightTimer;
    textLayer.addEventListener('input', () => {
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(highlightKeywords, 150);
    });

    // Font sync
    function syncFont() {
        const family = fontFamily.value;
        const size = fontSize.value;
        textLayer.style.fontFamily = family;
        textLayer.style.fontSize = size;
        highlightKeywords();
    }
    fontFamily.onchange = fontSize.onchange = syncFont;
    matchCaseCb.onchange = wholeWordsCb.onchange = highlightKeywords;

    // Replace Mode Management (giữ nguyên, chỉ fix append)
    function loadModes() {
        try {
            const data = localStorage.getItem(REPLACE_MODES_KEY);
            replaceModes = data ? JSON.parse(data) : {};
            activeModeName = localStorage.getItem(ACTIVE_MODE_NAME_KEY) || 'Mặc định';

            if (!replaceModes['Mặc định']) {
                replaceModes['Mặc định'] = { pairs: [], options: { matchCase: false } };
            }
            if (!replaceModes[activeModeName]) activeModeName = Object.keys(replaceModes)[0] || 'Mặc định';
        } catch (e) {
            replaceModes = { 'Mặc định': { pairs: [], options: { matchCase: false } } };
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
        (replaceModes[activeModeName].pairs || []).forEach(p => addPairUI(p.find, p.replace));
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
        punctuationList.appendChild(div); // Append fix đảo
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

    // Events
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
        replaceModes[name] = { pairs: [], options: { matchCase: false } };
        activeModeName = name;
        saveModes();
        updateUI();
    };

    deleteModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định' || !confirm(`Xóa chế độ "${activeModeName}"?`)) return;
        delete replaceModes[activeModeName];
        activeModeName = Object.keys(replaceModes)[0] || 'Mặc định';
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

    // Khởi động
    syncFont();
    loadModes();
    textLayer.textContent = '';
    highlightKeywords();
});
