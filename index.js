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

    // === RANGE MANAGEMENT ===
    
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
                        matchText = args[i]; 
                        
                        // FIX LỖI #1: Tính toán startOffset chuẩn khi có WholeWord
                        if(mode.wholeWord) {
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
                
                if (matchedRule) {
                    replaceCount++;
                    replacement = normalizeText(matchedRule.replace || '');
                    
                    if (!mode.matchCase) {
                        replacement = preserveCase(matchText, replacement);
                    }
                    
                    // Push range để highlight, sử dụng độ dài của replacement
                    ranges.push({ 
                        start: startOffset, 
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
                    matchText = args[i]; 
                    
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
            let shouldAdd = true;
            
            for (const existingRange of existingRanges) {
                // Check chồng lấn với Replace/AutoCaps Ranges
                if (
                    kwRange.start < existingRange.end && 
                    kwRange.end > existingRange.start &&
                    existingRange.type !== RANGE_TYPE.KEYWORD // Chỉ quan tâm đến Replace/AutoCaps
                ) {
                    // FIX LỖI #3: Keyword được phép chồng lên Replace/AutoCaps.
                    // Không cần làm gì, shouldAdd vẫn là true, tiếp tục kiểm tra.
                }
            }
            
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
        
        finalRanges.sort((a, b) => a.start - b.start || b.end - a.end);

        return { ranges: finalRanges, count: highlightCount };
    }

    async function updateHighlight(textToRender, allRanges) {
        if (!els.highlightLayer || !els.editorInput) return;
        
        const finalHTML = buildFinalHTML(textToRender, allRanges);
        els.highlightLayer.innerHTML = finalHTML;
    }

    // === CHỨC NĂNG CHÍNH ===
    async function performSearchHighlight() {
        if (!els.editorInput) return notify('Lỗi Editor!', 'error');

        const rawText = els.editorInput.value; 
        if (!rawText.trim()) {
            if (els.highlightLayer) els.highlightLayer.innerHTML = '';
            return notify('Editor trống!', 'warning');
        }

        const originalTextBtn = els.searchBtn.textContent;
        els.searchBtn.textContent = 'Đang tính toán...';
        els.searchBtn.disabled = true;

        try {
            // 1. Chạy Replace/AutoCaps (Không thay đổi text, chỉ lấy ranges)
            const mode = state.modes[state.activeMode];
            const rules = mode.pairs.filter(p => p.find && p.find.trim());
            
            // Chạy qua một phiên bản tạm của replace để lấy ranges
            const tempResult = await performReplace(rawText);
            
            // 2. Chạy Highlight Keywords trên văn bản gốc
            const highlightResult = await performHighlight(rawText, tempResult.ranges); 
            
            // 3. Render
            await updateHighlight(rawText, highlightResult.ranges);
            
            const totalHighlights = tempResult.count + highlightResult.count;
            if (totalHighlights > 0) notify(`Đã tìm thấy ${totalHighlights} vị trí cần chú ý.`);
            else notify('Không tìm thấy từ khóa nào hoặc cặp thay thế nào.', 'warning');

        } catch (e) {
            console.error(e);
            notify('Lỗi: ' + e.message, 'error');
        } finally {
            els.searchBtn.textContent = originalTextBtn;
            els.searchBtn.disabled = false;
        }
    }

    async function performReplaceAll() {
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
    
    // Đồng bộ cuộn
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
        
        // FIX LỖI #4: Không xóa highlightLayer khi chỉ update word count
        // els.highlightLayer.innerHTML = ''; // Đã XÓA HOÀN TOÀN
    }
    
    // === MODE & SETTINGS UI (FIXED: Đã thêm lại các hàm bị thiếu) ===
    function updateToggle(btn, isActive, label) {
        btn.classList.toggle('active', isActive);
        btn.textContent = `${label}: ${isActive ? 'Bật' : 'Tắt'}`;
    }

    function renderModeUI() {
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

    function renderPairs(pairs) {
        if (!els.puncList || !els.emptyState) return;
        els.puncList.innerHTML = '';
        if (pairs.length === 0) {
            els.emptyState.classList.remove('hidden');
        } else {
            els.emptyState.classList.add('hidden');
            pairs.forEach((pair, index) => addPairUI(pair.find, pair.replace, index, false));
        }
    }

    function addPairUI(f = '', r = '', index = -1, isNew = true) {
        if (!els.puncList) return;
        const div = document.createElement('div');
        div.className = 'pair-row';
        div.dataset.index = index;
        
        div.innerHTML = `
            <input type="text" class="pair-input find-input" value="${escapeHTML(f)}" placeholder="Cụm từ tìm kiếm">
            <input type="text" class="pair-input replace-input" value="${escapeHTML(r)}" placeholder="Cụm từ thay thế">
            <button class="delete-btn">Xóa</button>
        `;
        
        div.querySelector('.delete-btn').onclick = (e) => {
            const row = e.target.closest('.pair-row');
            const mode = state.modes[state.activeMode];
            // Lọc theo index hiện tại (chỉ cần savePairs sẽ render lại đúng index mới)
            mode.pairs.splice(parseInt(row.dataset.index), 1); 
            savePairs(true); 
            notify('Đã xóa cặp thay thế.');
        };
        
        if (isNew) {
             els.puncList.prepend(div);
        } else {
             els.puncList.appendChild(div);
        }
    }
    
    function savePairs(reRender = false) {
        const mode = state.modes[state.activeMode];
        const newPairs = [];
        if(els.puncList) {
            // Lấy lại dữ liệu từ DOM theo thứ tự hiển thị
            els.puncList.querySelectorAll('.pair-row').forEach(row => {
                const find = row.querySelector('.find-input').value.trim();
                const replace = row.querySelector('.replace-input').value.trim();
                if (find) { 
                    newPairs.push({ find, replace });
                }
            });
        }
        mode.pairs = newPairs;
        saveState();
        if(reRender) renderModeUI();
    }
    
    // --- KEYWORD UI ---
    function updateKwUI() {
        const kwSettings = state.keywordSettings;
        if(els.kwMatchCaseBtn) updateToggle(els.kwMatchCaseBtn, kwSettings.matchCase, 'Match Case');
        if(els.kwWholeWordBtn) updateToggle(els.kwWholeWordBtn, kwSettings.wholeWord, 'Whole Word');
        
        renderTags(state.keywords, els.sidebarTags, true);
        renderTags(state.keywords, els.fullKwTags, false);
        saveState();
    }
    
    function renderTags(keywords, container, isSidebar) {
        if (!container) return;
        container.innerHTML = keywords.map((kw, index) => {
            const colorClass = KW_COLORS[index % KW_COLORS.length];
            return `
                <div class="tag ${isSidebar ? 'sidebar-tag' : ''} ${colorClass.replace('hl-', 'kw-')}">
                    <span>${escapeHTML(kw)}</span>
                    <span class="remove-tag" data-keyword="${escapeHTML(kw)}">×</span>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.remove-tag').forEach(btn => {
            btn.onclick = (e) => {
                const keywordToRemove = e.target.dataset.keyword;
                removeKeyword(keywordToRemove);
                performSearchHighlight(); // Update highlight sau khi xóa
            };
        });
    }

    function addKeyword(val) {
        if (!val) return;
        
        // FIX LỖI #5: Xử lý input từ phẩy hoặc Enter
        const newKws = val.split(/[,\n]/)
            .map(k => k.trim())
            .filter(k => k && !state.keywords.includes(k));
            
        if (newKws.length > 0) {
            state.keywords = state.keywords.concat(newKws);
            updateKwUI();
            notify(`Đã thêm ${newKws.length} từ khóa.`);
            // Sau khi thêm, cập nhật highlight
            performSearchHighlight();
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
    
    // --- TAB & SIDEBAR LOGIC ---
    function switchTab(tabId) {
        els.tabs.forEach(btn => btn.classList.remove('active'));
        els.contents.forEach(content => content.classList.remove('active'));
        
        const activeTab = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        const activeContent = document.getElementById(tabId);
        
        if (activeTab) activeTab.classList.add('active');
        if (activeContent) activeContent.classList.add('active');
        
        if (tabId === 'settings-tab') renderModeUI();
        if (tabId === 'display-tab') updateKwUI();
    }

    function toggleSidebar() {
        state.sidebarOpen = !state.sidebarOpen;
        if (els.sidebar) els.sidebar.classList.toggle('closed', !state.sidebarOpen);
        if (els.sidebarToggle) els.sidebarToggle.classList.toggle('open', state.sidebarOpen);
        saveState();
    }
    
    // === EVENT LISTENERS ===
    
    // Tab Switching
    els.tabs.forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab);
    });
    
    // Editor Events
    if (els.editorInput) {
        els.editorInput.addEventListener('input', updateWordCount);
    }
    
    // Action Buttons
    if (els.searchBtn) els.searchBtn.onclick = performSearchHighlight;
    if (els.replaceBtn) els.replaceBtn.onclick = performReplaceAll;
    
    if (els.clearBtn) {
        els.clearBtn.onclick = () => {
            if (confirm('Bạn có chắc chắn muốn xóa trắng toàn bộ nội dung?')) {
                if (els.editorInput) els.editorInput.value = '';
                if (els.highlightLayer) els.highlightLayer.innerHTML = '';
                updateWordCount();
                notify('Đã xóa trắng nội dung.');
            }
        };
    }
    
    if (els.copyBtn) {
        els.copyBtn.onclick = () => {
            if (!els.editorInput || !els.editorInput.value) return notify('Không có nội dung để copy.', 'warning');
            
            navigator.clipboard.writeText(els.editorInput.value)
                .then(() => {
                    notify('Đã copy nội dung thành công và xóa trắng editor.');
                    els.editorInput.value = '';
                    if (els.highlightLayer) els.highlightLayer.innerHTML = '';
                    updateWordCount();
                })
                .catch(err => {
                    console.error('Lỗi khi copy: ', err);
                    notify('Lỗi khi copy. Vui lòng thử lại.', 'error');
                });
        };
    }
    
    // Sidebar/Keyword Actions
    if (els.sidebarToggle) els.sidebarToggle.onclick = toggleSidebar;
    
    if (els.sidebarInput) {
        els.sidebarInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addKeyword(els.sidebarInput.value);
            }
        });
    }

    if (els.fullKwInput) {
        els.fullKwInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { 
                e.preventDefault();
                addKeyword(els.fullKwInput.value);
            }
        });
        els.fullKwInput.addEventListener('keyup', (e) => {
             if (e.key === ',') {
                e.preventDefault();
                const value = els.fullKwInput.value.slice(0, -1);
                if (value.trim().length > 0) {
                     addKeyword(value);
                } else {
                     // Xóa dấu phẩy nếu không có từ khóa
                     els.fullKwInput.value = '';
                }
            }
        });
    }

    if (els.kwMatchCaseBtn) {
        els.kwMatchCaseBtn.onclick = () => {
            state.keywordSettings.matchCase = !state.keywordSettings.matchCase;
            updateKwUI();
            performSearchHighlight();
        };
    }

    if (els.kwWholeWordBtn) {
        els.kwWholeWordBtn.onclick = () => {
            state.keywordSettings.wholeWord = !state.keywordSettings.wholeWord;
            updateKwUI();
            performSearchHighlight();
        };
    }

    // Font Controls
    if (els.fontFamily) els.fontFamily.onchange = updateFont;
    if (els.fontSize) els.fontSize.onchange = updateFont;
    
    // Settings Actions
    if (els.modeSelect) {
        els.modeSelect.onchange = () => {
            state.activeMode = els.modeSelect.value;
            renderModeUI();
            saveState();
        };
    }

    if (els.addPairBtn) {
        els.addPairBtn.onclick = () => addPairUI('', '', state.modes[state.activeMode].pairs.length, true);
    }
    
    if (els.saveSettingsBtn) {
        els.saveSettingsBtn.onclick = () => {
            savePairs(true);
            notify('Đã lưu cài đặt cặp thay thế.');
        };
    }

    // Toggle Settings
    function setupToggle(btn, propName, label) {
        if (btn) {
            btn.onclick = () => {
                const mode = state.modes[state.activeMode];
                mode[propName] = !mode[propName];
                updateToggle(btn, mode[propName], label);
                saveState();
            };
        }
    }
    setupToggle(els.matchCaseBtn, 'matchCase', 'Match Case');
    setupToggle(els.wholeWordBtn, 'wholeWord', 'Whole Word');
    setupToggle(els.autoCapsBtn, 'autoCaps', 'Auto Caps');

    // Init
    function init() {
        if (els.sidebar) els.sidebar.classList.toggle('closed', !state.sidebarOpen);
        if (els.sidebarToggle) els.sidebarToggle.classList.toggle('open', state.sidebarOpen);

        if (els.fontFamily) els.fontFamily.value = state.fontFamily;
        if (els.fontSize) els.fontSize.value = state.fontSize;
        
        updateFont();
        updateWordCount();
        renderModeUI(); 
        updateKwUI();   
        
        switchTab('main-tab');
    }
    
    init();
});
