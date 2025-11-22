document.addEventListener('DOMContentLoaded', () => {
    // === 1. BLOCK EXTENSION ERRORS (Giữ cho console sạch) ===
    window.addEventListener('error', e => {
        if (e.filename && (e.filename.includes('contentScript') || e.message.includes('extension') || e.message.includes('unexpected'))) {
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
        replacedIndices: [], // Lưu các vị trí vừa thay thế để highlight vàng
        modes: {},
        activeMode: 'Mặc định'
    };

    const COLORS = ['hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red'];

    // === 3. CORE FUNCTIONS ===

    // Hiển thị thông báo
    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.innerHTML = type === 'success' ? `✓ ${msg}` : `⚠️ ${msg}`;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }

    // Escape Regex
    const escRgx = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // VIETNAMESE WHOLE WORD REGEX (Cực chuẩn)
    // Logic: Ký tự trước và sau từ khóa KHÔNG được là chữ cái tiếng Việt hoặc số
    const VIET_LETTERS = 'a-zA-Z0-9àáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳỵỷỹýđÀÁÃẠẢĂẮẰẲẴẶÂẤẦẨẪẬÈÉẸẺẼÊỀẾỂỄỆÌÍĨỈỊÒÓÕỌỎÔỐỒỔỖỘƠỚỜỞỠỢÙÚŨỤỦƯỨỪỬỮỰỲỴỶỸÝĐ';
    function getRegex(kw, isWhole, isCase) {
        if (!kw) return null;
        const flags = isCase ? 'g' : 'gi';
        const pattern = isWhole 
            ? `(?<![${VIET_LETTERS}])(${escRgx(kw)})(?![${VIET_LETTERS}])` // Lookbehind & Lookahead
            : `(${escRgx(kw)})`;
        try { return new RegExp(pattern, flags); } catch { return null; }
    }

    // --- MAIN HIGHLIGHT LOGIC ---
    function renderHighlights() {
        const text = els.text.innerText; // Lấy text thuần (đã bao gồm xuống dòng chuẩn)
        
        // Reset Highlight Layer
        els.hl.innerHTML = '';
        if (!text) return;

        // Tạo mảng map: mỗi ký tự trong text ứng với 1 class highlight (hoặc null)
        const map = new Array(text.length).fill(null);

        // 1. Ưu tiên cao nhất: Những từ vừa được thay thế (Màu Vàng)
        state.replacedIndices.forEach(({start, end}) => {
            if (start < 0 || end > text.length) return;
            for (let i = start; i < end; i++) map[i] = 'hl-yellow';
        });

        // 2. Highlight từ khóa tìm kiếm
        state.keywords.forEach((kw, idx) => {
            const regex = getRegex(kw, els.wholeWords.checked, els.matchCase.checked);
            if (!regex) return;
            
            let match;
            while ((match = regex.exec(text)) !== null) {
                const start = match.index;
                const end = start + match[0].length; // Dùng match[0].length để chính xác
                const cls = COLORS[idx % COLORS.length];

                // Chỉ tô màu nếu vị trí đó chưa bị tô bởi "Thay thế" (ưu tiên vàng)
                for (let i = start; i < end; i++) {
                    if (!map[i]) map[i] = cls; 
                }
            }
        });

        // 3. Render HTML từ map (Ghép các ký tự liền kề cùng màu)
        let html = '';
        let currentClass = null;
        let buffer = '';

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const cls = map[i];

            if (cls !== currentClass) {
                // Đóng thẻ cũ
                if (buffer) {
                    html += currentClass ? `<mark class="${currentClass}">${escapeHtml(buffer)}</mark>` : escapeHtml(buffer);
                }
                currentClass = cls;
                buffer = char;
            } else {
                buffer += char;
            }
        }
        // Đóng thẻ cuối cùng
        if (buffer) {
            html += currentClass ? `<mark class="${currentClass}">${escapeHtml(buffer)}</mark>` : escapeHtml(buffer);
        }

        // Fix lỗi hiển thị xuống dòng: Thay \n bằng <br> trong highlight layer
        // Vì highlight layer là div thường, nó cần <br> để xuống dòng giống contenteditable
        // Tuy nhiên, vì ta dùng white-space: pre-wrap cho cả 2, nên \n vẫn hiển thị tốt.
        // Chỉ cần đảm bảo ký tự cuối cùng nếu là \n thì thêm 1 khoảng trắng ảo để layout không bị sập.
        if (text.endsWith('\n')) html += '<br>';

        els.hl.innerHTML = html;
        syncScroll(); // Đồng bộ lại vị trí ngay
    }

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // === 4. EVENT HANDLERS ===

    // Xử lý PASTE chuẩn (Fix lỗi dồn cục)
    els.text.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        // Insert text thuần tại vị trí con trỏ (Browser sẽ tự lo việc giữ dòng)
        document.execCommand('insertText', false, text);
        // Sau khi paste, highlight có thể bị lệch do DOM update, cần render lại
        setTimeout(renderHighlights, 10); 
    });

    // Input & Scroll Sync
    let inputTimer;
    els.text.addEventListener('input', () => {
        clearTimeout(inputTimer);
        // Khi user gõ, các vị trí thay thế cũ không còn đúng nữa => Xóa highlight vàng
        if (state.replacedIndices.length > 0) state.replacedIndices = [];
        inputTimer = setTimeout(renderHighlights, 150); // Debounce
    });

    function syncScroll() {
        els.hl.scrollTop = els.text.scrollTop;
        els.hl.scrollLeft = els.text.scrollLeft;
    }
    els.text.addEventListener('scroll', syncScroll, { passive: true });
    
    // Sync font
    function updateFont() {
        const style = `font-family: ${els.font.value}; font-size: ${els.size.value};`;
        els.text.style = style;
        els.hl.style = style; // Highlight layer phải style y hệt
        // Reset color transparent cho text layer vì set style overwrite
        els.text.style.color = 'transparent';
        els.text.style.backgroundColor = 'transparent';
        els.text.style.caretColor = 'black'; // Đảm bảo thấy con trỏ
        setTimeout(renderHighlights, 50);
    }
    els.font.addEventListener('change', updateFont);
    els.size.addEventListener('change', updateFont);

    // Keywords logic
    function addKw() {
        const raw = els.input.value;
        if (!raw.trim()) return;
        const newKws = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        let addedCount = 0;
        newKws.forEach(k => {
            if (!state.keywords.includes(k)) {
                state.keywords.push(k);
                addedCount++;
                renderTag(k);
            }
        });
        els.input.value = '';
        if (addedCount > 0) renderHighlights();
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

    // Search Action
    els.search.onclick = () => {
        if (!state.keywords.length) return notify('Chưa nhập từ khóa!', 'error');
        const text = els.text.innerText;
        let count = 0;
        state.keywords.forEach(kw => {
            const regex = getRegex(kw, els.wholeWords.checked, els.matchCase.checked);
            if (regex) {
                const matches = text.match(regex);
                if (matches) count += matches.length;
            }
        });
        renderHighlights();
        if (count > 0) notify(`Tìm thấy ${count} kết quả!`);
        else notify('Không tìm thấy kết quả nào.', 'error');
    };

    els.clear.onclick = () => {
        state.keywords = [];
        state.replacedIndices = [];
        els.tags.innerHTML = '';
        renderHighlights();
        notify('Đã xóa tất cả dữ liệu tìm kiếm.');
    };

    // Checkbox toggles
    els.matchCase.onchange = renderHighlights;
    els.wholeWords.onchange = renderHighlights;

    // --- REPLACE LOGIC ---
    // Load/Save Modes
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
        // Update current pairs from UI before saving
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(div => {
            const find = div.querySelector('.find').value;
            const rep = div.querySelector('.replace').value;
            if (find) pairs.push({ find, replace: rep });
        });
        state.modes[state.activeMode].pairs = pairs;
        
        localStorage.setItem('replace_data', JSON.stringify({
            modes: state.modes,
            active: state.activeMode
        }));
    }

    function updateModeUI() {
        // Select
        els.modeSel.innerHTML = '';
        Object.keys(state.modes).forEach(k => {
            const opt = document.createElement('option');
            opt.value = k; opt.text = k; opt.selected = k === state.activeMode;
            els.modeSel.appendChild(opt);
        });
        
        // Buttons
        const isDef = state.activeMode === 'Mặc định';
        els.delMode.classList.toggle('hidden', isDef);
        els.renameMode.classList.toggle('hidden', isDef);

        // Settings
        const mode = state.modes[state.activeMode];
        els.caseMode.textContent = mode.case ? 'Case Sensitive: BẬT' : 'Case Sensitive: TẮT';
        els.caseMode.className = mode.case 
            ? 'w-full py-1.5 mt-1 rounded text-xs font-bold transition-colors bg-green-200 text-green-800'
            : 'w-full py-1.5 mt-1 rounded text-xs font-bold transition-colors bg-gray-200 text-gray-600';

        // List
        els.puncList.innerHTML = '';
        mode.pairs.forEach(p => addPairUI(p.find, p.replace));
    }

    function addPairUI(f = '', r = '') {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `
            <input type="text" class="find" placeholder="Tìm từ..." value="${escapeHtml(f)}">
            <span class="text-gray-400">→</span>
            <input type="text" class="replace" placeholder="Thay bằng..." value="${escapeHtml(r)}">
            <button class="remove-pair" tabindex="-1">×</button>
        `;
        div.querySelector('.remove-pair').onclick = () => div.remove();
        els.puncList.prepend(div);
    }

    // Replace Actions
    els.addPair.onclick = () => { addPairUI(); els.puncList.querySelector('input').focus(); };
    els.save.onclick = () => { saveData(); notify(`Đã lưu cấu hình "${state.activeMode}"`); };
    
    els.modeSel.onchange = () => {
        saveData(); // Save old mode first
        state.activeMode = els.modeSel.value;
        updateModeUI();
    };

    els.addMode.onclick = () => {
        const name = prompt('Tên chế độ mới:');
        if (!name || state.modes[name]) return;
        saveData();
        state.modes[name] = { pairs: [], case: false };
        state.activeMode = name;
        updateModeUI();
    };

    els.delMode.onclick = () => {
        if (!confirm('Xóa chế độ này?')) return;
        delete state.modes[state.activeMode];
        state.activeMode = 'Mặc định';
        updateModeUI();
        saveData();
    };

    els.caseMode.onclick = () => {
        state.modes[state.activeMode].case = !state.modes[state.activeMode].case;
        updateModeUI();
    };

    // --- REPLACE ALL LOGIC (TRÁI TIM CỦA TOOL) ---
    els.replace.onclick = () => {
        saveData(); // Sync UI to Data first
        const mode = state.modes[state.activeMode];
        if (!mode.pairs.length) return notify('Không có cặp từ nào để thay thế!', 'error');

        const text = els.text.innerText;
        if (!text) return notify('Chưa có nội dung văn bản!', 'error');

        // Sort pairs by length (Longest first) to avoid partial replacement bugs
        const pairs = [...mode.pairs].sort((a, b) => b.find.length - a.find.length);
        
        let newText = text;
        let totalReplaced = 0;
        state.replacedIndices = []; // Reset highlights

        // Chiến thuật: Thay thế trực tiếp trên string và track vị trí
        // Lưu ý: Thay thế tuần tự từng cặp. 
        // Để highlight CHÍNH XÁC, ta cần tính toán lại vị trí sau mỗi lần thay thế (Khó)
        // Cách đơn giản & Hiệu quả: Sau khi thay thế xong hết, chạy lại 1 vòng tìm kiếm chính xác những từ đã thay thế để highlight.

        // 1. Thực hiện Replace text
        pairs.forEach(p => {
            const regex = getRegex(p.find, false, mode.case);
            if (!regex) return;
            // Đếm số lượng
            const matches = newText.match(regex);
            if (matches) totalReplaced += matches.length;
            // Replace
            newText = newText.replace(regex, p.replace);
        });

        if (totalReplaced === 0) return notify('Không tìm thấy từ nào để thay thế.', 'error');

        // 2. Update Editor
        els.text.innerText = newText; // Dùng innerText để browser parse lại dòng
        
        // 3. Tính toán Highlight Vàng (Quét lại văn bản mới để tìm các từ đích)
        // Lưu ý: Cách này sẽ highlight TẤT CẢ các từ trùng với từ đích (replace), kể cả từ vốn có sẵn. 
        // Đây là behavior mong muốn (để user check lại văn bản cuối).
        
        const tempIndices = [];
        pairs.forEach(p => {
            // Chỉ tìm những từ "replace" (kết quả)
            if (!p.replace) return; // Nếu replace rỗng (xóa từ) thì ko highlight
            const regex = getRegex(p.replace, false, mode.case); 
            if (!regex) return;
            
            let m;
            while ((m = regex.exec(newText)) !== null) {
                tempIndices.push({ start: m.index, end: m.index + m[0].length });
            }
        });
        state.replacedIndices = tempIndices;

        renderHighlights();
        notify(`Đã thay thế ${totalReplaced} vị trí!`, 'success');
    };

    // --- INIT ---
    loadData();
    updateFont();
    els.text.focus();
});
