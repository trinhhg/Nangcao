document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v23_optimized';
    
    // Range Types (FIX 3: Thay thế PUA)
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
        
        importKwBtn: document.getElementById('import-kw-csv'),
        exportKwBtn: document.getElementById('export-kw-csv'),
        
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

    // === RANGE MANAGEMENT (FIX 3: Range-based Rendering) ===
    
    function buildFinalHTML(text, ranges) {
        if (ranges.length === 0) {
            return escapeHTML(text);
        }

        let html = '';
        let lastEnd = 0;

        for (const range of ranges) {
            html += escapeHTML(text.substring(lastEnd, range.start));

            let className = '';
            if (range.type === RANGE_TYPE.REPLACE) {
                className = 'hl-yellow';
            } else if (range.type === RANGE_TYPE.AUTOCAPS) {
                className = 'hl-blue';
            } else if (range.type === RANGE_TYPE.KEYWORD && range.color !== undefined) {
                className = `keyword ${KW_COLORS[range.color % KW_COLORS.length]}`;
            }

            html += `<span class="${className}">${escapeHTML(text.substring(range.start, range.end))}</span>`;
            
            lastEnd = range.end;
        }

        html += escapeHTML(text.substring(lastEnd));
        
        return html;
    }

    // === XỬ LÝ TEXT (FIX 2: Master Regex) ===

    async function performReplace(rawText) {
        const mode = state.modes[state.activeMode];
        const rules = mode.pairs.filter(p => p.find && p.find.trim());
        
        let processedText = rawText;
        let replaceCount = 0;
        let ranges = [];
        
        // --- 1. Master Regex Replace ---
        if (rules.length > 0) {
            const patterns = [];
            
            rules.forEach((rule) => {
                const pattern = escapeRegExp(normalizeText(rule.find));
                const fullPattern = mode.wholeWord 
                    ? `(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])` 
                    : `(${pattern})`; 
                patterns.push(fullPattern);
            });

            const flags = mode.matchCase ? 'gu' : 'giu';
            const masterRegex = new RegExp(patterns.join("|"), flags);
            
            processedText = processedText.replace(masterRegex, (match, ...args) => {
                let matchText = match;
                let startOffset = args[args.length - 2];
                let replacement = '';
                let matchedRule = null;
                
                for (let i = 0; i < rules.length; i++) {
                    if (args[i] !== undefined) {
                        matchedRule = rules[i];
                        matchText = args[i]; 
                        
                        if(mode.wholeWord) {
                            const matchIndex = match.indexOf(matchText);
                            if (matchIndex !== -1) {
                                startOffset += matchIndex;
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
            let startOffset = args[args.length - 2];
            let matchText = match;
            let matchedKwIndex = -1;

            for (let i = 0; i < sortedKws.length; i++) {
                if (args[i] !== undefined) {
                    matchedKwIndex = i;
                    matchText = args[i]; 
                    
                    if(wholeWord) {
                        const matchIndex = match.indexOf(matchText);
                        if (matchIndex !== -1) {
                            startOffset += matchIndex;
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

        // --- 2. Xử lý chồng lấn (Ưu tiên Replace/Caps hơn Keyword) ---
        let finalRanges = [...existingRanges];
        
        for (const kwRange of keywordRanges) {
            let isOverlappingWithExisting = false;
            
            for (const existingRange of existingRanges) {
                if (kwRange.start < existingRange.end && kwRange.end > existingRange.start) {
                    isOverlappingWithExisting = true;
                    break; 
                }
            }
            
            if (!isOverlappingWithExisting) {
                // Kiểm tra chồng lấn giữa các Keyword ranges (chỉ thêm nếu không nằm hoàn toàn trong)
                let shouldAdd = true;
                for (let i = finalRanges.length - 1; i >= existingRanges.length; i--) {
                    const prevKwRange = finalRanges[i];
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
            
            els.editorInput.value = plainTextAfterReplace;
            
            els.replaceBtn.textContent = 'Đang xử lý Highlight...';
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

    // === UI SYNCHRONIZATION (FIX 1: Scroll Transform) ===
    
    // 1. Đồng bộ cuộn (Scroll)
    if (els.editorInput && els.highlightLayer) {
        els.editorInput.addEventListener('scroll', () => {
            const top = els.editorInput.scrollTop;
            const left = els.editorInput.scrollLeft;

            els.highlightLayer.style.transform = `translate(${-left}px, ${-top}px)`;
        });
    }
    
    // 2. Đồng bộ Font
    function updateFont() {
        if (!els.editorInput || !els.highlightLayer || !els.fontFamily || !els.fontSize) return;
        
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
    
    // 3. Xử lý Input và Word Count
    function updateWordCount() {
        if (!els.editorInput || !els.wordCount) return;
        const txt = els.editorInput.value || '';
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
        
        if (els.highlightLayer) els.highlightLayer.innerHTML = ''; 
    }
    
    // --- MODE & SETTINGS UI (Phục hồi logic UI) ---
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
        // notify('Đã lưu Cài đặt Thay thế.'); // Bỏ notify để không bị spam khi reRender
    }
    
    // --- KEYWORD UI (Phục hồi logic UI) ---
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
        container.innerHTML = '';
        keywords.forEach((keyword) => {
            const tag = document.createElement('div');
            tag.className = `tag ${isSidebar ? 'sidebar-tag' : 'settings-tag'}`;
            tag.textContent = keyword;
            
            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-tag';
            removeBtn.textContent = 'x';
            removeBtn.onclick = () => removeKeyword(keyword);
            
            tag.appendChild(removeBtn);
            container.appendChild(tag);
        });
    }

    function addKeyword(val) {
        if (!val) return;
        const newKws = val.split(/[,\n]/).map(k => k.trim()).filter(k => k && !state.keywords.includes(k));
        if (newKws.length > 0) {
            state.keywords = state.keywords.concat(newKws);
            updateKwUI();
            notify(`Đã thêm ${newKws.length} từ khóa.`);
        }
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
    }

    function removeKeyword(keyword) {
        state.keywords = state.keywords.filter(k => k !== keyword);
        updateKwUI();
        notify(`Đã xóa từ khóa: ${keyword}.`);
    }

    // --- TAB & SIDEBAR LOGIC (Phục hồi logic UI) ---
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
        if(els.sidebar) els.sidebar.classList.toggle('closed', !state.sidebarOpen);
        if(els.sidebarToggle) els.sidebarToggle.classList.toggle('open', state.sidebarOpen);
        saveState();
    }

    // === EVENT LISTENERS ===
    
    // UI Events
    els.tabs.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    if (els.sidebarToggle) els.sidebarToggle.onclick = toggleSidebar;
    if (els.editorInput) els.editorInput.addEventListener('input', updateWordCount);
    
    // Editor Actions
    if (els.searchBtn) { /* Logic đã có ở trên */ }
    if (els.clearBtn) els.clearBtn.onclick = () => { 
        if (els.editorInput) els.editorInput.value = ''; 
        if (els.highlightLayer) els.highlightLayer.innerHTML = '';
        updateWordCount(); 
        notify('Đã xóa trắng Editor.');
    };
    if (els.copyBtn) els.copyBtn.onclick = () => { 
        if (!els.editorInput || !els.editorInput.value.trim()) return notify('Trống!', 'error'); 
        navigator.clipboard.writeText(els.editorInput.value); 
        notify('Đã copy vào clipboard!');
        els.editorInput.value = ''; 
        if (els.highlightLayer) els.highlightLayer.innerHTML = '';
        updateWordCount();
    };
    if (els.replaceBtn) els.replaceBtn.onclick = performReplaceAll;

    // Settings Events
    if (els.modeSelect) els.modeSelect.onchange = (e) => {
        state.activeMode = e.target.value;
        saveState();
        renderModeUI();
    };
    if (els.addPairBtn) els.addPairBtn.onclick = () => addPairUI('', '', -1, true); // Thêm mới
    if (els.saveSettingsBtn) els.saveSettingsBtn.onclick = () => {
        savePairs();
        notify('Đã lưu Cài đặt Thay thế.');
    };
    
    // Toggle Buttons
    [
        { btn: els.matchCaseBtn, key: 'matchCase', label: 'Match Case' },
        { btn: els.wholeWordBtn, key: 'wholeWord', label: 'Whole Word' },
        { btn: els.autoCapsBtn, key: 'autoCaps', label: 'Auto Caps' }
    ].forEach(({ btn, key, label }) => {
        if (btn) btn.onclick = () => {
            const mode = state.modes[state.activeMode];
            mode[key] = !mode[key];
            updateToggle(btn, mode[key], label);
            saveState();
        };
    });
    
    // Keyword Settings Events
    if (els.fontFamily) els.fontFamily.onchange = updateFont;
    if (els.fontSize) els.fontSize.onchange = updateFont;
    
    [
        { btn: els.kwMatchCaseBtn, key: 'matchCase', label: 'Match Case' },
        { btn: els.kwWholeWordBtn, key: 'wholeWord', label: 'Whole Word' }
    ].forEach(({ btn, key, label }) => {
        if (btn) btn.onclick = () => {
            state.keywordSettings[key] = !state.keywordSettings[key];
            updateToggle(btn, state.keywordSettings[key], label);
            updateKwUI();
        };
    });

    if (els.fullKwInput) els.fullKwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addKeyword(els.fullKwInput.value);
        }
    });
    
    // --- INIT ---
    function init() {
        // Khôi phục trạng thái Sidebar
        if (state.sidebarOpen) els.sidebar.classList.remove('closed');
        if (els.sidebarToggle) els.sidebarToggle.classList.toggle('open', state.sidebarOpen);

        // Đặt lại giá trị font từ state
        if (els.fontFamily) els.fontFamily.value = state.fontFamily;
        if (els.fontSize) els.fontSize.value = state.fontSize;
        
        updateFont(); 
        updateWordCount();
        renderModeUI(); // Khởi tạo tab Settings
        updateKwUI();   // Khởi tạo tab Keywords
        
        // Đảm bảo tab Main Content hiển thị
        switchTab('main-tab');
    }
    
    init();
});
