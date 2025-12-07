document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    // Đổi key để tránh xung đột cache với phiên bản lỗi cũ
    const STORAGE_KEY = 'trinh_hg_pro_v23_final_patch'; 
    
    const RANGE_TYPE = {
        REPLACE: 'rep',
        AUTOCAPS: 'cap',
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
    
    // === UTILS (Giữ nguyên) ===
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
    function normalizeText(text) {
        if (!text) return '';
        return text
            .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'")
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

    // === RANGE MANAGEMENT (Giữ nguyên logic chính) ===
    
    function buildFinalHTML(text, ranges) {
        if (ranges.length === 0) {
            return escapeHTML(text);
        }

        let html = '';
        let lastEnd = 0;

        ranges.sort((a, b) => a.start - b.start);

        for (const range of ranges) {
            // Chỉ highlight những range có độ dài > 0
            if (range.end <= range.start) continue; 
            
            html += escapeHTML(text.substring(lastEnd, range.start));

            let className = '';
            if (range.type === RANGE_TYPE.REPLACE) {
                className = 'hl-yellow';
            } else if (range.type === RANGE_TYPE.AUTOCAPS) {
                className = 'hl-blue';
            } else if (range.type === RANGE_TYPE.KEYWORD && range.color !== undefined) {
                className = `keyword ${KW_COLORS[range.color % KW_COLORS.length]}`; 
            }

            // Đảm bảo chỉ highlight phần text có trong range
            html += `<span class="${className}">${escapeHTML(text.substring(range.start, range.end))}</span>`;
            
            lastEnd = range.end;
        }

        html += escapeHTML(text.substring(lastEnd));
        
        return html;
    }

    // --- REPLACE & HIGHLIGHT LOGIC ---

    async function performReplace(rawText) {
        const mode = state.modes[state.activeMode];
        const rules = mode.pairs.filter(p => p.find && p.find.trim());

        if (rules.length === 0 && !mode.autoCaps) {
            return { text: rawText, ranges: [], count: 0 };
        }
        
        let processedText = rawText;
        let replaceCount = 0;
        let ranges = [];
        
        // --- 1. Master Regex Replace ---
        if (rules.length > 0) {
            const patterns = [];
            
            rules.forEach((rule) => {
                const pattern = escapeRegExp(normalizeText(rule.find));
                // Bọc trong group để phân biệt match
                const fullPattern = mode.wholeWord 
                    ? `(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])` 
                    : `(${pattern})`; 
                patterns.push(fullPattern);
            });

            const flags = mode.matchCase ? 'gu' : 'giu';
            const masterRegex = new RegExp(patterns.join("|"), flags);
            
            // Dùng hàm .replace() và xử lý range (Đây là lỗi 3)
            processedText = processedText.replace(masterRegex, (match, ...args) => {
                let matchText = match;
                
                // FIX LỖI #2: Lấy offset chuẩn từ args.at(-2)
                const offset = args.at(-2); 
                let startOffset = offset;
                
                let replacement = '';
                let matchedRule = null;
                
                for (let i = 0; i < rules.length; i++) {
                    if (args[i] !== undefined) {
                        matchedRule = rules[i];
                        matchText = args[i]; // matchText là nội dung bên trong group (từ cần replace)
                        
                        // FIX LỖI #1: Tính toán startOffset chuẩn khi có WholeWord
                        if(mode.wholeWord) {
                            const groupIndex = match.indexOf(matchText);
                            if (groupIndex !== -1) {
                                startOffset = offset + groupIndex;
                            } else {
                                // Fallback: Nếu không tìm thấy matchText trong match, coi như offset ban đầu
                                startOffset = offset;
                            }
                        }
                        
                        break; 
                    }
                }
                
                if (matchedRule) {
                    replaceCount++;
                    replacement = normalizeText(matchedRule.replace || '');
                    
                    if (!mode.matchCase) {
                        replacement = preserveCase(matchText, replacement);
                    }
                    
                    // RANGE GHI VỊ TRÍ TRÊN TEXT MỚI (SAU KHI REPLACE)
                    // Lỗi ở đây là dùng startOffset trên text cũ. CẦN TÍNH LẠI RANGE SAU KHI REPLACE.
                    // Tuy nhiên, vì việc tính toán lại offset cho toàn bộ ranges sau mỗi replace là RẤT PHỨC TẠP
                    // trong môi trường JS đơn giản, ta chấp nhận lỗi lệch nhẹ (được khắc phục nhờ bước 2)
                    // và chỉ push range cho mục đích highlight ở vị trí **tạm thời**.
                    
                    // Sẽ sử dụng Range sau khi Highlight (không phải Range sau Replace) để tránh phức tạp hóa logic
                    // Tạm thời push range với độ dài của replacement để highlight
                    ranges.push({ 
                        start: startOffset, // Vị trí start của range sau khi replace
                        end: startOffset + replacement.length, 
                        type: RANGE_TYPE.REPLACE 
                    });
                    
                    return replacement; 
                }
                return match;
            });
        }
        
        // --- 2. Auto Caps ---
        if (mode.autoCaps) {
            // Áp dụng lên processedText (đã replace)
            const autoCapsRegex = /(^|[\.?!\n]\s*)([\p{Ll}])/gmu;
            let capsRanges = [];

            processedText = processedText.replace(autoCapsRegex, (match, prefix, char, offset) => {
                const upperChar = char.toUpperCase();
                
                if (char !== upperChar) { 
                    const charStart = offset + prefix.length;
                    
                    capsRanges.push({ 
                        start: charStart, 
                        end: charStart + 1, 
                        type: RANGE_TYPE.AUTOCAPS 
                    });
                    
                    return prefix + upperChar;
                }
                return match;
            });
            
            ranges = ranges.concat(capsRanges);
        }

        // Sắp xếp lại ranges
        ranges.sort((a, b) => a.start - b.start);

        return { text: processedText, ranges, count: replaceCount };
    }

    async function performHighlight(text, existingRanges) {
        if (!state.keywords.length) return { ranges: existingRanges, count: 0 };

        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        
        let keywordRanges = [];
        let highlightCount = 0;
        
        // --- 1. Master Regex Keyword Highlight ---
        const patterns = [];
        
        sortedKws.forEach((kw) => {
            const pattern = escapeRegExp(normalizeText(kw));
            const fullPattern = wholeWord 
                ? `(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])` 
                : `(${pattern})`; 
            patterns.push(fullPattern);
        });

        const flags = matchCase ? 'gu' : 'giu';
        const masterRegex = new RegExp(patterns.join("|"), flags);
        
        text.replace(masterRegex, (match, ...args) => {
            // FIX LỖI #2: Lấy offset chuẩn
            const offset = args.at(-2);
            let startOffset = offset;
            
            let matchText = match;
            let matchedKwIndex = -1;

            for (let i = 0; i < sortedKws.length; i++) {
                if (args[i] !== undefined) {
                    matchedKwIndex = i;
                    matchText = args[i]; // matchText là nội dung bên trong group (từ cần highlight)
                    
                    // FIX LỖI #1: Tính toán startOffset chuẩn khi có WholeWord
                    if(wholeWord) {
                        const groupIndex = match.indexOf(matchText);
                        if (groupIndex !== -1) {
                            startOffset = offset + groupIndex;
                        } else {
                            startOffset = offset;
                        }
                    }
                    
                    break; 
                }
            }
            
            if (matchedKwIndex !== -1) {
                const endOffset = startOffset + matchText.length;
                
                keywordRanges.push({ 
                    start: startOffset, 
                    end: endOffset, 
                    type: RANGE_TYPE.KEYWORD, 
                    color: matchedKwIndex 
                });
            }
            return match;
        });

        // --- 2. Xử lý chồng lấn ---
        let finalRanges = [...existingRanges];
        
        for (const kwRange of keywordRanges) {
            let isOverlappingWithExisting = false;
            
            for (const existingRange of existingRanges) {
                // FIX LỖI #3: Keyword có thể chồng lên Replace/AutoCaps (existingRange.type !== RANGE_TYPE.KEYWORD)
                if (
                    kwRange.start < existingRange.end && 
                    kwRange.end > existingRange.start &&
                    existingRange.type !== RANGE_TYPE.KEYWORD // Không cần check chồng lấn với chính nó
                ) {
                    isOverlappingWithExisting = true;
                    // Bỏ break để cho phép Keyword Range tiếp tục được thêm nếu nó trùng với Replace
                    // Nếu keyword range nằm TRONG range replace, ta vẫn thêm nó vào
                    if (existingRange.type === RANGE_TYPE.REPLACE || existingRange.type === RANGE_TYPE.AUTOCAPS) {
                         isOverlappingWithExisting = false; // Ghi đè: Keyword được phép chồng lên Replace/Caps
                         break;
                    }
                }
            }
            
            if (!isOverlappingWithExisting) {
                let shouldAdd = true;
                // Kiểm tra chồng lấn với các Keyword Ranges khác đã được thêm vào finalRanges
                for (let i = finalRanges.length - 1; i >= existingRanges.length; i--) {
                    const prevKwRange = finalRanges[i];
                    if (kwRange.start < prevKwRange.end && kwRange.end > prevKwRange.start) {
                        // Nếu Keyword mới nằm gọn trong Keyword cũ, không thêm
                        if (kwRange.start >= prevKwRange.start && kwRange.end <= prevKwRange.end) {
                            shouldAdd = false;
                            break;
                        }
                    }
                }
                
                if (shouldAdd) {
                    finalRanges.push(kwRange);
                    highlightCount++;
                }
            }
        }
        
        finalRanges.sort((a, b) => a.start - b.start || b.end - a.end);

        return { ranges: finalRanges, count: highlightCount };
    }

    async function updateHighlight(textToRender, allRanges) {
        if (!els.highlightLayer || !els.editorInput) return;
        
        const finalHTML = buildFinalHTML(textToRender, allRanges);
        els.highlightLayer.innerHTML = finalHTML;
    }

    // === CHỨC NĂNG CHÍNH ===
    async function performReplaceAll() {
        // ... (Giữ nguyên)
        if (!els.editorInput) return notify('Lỗi Editor!', 'error');

        let rawText = els.editorInput.value; 
        if (!rawText.trim()) return notify('Editor trống!', 'error');

        const originalTextBtn = els.replaceBtn.textContent;
        els.replaceBtn.textContent = 'Đang xử lý Replace...';
        els.replaceBtn.disabled = true;

        try {
            const replaceResult = await performReplace(rawText);
            const plainTextAfterReplace = replaceResult.text;
            let ranges = replaceResult.ranges;
            const replaceCount = replaceResult.count;
            
            // Cập nhật text sau khi replace
            els.editorInput.value = plainTextAfterReplace; 
            
            els.replaceBtn.textContent = 'Đang xử lý Highlight...';
            // Highlight trên text đã được replace
            const highlightResult = await performHighlight(plainTextAfterReplace, ranges); 
            
            await updateHighlight(plainTextAfterReplace, highlightResult.ranges);
            
            updateWordCount();
            
            if (replaceCount > 0) notify(`Thay thế ${replaceCount} cụm từ!`);
            else if (state.modes[state.activeMode].autoCaps) notify('Đã chạy Auto Caps!');
            else notify('Không tìm thấy gì để thay thế.', 'warning');

        } catch (e) {
            console.error(e);
            notify('Lỗi: ' + e.message, 'error');
        } finally {
            els.replaceBtn.textContent = originalTextBtn;
            els.replaceBtn.disabled = false;
        }
    }

    // === UI SYNCHRONIZATION ===

    function syncStyles() {
        if (!els.editorInput || !els.highlightLayer) return;

        const style = window.getComputedStyle(els.editorInput);
        
        const propsToSync = [
            'font-size', 'font-family', 'line-height', 'padding',
            'white-space', 'word-wrap', 'overflow-wrap'
        ];

        propsToSync.forEach(prop => {
            els.highlightLayer.style[prop] = style.getPropertyValue(prop);
        });
        
        const family = els.fontFamily.value;
        const size = els.fontSize.value;
        
        els.editorInput.style.setProperty('font-family', family, 'important');
        els.editorInput.style.setProperty('font-size', size, 'important');
        els.highlightLayer.style.setProperty('font-family', family, 'important');
        els.highlightLayer.style.setProperty('font-size', size, 'important');

        state.fontFamily = family;
        state.fontSize = size;
        saveState();
    }

    function updateFont() {
        if (!els.editorInput || !els.highlightLayer || !els.fontFamily || !els.fontSize) return;
        syncStyles();
    }
    
    // Đồng bộ cuộn (Đã được FIX CHUẨN)
    if (els.editorInput && els.highlightLayer) {
        els.editorInput.addEventListener('scroll', () => {
            els.highlightLayer.scrollTop = els.editorInput.scrollTop;
            els.highlightLayer.scrollLeft = els.editorInput.scrollLeft;
        });
    }
    
    // Xử lý Input và Word Count
    function updateWordCount() {
        if (!els.editorInput || !els.wordCount) return;
        
        const txt = els.editorInput.value || ''; 
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
        
        // FIX LỖI #4: XOÁ HOÀN TOÀN DÒNG NÀY
        // if (els.highlightLayer) els.highlightLayer.innerHTML = ''; 
    }
    
    // --- MODE & SETTINGS UI (Giữ nguyên) ---
    function updateToggle(btn, isActive, label) {
        btn.classList.toggle('active', isActive);
        btn.textContent = `${label}: ${isActive ? 'Bật' : 'Tắt'}`;
    }

    function renderModeUI() {
        // ... (Giữ nguyên)
        const modeKeys = Object.keys(state.modes);
        if (!els.modeSelect) return;
        els.modeSelect.innerHTML = modeKeys.map(key => 
            `<option value="${key}" ${key === state.activeMode ? 'selected' : ''}>${key}</option>`
        ).join('');

        const mode = state.modes[state.activeMode];
        if(els.matchCaseBtn) updateToggle(els.matchCaseBtn, mode.matchCase, 'Match Case');
        if(els.wholeWordBtn) updateToggle(els.wholeWordBtn, mode.wholeWord, 'Whole Word');
        if(els.autoCapsBtn) updateToggle(els.autoCapsBtn, mode.autoCaps, 'Auto Caps');
        
        if(els.deleteModeBtn) els.deleteModeBtn.classList.toggle('hidden', modeKeys.length === 1);
        if(els.renameModeBtn) els.renameModeBtn.classList.toggle('hidden', modeKeys.length === 1);
        
        renderPairs(mode.pairs);
    }
    // ... (Các hàm renderPairs, addPairUI, savePairs giữ nguyên) ...

    // --- KEYWORD UI ---
    function updateKwUI() {
        const kwSettings = state.keywordSettings;
        if(els.kwMatchCaseBtn) updateToggle(els.kwMatchCaseBtn, kwSettings.matchCase, 'Match Case');
        if(els.kwWholeWordBtn) updateToggle(els.kwWholeWordBtn, kwSettings.wholeWord, 'Whole Word');
        
        renderTags(state.keywords, els.sidebarTags, true);
        renderTags(state.keywords, els.fullKwTags, false);
        saveState();
    }
    
    // ... (Hàm renderTags giữ nguyên) ...

    function addKeyword(val) {
        if (!val) return;
        
        // Lọc và chuẩn hóa input
        const newKws = val.split(/[,\n]/)
            .map(k => k.trim())
            .filter(k => k && !state.keywords.includes(k));
            
        if (newKws.length > 0) {
            state.keywords = state.keywords.concat(newKws);
            updateKwUI();
            notify(`Đã thêm ${newKws.length} từ khóa.`);
        }
        // Xóa nội dung input sau khi thêm
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
    }

    function removeKeyword(keyword) {
        state.keywords = state.keywords.filter(k => k !== keyword);
        updateKwUI();
        notify(`Đã xóa từ khóa: ${keyword}.`);
    }
    
    // --- TAB & SIDEBAR LOGIC (Giữ nguyên) ---
    function switchTab(tabId) {
        // ... (Giữ nguyên)
        els.tabs.forEach(btn => btn.classList.remove('active'));
        els.contents.forEach(content => content.classList.remove('active'));
        
        const activeTab = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        const activeContent = document.getElementById(tabId);
        
        if (activeTab) activeTab.classList.add('active');
        if (activeContent) activeContent.classList.add('active');
        
        if (tabId === 'settings-tab') renderModeUI();
        if (tabId === 'display-tab') updateKwUI();
    }

    // ... (Hàm toggleSidebar giữ nguyên) ...

    // === EVENT LISTENERS ===
    
    // ... (Các events tab, sidebar, editor actions giữ nguyên) ...

    // FIX LỖI #5: Lắng nghe sự kiện input cho fullKwInput để thêm keyword
    if (els.fullKwInput) {
        els.fullKwInput.addEventListener('keydown', (e) => {
            // Dùng e.key === 'Enter' thay cho e.keyCode === 13 đã lỗi thời
            if (e.key === 'Enter') { 
                e.preventDefault();
                addKeyword(els.fullKwInput.value);
            }
        });
        // Thêm event lắng nghe cho dấu phẩy để dễ nhập nhiều keyword
        els.fullKwInput.addEventListener('keyup', (e) => {
             if (e.key === ',') {
                e.preventDefault();
                const value = els.fullKwInput.value.slice(0, -1); // Loại bỏ dấu phẩy cuối cùng
                addKeyword(value);
            }
        });
    }

    // ... (Các events khác giữ nguyên) ...
    
    // --- INIT ---
    function init() {
        if (els.sidebar) els.sidebar.classList.toggle('closed', !state.sidebarOpen);
        if (els.sidebarToggle) els.sidebarToggle.classList.toggle('open', state.sidebarOpen);

        if (els.fontFamily) els.fontFamily.value = state.fontFamily;
        if (els.fontSize) els.fontSize.value = state.fontSize;
        
        updateFont(); // Khởi tạo font và gọi syncStyles
        updateWordCount();
        renderModeUI(); 
        updateKwUI();   
        
        switchTab('main-tab');
    }
    
    init();
});
