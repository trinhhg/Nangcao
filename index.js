document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_final_ultimate';
    
    // MÀU SẮC NEON ĐẬM (Dễ nhìn hơn)
    const KW_COLORS_RGBA = [
        'rgba(255, 255, 0, 0.4)',    // Vàng sáng
        'rgba(0, 255, 0, 0.4)',      // Xanh lá sáng
        'rgba(0, 255, 255, 0.4)',    // Cyan
        'rgba(255, 0, 255, 0.4)',    // Hồng cánh sen
        'rgba(255, 128, 0, 0.4)'     // Cam
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
    let isCalculated = false;

    // === STATE & NOTIFICATION ===
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

    // === UTILS ===
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

    // === OVERLAY SYSTEM (OPTIMIZED) ===

    // Map DOM Nodes to Text Offsets (Heavy, run only when text changes)
    function createTextNodeMap(rootNode) {
        const map = [];
        let currentIndex = 0;
        const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while(node = walker.nextNode()) {
            const len = node.nodeValue.length;
            map.push({ node: node, start: currentIndex, end: currentIndex + len });
            currentIndex += len;
        }
        return map;
    }

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
        return null;
    }

    // Calculate Highlight Ranges (Heavy, Debounced)
    function calculateHighlights() {
        if (!els.editor) return;
        const text = els.editor.innerText; 
        const cleanText = text.replace(/\n$/, ''); 
        
        highlightRanges = [];

        if (state.keywords.length > 0) {
            const nodeMap = createTextNodeMap(els.editor);
            const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
            const matchCase = state.keywordSettings.matchCase;
            const wholeWord = state.keywordSettings.wholeWord;
            const wordCharRegex = /[\p{L}\p{N}_]/u;

            // Simple loop for accuracy
            sortedKws.forEach((kw, index) => {
                if (!kw) return;
                const searchKw = matchCase ? kw : kw.toLowerCase();
                const searchArea = matchCase ? cleanText : cleanText.toLowerCase();
                const color = KW_COLORS_RGBA[index % KW_COLORS_RGBA.length];
                
                let pos = 0;
                while (true) {
                    const foundIdx = searchArea.indexOf(searchKw, pos);
                    if (foundIdx === -1) break;
                    
                    const endIdx = foundIdx + searchKw.length;
                    
                    let isValid = true;
                    if (wholeWord) {
                        const prev = foundIdx > 0 ? cleanText[foundIdx-1] : '';
                        const next = endIdx < cleanText.length ? cleanText[endIdx] : '';
                        if (wordCharRegex.test(prev) || wordCharRegex.test(next)) isValid = false;
                    }

                    if (isValid) {
                        const startLoc = getNodeAndOffset(nodeMap, foundIdx);
                        const endLoc = getNodeAndOffset(nodeMap, endIdx);
                        if (startLoc && endLoc) {
                            try {
                                const range = document.createRange();
                                range.setStart(startLoc.node, startLoc.offset);
                                range.setEnd(endLoc.node, endLoc.offset);
                                highlightRanges.push({ range, color });
                            } catch (e) { /* ignore range errors */ }
                        }
                    }
                    pos = foundIdx + 1;
                }
            });
        }
        
        isCalculated = true;
        requestAnimationFrame(drawHighlights);
    }

    // Draw Function (Fast, on scroll/resize)
    function drawHighlights() {
        if (!isCalculated || !els.editor || !els.canvas) return;

        const width = els.editor.offsetWidth;
        const height = els.editor.offsetHeight; // Use offsetHeight to cover full content
        
        if (els.canvas.width !== width || els.canvas.height !== height) {
            els.canvas.width = width;
            els.canvas.height = height;
        } else {
            ctx.clearRect(0, 0, width, height);
        }

        // Get Editor offset relative to viewport
        // But since we are inside a relative container, we need to correct coordinates.
        // Range.getClientRects() returns viewport coordinates.
        // Container.getBoundingClientRect() returns viewport coordinates.
        // Relative Y = Rect.top - Container.top
        
        const containerRect = els.container.getBoundingClientRect();
        
        highlightRanges.forEach(item => {
            const rects = item.range.getClientRects();
            ctx.fillStyle = item.color;
            
            for (const rect of rects) {
                // Tọa độ tương đối so với container (canvas nằm absolute 0,0 trong container)
                const x = rect.left - containerRect.left;
                const y = rect.top - containerRect.top;
                
                // Chỉ vẽ nếu kích thước hợp lệ
                if (rect.width > 0 && rect.height > 0) {
                     ctx.fillRect(x, y, rect.width, rect.height);
                }
            }
        });
    }

    // === EVENT LISTENERS ===

    // 1. Debounce Input (Fix Lag)
    let inputTimeout;
    if (els.editor) {
        els.editor.addEventListener('input', () => {
            updateWordCount();
            ctx.clearRect(0,0, els.canvas.width, els.canvas.height); // Clear immediately while typing
            clearTimeout(inputTimeout);
            inputTimeout = setTimeout(() => {
                calculateHighlights();
            }, 500); // Chờ 0.5s sau khi dừng gõ mới tính toán highlight
        });

        // 2. Paste Clean Text (Fix Format Error)
        els.editor.addEventListener('paste', (e) => {
            e.preventDefault();
            // Lấy text thuần
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            // Chèn text vào vị trí con trỏ (deprecated but robust for this case)
            document.execCommand('insertText', false, text);
        });
    }
    
    // 3. Scroll Sync (Mượt mà, không cần tính lại range)
    if (els.scroller) {
        els.scroller.addEventListener('scroll', () => {
            // Khi scroll, Range.getClientRects() thay đổi theo viewport -> Cần vẽ lại
            // Tuy nhiên, việc tính Range (calculateHighlights) không cần chạy lại, chỉ cần chạy drawHighlights
            requestAnimationFrame(drawHighlights);
        });
    }
    
    window.addEventListener('resize', () => { calculateHighlights(); });

    // === SETTINGS LOGIC (Khôi phục) ===
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
    }

    function savePairs() {
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(d => {
            pairs.push({ find: d.querySelector('.find').value, replace: d.querySelector('.replace').value });
        });
        state.modes[state.activeMode].pairs = pairs;
        saveState();
    }

    // Attach Events for Buttons
    if (els.matchCaseBtn) els.matchCaseBtn.onclick = () => { state.modes[state.activeMode].matchCase = !state.modes[state.activeMode].matchCase; saveState(); renderModeUI(); };
    if (els.wholeWordBtn) els.wholeWordBtn.onclick = () => { state.modes[state.activeMode].wholeWord = !state.modes[state.activeMode].wholeWord; saveState(); renderModeUI(); };
    if (els.autoCapsBtn) els.autoCapsBtn.onclick = () => { state.modes[state.activeMode].autoCaps = !state.modes[state.activeMode].autoCaps; saveState(); renderModeUI(); };
    
    if (els.modeSelect) els.modeSelect.onchange = () => { state.activeMode = els.modeSelect.value; saveState(); renderModeUI(); };
    if (els.addModeBtn) els.addModeBtn.onclick = () => { const n = prompt('Tên mới:'); if (n && !state.modes[n]) { state.modes[n] = { pairs: [], matchCase:false, wholeWord:false, autoCaps:false }; state.activeMode = n; saveState(); renderModeUI(); } };
    if (els.renameModeBtn) els.renameModeBtn.onclick = () => { const n = prompt('Tên mới:', state.activeMode); if (n && !state.modes[n]) { state.modes[n] = state.modes[state.activeMode]; delete state.modes[state.activeMode]; state.activeMode = n; saveState(); renderModeUI(); } };
    if (els.deleteModeBtn) els.deleteModeBtn.onclick = () => { if (confirm('Xóa?')) { delete state.modes[state.activeMode]; state.activeMode = 'Mặc định'; saveState(); renderModeUI(); } };
    if (els.addPairBtn) els.addPairBtn.onclick = () => { addPairUI(); els.puncList.firstChild.querySelector('input').focus(); };
    if (els.saveSettingsBtn) els.saveSettingsBtn.onclick = () => { savePairs(); notify('Đã lưu tất cả!'); };

    // === REPLACE LOGIC ===
    els.replaceBtn.onclick = () => {
        if (!els.editor) return;
        let text = els.editor.innerText; // Get raw text
        if (!text.trim()) return notify('Editor trống!', 'error');

        const mode = state.modes[state.activeMode];
        let count = 0;

        // 1. Pairs Replace
        mode.pairs.forEach(p => {
            if (!p.find) return;
            const flags = mode.matchCase ? 'g' : 'gi';
            let regex;
            if (mode.wholeWord) {
                regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(p.find)}(?![\\p{L}\\p{N}_])`, flags + 'u');
            } else {
                regex = new RegExp(escapeRegExp(p.find), flags);
            }
            text = text.replace(regex, (m) => {
                count++;
                let r = p.replace;
                if (!mode.matchCase) r = preserveCase(m, r);
                return r;
            });
        });

        // 2. Auto Caps
        if (mode.autoCaps) {
             text = text.replace(/(^|[\.?!\n]\s*)([\p{Ll}])/gmu, (m, sep, char) => sep + char.toUpperCase());
        }

        els.editor.innerText = text; // Update text
        calculateHighlights(); // Recalculate overlay
        updateWordCount();
        notify(count > 0 ? `Đã thay thế ${count} cụm từ.` : 'Hoàn tất.');
    };

    // === COPY KEYWORDS & CSV ===
    if (els.copyKwBtn) els.copyKwBtn.onclick = () => {
        if (!state.keywords.length) return notify('Trống!', 'warning');
        navigator.clipboard.writeText(state.keywords.join(', '));
        notify('Đã copy keywords!');
    };

    if (els.importKwBtn) els.importKwBtn.onclick = () => {
        const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv,.txt';
        inp.onchange = e => {
            const f = e.target.files[0];
            if(!f) return;
            const r = new FileReader();
            r.onload = ev => {
                const lines = ev.target.result.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
                let c = 0;
                lines.forEach(k => { if(!state.keywords.includes(k)){ state.keywords.push(k); c++; }});
                if(c>0) { renderTags(); saveState(); calculateHighlights(); notify(`Thêm ${c} keywords.`); }
            };
            r.readAsText(f);
        };
        inp.click();
    };

    // CSV Import/Export Replace Pairs
    if (els.exportReplaceBtn) els.exportReplaceBtn.onclick = () => {
        let csv = "\uFEFFfind,replace,mode\n";
        Object.keys(state.modes).forEach(m => state.modes[m].pairs.forEach(p => csv += `"${p.find.replace(/"/g,'""')}","${p.replace.replace(/"/g,'""')}","${m}"\n`));
        const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
        const a = document.createElement('a'); a.href=url; a.download='replace_settings.csv'; a.click();
    };

    if (els.importReplaceBtn) els.importReplaceBtn.onclick = () => {
         const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv';
         inp.onchange = e => {
             const f = e.target.files[0];
             if(!f) return;
             const r = new FileReader();
             r.onload = ev => {
                const lines = ev.target.result.split(/\r?\n/);
                let c=0;
                for(let i=1; i<lines.length; i++) {
                    const m = lines[i].match(/^"(.*)","(.*)","(.*)"$/);
                    if (m) {
                        const [_, fi, re, mo] = m;
                        if (!state.modes[mo]) state.modes[mo] = {pairs:[], matchCase:false, wholeWord:false, autoCaps:false};
                        state.modes[mo].pairs.push({find: fi.replace(/""/g,'"'), replace: re.replace(/""/g,'"')});
                        c++;
                    }
                }
                saveState(); renderModeUI(); notify(`Nhập ${c} cặp thay thế.`);
             };
             r.readAsText(f);
         };
         inp.click();
    };

    // Keyword Settings Toggles
    if (els.kwMatchCaseBtn) els.kwMatchCaseBtn.onclick = () => { state.keywordSettings.matchCase = !state.keywordSettings.matchCase; saveState(); updateKwUI(); calculateHighlights(); };
    if (els.kwWholeWordBtn) els.kwWholeWordBtn.onclick = () => { state.keywordSettings.wholeWord = !state.keywordSettings.wholeWord; saveState(); updateKwUI(); calculateHighlights(); };
    function updateKwUI() {
        if (els.kwMatchCaseBtn) updateToggle(els.kwMatchCaseBtn, state.keywordSettings.matchCase);
        if (els.kwWholeWordBtn) updateToggle(els.kwWholeWordBtn, state.keywordSettings.wholeWord);
    }

    // === KEYWORDS UI (Tags) ===
    function addKeyword(val) {
        if (!val.trim()) return;
        const keys = val.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        let changed = false;
        keys.forEach(k => { if (!state.keywords.includes(k)) { state.keywords.push(k); changed = true; }});
        if (changed) { renderTags(); saveState(); calculateHighlights(); }
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
    }

    function renderTags() {
        const html = state.keywords.map(k => `<div class="tag"><span>${escapeHTML(k)}</span><span class="remove-tag" data-kw="${k.replace(/"/g, '&quot;')}">×</span></div>`).join('');
        if (els.sidebarTags) els.sidebarTags.innerHTML = html;
        if (els.fullKwTags) els.fullKwTags.innerHTML = html;
        document.querySelectorAll('.remove-tag').forEach(btn => btn.onclick = (e) => {
            state.keywords = state.keywords.filter(k => k !== e.target.dataset.kw);
            renderTags(); saveState(); calculateHighlights();
        });
    }
    
    function escapeHTML(str) { return str.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[m]); }

    [els.sidebarInput, els.fullKwInput].forEach(inp => { if(inp) {
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(inp.value); } });
        inp.addEventListener('blur', () => addKeyword(inp.value));
    }});

    // Font Config
    function updateFont() {
        if (!els.editor) return;
        els.editor.style.setProperty('font-family', els.fontFamily.value, 'important');
        els.editor.style.setProperty('font-size', els.fontSize.value, 'important');
        setTimeout(calculateHighlights, 100);
    }
    if (els.fontFamily) els.fontFamily.onchange = updateFont;
    if (els.fontSize) els.fontSize.onchange = updateFont;
    
    // Standard Utils
    if (els.clearBtn) els.clearBtn.onclick = () => { els.editor.innerText = ''; updateWordCount(); calculateHighlights(); };
    if (els.refreshBtn) els.refreshBtn.onclick = calculateHighlights;
    if (els.copyBtn) els.copyBtn.onclick = () => { navigator.clipboard.writeText(els.editor.innerText); notify('Đã copy nội dung!'); };
    
    function updateWordCount() {
        if (!els.editor) return;
        const c = els.editor.innerText.trim() ? els.editor.innerText.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${c}`;
    }
    
    // Sidebar Toggle
    function switchTab(tabId) {
        els.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        els.contents.forEach(c => { c.classList.toggle('active', c.id === tabId); c.classList.toggle('hidden', c.id !== tabId); });
        if(els.sidebarToggle) els.sidebarToggle.classList.toggle('hidden', !(tabId === 'main-tab' || tabId === 'settings-tab'));
    }
    els.tabs.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    
    if (els.sidebar && els.sidebarToggle) {
        els.sidebarToggle.onclick = () => {
            state.sidebarOpen = !state.sidebarOpen;
            els.sidebar.classList.toggle('closed', !state.sidebarOpen);
            els.sidebarToggle.querySelector('.icon').textContent = state.sidebarOpen ? '«' : '»';
            saveState();
        };
        els.sidebar.classList.toggle('closed', !state.sidebarOpen);
        els.sidebarToggle.querySelector('.icon').textContent = state.sidebarOpen ? '«' : '»';
    }

    // Init
    renderTags(); renderModeUI(); updateKwUI(); updateFont(); updateWordCount();
    setTimeout(calculateHighlights, 500);
});
