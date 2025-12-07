document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v24_final_patch_fixed'; // Cập nhật key storage
    
    const RANGE_TYPE = {
        REPLACE: 'rep',
        AUTOCAPS: 'cap',
        REPLACE_CAP: 'rep-cap', // Loại mới
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
        // Nếu toàn bộ là chữ hoa
        if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
        // Nếu là viết hoa chữ cái đầu
        if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        }
        return replacement;
    }

    // --- CORE LOGIC: STRING BUILDER REPLACE (FIXED OFFSET V24) ---
    
    /**
     * Thực hiện Replace/AutoCaps và tính toán ranges chính xác trên văn bản MỚI.
     * @param {string} rawText - Văn bản đầu vào.
     * @returns {{text: string, ranges: Array, count: number}}
     */
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
        
        // 2. Linear Pass và Build New String
        let match;
        while (match = regex.exec(rawText)) {
            const start = match.index;
            const end = regex.lastIndex;

            let ruleIndex = match.findIndex((m, i) => i > 0 && m !== undefined) - 1;
            
            if (ruleIndex >= 0) {
                const rule = rules[ruleIndex];
                const matchedText = match[ruleIndex + 1]; 
                
                let replacement = normalizeText(rule.replace || '');

                if (!mode.matchCase) {
                    replacement = preserveCase(matchedText, replacement);
                }

                // Append phần văn bản chưa được xử lý
                processedText += rawText.slice(lastIndex, start);

                // Tính toán range trên CHUỖI MỚI (Offset Accumulation)
                const newStart = processedText.length;
                const newEnd = newStart + replacement.length;

                ranges.push({
                    start: newStart,
                    end: newEnd,
                    type: RANGE_TYPE.REPLACE
                });

                // Append phần thay thế
                processedText += replacement;
                replaceCount++;

                lastIndex = end;
            } else {
                processedText += rawText.slice(lastIndex, end);
                lastIndex = end;
            }
        }

        // Append phần còn lại
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
                    
                    // Kiểm tra xem vị trí này có nằm trong range REPLACE đã tạo trước đó không
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

        ranges.sort((a, b) => a.start - b.start);

        return { text: processedText, ranges, count: replaceCount };
    }
    
    // --- CORE LOGIC: KEYWORD HIGHLIGHT (FIXED OVERLAP V24) ---

    /**
     * Tính toán ranges cho Highlight Keywords. 
     * @param {string} text - Văn bản để tìm kiếm (có thể là văn bản gốc hoặc đã replace).
     * @param {Array} existingRanges - Các ranges đã có (thường là Replace/AutoCaps).
     * @returns {{ranges: Array, count: number}}
     */
    async function performHighlight(text, existingRanges) {
        if (!state.keywords.length) return { ranges: existingRanges, count: 0 };

        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        
        let keywordRanges = [];
        let highlightCount = 0;
        
        // 1. Master Regex Keyword Highlight
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
            const offset = args.at(-2);
            let startOffset = offset;
            
            let matchText = match;
            let matchedKwIndex = -1;

            // Xác định từ khóa nào match
            for (let i = 0; i < sortedKws.length; i++) {
                if (args[i] !== undefined) {
                    matchedKwIndex = i;
                    matchText = args[i]; 
                    
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

        // 2. Xử lý chồng lấn (FIXED: Keywords luôn được thêm, chỉ check chồng lấn giữa các KEYWORD với nhau)
        let finalRanges = [...existingRanges];
        
        for (const kwRange of keywordRanges) {
            let shouldAdd = true;
            
            // Chỉ kiểm tra chồng lấn với các KEYWORD đã thêm
            const existingKwRanges = finalRanges.filter(r => r.type === RANGE_TYPE.KEYWORD);
            
            for (const prevKwRange of existingKwRanges) {
                if (kwRange.start >= prevKwRange.start && kwRange.end <= prevKwRange.end) {
                    // Nếu nằm hoàn toàn bên trong keyword khác (do sắp xếp từ dài đến ngắn) -> bỏ qua
                    shouldAdd = false;
                    break;
                }
            }
            
            if (shouldAdd) {
                finalRanges.push(kwRange);
                highlightCount++;
            }
        }
        
        // Sắp xếp ranges để render: start asc, sau đó ưu tiên type (REPLACE, AUTOCAPS, REPLACE_CAP trước KEYWORD)
        // 1. REPLACE, 2. AUTOCAPS, 3. REPLACE_CAP, 4. KEYWORD
        finalRanges.sort((a, b) => {
             if (a.start !== b.start) return a.start - b.start;
             
             const typeOrder = { 
                 [RANGE_TYPE.REPLACE]: 1, 
                 [RANGE_TYPE.AUTOCAPS]: 2, 
                 [RANGE_TYPE.REPLACE_CAP]: 3, 
                 [RANGE_TYPE.KEYWORD]: 4 
             };
             return typeOrder[a.type] - typeOrder[b.type];
        });

        return { ranges: finalRanges, count: highlightCount };
    }


    // --- CẬP NHẬT HIGHLIGHT VÀ SCROLL SYNC (FIXED VIEWPORT V24) ---
    async function updateHighlight(textToRender, allRanges) {
        if (!els.highlightLayer || !els.editorInput) return;
        
        const finalHTML = buildFinalHTML(textToRender, allRanges);
        els.highlightLayer.innerHTML = finalHTML;
        
        // Đồng bộ scroll TỪ input sang layer (đã fix trong CSS)
        els.highlightLayer.scrollTop = els.editorInput.scrollTop;
        els.highlightLayer.scrollLeft = els.editorInput.scrollLeft;
    }
    
    function buildFinalHTML(text, ranges) {
        if (ranges.length === 0) {
            return escapeHTML(text);
        }

        let html = '';
        let lastEnd = 0;

        // Ranges đã được sắp xếp trong performHighlight
        for (const range of ranges) {
            
            if (range.end <= range.start) continue;
            
            // Xử lý chồng lấn
            if (range.start < lastEnd) {
                // Nếu range hiện tại là KEYWORD, và nó bắt đầu trước lastEnd
                if (range.type === RANGE_TYPE.KEYWORD) {
                    // Nếu keyword nằm hoàn toàn trong vùng đã render bởi REPLACE/CAPS, 
                    // ta chỉ cần điều chỉnh điểm bắt đầu để nó không bị trùng lặp HTML, 
                    // nhưng vẫn cho phép nó highlight LÊN trên (do thứ tự render type).
                    if (range.end <= lastEnd) continue; // Bỏ qua nếu đã render qua điểm kết thúc
                    range.start = lastEnd; // Bắt đầu render từ điểm cuối của highlight trước đó
                } else {
                    // Đối với REPLACE/CAPS/REP_CAP, nếu nó bắt đầu trước lastEnd, 
                    // ta coi như vùng đó đã được highlight bởi một type ưu tiên cao hơn (nếu có)
                    // Hoặc chỉ render phần còn lại.
                     range.start = lastEnd;
                     if (range.start >= range.end) continue;
                }
            }
            
            // Thêm văn bản thuần trước range
            html += escapeHTML(text.substring(lastEnd, range.start));

            let className = '';
            if (range.type === RANGE_TYPE.REPLACE) {
                className = 'hl-yellow'; // Vàng: Thay thế
            } else if (range.type === RANGE_TYPE.AUTOCAPS) {
                className = 'hl-blue'; // Xanh dương: AutoCaps
            } else if (range.type === RANGE_TYPE.REPLACE_CAP) {
                className = 'hl-orange-dark'; // FIX V24: Cam đậm: Replace + AutoCaps
            } else if (range.type === RANGE_TYPE.KEYWORD && range.color !== undefined) {
                className = `keyword ${KW_COLORS[range.color % KW_COLORS.length]}`; // Keywords
            }

            // Thêm span highlight
            html += `<span class="${className}">${escapeHTML(text.substring(range.start, range.end))}</span>`;
            
            lastEnd = range.end;
        }

        // Thêm phần văn bản còn lại
        html += escapeHTML(text.substring(lastEnd));
        
        return html;
    }


    // === CHỨC NĂNG CHÍNH (PIPELINE) ===
    
    // 1. Luồng Search & Highlight (Chỉ đọc)
    async function performSearchHighlight() {
        // ... (Logic giữ nguyên)
        if (!els.editorInput) return notify('Lỗi Editor!', 'error');

        const textToSearch = els.editorInput.value; 
        if (!textToSearch.trim()) {
            if (els.highlightLayer) els.highlightLayer.innerHTML = '';
            return notify('Editor trống!', 'warning');
        }

        const originalTextBtn = els.searchBtn.textContent;
        els.searchBtn.textContent = 'Đang tính toán...';
        els.searchBtn.disabled = true;

        try {
            // Chỉ chạy performHighlight trên text gốc, BỎ QUA REPLACE/AUTOCAPS ranges.
            const highlightResult = await performHighlight(textToSearch, []); 
            
            // Render trên TEXT GỐC (textToSearch)
            await updateHighlight(textToSearch, highlightResult.ranges);
            
            // Đặt lại văn bản editor về văn bản gốc (vì đây là Search mode)
            els.editorInput.value = textToSearch; 

            
            const totalHighlights = highlightResult.count;
            if (totalHighlights > 0) notify(`Đã tìm thấy ${totalHighlights} từ khóa.`);
            else notify('Không tìm thấy từ khóa nào.', 'warning');

        } catch (e) {
            console.error(e);
            notify('Lỗi Search Highlight: ' + e.message, 'error');
        } finally {
            els.searchBtn.textContent = originalTextBtn;
            els.searchBtn.disabled = false;
        }
    }
    
    // 2. Luồng Replace & Highlight (Ghi đè)
    async function performReplaceAll() {
        // ... (Logic giữ nguyên)
        if (!els.editorInput) return notify('Lỗi Editor!', 'error');

        let rawText = els.editorInput.value; 
        if (!rawText.trim()) return notify('Editor trống!', 'error');

        const originalTextBtn = els.replaceBtn.textContent;
        els.replaceBtn.textContent = 'Đang xử lý Replace...';
        els.replaceBtn.disabled = true;

        try {
            // 1. Thực hiện Replace và Auto-Caps (Tạo newText và ranges chuẩn)
            const replaceResult = await performReplaceAndGetRanges(rawText);
            const plainTextAfterReplace = replaceResult.text;
            let ranges = replaceResult.ranges; // Bao gồm REPLACE + AUTOCAPS + REPLACE_CAP ranges
            const replaceCount = replaceResult.count;
            
            // 2. CẬP NHẬT EDITOR VỚI VĂN BẢN MỚI
            els.editorInput.value = plainTextAfterReplace; 
            
            els.replaceBtn.textContent = 'Đang xử lý Highlight...';
            
            // 3. Tính toán Highlight Keywords TRÊN VĂN BẢN MỚI
            const highlightResult = await performHighlight(plainTextAfterReplace, ranges); 
            
            // 4. Render Highlight trên văn bản mới
            await updateHighlight(plainTextAfterReplace, highlightResult.ranges);
            
            updateWordCount();
            
            if (replaceCount > 0) notify(`Thay thế ${replaceCount} cụm từ!`);
            else if (state.modes[state.activeMode].autoCaps) notify('Đã chạy Auto Caps!');
            else notify('Không tìm thấy gì để thay thế.', 'warning');

        } catch (e) {
            console.error(e);
            notify('Lỗi Replace All: ' + e.message, 'error');
        } finally {
            els.replaceBtn.textContent = originalTextBtn;
            els.replaceBtn.disabled = false;
        }
    }


    // === UI SYNCHRONIZATION (V24 - Đảm bảo fix viewport) ===

    function syncStyles() {
        if (!els.editorInput || !els.highlightLayer) return;

        const family = els.fontFamily.value;
        const size = els.fontSize.value;
        
        els.editorInput.style.fontFamily = family;
        els.editorInput.style.fontSize = size;
        els.highlightLayer.style.fontFamily = family;
        els.highlightLayer.style.fontSize = size;

        state.fontFamily = family;
        state.fontSize = size;
        saveState();
    }

    function updateFont() {
        syncStyles();
    }
    
    if (els.editorInput && els.highlightLayer) {
        // SỬ DỤNG SỰ KIỆN SCROLL ĐỂ ĐỒNG BỘ VIEWPORT (Fixed)
        els.editorInput.addEventListener('scroll', () => {
            els.highlightLayer.scrollTop = els.editorInput.scrollTop;
            els.highlightLayer.scrollLeft = els.editorInput.scrollLeft;
        });
    }
    
    function updateWordCount() {
        if (!els.editorInput || !els.wordCount) return;
        
        const txt = els.editorInput.value || ''; 
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
    }
    
    // === MODE & SETTINGS UI (Các hàm cũ) ===
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
    
    function renderTags(keywords, container) {
        if (!container) return;
        container.innerHTML = keywords.map((kw, index) => {
            const colorClass = KW_COLORS[index % KW_COLORS.length];
            return `
                <div class="tag ${colorClass.replace('hl-', 'kw-')}">
                    <span>${escapeHTML(kw)}</span>
                    <span class="remove-tag" data-keyword="${escapeHTML(kw)}">×</span>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.remove-tag').forEach(btn => {
            btn.onclick = (e) => {
                const keywordToRemove = e.target.dataset.keyword;
                removeKeyword(keywordToRemove);
                performSearchHighlight(); 
            };
        });
    }

    /**
     * FIX: Đảm bảo trim, reset input và gọi updateKwUI/highlight
     */
    function addKeyword(val) {
        if (!val) return;
        
        const newKws = val.split(/[,\n]/)
            .map(k => k.trim())
            .filter(k => k && !state.keywords.includes(k));
            
        if (newKws.length > 0) {
            state.keywords = state.keywords.concat(newKws);
            updateKwUI();            // Cập nhật sidebar + fullKwTags
            notify(`Đã thêm ${newKws.length} từ khóa.`);
            performSearchHighlight(); // Highlight ngay
        }
        
        // Reset inputs sau khi xử lý
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
    }

    function removeKeyword(keyword) {
        state.keywords = state.keywords.filter(k => k !== keyword);
        updateKwUI();
        notify(`Đã xóa từ khóa: ${keyword}.`);
        performSearchHighlight(); 
    }
    
    // --- TAB & SIDEBAR LOGIC (Các hàm cũ) ---
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
        
        if (els.sidebar) {
            els.sidebar.classList.toggle('closed', !state.sidebarOpen);
            const iconSpan = els.sidebarToggle.querySelector('.icon');
            if (iconSpan) {
                iconSpan.textContent = state.sidebarOpen ? '»' : '«';
            }
        }
        
        saveState();
    }
    
    // === EVENT LISTENERS (Các hàm cũ) ===
    
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
    if (els.sidebarToggle) {
        els.sidebarToggle.onclick = toggleSidebar;
        // Khởi tạo icon
        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon';
        iconSpan.textContent = state.sidebarOpen ? '»' : '«';
        els.sidebarToggle.innerHTML = '';
        els.sidebarToggle.appendChild(iconSpan);
    }
    
    // Sidebar Input
    if (els.sidebarInput) {
        els.sidebarInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addKeyword(els.sidebarInput.value);
            }
        });
    }

    // Full Keywords Input
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
                const value = els.fullKwInput.value.slice(0, -1); // Lấy giá trị trước dấu phẩy
                if (value.trim().length > 0) {
                     addKeyword(value);
                } else {
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

        if (els.fontFamily) els.fontFamily.value = state.fontFamily;
        if (els.fontSize) els.fontSize.value = state.fontSize;
        
        updateFont(); 
        updateWordCount();
        renderModeUI(); 
        updateKwUI();   
        
        switchTab('main-tab');
        performSearchHighlight(); // Highlight keyword ngay khi load
    }
    
    init();
});
