document.addEventListener('DOMContentLoaded', () => {
    // === DOM ===
    const editor = document.getElementById('editor');
    const keywordsInput = document.getElementById('keywords-input');
    const keywordsTags = document.getElementById('keywords-tags');
    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    const matchCaseCb = document.getElementById('matchCase');
    const wholeWordsCb = document.getElementById('wholeWords');
    const punctuationList = document.getElementById('punctuation-list');
    const modeSelect = document.getElementById('mode-select');
    const addModeBtn = document.getElementById('add-mode');
    const renameModeBtn = document.getElementById('rename-mode');
    const deleteModeBtn = document.getElementById('delete-mode');
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');
    const replaceAllBtn = document.getElementById('replace-all');
    const toggleCaseBtn = document.getElementById('toggle-case');

    // === STATE ===
    let keywords = [];
    let lastReplaced = new Set();
    const COLORS = ['hl-yellow', 'hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple'];
    const MODES_KEY = 'replace_modes_v2';
    const ACTIVE_KEY = 'active_replace_mode';
    let modes = { 'Mặc định': { pairs: [], options: { matchCase: false } } };
    let activeMode = 'Mặc định';

    // === NOTIFICATION ===
    const notify = (msg, type = 'success') => {
        const n = document.createElement('div');
        n.className = `notification ${type}`;
        n.textContent = msg;
        document.getElementById('notification-container').prepend(n);
        setTimeout(() => n.remove(), 3000);
    };

    // === PLAIN TEXT & HIGHLIGHT ENGINE (CHUẨN GOOGLE DOCS) ===
    const getPlainText = () => {
        return editor.textContent || '';
    };

    const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const buildRegex = (word, whole, mc) => {
        if (!word) return null;
        const esc = escapeRegExp(word);
        const pattern = whole ? `\\b${esc}\\b` : esc;
        return new RegExp(pattern, mc ? 'g' : 'gi');
    };

    const highlight = () => {
        const text = getPlainText();
        const items = [
            ...Array.from(lastReplaced).map(t => ({ text: t, cls: 'hl-yellow', prio: 999 })),
            ...keywords.map((k, i) => ({ text: k, cls: COLORS[i % 6], prio: 100 }))
        ];

        const matchCase = matchCaseCb.checked;
        const whole = wholeWordsCb.checked;

        const matches = [];
        items.forEach(item => {
            const re = buildRegex(item.text, whole, matchCase);
            if (!re) return;
            let m;
            while ((m = re.exec(text)) !== null) {
                matches.push({ start: m.index, end: re.lastIndex, cls: item.cls, prio: item.prio });
            }
        });

        // Sort: position → priority → length desc
        matches.sort((a, b) => a.start - b.start || b.prio - a.prio || b.end - a.end);

        // Remove overlaps
        const final = [];
        let last = 0;
        for (const m of matches) {
            if (m.start >= last) {
                final.push(m);
                last = m.end;
            }
        }

        // Rebuild DOM
        const frag = document.createDocumentFragment();
        let pos = 0;
        for (const m of final) {
            if (m.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, m.start)));
            const span = document.createElement('mark');
            span.className = m.cls + ' hl';
            span.setAttribute('data-hl', '1');
            span.textContent = text.slice(m.start, m.end);
            frag.appendChild(span);
            pos = m.end;
        }
        if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));

        editor.textContent = ''; // clear
        editor.appendChild(frag);
    };

    // === REPLACE SAFE (NO DOM TOUCH) ===
    const replaceAll = () => {
        let text = getPlainText();
        const mode = modes[activeMode];
        if (!mode || !mode.pairs.length) return notify('Chưa có cặp thay thế!', 'error');

        const pairs = mode.pairs.filter(p => p.find);
        const opts = mode.options || {};
        let changed = false;
        const used = new Set();

        pairs.forEach(p => {
            const re = buildRegex(p.find, false, opts.matchCase);
            if (!re) return;
            text = text.replace(re, match => {
                if (match !== p.replace) {
                    changed = true;
                    used.add(p.find);
                }
                return p.replace;
            });
        });

        if (changed) {
            editor.textContent = text;
            lastReplaced = used;
            notify('Thay thế thành công!', 'success');
        } else {
            lastReplaced = new Set();
            notify('Không tìm thấy gì để thay.', 'error');
        }
        highlight();
    };

    // === KEYWORDS TAGS ===
    const addKeyword = (word) => {
        word = word.trim();
        if (!word || keywords.includes(word)) return;
        keywords.push(word);

        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `${word} <span class="remove">×</span>`;
        tag.querySelector('.remove').onclick = () => {
            tag.remove();
            keywords = keywords.filter(k => k !== word);
            highlight();
        };
        keywordsTags.appendChild(tag);
        highlight();
    };

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = keywordsInput.value.trim();
            if (val) addKeyword(val);
            keywordsInput.value = '';
        }
    });

    keywordsInput.addEventListener('blur', () => {
        const val = keywordsInput.value.trim();
        if (val) addKeyword(val);
        keywordsInput.value = '';
    });

    // === PASTE CHUẨN ===
    editor.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
    });

    // === EVENTS ===
    searchBtn.onclick = () => { lastReplaced = new Set(); highlight(); };
    clearBtn.onclick = () => {
        keywords = [];
        lastReplaced = new Set();
        keywordsTags.innerHTML = '';
        highlight();
    };

    replaceAllBtn.onclick = replaceAll;

    let highlightTimer;
    editor.addEventListener('input', () => {
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(highlight, 200);
    });

    // Font sync
    const syncFont = () => {
        editor.style.fontFamily = fontFamily.value;
        editor.style.fontSize = fontSize.value;
    };
    fontFamily.onchange = fontSize.onchange = syncFont;
    matchCaseCb.onchange = wholeWordsCb.onchange = highlight;

    // === REPLACE MODES ===
    const loadModes = () => {
        try {
            const data = localStorage.getItem(MODES_KEY);
            if (data) modes = JSON.parse(data);
            activeMode = localStorage.getItem(ACTIVE_KEY) || 'Mặc định';
            if (!modes[activeMode]) activeMode = Object.keys(modes)[0] || 'Mặc định';
        } catch (e) { /* ignore */ }
        if (!modes['Mặc định']) modes['Mặc định'] = { pairs: [], options: { matchCase: false } };
        saveModes();
        renderModes();
    };

    const saveModes = () => {
        localStorage.setItem(MODES_KEY, JSON.stringify(modes));
        localStorage.setItem(ACTIVE_KEY, activeMode);
    };

    const renderModes = () => {
        modeSelect.innerHTML = '';
        Object.keys(modes).forEach(n => {
            const opt = new Option(n, n, false, n === activeMode);
            modeSelect.add(opt);
        });

        const isDefault = activeMode === 'Mặc định';
        deleteModeBtn.classList.toggle('hidden', isDefault);
        renameModeBtn.classList.toggle('hidden', isDefault);

        toggleCaseBtn.textContent = modes[activeMode].options?.matchCase ? 'Case: BẬT' : 'Case: TẮT';
        toggleCaseBtn.className = modes[activeMode].options?.matchCase ? 'w-full mb-3 py-2 bg-green-600 text-white rounded text-xs' : 'w-full mb-3 py-2 bg-gray-600 text-white rounded text-xs';

        punctuationList.innerHTML = '';
        (modes[activeMode].pairs || []).forEach(p => addPairRow(p.find, p.replace));
    };

    const addPairRow = (find = '', rep = '') => {
        const div = document.createElement('div');
        div.className = 'flex gap-2 items-center mb-2';
        div.innerHTML = `
            <input type="text" class="find flex-1 p-2 border rounded text-xs" placeholder="Tìm" value="${find}">
            <span class="text-gray-500">→</span>
            <input type="text" class="replace flex-1 p-2 border rounded text-xs" placeholder="Thay bằng" value="${rep}">
            <button class="remove-pair w-8 h-8 bg-red-500 text-white rounded hover:bg-red-600">×</button>
        `;
        div.querySelector('.remove-pair').onclick = () => div.remove();
        punctuationList.prepend(div);
    };

    const saveCurrentMode = () => {
        const rows = punctuationList.querySelectorAll('div');
        const pairs = Array.from(rows).map(row => ({
            find: row.querySelector('.find').value.trim(),
            replace: row.querySelector('.replace').value
        }));
        modes[activeMode].pairs = pairs;
        saveModes();
        notify(`Đã lưu "${activeMode}"`);
    };

    // Mode events
    modeSelect.onchange = () => { activeMode = modeSelect.value; saveModes(); renderModes(); };
    addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ mới:')?.trim();
        if (!name || modes[name]) return notify('Tên đã tồn tại!', 'error');
        modes[name] = { pairs: [], options: { matchCase: false } };
        activeMode = name;
        saveModes();
        renderModes();
    };
    deleteModeBtn.onclick = () => {
        if (activeMode === 'Mặc định' || !confirm(`Xóa "${activeMode}"?`)) return;
        delete modes[activeMode];
        activeMode = Object.keys(modes)[0];
        saveModes();
        renderModes();
    };
    renameModeBtn.onclick = () => {
        const newName = prompt('Tên mới:', activeMode)?.trim();
        if (!newName || newName === activeMode || modes[newName]) return;
        modes[newName] = modes[activeMode];
        delete modes[activeMode];
        activeMode = newName;
        saveModes();
        renderModes();
    };
    toggleCaseBtn.onclick = () => {
        const opt = modes[activeMode].options || {};
        opt.matchCase = !opt.matchCase;
        modes[activeMode].options = opt;
        saveModes();
        renderModes();
    };
    addPairBtn.onclick = () => addPairRow();
    saveSettingsBtn.onclick = saveCurrentMode;

    // === INIT ===
    syncFont();
    loadModes();
    highlight();
});
