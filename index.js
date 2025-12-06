document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v22_overlay_final';
    
    // Màu sắc highlight cho Canvas (RGBA)
    const KW_COLORS_RGBA = [
        'rgba(249, 168, 212, 0.5)', // hl-pink
        'rgba(134, 239, 172, 0.5)', // hl-green
        'rgba(253, 186, 116, 0.5)', // hl-orange
        'rgba(216, 180, 254, 0.5)', // hl-purple
        'rgba(252, 165, 165, 0.5)'  // hl-red
    ];
    // Màu cho replace highlight
    const REPLACE_COLOR_RGBA = 'rgba(253, 224, 71, 0.5)'; // hl-yellow

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
        
        wrapper: document.getElementById('editor-wrapper'),
        editor: document.getElementById('editor'),
        canvas: document.getElementById('overlay-canvas'),
        wordCount: document.getElementById('word-count-display'),
        
        refreshBtn: document.getElementById('refresh-highlight'), // Rename searchBtn
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
        
        copyKwBtn: document.getElementById('copy-keywords-btn'), // Nút mới
        
        notify: document.getElementById('notification-container')
    };

    const ctx = els.canvas.getContext('2d');
    let highlightRanges = []; // Store ranges to redraw on scroll without recalc

    // === CORE FUNCTIONS ===

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = msg;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }

    function preserveCase(original, replacement) {
        if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
        if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        }
        return replacement;
    }
    
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // === OVERLAY HIGHLIGHT SYSTEM (THE FIX) ===

    /**
     * Tạo một bản đồ (Map) ánh xạ từ index của chuỗi plain text sang TextNode trong DOM.
     * Điều này cho phép ta tìm thấy vị trí (Node, Offset) từ vị trí (Start, End) của Regex.
     */
    function createTextNodeMap(rootNode) {
        const map = [];
        let currentIndex = 0;
        
        const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while(node = walker.nextNode()) {
            const len = node.nodeValue.length;
            map.push({
                node: node,
                start: currentIndex,
                end: currentIndex + len
            });
            currentIndex += len;
        }
        return map;
    }

    /**
     * Tìm TextNode và Offset cụ thể từ global index.
     * Sử dụng Binary Search để tối ưu tốc độ cho văn bản rất dài.
     */
    function getNodeAndOffset(map, index) {
        let left = 0;
        let right = map.length - 1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const entry = map[mid];
            
            if (index >= entry.start && index < entry.end) {
                return { node: entry.node, offset: index - entry.start };
            } else if (index < entry.start) {
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
        return null; // Should not happen if index is valid
    }

    /**
     * Hàm chính để tính toán vị trí Highlight.
     * Không vẽ ngay, mà lưu trữ Ranges vào biến toàn cục highlightRanges.
     */
    function calculateHighlights() {
        if (!els.editor) return;
        
        const text = els.editor.innerText; // Lấy text thuần
        // Fix: Chrome thêm \n cuối cùng cho block element, cần loại bỏ để map chính xác
        const cleanText = text.replace(/\n$/, ''); 
        
        const nodeMap = createTextNodeMap(els.editor);
        highlightRanges = []; // Reset

        // 1. Tính toán Keyword Highlights
        if (state.keywords.length > 0) {
            const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
            const matchCase = state.keywordSettings.matchCase;
            const wholeWord = state.keywordSettings.wholeWord;
            const wordCharRegex = /[\p{L}\p{N}_]/u;

            // Gom nhóm keywords để tối ưu Regex (Tạo Regex khổng lồ)
            // Lưu ý: Regex quá dài có thể gây lỗi, nên chia nhỏ nếu cần. Ở đây làm đơn giản.
            // Để hỗ trợ Whole Word và Case chính xác, ta quét từng keyword hoặc tạo Regex thông minh.
            // Cách đơn giản và an toàn nhất: Quét từng keyword (chấp nhận chậm hơn một chút nhưng chính xác).
            // Tối ưu hơn: Dùng 1 vòng lặp text và check keywords.
            
            // Ở đây dùng giải pháp: Tạo 1 Regex gộp tất cả keywords (escaped).
            // Sắp xếp keyword dài trước để match đúng (ví dụ "Công chúa" trước "Công").
            
            const flags = matchCase ? 'g' : 'gi';
            const pattern = sortedKws.map(k => escapeRegExp(k)).join('|');
            const regex = new RegExp(pattern, flags);
            
            let match;
            while ((match = regex.exec(cleanText)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                
                // Check whole word
                if (wholeWord) {
                    const prev = start > 0 ? cleanText[start-1] : '';
                    const next = end < cleanText.length ? cleanText[end] : '';
                    if (wordCharRegex.test(prev) || wordCharRegex.test(next)) continue;
                }
                
                // Xác định màu (dựa trên index của keyword trong mảng gốc để nhất quán màu)
                // Tìm keyword gốc khớp với match
                const kwIndex = state.keywords.findIndex(k => matchCase ? k === match[0] : k.toLowerCase() === match[0].toLowerCase());
                const color = KW_COLORS_RGBA[kwIndex % KW_COLORS_RGBA.length] || KW_COLORS_RGBA[0];

                try {
                    const startLoc = getNodeAndOffset(nodeMap, start);
                    const endLoc = getNodeAndOffset(nodeMap, end);
                    
                    if (startLoc && endLoc) {
                        const range = document.createRange();
                        range.setStart(startLoc.node, startLoc.offset);
                        range.setEnd(endLoc.node, endLoc.offset);
                        highlightRanges.push({ range, color });
                    }
                } catch(e) { console.warn('Lỗi map range', e); }
            }
        }
        
        requestAnimationFrame(drawHighlights);
    }

    /**
     * Vẽ lại Canvas dựa trên highlightRanges đã tính.
     * Hàm này cực nhanh vì chỉ vẽ hình chữ nhật, không tính toán DOM.
     */
    function drawHighlights() {
        if (!els.editor || !els.canvas) return;

        // 1. Resize Canvas khớp với Scroll Size của Editor
        // Quan trọng: Canvas phải đủ lớn để chứa toàn bộ nội dung cuộn
        const width = els.editor.scrollWidth;
        const height = els.editor.scrollHeight;
        
        // Chỉ resize nếu kích thước thay đổi (tránh clear canvas không cần thiết)
        if (els.canvas.width !== width || els.canvas.height !== height) {
            els.canvas.width = width;
            els.canvas.height = height;
        } else {
            ctx.clearRect(0, 0, width, height); // Xóa trắng để vẽ lại
        }
        
        // 2. Lấy offset của Editor so với viewport để tính tọa độ tương đối
        const editorRect = els.editor.getBoundingClientRect();
        
        // 3. Loop và vẽ
        highlightRanges.forEach(item => {
            const rects = item.range.getClientRects();
            ctx.fillStyle = item.color;
            
            for (const rect of rects) {
                // Tọa độ vẽ = (Rect Viewport) - (Editor Viewport) + (Scroll Amount)
                // Vì Canvas nằm absolute top:0 left:0 trong thẻ cha relative, 
                // và Canvas có kích thước bằng scrollHeight,
                // nên ta cần vẽ tại tọa độ tuyệt đối so với Editor content.
                
                // Công thức đúng cho Overlay nằm trong cùng container scroll:
                // Canvas được định vị absolute top:0 left:0.
                // Scroll container cuộn cả Editor và Canvas cùng lúc.
                // Do đó, ta cần tính vị trí của rect tương đối so với góc trên trái của Editor (không tính scroll).
                
                // rect.top là tọa độ màn hình.
                // editorRect.top là tọa độ màn hình của editor visible box.
                // editor.scrollTop là phần đã cuộn đi.
                
                // Vị trí Y trên Canvas = (rect.top - editorRect.top) + els.wrapper.scrollTop;
                // Tuy nhiên, editorRect tính cả border/padding.
                // Editor có padding 20px. rect tính từ content.
                // Cách chính xác nhất:
                // x = rect.left - editorRect.left + els.wrapper.scrollLeft
                // y = rect.top - editorRect.top + els.wrapper.scrollTop
                
                // Lưu ý: els.wrapper là thẻ chứa scroll.
                // getBoundingClientRect của Editor (nằm trong wrapper) sẽ thay đổi khi scroll?
                // Không, Editor width/height full. Wrapper scroll.
                
                // Fix chính xác:
                // Wrapper relative.
                // Canvas absolute top 0 left 0.
                // Editor absolute top 0 left 0 (hoặc relative nhưng wrapper scroll).
                // Khi wrapper scroll, cả Canvas và Editor bị đẩy lên.
                // getClientRects trả về vị trí trên màn hình.
                
                // Wrapper Rect
                const wrapperRect = els.wrapper.getBoundingClientRect();
                
                const x = rect.left - wrapperRect.left + els.wrapper.scrollLeft;
                const y = rect.top - wrapperRect.top + els.wrapper.scrollTop;
                
                // Vẽ chữ nhật, thêm padding nhỏ (hoặc không) tùy thẩm mỹ
                ctx.fillRect(x, y, rect.width, rect.height);
            }
        });
    }

    // === EVENT LISTENERS FOR PERFORMANCE ===
    
    // Debounce Input để không tính toán quá nhiều khi gõ
    let inputTimeout;
    if (els.editor) {
        els.editor.addEventListener('input', () => {
            updateWordCount();
            clearTimeout(inputTimeout);
            inputTimeout = setTimeout(() => {
                calculateHighlights();
            }, 100); // Delay 100ms sau khi ngừng gõ
        });

        // Xử lý Paste text thuần
        els.editor.addEventListener('paste', (e) => {
            e.preventDefault();
            let text = (e.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, text);
        });
    }

    // Scroll: Không cần tính lại Ranges, chỉ cần vẽ lại?
    // Thực tế nếu Canvas kích thước = scrollHeight và nằm trong wrapper scroll,
    // thì Canvas sẽ tự trôi theo nội dung. KHÔNG CẦN VẼ LẠI KHI SCROLL.
    // Trừ khi layout thay đổi động.
    // Tuy nhiên, Range.getClientRects() trả về tọa độ Viewport. Khi scroll, tọa độ này thay đổi.
    // Nhưng ta đã cộng scrollTop vào rồi. 
    // -> Canvas tĩnh so với nội dung, nhưng động so với Viewport.
    // -> Chỉ cần tính 1 lần, Canvas tự cuộn. OK.
    
    // Resize window: Cần tính lại vì dòng chữ có thể bị wrap (xuống dòng) khác đi
    window.addEventListener('resize', () => {
        calculateHighlights();
    });

    // Font thay đổi: Cần tính lại
    function updateFont() {
        if (!els.editor || !els.fontFamily || !els.fontSize) return;
        els.editor.style.setProperty('font-family', els.fontFamily.value, 'important');
        els.editor.style.setProperty('font-size', els.fontSize.value, 'important');
        // Đợi DOM update font xong mới tính lại highlight
        setTimeout(calculateHighlights, 50);
    }
    if (els.fontFamily) els.fontFamily.onchange = updateFont;
    if (els.fontSize) els.fontSize.onchange = updateFont;

    // === REPLACE LOGIC (Updated for Overlay) ===
    async function performReplaceAll() {
        if (!els.editor) return notify('Lỗi editor!', 'error');
        let text = els.editor.innerText; 
        if (!text.trim()) return notify('Editor trống!', 'error');

        const originalTextBtn = els.replaceBtn.textContent;
        els.replaceBtn.textContent = 'Đang xử lý...';
        els.replaceBtn.disabled = true;

        // Sử dụng Promise để không chặn UI khi replace văn bản rất lớn
        await new Promise(resolve => setTimeout(resolve, 10));

        try {
            const mode = state.modes[state.activeMode];
            let replaceCount = 0;
            
            // Logic Replace trên chuỗi (String manipulation)
            // Thay vì dùng Regex phức tạp trên DOM, ta replace trên Plain Text sau đó gán lại
            // Điều này làm mất định dạng Rich Text (nhưng app này ưu tiên Plain Text)
            
            // 1. User Replace Pairs
            mode.pairs.forEach(pair => {
                if (!pair.find) return;
                const flags = mode.matchCase ? 'g' : 'gi';
                let regex;
                if (mode.wholeWord) {
                     regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(pair.find)}(?![\\p{L}\\p{N}_])`, flags + 'u');
                } else {
                    regex = new RegExp(escapeRegExp(pair.find), flags);
                }
                
                text = text.replace(regex, (match) => {
                    replaceCount++;
                    let replacement = pair.replace;
                    if (!mode.matchCase) replacement = preserveCase(match, replacement);
                    return replacement;
                });
            });

            // 2. Auto Caps
            if (mode.autoCaps) {
                const autoCapsRegex = /(^|[\.?!\n]\s*)([\p{Ll}])/gmu;
                text = text.replace(autoCapsRegex, (m, p, c) => p + c.toUpperCase());
            }

            // Update Content
            els.editor.innerText = text; // Gán lại text mới
            
            // Trigger Highlight lại
            calculateHighlights();
            updateWordCount();
            
            if (replaceCount > 0) notify(`Đã thay thế ${replaceCount} cụm từ!`);
            else notify('Hoàn tất xử lý.', 'success');

        } catch (e) {
            console.error(e);
            notify('Lỗi: ' + e.message, 'error');
        } finally {
            els.replaceBtn.textContent = originalTextBtn;
            els.replaceBtn.disabled = false;
        }
    }
    
    if (els.replaceBtn) els.replaceBtn.onclick = performReplaceAll;

    // === COPY KEYWORDS FEATURE ===
    if (els.copyKwBtn) {
        els.copyKwBtn.onclick = () => {
            if (!state.keywords || state.keywords.length === 0) {
                return notify('Danh sách keywords trống!', 'warning');
            }
            // Join bằng dấu phẩy và khoảng trắng
            const textToCopy = state.keywords.join(', ');
            navigator.clipboard.writeText(textToCopy).then(() => {
                notify('Đã copy danh sách keywords!');
            }).catch(err => {
                console.error('Lỗi copy:', err);
                notify('Không thể copy vào clipboard', 'error');
            });
        };
    }

    // === KEYWORDS MANAGEMENT UI (Giữ nguyên logic cũ) ===
    function addKeyword(val) {
        if (!val.trim()) return;
        const keys = val.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        let changed = false;
        keys.forEach(k => {
            if (!state.keywords.includes(k)) {
                state.keywords.push(k);
                changed = true;
            }
        });
        if (changed) {
            renderTags(); saveState(); 
            calculateHighlights(); // Vẽ lại ngay khi thêm
        }
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
    }

    function renderTags() {
        const html = state.keywords.map(k => `
            <div class="tag"><span>${k.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[m])}</span><span class="remove-tag" data-kw="${k.replace(/"/g, '&quot;')}">×</span></div>
        `).join('');
        if (els.sidebarTags) els.sidebarTags.innerHTML = html;
        if (els.fullKwTags) els.fullKwTags.innerHTML = html;
        document.querySelectorAll('.remove-tag').forEach(btn => {
            btn.onclick = (e) => {
                state.keywords = state.keywords.filter(k => k !== e.target.dataset.kw);
                renderTags(); saveState(); 
                calculateHighlights(); // Vẽ lại ngay khi xóa
            }
        });
    }

    [els.sidebarInput, els.fullKwInput].forEach(inp => {
        if (inp) {
            inp.addEventListener('keydown', e => { 
                if (e.key === 'Enter') { e.preventDefault(); addKeyword(inp.value); } 
            });
            inp.addEventListener('blur', () => addKeyword(inp.value));
        }
    });

    // === SETTINGS UI HELPERS ===
    function renderModeUI() {
        if (!els.puncList || !els.modeSelect) return;
        const mode = state.modes[state.activeMode];
        if (els.matchCaseBtn) updateToggle(els.matchCaseBtn, mode.matchCase);
        if (els.wholeWordBtn) updateToggle(els.wholeWordBtn, mode.wholeWord);
        if (els.autoCapsBtn) updateToggle(els.autoCapsBtn, mode.autoCaps);
        els.puncList.innerHTML = '';
        mode.pairs.forEach(p => addPairUI(p.find, p.replace));
        els.modeSelect.innerHTML = '';
        Object.keys(state.modes).forEach(m => els.modeSelect.add(new Option(m, m, false, m === state.activeMode)));
        if (els.emptyState) els.emptyState.classList.toggle('hidden', els.puncList.children.length > 0);
        const isDef = state.activeMode === 'Mặc định';
        if (els.renameModeBtn) els.renameModeBtn.classList.toggle('hidden', isDef);
        if (els.deleteModeBtn) els.deleteModeBtn.classList.toggle('hidden', isDef);
    }
    
    function updateToggle(btn, isActive) {
        btn.textContent = `${btn.id.includes('whole') ? 'Whole Word' : btn.id.includes('caps') ? 'Auto Caps' : 'Match Case'}: ${isActive ? 'BẬT' : 'Tắt'}`;
        btn.classList.toggle('active', isActive);
    }

    function addPairUI(f = '', r = '') {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${f.replace(/"/g,'&quot;')}"><input type="text" class="replace" placeholder="Thay" value="${r.replace(/"/g,'&quot;')}"><button class="remove" tabindex="-1">×</button>`;
        div.querySelector('.remove').onclick = () => { div.remove(); savePairs(); };
        div.querySelectorAll('input').forEach(i => i.addEventListener('input', () => savePairs()));
        els.puncList.prepend(div);
        if (els.emptyState) els.emptyState.classList.add('hidden');
    }

    function savePairs() {
        if (!els.puncList) return;
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(d => {
            pairs.push({ find: d.querySelector('.find').value, replace: d.querySelector('.replace').value });
        });
        state.modes[state.activeMode].pairs = pairs;
        saveState();
    }

    // Attach Settings Events
    if (els.matchCaseBtn) els.matchCaseBtn.onclick = () => { state.modes[state.activeMode].matchCase = !state.modes[state.activeMode].matchCase; saveState(); renderModeUI(); };
    if (els.wholeWordBtn) els.wholeWordBtn.onclick = () => { state.modes[state.activeMode].wholeWord = !state.modes[state.activeMode].wholeWord; saveState(); renderModeUI(); };
    if (els.autoCapsBtn) els.autoCapsBtn.onclick = () => { state.modes[state.activeMode].autoCaps = !state.modes[state.activeMode].autoCaps; saveState(); renderModeUI(); };
    if (els.modeSelect) els.modeSelect.onchange = () => { state.activeMode = els.modeSelect.value; saveState(); renderModeUI(); };
    if (els.addModeBtn) els.addModeBtn.onclick = () => { const n = prompt('Tên mới:'); if (n && !state.modes[n]) { state.modes[n] = { pairs: [], matchCase:false, wholeWord:false, autoCaps:false }; state.activeMode = n; saveState(); renderModeUI(); } };
    if (els.renameModeBtn) els.renameModeBtn.onclick = () => { const n = prompt('Tên mới:', state.activeMode); if (n && !state.modes[n]) { state.modes[n] = state.modes[state.activeMode]; delete state.modes[state.activeMode]; state.activeMode = n; saveState(); renderModeUI(); } };
    if (els.deleteModeBtn) els.deleteModeBtn.onclick = () => { if (confirm('Xóa?')) { delete state.modes[state.activeMode]; state.activeMode = 'Mặc định'; saveState(); renderModeUI(); } };
    if (els.addPairBtn) els.addPairBtn.onclick = () => { addPairUI(); els.puncList.firstChild.querySelector('input').focus(); };
    if (els.saveSettingsBtn) els.saveSettingsBtn.onclick = () => { savePairs(); notify('Đã lưu tất cả!'); };

    // Standard buttons
    if (els.clearBtn) els.clearBtn.onclick = () => { if (els.editor) els.editor.innerText = ''; updateWordCount(); calculateHighlights(); };
    if (els.copyBtn) els.copyBtn.onclick = () => { if (els.editor) navigator.clipboard.writeText(els.editor.innerText); notify('Đã copy!'); };
    if (els.refreshBtn) els.refreshBtn.onclick = calculateHighlights;

    // Word Count
    function updateWordCount() {
        if (!els.editor || !els.wordCount) return;
        const txt = els.editor.innerText || '';
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
    }

    // Toggle Sidebar/Tab Logic (Giữ nguyên)
    function switchTab(tabId) {
        els.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        els.contents.forEach(c => {
            if (c.id === tabId) { c.classList.remove('hidden'); c.classList.add('active'); } 
            else { c.classList.add('hidden'); c.classList.remove('active'); }
        });
        if (els.sidebarToggle) els.sidebarToggle.classList.toggle('hidden', !(tabId === 'main-tab' || tabId === 'settings-tab'));
    }
    els.tabs.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    
    if (els.sidebar && els.sidebarToggle) {
        els.sidebarToggle.onclick = () => {
            state.sidebarOpen = !state.sidebarOpen;
            els.sidebar.classList.toggle('closed', !state.sidebarOpen);
            els.sidebarToggle.querySelector('.icon').textContent = state.sidebarOpen ? '«' : '»';
            saveState();
        };
        // Init sidebar state
        els.sidebar.classList.toggle('closed', !state.sidebarOpen);
        els.sidebarToggle.querySelector('.icon').textContent = state.sidebarOpen ? '«' : '»';
    }

    // Export/Import Replace CSV (Giữ nguyên logic cũ nếu cần)
    if (els.exportReplaceBtn) {
        els.exportReplaceBtn.onclick = () => {
            let csv = "\uFEFFfind,replace,mode\n";
            Object.keys(state.modes).forEach(m => state.modes[m].pairs.forEach(p => csv += `"${p.find.replace(/"/g,'""')}","${p.replace.replace(/"/g,'""')}","${m}"\n`));
            const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
            const a = document.createElement('a'); a.href=url; a.download='settings.csv'; a.click();
        };
    }

    // === INIT ===
    renderTags(); renderModeUI(); updateFont(); updateWordCount(); 
    // Trigger highlight lần đầu sau 1 chút delay để DOM ổn định
    setTimeout(calculateHighlights, 200);
});
