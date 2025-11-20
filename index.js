document.addEventListener('DOMContentLoaded', () => {
    const textLayer = document.getElementById('text-layer');
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
    const modeSelect = document.getElementById('mode-select');
    const addModeBtn = document.getElementById('add-mode');
    const matchCaseReplaceBtn = document.getElementById('match-case');
    const deleteModeBtn = document.getElementById('delete-mode-btn');
    const renameModeBtn = document.getElementById('rename-mode');
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');

    let currentKeywords = [];
    let replacedRanges = []; // [{start, end}] — để highlight vàng chính xác
    const COLORS = ['hl-pink','hl-blue','hl-green','hl-orange','hl-purple','hl-yellow'];

    const MODES_KEY = 'replaceModes_v4';
    const ACTIVE_KEY = 'activeMode_v4';
    let modes = { 'Mặc định': { pairs: [], options: { matchCase: false } } };
    let activeMode = 'Mặc định';

    const notify = (msg, type = 'success') => {
        const n = document.createElement('div');
        n.className = `notification ${type}`;
        n.textContent = msg;
        document.getElementById('notification-container').prepend(n);
        setTimeout(() => n.remove(), 3000);
    };

    const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const buildRegex = (word, whole, mc) => {
        if (!word) return null;
        const esc = escapeRegex(word);
        const pattern = whole ? `\\b${esc}\\b` : esc;
        return new RegExp(pattern, mc ? 'g' : 'gi');
    };

    // === HIGHLIGHT CHUẨN 100% ===
    const highlight = () => {
        const text = textLayer.textContent || '';
        const items = [
            ...currentKeywords.map((k, i) => ({ text: k, cls: COLORS[i % 5], prio: 100 })),
            ...replacedRanges.map(r => ({ start: r.start, end: r.end, cls: 'hl-yellow', prio: 999 }))
        ];

        const matches = [];
        const mc = matchCaseCb.checked;
        const ww = wholeWordsCb.checked;

        items.forEach(item => {
            if (item.start !== undefined) {
                matches.push({ start: item.start, end: item.end, cls: item.cls, prio: item.prio });
            } else {
                const re = buildRegex(item.text, ww, mc);
                if (!re) return;
                let m;
                while ((m = re.exec(text)) !== null) {
                    matches.push({ start: m.index, end: re.lastIndex, cls: item.cls, prio: item.prio });
                }
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
            span.className = m.cls;
            span.setAttribute('data-hl', '1');
            span.textContent = text.slice(m.start, m.end);
            frag.appendChild(span);
            pos = m.end;
        }
        if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));

        textLayer.innerHTML = '';
        textLayer.appendChild(frag);
    };

    // === REPLACE + LOG VỊ TRÍ (để highlight vàng) ===
    const replaceAll = () => {
        let text = textLayer.textContent || '';
        const mode = modes[activeMode];
        if (!mode || !mode.pairs?.length) return notify('Chưa có cặp thay thế!', 'error');

        replacedRanges = [];
        let offset = 0;

        mode.pairs.forEach(p => {
            if (!p.find) return;
            const re = buildRegex(p.find, false, mode.options?.matchCase);
            if (!re) return;

            text = text.replace(re, (match, i) => {
                const start = i + offset;
                const end = start + p.replace.length;
                replacedRanges.push({ start, end });
                offset += p.replace.length - match.length;
                return p.replace;
            });
        });

        textLayer.textContent = text;
        if (replacedRanges.length) {
            notify(`Đã thay thế ${replacedRanges.length} chỗ!`, 'success');
        } else {
            replacedRanges = [];
            notify('Không tìm thấy gì để thay.', 'error');
        }
        highlight();
    };

    // === KEYWORDS ===
    const addKeyword = () => {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        vals.forEach(v => {
            if (v && !currentKeywords.includes(v)) {
                currentKeywords.push(v);
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.innerHTML = `${v} <span class="remove-tag">×</span>`;
                tag.querySelector('.remove-tag').onclick = () => {
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x => x !== v);
                    highlight();
                };
                keywordsTags.appendChild(tag); // append, không prepend → không đảo ngược
            }
        });
        keywordsInput.value = '';
        highlight();
    };

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addKeyword();
        }
    });
    keywordsInput.addEventListener('blur', addKeyword);

    // === PASTE GIỮ NGUYÊN XUỐNG DÒNG ===
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        const lines = text.split(/\r\n|\r|\n/);
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();

        lines.forEach((line, i) => {
            if (i > 0) range.insertNode(document.createElement('br'));
            if (line) range.insertNode(document.createTextNode(line));
        });
        range.collapse(false);
    });

    // === FONT + EVENTS ===
    const syncFont = () => {
        textLayer.style.fontFamily = fontFamily.value;
        textLayer.style.fontSize = fontSize.value;
    };
    fontFamily.onchange = fontSize.onchange = syncFont;
    matchCaseCb.onchange = wholeWordsCb.onchange = highlight;

    let timer;
    textLayer.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(highlight, 200);
    });

    searchBtn.onclick = () => { replacedRanges = []; highlight(); };
    clearBtn.onclick = () => {
        currentKeywords = []; replacedRanges = [];
        keywordsTags.innerHTML = '';
        highlight();
    };
    replaceAllBtn.onclick = replaceAll;

    // === MODES ===
    const loadModes = () => {
        try {
            const data = localStorage.getItem(MODES_KEY);
            if (data) modes = JSON.parse(data);
            activeMode = localStorage.getItem(ACTIVE_KEY) || 'Mặc định';
        } catch(e) {}
        if (!modes['Mặc định']) modes['Mặc định'] = { pairs: [], options: { matchCase: false } };
        saveModes();
        updateUI();
    };
    const saveModes = () => {
        localStorage.setItem(MODES_KEY, JSON.stringify(modes));
        localStorage.setItem(ACTIVE_KEY, activeMode);
    };
    const updateUI = () => {
        modeSelect.innerHTML = '';
        Object.keys(modes).forEach(n => modeSelect.add(new Option(n, n, false, n === activeMode)));

        const isDef = activeMode === 'Mặc định';
        deleteModeBtn.classList.toggle('hidden', isDef);
        renameModeBtn.classList.toggle('hidden', isDef);

        const opt = modes[activeMode].options || { matchCase: false };
        matchCaseReplaceBtn.textContent = opt.matchCase ? 'Case: BẬT' : 'Case: TẮT';
        matchCaseReplaceBtn.classList.toggle('bg-green-600', opt.matchCase);
        matchCaseReplaceBtn.classList.toggle('bg-gray-500', !opt.matchCase);

        punctuationList.innerHTML = '';
        (modes[activeMode].pairs || []).forEach(p => {
            const div = document.createElement('div');
            div.className = 'punctuation-item';
            div.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${p.find || ''}">
                            <input type="text" class="replace" placeholder="Thay bằng" value="${p.replace || ''}">
                            <button class="remove-pair">×</button>`;
            div.querySelector('.remove-pair').onclick = () => div.remove();
            punctuationList.appendChild(div); // append, không prepend
        });
    };

    modeSelect.onchange = () => { activeMode = modeSelect.value; saveModes(); updateUI(); };
    addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ mới:')?.trim();
        if (!name || modes[name]) return notify('Tên đã tồn tại!', 'error');
        modes[name] = { pairs: [], options: { matchCase: false } };
        activeMode = name;
        saveModes();
        updateUI();
    };
    deleteModeBtn.onclick = () => {
        if (activeMode === 'Mặc định' || !confirm('Xóa?')) return;
        delete modes[activeMode];
        activeMode = 'Mặc định';
        saveModes();
        updateUI();
    };
    renameModeBtn.onclick = () => {
        const newName = prompt('Tên mới:', activeMode)?.trim();
        if (!newName || newName === activeMode || modes[newName]) return;
        modes[newName] = modes[activeMode];
        delete modes[activeMode];
        activeMode = newName;
        saveModes();
        updateUI();
    };
    matchCaseReplaceBtn.onclick = () => {
        modes[activeMode].options.matchCase = !modes[activeMode].options.matchCase;
        saveModes();
        updateUI();
    };
    addPairBtn.onclick = () => {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = '<input type="text" class="find" placeholder="Tìm"><input type="text" class="replace" placeholder="Thay bằng"><button class="remove-pair">×</button>';
        div.querySelector('.remove-pair').onclick = () => div.remove();
        punctuationList.appendChild(div);
        div.querySelector('.find').focus();
    };
    saveSettingsBtn.onclick = () => {
        modes[activeMode].pairs = Array.from(punctuationList.children).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        }));
        saveModes();
        notify(`Đã lưu "${activeMode}"`);
    };

    // INIT
    syncFont();
    loadModes();
    highlight();
});
