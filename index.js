document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v25_final_fix'; 
    
    const RANGE_TYPE = {
        REPLACE: 'rep',
        AUTOCAPS: 'cap',
        REPLACE_CAP: 'rep-cap',
        KEYWORD: 'kw'
    };
    
    const KW_COLORS = ['hl-pink', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red']; 
    
    const defaultState = {
        keywords: [],
        keywordSettings: { matchCase: false, wholeWord: false },
        activeMode: 'Mặc định',
        sidebarOpen: false, 
        fontFamily: "'Montserrat', sans-serif",
        fontSize: '16px',
        modes: {
            'Mặc định': { 
                pairs: [
                    { find: 'tô', replace: 'tôi' },
                    { find: 'ko', replace: 'không' }
                ], 
                matchCase: false, wholeWord: true, autoCaps: true 
            }
        }
    };
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes[state.activeMode]) state.activeMode = Object.keys(state.modes)[0] || 'Mặc định';
    if (!state.keywordSettings) state.keywordSettings = { matchCase: false, wholeWord: false };
    if (!state.fontFamily) state.fontFamily = defaultState.fontFamily;
    if (!state.fontSize) state.fontSize = defaultState.fontSize;

    // === DOM ELEMENTS ===
    const els = {
        tabs: document.querySelectorAll('.tab-button'),
        contents: document.querySelectorAll('.tab-content'),
        
        editorWrapper: document.getElementById('editor-wrapper'),
        backdrop: document.getElementById('backdrop'),
        editorInput: document.getElementById('editor-input'), 
        highlightLayer: document.getElementById('highlight-layer'),

        wordCount: document.getElementById('word-count-display'),
        
        searchBtn: document.getElementById('search'),
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
        
        copyKwBtn: document.getElementById('copy-kw-csv'), 
        
        notify: document.getElementById('notification-container')
    };
    
    // === UTILS ===
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
    
    // Improved normalizeText: Cover more unicode smart quotes
    function normalizeText(text) {
        if (!text) return '';
        return text
            .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD\u201F\uFF02]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07\u201B]/g, "'")
            .replace(/\u00A0/g, ' '); 
    }
    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[m]);
    }
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    function preserveCase(original, replacement) {
        if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
        if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        }
        return replacement;
    }

    // === CORE LOGIC: REPLACE AND GET RANGES (V25 Fixed) ===
    
    async function performReplaceAndGetRanges(rawText) {
        const mode = state.modes[state.activeMode];
        const rules = mode.pairs.filter(p => p.find && p.find.trim());

        let processedText = "";
        let lastIndex = 0;
        let ranges = [];
        let replaceCount = 0;
        
        // 1. Prepare Regex cho Replace
        const patterns = rules.map(rule => {
            const find = escapeRegExp(normalizeText(rule.find));
            const p = mode.wholeWord 
                ? `(?<![\\p{L}\\p{N}_])(${find})(?![\\p{L}\\p{N}_])`
                : `(${find})`;
            return p;
        });

        const flags = mode.matchCase ? "gu" : "giu";
        const regex = new RegExp(patterns.join("|"), flags);
        
        // 2. Linear Pass with Fixed Group Matching
        let match;
        while (match = regex.exec(rawText)) {
            const start = match.index;
            const end = regex.lastIndex;

            // FIX: Thay thế findIndex (không tồn tại trên match array) bằng loop
            let ruleIndex = -1;
            let matchedText = '';
            
            // match[0] là toàn bộ chuỗi khớp, các group bắt đầu từ index 1
            for (let i = 1; i < match.length; i++) {
                if (match[i] !== undefined) {
                    ruleIndex = i - 1; // Vì rules map 1:1 với capturing groups
                    matchedText = match[i];
                    break;
                }
            }
            
            if (ruleIndex >= 0 && ruleIndex < rules.length) {
                const rule = rules[ruleIndex];
                let replacement = normalizeText(rule.replace || '');

                if (!mode.matchCase) {
                    replacement = preserveCase(matchedText, replacement);
                }

                // Append text before match
                processedText += rawText.slice(lastIndex, start);

                // Calculate range on NEW text
                const newStart = processedText.length;
                const newEnd = newStart + replacement.length;

                ranges.push({
                    start: newStart,
                    end: newEnd,
                    type: RANGE_TYPE.REPLACE
                });

                processedText += replacement;
                replaceCount++;
                lastIndex = end;
            } else {
                // Fallback: copy as is if strange match
                processedText += rawText.slice(lastIndex, end);
                lastIndex = end;
            }
        }

        processedText += rawText.slice(lastIndex);
        
        // 3. Auto Caps (Chạy trên văn bản đã replace)
        if (mode.autoCaps) {
            const autoCapsRegex = /(^|[\.?!\n]\s*)([\p{Ll}])/gmu;
            let capsRanges = [];
            let autoCapsCount = 0;

            const finalProcessedText = processedText.replace(autoCapsRegex, (match, prefix, char, offset) => {
                const upperChar = char.toUpperCase();
                
                if (char !== upperChar) { 
                    const charStart = offset + prefix.length;
                    
                    // Check overlap for Color Priority
                    const isWithinReplace = ranges.some(r => 
                        r.type === RANGE_TYPE.REPLACE && charStart >= r.start && charStart < r.end
                    );
                    
                    const type = isWithinReplace ? RANGE_TYPE.REPLACE_CAP : RANGE_TYPE.AUTOCAPS;

                    capsRanges.push({ 
                        start: charStart, 
                        end: charStart + 1, 
                        type: type
                    });
                    autoCapsCount++;
                    return prefix + upperChar;
                }
                return match;
            });
            
            processedText = finalProcessedText;
            ranges = ranges.concat(capsRanges);
            replaceCount += autoCapsCount;
        }

        return { text: processedText, ranges, count: replaceCount };
    }
    
    // --- CORE LOGIC: KEYWORD HIGHLIGHT (V25 Fixed Offset) ---

    async function performHighlight(text, existingRanges) {
        if (!state.keywords.length) return { ranges: existingRanges, count: 0 };

        // Sort keywords longest first to prevent sub-match issues
        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        
        let keywordRanges = [];
        let highlightCount = 0;
        
        const patterns = sortedKws.map(kw => {
            const pattern = escapeRegExp(normalizeText(kw));
            return wholeWord 
                ? `(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])` 
                : `(${pattern})`; 
        });

        const flags = matchCase ? 'gu' : 'giu';
        const masterRegex = new RegExp(patterns.join("|"), flags);
        
        let match;
        while (match = masterRegex.exec(text)) {
            // FIX Offset Logic: use match.index directly from exec loop
            let matchedKwIndex = -1;
            let matchedText = '';

            for (let i = 1; i < match.length; i++) {
                if (match[i] !== undefined) {
                    matchedKwIndex = i - 1;
                    matchedText = match[i];
                    break;
                }
            }
            
            if (matchedKwIndex !== -1) {
                // Calculate start based on match index + position of group in match
                // (Usually group is at index 0 of match if simple, but with boundaries it varies)
                // Use built-in index which points to start of match
                const startOffset = match.index + match[0].indexOf(matchedText);
                const endOffset = startOffset + matchedText.length;
                
                keywordRanges.push({ 
                    start: startOffset, 
                    end: endOffset, 
                    type: RANGE_TYPE.KEYWORD, 
                    color: matchedKwIndex 
                });
            }
        }

        // 2. Xử lý chồng lấn
        let finalRanges = [...existingRanges];
        
        for (const kwRange of keywordRanges) {
            let shouldAdd = true;
            
            // Check overlap with other keywords
            const existingKwRanges = finalRanges.filter(r => r.type === RANGE_TYPE.KEYWORD);
            
            for (const prevKwRange of existingKwRanges) {
                if (kwRange.start >= prevKwRange.start && kwRange.end <= prevKwRange.end) {
                    shouldAdd = false;
                    break;
                }
            }
            
            if (shouldAdd) {
                finalRanges.push(kwRange);
                highlightCount++;
            }
        }
        
        // FIX Sort Order: REPLACE -> AUTOCAPS -> REPLACECAP -> KEYWORD (Last renders on top if using span)
        // But for linear rendering, we just need start order. Overlaps handled in buildFinalHTML
        finalRanges.sort((a, b) => {
             if (a.start !== b.start) return a.start - b.start;
             // If start same, longer first
             return (b.end - b.start) - (a.end - a.start);
        });

        return { ranges: finalRanges, count: highlightCount };
    }

    // --- RENDER & SYNC ---

    async function updateHighlight(textToRender, allRanges) {
        if (!els.highlightLayer || !els.editorInput) return;
        
        const finalHTML = buildFinalHTML(textToRender, allRanges);
        els.highlightLayer.innerHTML = finalHTML;
        syncScroll();
    }
    
    function buildFinalHTML(text, ranges) {
        if (ranges.length === 0) return escapeHTML(text);

        let html = '';
        let lastEnd = 0;

        for (const range of ranges) {
            if (range.end <= range.start) continue;
            
            // FIX Overlap Rendering Logic
            // If current range starts before lastEnd, it's an overlap
            if (range.start < lastEnd) {
                // If completely inside, ignore (already rendered by wider range)
                if (range.end <= lastEnd) continue;
                
                // If partial overlap, start from lastEnd
                range.start = lastEnd;
            }
            
            html += escapeHTML(text.substring(lastEnd, range.start));

            let className = '';
            if (range.type === RANGE_TYPE.REPLACE) className = 'hl-yellow';
            else if (range.type === RANGE_TYPE.AUTOCAPS) className = 'hl-blue';
            else if (range.type === RANGE_TYPE.REPLACE_CAP) className = 'hl-orange-dark';
            else if (range.type === RANGE_TYPE.KEYWORD) className = `keyword ${KW_COLORS[range.color % KW_COLORS.length]}`;

            html += `<span class="${className}">${escapeHTML(text.substring(range.start, range.end))}</span>`;
            lastEnd = range.end;
        }

        html += escapeHTML(text.substring(lastEnd));
        return html;
    }

    function syncScroll() {
        if (els.backdrop && els.editorInput) {
            els.backdrop.scrollTop = els.editorInput.scrollTop;
            els.backdrop.scrollLeft = els.editorInput.scrollLeft;
        }
    }

    function syncStyles() {
        if (!els.editorInput || !els.highlightLayer) return;
        const style = window.getComputedStyle(els.editorInput);
        const props = ['font-family', 'font-size', 'line-height', 'padding', 'white-space', 'word-wrap', 'overflow-wrap', 'text-align'];
        props.forEach(p => els.highlightLayer.style[p] = style.getPropertyValue(p));
        
        // Also sync width/height
        els.highlightLayer.style.width = style.width;
        els.highlightLayer.style.minHeight = style.height;
    }

    // === MAIN ACTIONS ===

    async function performSearchHighlight() {
        const text = els.editorInput.value;
        if (!text.trim()) {
            if(els.highlightLayer) els.highlightLayer.innerHTML = '';
            return notify('Editor trống!', 'warning');
        }
        
        els.searchBtn.disabled = true;
        els.searchBtn.textContent = 'Đang xử lý...';

        try {
            // Get potential replace/caps ranges on ORIGINAL text
            const temp = await performReplaceAndGetRanges(text);
            // Combine with keywords
            const res = await performHighlight(text, temp.ranges); // Use original text for ranges
            
            // NOTE: Replace ranges might be slightly off if used on original text 
            // without actual replacement, but for 'Search' only it's acceptable approximation.
            // The user requested 'Highlight Keywords' shouldn't replace text.
            
            // To be 100% accurate, Search usually just highlights KEYWORDS.
            // But if you want to show what WOULD be replaced:
            // We use the ranges returned from logic that ran on text.
            
            // V25 Decision: Highlight Keywords button only highlights Keywords to avoid confusion
            // OR shows all. Let's show all but ON original text.
            // Since `performReplaceAndGetRanges` returns text-transformed ranges, mapping back to original is hard.
            // SIMPLIFIED: Just highlight Keywords for "Highlight Keywords" button.
            
            const kwOnlyRes = await performHighlight(text, []);
            await updateHighlight(text, kwOnlyRes.ranges);
            
            if (kwOnlyRes.count > 0) notify(`Tìm thấy ${kwOnlyRes.count} từ khóa.`);
            else notify('Không tìm thấy từ khóa.', 'warning');

        } catch (e) {
            console.error(e);
        } finally {
            els.searchBtn.disabled = false;
            els.searchBtn.textContent = 'Tính toán lại Highlight';
        }
    }

    async function performReplaceAll() {
        const text = els.editorInput.value;
        if (!text.trim()) return notify('Editor trống!', 'warning');

        els.replaceBtn.disabled = true;
        try {
            const res = await performReplaceAndGetRanges(text);
            els.editorInput.value = res.text; // Update text
            
            const hlRes = await performHighlight(res.text, res.ranges);
            await updateHighlight(res.text, hlRes.ranges);
            
            updateWordCount();
            notify('Đã thay thế hoàn tất!');
        } catch (e) {
            console.error(e);
        } finally {
            els.replaceBtn.disabled = false;
        }
    }

    // === KEYWORD & UI LOGIC ===

    function addKeyword(val) {
        if (!val) return;
        // Fix split logic: handle comma and newline
        const kws = val.split(/[,\n]+/).map(k => k.trim()).filter(k => k && !state.keywords.includes(k));
        
        if (kws.length) {
            state.keywords = [...state.keywords, ...kws];
            updateKwUI();
            notify(`Đã thêm ${kws.length} từ khóa.`);
            // Auto update highlight if not in replace mode
            // performSearchHighlight(); 
        }
        
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
    }

    function removeKeyword(kw) {
        state.keywords = state.keywords.filter(k => k !== kw);
        updateKwUI();
    }

    function updateKwUI() {
        // Render tags
        [els.sidebarTags, els.fullKwTags].forEach(container => {
            if(!container) return;
            container.innerHTML = state.keywords.map((kw, i) => `
                <div class="tag ${KW_COLORS[i % KW_COLORS.length].replace('hl-', 'kw-')}">
                    <span>${escapeHTML(kw)}</span>
                    <span class="remove-tag" onclick="window.removeKw('${escapeHTML(kw)}')">×</span>
                </div>
            `).join('');
        });
        
        // Re-attach listeners manually or use global function for remove
        document.querySelectorAll('.remove-tag').forEach(btn => {
            btn.onclick = (e) => {
               const text = e.target.previousElementSibling.textContent;
               removeKeyword(text);
            }
        });
        
        saveState();
    }

    function updateWordCount() {
        const txt = els.editorInput.value || '';
        els.wordCount.textContent = `Words: ${txt.trim() ? txt.trim().split(/\s+/).length : 0}`;
    }

    // Event Listeners
    if (els.sidebarInput) {
        els.sidebarInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') addKeyword(els.sidebarInput.value);
        });
    }
    if (els.fullKwInput) {
        els.fullKwInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent newline
                addKeyword(els.fullKwInput.value);
            }
        });
        els.fullKwInput.addEventListener('input', e => {
            // Check for comma
            if (e.data === ',') {
                const val = els.fullKwInput.value;
                if (val.includes(',')) {
                    // Split by comma
                    addKeyword(val); 
                }
            }
        });
    }

    if (els.editorInput) {
        els.editorInput.addEventListener('scroll', syncScroll);
        els.editorInput.addEventListener('input', () => {
            updateWordCount();
            // Clear highlight on input to avoid mismatch
            if(els.highlightLayer) els.highlightLayer.innerHTML = '';
        });
        // Resize observer
        new ResizeObserver(() => syncStyles()).observe(els.editorInput);
    }

    // Toggle Sidebar
    if (els.sidebarToggle) {
        els.sidebarToggle.onclick = () => {
            state.sidebarOpen = !state.sidebarOpen;
            els.sidebar.classList.toggle('closed', !state.sidebarOpen);
            saveState();
        };
    }

    // Copy Keywords
    if (els.copyKwBtn) {
        els.copyKwBtn.onclick = () => {
            if (!state.keywords.length) return notify('Không có từ khóa', 'warning');
            navigator.clipboard.writeText(state.keywords.join(', '));
            notify('Đã copy danh sách từ khóa!');
        };
    }

    // Init UI
    function init() {
        if (state.sidebarOpen) els.sidebar.classList.remove('closed');
        
        // Restore fonts
        if(state.fontFamily) {
            els.fontFamily.value = state.fontFamily;
            els.fontSize.value = state.fontSize;
        }
        
        syncStyles();
        updateKwUI();
        
        // Mode & Settings UI (Simplified for brevity, ensure you include renderModeUI logic from prev versions)
        renderModeUI();
        
        // Font change listeners
        els.fontFamily.addEventListener('change', () => {
            state.fontFamily = els.fontFamily.value;
            syncStyles();
        });
        els.fontSize.addEventListener('change', () => {
            state.fontSize = els.fontSize.value;
            syncStyles();
        });
    }

    // --- Missing Functions from previous parts (renderModeUI, etc) ---
    function renderModeUI() {
        const mode = state.modes[state.activeMode];
        if(!mode) return;
        const keys = Object.keys(state.modes);
        els.modeSelect.innerHTML = keys.map(k => `<option value="${k}" ${k===state.activeMode?'selected':''}>${k}</option>`).join('');
        
        // Update toggles
        updateToggle(els.matchCaseBtn, mode.matchCase, 'Match Case');
        updateToggle(els.wholeWordBtn, mode.wholeWord, 'Whole Word');
        updateToggle(els.autoCapsBtn, mode.autoCaps, 'Auto Caps');
        
        renderPairs(mode.pairs);
    }
    
    function updateToggle(btn, val, txt) {
        btn.textContent = `${txt}: ${val ? 'Bật' : 'Tắt'}`;
        btn.classList.toggle('active', val);
        btn.onclick = () => {
            state.modes[state.activeMode][btn.id.replace('btn','').replace(/-([a-z])/g, g=>g[1].toUpperCase()).replace('matchCase','matchCase').replace('wholeWord','wholeWord').replace('autoCaps','autoCaps')] = !val; 
            // Simplified logic: map btn id to prop. Better to use explicit mapping:
            const prop = btn.id.includes('match') ? 'matchCase' : btn.id.includes('whole') ? 'wholeWord' : 'autoCaps';
            state.modes[state.activeMode][prop] = !state.modes[state.activeMode][prop];
            saveState();
            renderModeUI();
        }
    }

    function renderPairs(pairs) {
        els.puncList.innerHTML = '';
        if(!pairs.length) els.emptyState.classList.remove('hidden');
        else els.emptyState.classList.add('hidden');
        
        pairs.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'pair-row';
            div.innerHTML = `
                <input class="pair-input find" value="${escapeHTML(p.find)}">
                <input class="pair-input replace" value="${escapeHTML(p.replace)}">
                <button class="delete-btn">Xóa</button>
            `;
            div.querySelector('.delete-btn').onclick = () => {
                state.modes[state.activeMode].pairs.splice(i, 1);
                saveState(); renderModeUI();
            };
            div.querySelectorAll('input').forEach(inp => inp.onchange = () => savePairsFromUI());
            els.puncList.appendChild(div);
        });
    }

    function savePairsFromUI() {
        const pairs = [];
        els.puncList.querySelectorAll('.pair-row').forEach(row => {
            pairs.push({
                find: row.querySelector('.find').value,
                replace: row.querySelector('.replace').value
            });
        });
        state.modes[state.activeMode].pairs = pairs;
        saveState();
    }
    
    if(els.addPairBtn) els.addPairBtn.onclick = () => {
        state.modes[state.activeMode].pairs.push({find: '', replace: ''});
        saveState(); renderModeUI();
    };

    init();
});
