document.addEventListener('DOMContentLoaded', () => {
    // === 1. BLOCK EXTENSION ERRORS ===
    window.addEventListener('error', e => {
        if (e.filename && (e.filename.includes('contentScript') || e.message.includes('extension'))) {
            e.stopImmediatePropagation(); e.preventDefault(); return false;
        }
    });

    // === 2. DOM ELEMENTS ===
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

    // === 3. CORE UTILS ===
    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.innerHTML = type === 'success' ? `✓ ${msg}` : `⚠️ ${msg}`;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }

    const escRgx = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // REGEX TIẾNG VIỆT CHUẨN (Dùng cho cả highlight và thay thế)
    // Bao gồm các ký tự tiếng Việt có dấu
    const VIET_LETTERS = 'a-zA-Z0-9àáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳỵỷỹýđÀÁÃẠẢĂẮẰẲẴẶÂẤẦẨẪẬÈÉẸẺẼÊỀẾỂỄỆÌÍĨỈỊÒÓÕỌỎÔỐỒỔỖỘƠỚỜỞỠỢÙÚŨỤỦƯỨỪỬỮỰỲỴỶỸÝĐ';
    
    function getRegex(kw, isWhole, isCase) {
        if (!kw) return null;
        const flags = isCase ? 'g' : 'gi';
        // Logic: Nếu là Whole Word, dùng Lookbehind (?<!) và Lookahead (?!) để đảm bảo
        // ký tự trước và sau nó KHÔNG PHẢI là chữ cái tiếng Việt hoặc số.
        const pattern = isWhole 
            ? `(?<![${VIET_LETTERS}])(${escRgx(kw)})(?![${VIET_LETTERS}])`
            : `(${escRgx(kw)})`;
        try { return new RegExp(pattern, flags); } catch { return null; }
    }

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // === 4. RENDER HIGHLIGHTS ===
    function renderHighlights() {
        const text = els.text.innerText;
        els.hl.innerHTML = '';
        if (!text) return;

        const map = new Array(text.length).fill(null);
        const currentMode = state.modes[state.activeMode];
        const isReplaceCase = currentMode ? currentMode.case : false;

        // 1. Highlight Replaced (Vàng) - QUAN TRỌNG: 
        // Khi highlight kết quả, ta cũng dùng chế độ Whole Word (true) nếu cần chính xác,
        // hoặc false nếu muốn highlight mọi chỗ. Theo logic editor, thường highlight kết quả là highlight chính xác từ đó.
        state.replacedTargets.forEach(targetWord => {
            // Highlight kết quả sau khi replace thì không cần whole word quá khắt khe, 
            // nhưng để đẹp thì ta cứ tìm chính xác chuỗi đó.
            const regex = getRegex(targetWord, false, isReplaceCase); 
            if (!regex) return;
            let m;
            while ((m = regex.exec(text)) !== null) {
                const start = m.index;
                const end = start + m[0].length;
                for (let i = start; i < end; i++) map[i] = 'hl-yellow';
            }
        });

        // 2. Highlight Search
        state.keywords.forEach((kw, idx) => {
            const regex = getRegex(kw, els.wholeWords.checked, els.matchCase.checked);
            if (!regex) return;
            let m;
            while ((m = regex.exec(text)) !== null) {
                const start = m.index;
                const end = start + m[0].length;
                const cls = COLORS[idx % COLORS.length];
                for (let i = start; i < end; i++) {
                    if (!map[i]) map[i] = cls; 
                }
            }
        });

        // 3. Build HTML
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
        syncScroll();
        
        // KẾT THÚC RENDER: Hiện highlight, ẩn text gốc (chế độ xem)
        els.hl.style.visibility = 'visible';
        els.text.style.color = 'transparent';
    }

    // === 5. EVENT HANDLERS (ZERO LATENCY) ===
    
    // Paste
    els.text.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        // Khi paste: Chuyển ngay về chế độ Text đen để chỉnh sửa nếu cần
        switchToEditingMode();
        // Sau đó mới render
        triggerRenderDebounce();
    });

    // --- LOGIC CHUYỂN ĐỔI CHẾ ĐỘ ---
    let inputTimer;

    function switchToEditingMode() {
        // Chế độ gõ: Chữ đen, ẩn highlight đi để không bị bóng ma/delay
        els.text.style.color = 'black';
        els.hl.style.visibility = 'hidden'; 
    }

    function triggerRenderDebounce() {
        clearTimeout(inputTimer);
        // Chờ 300ms sau khi ngừng gõ mới tính toán highlight (Tối ưu hiệu năng)
        inputTimer = setTimeout(renderHighlights, 300);
    }

    els.text.addEventListener('input', () => {
        // 1. Ngay lập tức khi nhấn phím: Chuyển sang Text đen
        switchToEditingMode();
        
        // 2. Reset highlight vàng nếu nội dung thay đổi (để tránh lệch)
        if (state.replacedTargets.length > 0) state.replacedTargets = []; 

        // 3. Đặt lịch render lại sau khi nghỉ tay
        triggerRenderDebounce();
    });

    function syncScroll() {
        els.hl.scrollTop = els.text.scrollTop;
        els.hl.scrollLeft = els.text.scrollLeft;
    }
    els.text.addEventListener('scroll', syncScroll, { passive: true });
    
    // Sync Font
    function updateFont() {
        const style = `font-family: ${els.font.value}; font-size: ${els.size.value};`;
        els.text.style = style;
        els.hl.style = style;
        // Font đổi thì phải render lại vị trí
        renderHighlights();
    }
    els.font.addEventListener('change', updateFont);
    els.size.addEventListener('change', updateFont);

    // Keywords Logic
    function addKw() {
        const raw = els.input.value;
        if (!raw.trim()) return;
        const newKws = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        let changed = false;
        newKws.forEach(k => {
            if (!state.keywords.includes(k)) {
                state.keywords.push(k);
                renderTag(k);
                changed = true;
            }
        });
        els.input.value = '';
        if (changed) renderHighlights();
    }
    function renderTag(txt) {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `<span>${escapeHtml(txt)}</span><span class="remove-tag">×</span>`;
        tag.querySelector('.remove-tag').onclick = () => {
            state.keywords = state.keywords.filter(k => k !== txt);
            tag.remove();
            renderHighlights();
        };
        els.tags.appendChild(tag);
    }
    els.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKw(); } });
    els.input.addEventListener('blur', addKw);

    els.search.onclick = () => {
        if (!state.keywords.length) return notify('Chưa nhập từ khóa!', 'error');
        renderHighlights(); 
        const text = els.text.innerText;
        let count = 0;
        state.keywords.forEach(kw => {
            const regex = getRegex(kw, els.wholeWords.checked, els.matchCase.checked);
            if (regex && text.match(regex)) count += text.match(regex).length;
        });
        notify(count > 0 ? `Tìm thấy ${count} kết quả!` : 'Không tìm thấy kết quả nào.', count > 0 ? 'success' : 'error');
    };

    els.clear.onclick = () => {
        state.keywords = [];
        state.replacedTargets = [];
        els.tags.innerHTML = '';
        renderHighlights();
        notify('Đã xóa tất cả dữ liệu.');
    };
    els.matchCase.onchange = renderHighlights;
    els.wholeWords.onchange = renderHighlights;

    // --- REPLACE SETTINGS ---
    function loadData() {
        try {
            const raw = localStorage.getItem('replace_data');
            const data = JSON.parse(raw);
            if (data && data.modes) {
                state.modes = data.modes;
                state.activeMode = data.active || 'Mặc định';
            } else throw 1;
        } catch {
            state.modes = { 'Mặc định': { pairs: [], case: false } };
            state.activeMode = 'Mặc định';
        }
        updateModeUI();
    }
    function saveData() {
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(div => {
            const find = div.querySelector('.find').value;
            const rep = div.querySelector('.replace').value;
            if (find) pairs.push({ find, replace: rep });
        });
        state.modes[state.activeMode].pairs = pairs;
        localStorage.setItem('replace_data', JSON.stringify({ modes: state.modes, active: state.activeMode }));
    }

    function updateModeUI() {
        els.modeSel.innerHTML = '';
        Object.keys(state.modes).forEach(k => {
            els.modeSel.add(new Option(k, k, false, k === state.activeMode));
        });
        const isDef = state.activeMode === 'Mặc định';
        els.delMode.classList.toggle('hidden', isDef);
        els.renameMode.classList.toggle('hidden', isDef);
        const mode = state.modes[state.activeMode];
        els.caseMode.textContent = mode.case ? 'Case Sensitive: BẬT' : 'Case Sensitive: TẮT';
        els.caseMode.className = mode.case ? 'w-full py-1.5 mt-1 rounded text-xs font-bold bg-green-200 text-green-800' : 'w-full py-1.5 mt-1 rounded text-xs font-bold bg-gray-200 text-gray-600';
        els.puncList.innerHTML = '';
        mode.pairs.forEach(p => addPairUI(p.find, p.replace));
    }

    function addPairUI(f = '', r = '') {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${escapeHtml(f)}"><span class="text-gray-400">→</span><input type="text" class="replace" placeholder="Thay" value="${escapeHtml(r)}"><button class="remove-pair" tabindex="-1">×</button>`;
        div.querySelector('.remove-pair').onclick = () => div.remove();
        els.puncList.prepend(div);
    }

    els.addPair.onclick = () => { addPairUI(); els.puncList.querySelector('input').focus(); };
    els.save.onclick = () => { saveData(); notify(`Đã lưu "${state.activeMode}"`); };
    els.modeSel.onchange = () => { saveData(); state.activeMode = els.modeSel.value; updateModeUI(); };
    els.addMode.onclick = () => {
        const name = prompt('Tên chế độ mới:');
        if (!name || state.modes[name]) return;
        saveData(); state.modes[name] = { pairs: [], case: false }; state.activeMode = name; updateModeUI();
    };
    els.delMode.onclick = () => { if (confirm('Xóa?')) { delete state.modes[state.activeMode]; state.activeMode = 'Mặc định'; updateModeUI(); saveData(); } };
    els.renameMode.onclick = () => {
        const newName = prompt('Tên mới:', state.activeMode);
        if (newName && !state.modes[newName]) {
            state.modes[newName] = state.modes[state.activeMode]; delete state.modes[state.activeMode];
            state.activeMode = newName; updateModeUI(); saveData();
        }
    };
    els.caseMode.onclick = () => { state.modes[state.activeMode].case = !state.modes[state.activeMode].case; updateModeUI(); };

    // --- LOGIC REPLACE (CẬP NHẬT: LUÔN LÀ TỪ HOÀN CHỈNH) ---
    els.replace.onclick = () => {
        saveData(); 
        const mode = state.modes[state.activeMode];
        if (!mode.pairs.length) return notify('Chưa có từ khóa để thay thế!', 'error');
        
        const originalText = els.text.innerText;
        if (!originalText) return notify('Văn bản trống!', 'error');

        const pairs = [...mode.pairs].sort((a, b) => b.find.length - a.find.length);
        
        let newText = originalText;
        let count = 0;

        pairs.forEach(p => {
            // FIX: Tham số thứ 2 là 'true' -> BẮT BUỘC LÀ TỪ HOÀN CHỈNH
            // Nghĩa là: tìm "ông" sẽ không match "công"
            const regex = getRegex(p.find, true, mode.case);
            if (regex) {
                const matches = newText.match(regex);
                if (matches) {
                    count += matches.length;
                    newText = newText.replace(regex, p.replace);
                }
            }
        });

        if (count === 0) return notify('Không tìm thấy từ (hoàn chỉnh) nào để thay thế.', 'error');

        els.text.innerText = newText;
        state.replacedTargets = pairs.map(p => p.replace).filter(str => str && str.length > 0);
        
        // Render lại sau khi thay thế
        renderHighlights();
        
        notify(`Đã thay thế ${count} từ hoàn chỉnh!`);
    };

    // Init
    loadData();
    updateFont();
});
