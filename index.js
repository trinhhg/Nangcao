document.addEventListener('DOMContentLoaded', () => {
    // DOM
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

    // STATE
    let keywords = [];
    let replacedRanges = []; // [{start, end}]
    const KEYWORD_COLORS = ['hl-1','hl-2','hl-3','hl-4','hl-5','hl-6'];
    const MODES_KEY = 'replace_modes_v3';
    const ACTIVE_KEY = 'active_mode_v3';
    let modes = { 'Mặc định': { pairs: [], options: { matchCase: false } } };
    let activeMode = 'Mặc định';

    // NOTIFY
    const notify = (msg, type = 'success') => {
        const n = document.createElement('div');
        n.className = `notification ${type}`;
        n.textContent = msg;
        document.getElementById('notification-container').prepend(n);
        setTimeout(() => n.remove(), 3000);
    };

    // === PASTE CHUẨN GOOGLE DOCS ===
    const insertPlainTextAtCursor = (text) => {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();

        const lines = text.split(/\r\n|\r|\n/);
        lines.forEach((line, i) => {
            if (i > 0) range.insertNode(document.createElement('br'));
            if (line) range.insertNode(document.createTextNode(line));
        });
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    };

    editor.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        insertPlainTextAtCursor(text);
    });

    // === HIGHLIGHT ENGINE CHUẨN NOTION ===
    const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const buildRegex = (word, whole, mc) => {
        if (!word) return null;
        const esc = escapeRegExp(word);
        const pattern = whole ? `\\b${esc}\\b` : esc;
        return new RegExp(pattern, mc ? 'g' : 'gi');
    };

    const highlight = () => {
        const text = editor.textContent || '';
        const items = [
            ...keywords.map((k, i) => ({ text: k, cls: KEYWORD_COLORS[i % 6], prio: 100 })),
            ...replacedRanges.map(r => ({ text: text.slice(r.start, r.end), cls: 'hl-yellow', prio: 999 }))
        ];

        const matchCase = matchCaseCb.checked;
        const whole = wholeWordsCb.checked;

        const matches = [];
        items.forEach(item => {
            if (item.prio === 999) {
                matches.push({ start: item.start || 0, end: item.end || 0, cls: item.cls, prio: item.prio });
                return;
            }
            const re = buildRegex(item.text, whole, matchCase);
            if (!re) return;
            let m;
            while ((m = re.exec(text)) !== null) {
                matches.push({ start: m.index, end: re.lastIndex, cls: item.cls, prio: item.prio });
            }
        });

        matches.sort((a, b) => a.start - b.start || b.prio - a.prio || b.end - a.end);
        const final = [];
        let last = 0;
        for (const m of matches) {
            if (m.start >= last) {
                final.push(m);
                last = m.end;
            }
        }

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

        editor.innerHTML = '';
        editor.appendChild(frag);
    };

    // === REPLACE VỚI LOG VỊ TRÍ ===
    const replaceAll = () => {
        let text = editor.textContent || '';
        const mode = modes[activeMode];
        if (!mode || !mode.pairs.length) return notify('Chưa có cặp thay thế!', 'error');

        const pairs = mode.pairs.filter(p => p.find);
        const opts = mode.options || {};
        replacedRanges = [];

        pairs.forEach(p => {
            const re = buildRegex(p.find, false, opts.matchCase);
            if (!re) return;
            let offset = 0;
            text = text.replace(re, (match, i) => {
                const start = i + offset;
                const end = start + p.replace.length;
                replacedRanges.push({ start, end });
                offset += p.replace.length - match.length;
                return p.replace;
            });
        });

        editor.textContent = text;
        if (replacedRanges.length) {
            notify(`Đã thay thế ${replacedRanges.length} vị trí!`, 'success');
        } else {
            replacedRanges = [];
            notify('Không tìm thấy gì để thay.', 'error');
        }
        highlight();
    };

    // === KEYWORDS ===
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

    // === EVENTS ===
    searchBtn.onclick = () => { replacedRanges = []; highlight(); };
    clearBtn.onclick = () => {
        keywords = []; replacedRanges = [];
        keywordsTags.innerHTML = '';
        highlight();
    };
    replaceAllBtn.onclick = replaceAll;

    let timer;
    editor.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(highlight, 200);
    });

    // Font
    const syncFont = () => {
        editor.style.fontFamily = fontFamily.value;
        editor.style.fontSize = fontSize.value;
    };
    fontFamily.onchange = fontSize.onchange = syncFont;
    matchCaseCb.onchange = wholeWordsCb.onchange = highlight;

    // === MODES ===
    const loadModes = () => {
        try {
            const data = localStorage.getItem(MODES_KEY);
            if (data) modes = JSON.parse(data);
            activeMode = localStorage.getItem(ACTIVE_KEY) || 'Mặc định';
            if (!modes[activeMode]) activeMode = 'Mặc định';
        } catch(e) {}
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
        Object.keys(modes).forEach(n => modeSelect.add(new Option(n, n, false, n === activeMode)));

        const isDefault = activeMode === 'Mặc định';
        deleteModeBtn.classList.toggle('hidden', isDefault);
        renameModeBtn.classList.toggle('hidden', isDefault);

        toggleCaseBtn.textContent = modes[activeMode].options?.matchCase ? 'Case: BẬT' : 'Case: TẮT';
        toggleCaseBtn.className = modes[activeMode].options?.matchCase
            ? 'w-full mb-4 py-2 bg-green-600 text-white rounded text-xs'
            : 'w-full mb-4 py-2 bg-gray-600 text-white rounded text-xs';

        punctuationList.innerHTML = '';
        (modes[activeMode].pairs || []).forEach(p => addPairRow(p.find, p.replace));
    };

    const addPairRow = (find = '', rep = '') => {
        const div = document.createElement('div');
        div.className = 'flex gap-2 items-center';
        div.innerHTML = `
            <input type="text" class="find flex-1 p-2 border rounded text-xs" placeholder="Tìm" value="${find}">
            <span class="text-gray-500">→</span>
            <input type="text" class="replace flex-1 p-2 border rounded text-xs" placeholder="Thay bằng" value="${rep}">
            <button class="w-8 h-8 bg-red-500 text-white rounded hover:bg-red-600 text-xl">×</button>
        `;
        div.querySelector('button').onclick = () => div.remove();
        punctuationList.prepend(div);
    };

    const saveCurrentMode = () => {
        const rows = punctuationList.querySelectorAll('div');
        modes[activeMode].pairs = Array.from(rows).map(r => ({
            find: r.querySelector('.find').value.trim(),
            replace: r.querySelector('.replace').value
        }));
        saveModes();
        notify(`Đã lưu "${activeMode}"`);
    };

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

    // INIT
    syncFont();
    loadModes();
    highlight();
});
