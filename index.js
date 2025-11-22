document.addEventListener('DOMContentLoaded', () => {
    // 1. CHẶN LỖI EXTENSION
    window.addEventListener('error', e => {
        if (e.filename && (e.filename.includes('contentScript') || e.message.includes('extension'))) {
            e.stopImmediatePropagation(); e.preventDefault(); return false;
        }
    });

    // 2. KHAI BÁO BIẾN
    const els = {
        input: document.getElementById('keywords-input'),
        tags: document.getElementById('keywords-tags'),
        search: document.getElementById('search'),
        clear: document.getElementById('clear'),
        font: document.getElementById('fontFamily'),
        size: document.getElementById('fontSize'),
        matchCase: document.getElementById('matchCase'),
        wholeWords: document.getElementById('wholeWords'),
        text: document.getElementById('text-layer'),
        hl: document.getElementById('highlight-layer'),
        modeSel: document.getElementById('mode-select'),
        addMode: document.getElementById('add-mode'),
        delMode: document.getElementById('delete-mode-btn'),
        renameMode: document.getElementById('rename-mode'),
        caseMode: document.getElementById('match-case'),
        puncList: document.getElementById('punctuation-list'),
        addPair: document.getElementById('add-pair'),
        save: document.getElementById('save-settings'),
        replace: document.getElementById('replace-all'),
        notify: document.getElementById('notification-container')
    };

    let state = {
        keywords: [],
        replacedTargets: [],
        modes: {},
        activeMode: 'Mặc định'
    };

    const COLORS = ['hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red'];

    // 3. HÀM TIỆN ÍCH
    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = msg;
        els.notify.prepend(div);
        setTimeout(() => div.remove(), 3000);
    }
    const escRgx = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const VIET_LETTERS = 'a-zA-Z0-9àáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳỵỷỹýđÀÁÃẠẢĂẮẰẲẴẶÂẤẦẨẪẬÈÉẸẺẼÊỀẾỂỄỆÌÍĨỈỊÒÓÕỌỎÔỐỒỔỖỘƠỚỜỞỠỢÙÚŨỤỦƯỨỪỬỮỰỲỴỶỸÝĐ';
    
    function getRegex(kw, isWhole, isCase) {
        if (!kw) return null;
        const flags = isCase ? 'g' : 'gi';
        const pattern = isWhole 
            ? `(?<![${VIET_LETTERS}])(${escRgx(kw)})(?![${VIET_LETTERS}])`
            : `(${escRgx(kw)})`;
        try { return new RegExp(pattern, flags); } catch { return null; }
    }
    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // 4. CORE: RENDER HIGHLIGHT
    function renderHighlights() {
        const text = els.text.innerText;
        if (!text) {
            els.hl.innerHTML = '';
            return;
        }

        const map = new Array(text.length).fill(null);
        const currentMode = state.modes[state.activeMode];
        const isReplaceCase = currentMode ? currentMode.case : false;

        // Ưu tiên 1: Từ đã thay thế (Vàng)
        state.replacedTargets.forEach(target => {
            const regex = getRegex(target, false, isReplaceCase);
            if (!regex) return;
            let m;
            while ((m = regex.exec(text)) !== null) {
                for (let i = m.index; i < m.index + m[0].length; i++) map[i] = 'hl-yellow';
            }
        });

        // Ưu tiên 2: Từ khóa tìm kiếm
        state.keywords.forEach((kw, idx) => {
            const regex = getRegex(kw, els.wholeWords.checked, els.matchCase.checked);
            if (!regex) return;
            let m;
            while ((m = regex.exec(text)) !== null) {
                const cls = COLORS[idx % COLORS.length];
                for (let i = m.index; i < m.index + m[0].length; i++) {
                    if (!map[i]) map[i] = cls;
                }
            }
        });

        // Build HTML
        let html = '';
        let currentClass = null;
        let buffer = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const cls = map[i];
            if (cls !== currentClass) {
                if (buffer) html += currentClass ? `<mark class="${currentClass}">${escapeHtml(buffer)}</mark>` : escapeHtml(buffer);
                currentClass = cls;
                buffer = char;
            } else {
                buffer += char;
            }
        }
        if (buffer) html += currentClass ? `<mark class="${currentClass}">${escapeHtml(buffer)}</mark>` : escapeHtml(buffer);
        if (text.endsWith('\n')) html += '<br>';

        els.hl.innerHTML = html;
        
        // QUAN TRỌNG: Sau khi render xong, đồng bộ scroll rồi mới chuyển mode
        syncScroll();
        
        // CHUYỂN SANG CHẾ ĐỘ XEM: Text trong suốt, Highlight hiện lên
        els.text.style.color = 'transparent';
        els.hl.style.visibility = 'visible';
    }

    // 5. XỬ LÝ GÕ & SCROLL (FIX LAG/NHẢY)
    
    function enterEditMode() {
        // Khi gõ: Hiện chữ đen, ẩn highlight
        els.text.style.color = 'black';
        els.hl.style.visibility = 'hidden'; 
    }

    let inputTimer;
    els.text.addEventListener('input', () => {
        enterEditMode();
        // Xóa highlight cũ nếu văn bản thay đổi
        if (state.replacedTargets.length) state.replacedTargets = [];
        
        // Debounce 300ms: Dừng gõ mới render
        clearTimeout(inputTimer);
        inputTimer = setTimeout(renderHighlights, 300);
    });

    els.text.addEventListener('scroll', syncScroll, { passive: true });
    function syncScroll() {
        // Luôn ép highlight scroll theo text
        els.hl.scrollTop = els.text.scrollTop;
        els.hl.scrollLeft = els.text.scrollLeft;
    }

    // Paste giữ text
    els.text.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        enterEditMode();
        clearTimeout(inputTimer);
        inputTimer = setTimeout(renderHighlights, 100);
    });

    // Sync Font
    function updateFont() {
        const s = `font-family: ${els.font.value}; font-size: ${els.size.value};`;
        els.text.style = s;
        els.hl.style = s;
        // Cần timeout để browser render layout mới rồi mới sync
        setTimeout(renderHighlights, 50);
    }
    els.font.onchange = updateFont;
    els.size.onchange = updateFont;

    // 6. CÁC LOGIC KHÁC (Search, Replace...) - Giữ nguyên logic
    // ... (Keywords, Replace logic giữ nguyên như bản trước nhưng gọi renderHighlights)
    
    // [ĐOẠN LOGIC SEARCH/REPLACE CŨ - Copy từ bản trước vào đây để code gọn]
    // Keywords
    function addKw() {
        const raw = els.input.value;
        if (!raw.trim()) return;
        const newKws = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        newKws.forEach(k => { if (!state.keywords.includes(k)) { state.keywords.push(k); renderTag(k); }});
        els.input.value = ''; renderHighlights();
    }
    function renderTag(txt) {
        const tag = document.createElement('div'); tag.className = 'tag';
        tag.innerHTML = `<span>${escapeHtml(txt)}</span><span class="remove-tag">×</span>`;
        tag.querySelector('.remove-tag').onclick = () => { state.keywords = state.keywords.filter(k=>k!==txt); tag.remove(); renderHighlights(); };
        els.tags.appendChild(tag);
    }
    els.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKw(); } });
    els.input.addEventListener('blur', addKw);
    els.search.onclick = () => {
        if (!state.keywords.length) return notify('Chưa có từ khóa!', 'error');
        renderHighlights();
        const text = els.text.innerText; let count = 0;
        state.keywords.forEach(kw => {
            const rgx = getRegex(kw, els.wholeWords.checked, els.matchCase.checked);
            if (rgx && text.match(rgx)) count += text.match(rgx).length;
        });
        notify(`Tìm thấy ${count} kết quả!`);
    };
    els.clear.onclick = () => { state.keywords=[]; state.replacedTargets=[]; els.tags.innerHTML=''; renderHighlights(); notify('Đã xóa hết'); };
    els.matchCase.onchange = renderHighlights;
    els.wholeWords.onchange = renderHighlights;

    // Replace Settings
    function loadData() {
        try { const d = JSON.parse(localStorage.getItem('replace_data')); if(d) { state.modes=d.modes; state.activeMode=d.active||'Mặc định'; } else throw 1; }
        catch { state.modes={'Mặc định':{pairs:[],case:false}}; state.activeMode='Mặc định'; }
        updateModeUI();
    }
    function saveData() {
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(div => {
            pairs.push({ find: div.querySelector('.find').value, replace: div.querySelector('.replace').value });
        });
        state.modes[state.activeMode].pairs = pairs;
        localStorage.setItem('replace_data', JSON.stringify({modes:state.modes, active:state.activeMode}));
    }
    function updateModeUI() {
        els.modeSel.innerHTML = ''; Object.keys(state.modes).forEach(k => els.modeSel.add(new Option(k,k,false,k===state.activeMode)));
        const mode = state.modes[state.activeMode];
        els.caseMode.textContent = mode.case ? 'Case: BẬT' : 'Case: TẮT';
        els.caseMode.className = mode.case ? 'w-full py-1 mt-1 bg-green-200 text-xs font-bold rounded' : 'w-full py-1 mt-1 bg-gray-200 text-xs font-bold rounded';
        els.delMode.classList.toggle('hidden', state.activeMode==='Mặc định');
        els.renameMode.classList.toggle('hidden', state.activeMode==='Mặc định');
        els.puncList.innerHTML=''; mode.pairs.forEach(p => addPairUI(p.find, p.replace));
    }
    function addPairUI(f='',r='') {
        const d = document.createElement('div'); d.className='punctuation-item';
        d.innerHTML=`<input class="find" value="${escapeHtml(f)}" placeholder="Tìm"><span class="text-gray-400">→</span><input class="replace" value="${escapeHtml(r)}" placeholder="Thay"><button class="remove-pair">×</button>`;
        d.querySelector('.remove-pair').onclick=()=>d.remove(); els.puncList.prepend(d);
    }
    els.addPair.onclick = () => { addPairUI(); els.puncList.querySelector('input').focus(); };
    els.save.onclick = () => { saveData(); notify(`Đã lưu ${state.activeMode}`); };
    els.modeSel.onchange = () => { saveData(); state.activeMode = els.modeSel.value; updateModeUI(); };
    els.addMode.onclick = () => { const n = prompt('Tên:'); if(n && !state.modes[n]) { saveData(); state.modes[n]={pairs:[],case:false}; state.activeMode=n; updateModeUI(); }};
    els.delMode.onclick = () => { if(confirm('Xóa?')) { delete state.modes[state.activeMode]; state.activeMode='Mặc định'; updateModeUI(); saveData(); }};
    els.renameMode.onclick = () => { const n = prompt('Tên mới:', state.activeMode); if(n && !state.modes[n]) { state.modes[n]=state.modes[state.activeMode]; delete state.modes[state.activeMode]; state.activeMode=n; updateModeUI(); saveData(); }};
    els.caseMode.onclick = () => { state.modes[state.activeMode].case = !state.modes[state.activeMode].case; updateModeUI(); };

    els.replace.onclick = () => {
        saveData();
        const mode = state.modes[state.activeMode];
        if(!mode.pairs.length) return notify('Chưa có từ khóa', 'error');
        const orig = els.text.innerText;
        if(!orig) return notify('Trống', 'error');
        
        let txt = orig; let count = 0;
        const pairs = [...mode.pairs].sort((a,b)=>b.find.length - a.find.length);
        pairs.forEach(p => {
            const rgx = getRegex(p.find, true, mode.case); // Force Whole Word
            if(rgx && txt.match(rgx)) { count += txt.match(rgx).length; txt = txt.replace(rgx, p.replace); }
        });
        
        if(!count) return notify('Không tìm thấy từ nào', 'error');
        els.text.innerText = txt;
        state.replacedTargets = pairs.map(p => p.replace).filter(x=>x);
        renderHighlights(); notify(`Thay thế ${count} từ!`);
    };

    // INIT
    loadData(); updateFont();
});
