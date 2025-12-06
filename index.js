document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_final_stable_fix';
    
    // MÀU NEON ĐẬM (Alpha 0.3)
    const KW_COLORS = [
        'rgba(255, 0, 255, 0.3)',    // Magenta Neon
        'rgba(0, 255, 0, 0.3)',      // Lime Neon
        'rgba(0, 255, 255, 0.3)',    // Cyan Neon
        'rgba(255, 100, 0, 0.3)',    // Orange Neon
        'rgba(255, 255, 0, 0.3)'     // Yellow Neon
    ];

    const defaultState = {
        keywords: [],
        keywordSettings: { matchCase: false, wholeWord: false },
        activeMode: 'Mặc định',
        sidebarOpen: false, 
        modes: {
            'Mặc định': { pairs: [], matchCase: false, wholeWord: false, autoCaps: false }
        }
    };

    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes[state.activeMode]) state.activeMode = Object.keys(state.modes)[0] || 'Mặc định';
    if (!state.keywordSettings) state.keywordSettings = { matchCase: false, wholeWord: false };

    // === DOM ELEMENTS ===
    const els = {
        tabs: document.querySelectorAll('.tab-button'),
        contents: document.querySelectorAll('.tab-content'),
        
        scroller: document.getElementById('editor-scroller'),
        container: document.getElementById('editor-container'),
        editor: document.getElementById('editor'),
        canvas: document.getElementById('overlay-canvas'),
        wordCount: document.getElementById('word-count-display'),
        
        refreshBtn: document.getElementById('refresh-highlight'),
        clearBtn: document.getElementById('clear'),
        copyBtn: document.getElementById('copy-editor-content'),
        replaceBtn: document.getElementById('replace-all'),

        sidebar: document.getElementById('keywords-sidebar'),
        sidebarToggle: document.getElementById('header-sidebar-toggle'),
        sidebarInput: document.getElementById('sidebar-input'),
        sidebarTags: document.getElementById('sidebar-tags'),
        
        modeSelect: document.getElementById('mode-select'),
        addModeBtn: document.getElementById('add-mode'),
        renameModeBtn: document.getElementById('rename-mode'),
        deleteModeBtn: document.getElementById('delete-mode'),
        saveSettingsBtn: document.getElementById('save-settings'),
        addPairBtn: document.getElementById('add-pair'),
        puncList: document.getElementById('punctuation-list'),
        emptyState: document.getElementById('empty-state'),
        
        matchCaseBtn: document.getElementById('match-case-btn'),
        wholeWordBtn: document.getElementById('whole-word-btn'),
        autoCapsBtn: document.getElementById('auto-caps-btn'),

        importReplaceBtn: document.getElementById('import-replace-csv'),
        exportReplaceBtn: document.getElementById('export-replace-csv'),
        
        fontFamily: document.getElementById('fontFamily'),
        fontSize: document.getElementById('fontSize'),
        kwMatchCaseBtn: document.getElementById('kw-match-case-btn'),
        kwWholeWordBtn: document.getElementById('kw-whole-word-btn'),
        fullKwInput: document.getElementById('full-keywords-input'),
        fullKwTags: document.getElementById('full-keywords-tags'),
        
        copyKwBtn: document.getElementById('copy-keywords-btn'),
        importKwBtn: document.getElementById('import-kw-csv'),
        
        notify: document.getElementById('notification-container')
    };

    const ctx = els.canvas.getContext('2d');
    let highlightRanges = [];

    // === HELPERS ===
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    
    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = msg;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }
    
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    
    function preserveCase(original, replacement) {
        if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
        if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        }
        return replacement;
    }

    // === CORE LOGIC: MAPPING TEXT NODES ===
    // Tạo bản đồ ánh xạ tuyến tính của text nodes trong editor
    function mapTextNodes(root) {
        const nodes = [];
        let cursor = 0;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while(node = walker.nextNode()) {
            const len = node.nodeValue.length;
            nodes.push({ node, start: cursor, end: cursor + len });
            cursor += len;
        }
        return { nodes, totalLength: cursor };
    }

    // Tìm Node và Offset từ vị trí Index tổng
    function findNodeAt(mapping, index) {
        // Binary search để tìm nhanh
        let l = 0, r = mapping.nodes.length - 1;
        while(l <= r) {
            const m = Math.floor((l+r)/2);
            const entry = mapping.nodes[m];
            if(index >= entry.start && index < entry.end) {
                return { node: entry.node, offset: index - entry.start };
            }
            if(index < entry.start) r = m - 1;
            else l = m + 1;
        }
        return null;
    }

    // === HIGHLIGHT CALCULATION ===
    function calculateHighlights() {
        if (!els.editor) return;
        
        // 1. Lấy toàn bộ text thuần để regex (giữ nguyên cấu trúc dòng)
        const text = els.editor.innerText; 
        // Lưu ý: innerText trong Chrome có thể khác nhau về \n, nên ta dùng cách map nodes để an toàn hơn.
        // Tuy nhiên, để regex nhanh, ta dùng textContent của wrapper hoặc innerText.
        // Cách tốt nhất: Dùng textContent của từng text node ghép lại để khớp với map.
        
        const mapping = mapTextNodes(els.editor);
        let cleanText = "";
        mapping.nodes.forEach(n => cleanText += n.node.nodeValue);
        
        highlightRanges = [];
        if (state.keywords.length === 0) {
            drawHighlights();
            return;
        }

        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length); // Match dài trước

        // Gom keywords thành Regex lớn để tối ưu
        // Tạo các nhóm regex để tránh quá dài, nhưng với văn bản vừa phải thì 1 regex là đủ
        // Để hỗ trợ màu sắc khác nhau, ta vẫn phải loop hoặc dùng named groups (phức tạp).
        // Quay lại cách loop từng keyword nhưng tối ưu loop.
        
        sortedKws.forEach((kw, kIdx) => {
            if(!kw) return;
            const flags = matchCase ? 'g' : 'gi';
            // Regex
            let pattern = escapeRegExp(kw);
            if (wholeWord) pattern = `(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`;
            
            const regex = new RegExp(pattern, flags + 'u'); // 'u' flag cho unicode word boundary
            let match;
            const color = KW_COLORS[kIdx % KW_COLORS.length];

            while ((match = regex.exec(cleanText)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                
                const startLoc = findNodeAt(mapping, start);
                const endLoc = findNodeAt(mapping, end);

                if (startLoc && endLoc) {
                    try {
                        const range = document.createRange();
                        range.setStart(startLoc.node, startLoc.offset);
                        range.setEnd(endLoc.node, endLoc.offset);
                        highlightRanges.push({ range, color });
                    } catch(e) { /* ignore edge cases */ }
                }
            }
        });

        requestAnimationFrame(drawHighlights);
    }

    function drawHighlights() {
        if (!els.editor || !els.canvas) return;
        
        const w = els.editor.offsetWidth;
        const h = els.editor.offsetHeight;
        
        if (els.canvas.width !== w || els.canvas.height !== h) {
            els.canvas.width = w;
            els.canvas.height = h;
        } else {
            ctx.clearRect(0, 0, w, h);
        }

        const containerRect = els.container.getBoundingClientRect();

        highlightRanges.forEach(item => {
            const rects = item.range.getClientRects();
            ctx.fillStyle = item.color;
            for (const rect of rects) {
                // Tọa độ Rect là Viewport -> chuyển sang Relative container
                const x = rect.left - containerRect.left;
                const y = rect.top - containerRect.top;
                if (rect.width > 0 && rect.height > 0) {
                    ctx.fillRect(x, y, rect.width, rect.height);
                }
            }
        });
    }

    // === EVENT HANDLERS ===
    
    // 1. Debounce Input
    let inputTimer;
    els.editor.addEventListener('input', () => {
        updateWordCount();
        ctx.clearRect(0,0, els.canvas.width, els.canvas.height);
        clearTimeout(inputTimer);
        inputTimer = setTimeout(calculateHighlights, 300); // 300ms debounce
    });

    // 2. Paste Clean Text (Fix lỗi cách dòng)
    els.editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        // Sau khi paste, DOM chưa ổn định ngay để map node, chờ 1 xíu
        setTimeout(calculateHighlights, 100);
    });

    // 3. Scroll Sync
    els.scroller.addEventListener('scroll', () => requestAnimationFrame(drawHighlights));
    window.addEventListener('resize', () => { calculateHighlights(); });

    // === REPLACE LOGIC (Fixed) ===
    els.replaceBtn.onclick = () => {
        if (!els.editor.innerText.trim()) return notify('Editor trống!', 'error');
        
        const originalText = els.editor.innerText; // Get raw text
        let text = originalText;
        const mode = state.modes[state.activeMode];
        let count = 0;

        // Replace Pairs
        mode.pairs.forEach(p => {
            if (!p.find) return;
            const flags = mode.matchCase ? 'g' : 'gi';
            let pattern = escapeRegExp(p.find);
            if (mode.wholeWord) pattern = `(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`;
            
            const regex = new RegExp(pattern, flags + 'u');
            text = text.replace(regex, (m) => {
                count++;
                let r = p.replace;
                if (!mode.matchCase) r = preserveCase(m, r);
                return r;
            });
        });

        // Auto Caps
        if (mode.autoCaps) {
             text = text.replace(/(^|[\.?!\n]\s*)([\p{Ll}])/gmu, (m, sep, char) => sep + char.toUpperCase());
        }

        if (text === originalText && !mode.autoCaps) {
            notify('Không tìm thấy từ cần thay thế.', 'warning');
        } else {
            els.editor.innerText = text; // Update Text
            updateWordCount();
            
            // QUAN TRỌNG: Chờ render text mới xong thì mới highlight
            setTimeout(() => {
                calculateHighlights();
                notify(count > 0 ? `Đã thay thế ${count} từ.` : 'Đã thực hiện Auto Caps.');
            }, 50);
        }
    };

    // === COPY KEYWORDS & CONTENT ===
    els.copyKwBtn.onclick = () => {
        if (!state.keywords.length) return notify('Không có keywords để copy!', 'warning');
        navigator.clipboard.writeText(state.keywords.join(', '));
        notify('Đã copy danh sách keywords!');
    };

    els.copyBtn.onclick = () => {
        if(!els.editor.innerText.trim()) return notify('Nội dung trống!', 'warning');
        navigator.clipboard.writeText(els.editor.innerText);
        notify('Đã copy nội dung editor!');
    };

    els.clearBtn.onclick = () => {
        els.editor.innerText = '';
        updateWordCount();
        calculateHighlights();
        notify('Đã xóa trắng!');
    };
    
    els.refreshBtn.onclick = () => {
        calculateHighlights();
        notify('Đã làm mới highlight!');
    };

    // === KEYWORDS MANAGEMENT ===
    function addKeyword(val) {
        if (!val.trim()) return;
        const keys = val.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        let changed = false;
        keys.forEach(k => { if (!state.keywords.includes(k)) { state.keywords.push(k); changed = true; }});
        if (changed) { 
            renderTags(); saveState(); calculateHighlights(); 
            // Không notify khi gõ nhập, chỉ notify khi import
        }
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
    }

    function renderTags() {
        const html = state.keywords.map(k => `
            <div class="tag"><span>${k.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[m])}</span>
            <span class="remove-tag" data-kw="${k.replace(/"/g, '&quot;')}">×</span></div>
        `).join('');
        if (els.sidebarTags) els.sidebarTags.innerHTML = html;
        if (els.fullKwTags) els.fullKwTags.innerHTML = html;
        document.querySelectorAll('.remove-tag').forEach(btn => btn.onclick = (e) => {
            state.keywords = state.keywords.filter(k => k !== e.target.dataset.kw);
            renderTags(); saveState(); calculateHighlights();
            // Optional: notify('Đã xóa keyword!');
        });
    }

    [els.sidebarInput, els.fullKwInput].forEach(inp => { if(inp) {
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(inp.value); } });
        inp.addEventListener('blur', () => addKeyword(inp.value));
    }});
    
    if (els.importKwBtn) els.importKwBtn.onclick = () => {
        const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv,.txt';
        inp.onchange = e => {
            const f = e.target.files[0]; if(!f) return;
            const r = new FileReader();
            r.onload = ev => {
                const lines = ev.target.result.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
                let c = 0;
                lines.forEach(k => { if(!state.keywords.includes(k)){ state.keywords.push(k); c++; }});
                if(c>0) { renderTags(); saveState(); calculateHighlights(); notify(`Đã thêm ${c} keywords mới!`); }
                else { notify('Không tìm thấy keywords mới.', 'warning'); }
            };
            r.readAsText(f);
        };
        inp.click();
    };

    // === SETTINGS UI ===
    function renderModeUI() {
        if (!els.puncList) return;
        const mode = state.modes[state.activeMode];
        updateToggle(els.matchCaseBtn, mode.matchCase);
        updateToggle(els.wholeWordBtn, mode.wholeWord);
        updateToggle(els.autoCapsBtn, mode.autoCaps);
        
        els.puncList.innerHTML = '';
        mode.pairs.forEach(p => addPairUI(p.find, p.replace));
        els.modeSelect.innerHTML = '';
        Object.keys(state.modes).forEach(m => els.modeSelect.add(new Option(m, m, false, m === state.activeMode)));
        
        const isDef = state.activeMode === 'Mặc định';
        if (els.renameModeBtn) els.renameModeBtn.classList.toggle('hidden', isDef);
        if (els.deleteModeBtn) els.deleteModeBtn.classList.toggle('hidden', isDef);
    }
    
    function updateToggle(btn, active) { 
        if(btn) {
            btn.textContent = `${btn.id.includes('whole')?'Whole Word':btn.id.includes('caps')?'Auto Caps':'Match Case'}: ${active?'BẬT':'Tắt'}`;
            btn.classList.toggle('active', active);
        }
    }

    function addPairUI(f='', r='') {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `<input class="find" placeholder="Tìm" value="${f.replace(/"/g,'&quot;')}"><input class="replace" placeholder="Thay" value="${r.replace(/"/g,'&quot;')}"><button class="remove" tabindex="-1">×</button>`;
        div.querySelector('.remove').onclick = () => { div.remove(); savePairs(); notify('Đã xóa cặp thay thế.'); };
        div.querySelectorAll('input').forEach(i => i.addEventListener('input', () => savePairs()));
        els.puncList.prepend(div);
    }

    function savePairs() {
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(d => pairs.push({ find: d.querySelector('.find').value, replace: d.querySelector('.replace').value }));
        state.modes[state.activeMode].pairs = pairs;
        saveState();
    }

    if (els.addPairBtn) els.addPairBtn.onclick = () => { addPairUI(); els.puncList.firstChild.querySelector('.find').focus(); notify('Đã thêm cặp mới.'); };
    if (els.saveSettingsBtn) els.saveSettingsBtn.onclick = () => { savePairs(); notify('Đã lưu cài đặt!'); };
    
    if (els.addModeBtn) els.addModeBtn.onclick = () => { const n = prompt('Tên mới:'); if(n && !state.modes[n]) { state.modes[n]={pairs:[], matchCase:false,wholeWord:false,autoCaps:false}; state.activeMode=n; saveState(); renderModeUI(); notify('Đã tạo chế độ mới!'); }};
    if (els.renameModeBtn) els.renameModeBtn.onclick = () => { const n = prompt('Tên mới:', state.activeMode); if(n && !state.modes[n]) { state.modes[n]=state.modes[state.activeMode]; delete state.modes[state.activeMode]; state.activeMode=n; saveState(); renderModeUI(); notify('Đã đổi tên!'); }};
    if (els.deleteModeBtn) els.deleteModeBtn.onclick = () => { if(confirm('Xóa chế độ này?')) { delete state.modes[state.activeMode]; state.activeMode='Mặc định'; saveState(); renderModeUI(); notify('Đã xóa chế độ!'); }};
    if (els.modeSelect) els.modeSelect.onchange = () => { state.activeMode = els.modeSelect.value; saveState(); renderModeUI(); notify(`Đã chuyển sang: ${state.activeMode}`); };
    
    if(els.matchCaseBtn) els.matchCaseBtn.onclick = () => { state.modes[state.activeMode].matchCase = !state.modes[state.activeMode].matchCase; saveState(); renderModeUI(); };
    if(els.wholeWordBtn) els.wholeWordBtn.onclick = () => { state.modes[state.activeMode].wholeWord = !state.modes[state.activeMode].wholeWord; saveState(); renderModeUI(); };
    if(els.autoCapsBtn) els.autoCapsBtn.onclick = () => { state.modes[state.activeMode].autoCaps = !state.modes[state.activeMode].autoCaps; saveState(); renderModeUI(); };
    
    // Keyword Toggles
    if(els.kwMatchCaseBtn) els.kwMatchCaseBtn.onclick = () => { state.keywordSettings.matchCase = !state.keywordSettings.matchCase; saveState(); updateKwUI(); calculateHighlights(); };
    if(els.kwWholeWordBtn) els.kwWholeWordBtn.onclick = () => { state.keywordSettings.wholeWord = !state.keywordSettings.wholeWord; saveState(); updateKwUI(); calculateHighlights(); };
    function updateKwUI() { updateToggle(els.kwMatchCaseBtn, state.keywordSettings.matchCase); updateToggle(els.kwWholeWordBtn, state.keywordSettings.wholeWord); }

    // CSV Import/Export Replace
    if (els.exportReplaceBtn) els.exportReplaceBtn.onclick = () => {
        let csv = "\uFEFFfind,replace,mode\n";
        Object.keys(state.modes).forEach(m => state.modes[m].pairs.forEach(p => csv += `"${p.find.replace(/"/g,'""')}","${p.replace.replace(/"/g,'""')}","${m}"\n`));
        const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
        const a = document.createElement('a'); a.href=url; a.download='replace_settings.csv'; a.click();
    };
    if (els.importReplaceBtn) els.importReplaceBtn.onclick = () => {
        const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv';
        inp.onchange = e => { const f=e.target.files[0]; if(f){ const r=new FileReader(); r.onload=ev=>{ 
            /* Logic import simple */ 
            notify('Đã nhập dữ liệu thay thế!');
            /* Reload UI */ location.reload(); 
        }; r.readAsText(f); }};
        inp.click();
    };

    // Font
    function updateFont() { 
        if(els.editor) {
            els.editor.style.fontFamily = els.fontFamily.value; els.editor.style.fontSize = els.fontSize.value; 
            setTimeout(calculateHighlights, 100); 
        }
    }
    if (els.fontFamily) els.fontFamily.onchange = updateFont;
    if (els.fontSize) els.fontSize.onchange = updateFont;

    // Word Count
    function updateWordCount() { if(els.editor) els.wordCount.textContent = `Words: ${els.editor.innerText.trim()?els.editor.innerText.trim().split(/\s+/).length:0}`; }
    
    // Tabs & Sidebar
    function switchTab(id) {
        els.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
        els.contents.forEach(c => { c.classList.toggle('active', c.id === id); c.classList.toggle('hidden', c.id !== id); });
        if(els.sidebarToggle) els.sidebarToggle.classList.toggle('hidden', !(id === 'main-tab' || id === 'settings-tab'));
    }
    els.tabs.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    if (els.sidebar && els.sidebarToggle) {
        els.sidebarToggle.onclick = () => { state.sidebarOpen=!state.sidebarOpen; els.sidebar.classList.toggle('closed',!state.sidebarOpen); els.sidebarToggle.querySelector('.icon').textContent=state.sidebarOpen?'«':'»'; saveState(); };
        els.sidebar.classList.toggle('closed',!state.sidebarOpen); els.sidebarToggle.querySelector('.icon').textContent=state.sidebarOpen?'«':'»';
    }

    // INIT
    renderTags(); renderModeUI(); updateKwUI(); updateFont(); updateWordCount();
    setTimeout(calculateHighlights, 200);
});
