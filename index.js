document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v23_final_patch_fixed'; 
    
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
        // Fix: Thêm dấu gạch chéo ngược cho dấu gạch chéo
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

    // === CORE LOGIC: STRING BUILDER REPLACE (FIXED) ===
    
    async function performReplaceAndGetRanges(rawText) {
        const mode = state.modes[state.activeMode];
        const rules = mode.pairs.filter(p => p.find && p.find.trim());

        let processedText = "";
        let lastIndex = 0;
        let ranges = [];
        let replaceCount = 0;
        
        // 1. Prepare Regex
        const patterns = rules.map(rule => {
            const find = escapeRegExp(normalizeText(rule.find));
            // Sử dụng boundary cho wholeWord
            const p = mode.wholeWord 
                ? `(?<![\\p{L}\\p{N}_])(${find})(?![\\p{L}\\p{N}_])`
                : `(${find})`;
            return p;
        });

        const flags = mode.matchCase ? "gu" : "giu";
        const regex = new RegExp(patterns.join("|"), flags);
        
        // 2. Linear Pass and Build New String (FIXED LOGIC)
        let match;
        while (match = regex.exec(rawText)) {
            const start = match.index;
            const end = regex.lastIndex;

            // Xác định rule match
            let ruleIndex = match.findIndex((m, i) => i > 0 && m !== undefined) - 1;
            
            if (ruleIndex >= 0) {
                const rule = rules[ruleIndex];
                const matchedText = match[ruleIndex + 1]; // Text thực sự match
                
                let replacement = normalizeText(rule.replace || '');

                if (!mode.matchCase) {
                    replacement = preserveCase(matchedText, replacement);
                }

                // Append phần văn bản chưa được xử lý
                processedText += rawText.slice(lastIndex, start);

                // Tính toán range trên CHUỖI MỚI
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
                // Xảy ra nếu match[0] bị bao quanh bởi boundary, nhưng nhóm con match[1..n] không tìm thấy
                // Trường hợp này không nên xảy ra với cấu trúc regex hiện tại, nhưng để an toàn.
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
                    
                    capsRanges.push({ 
                        start: charStart, 
                        end: charStart + 1, 
                        type: RANGE_TYPE.AUTOCAPS 
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
    
    // --- CORE LOGIC: KEYWORD HIGHLIGHT ---

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

        // 2. Xử lý chồng lấn
        // Không xóa ranges REPALCE/AUTOCAPS. Chỉ xử lý chồng lấn giữa các KEYWORD với nhau.
        let finalRanges = [...existingRanges];
        
        for (const kwRange of keywordRanges) {
            let isOverlappedWithExisting = false;
            
            // Chỉ kiểm tra chồng lấn với các ranges đã có (REPLACE/AUTOCAPS)
            for (const existingRange of existingRanges) {
                if (kwRange.start < existingRange.end && kwRange.end > existingRange.start) {
                     isOverlappedWithExisting = true;
                     break; 
                }
            }

            if (isOverlappedWithExisting) continue;

            // Kiểm tra chồng lấn với các KEYWORD đã thêm
            let shouldAdd = true;
            for (let i = finalRanges.length - 1; i >= existingRanges.length; i--) {
                const prevKwRange = finalRanges[i];
                if (kwRange.start < prevKwRange.end && kwRange.end > prevKwRange.start) {
                    // Nếu nó nằm hoàn toàn bên trong 1 range keyword khác, bỏ qua
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


    // --- CẬP NHẬT HIGHLIGHT VÀ SCROLL SYNC ---
    async function updateHighlight(textToRender, allRanges) {
        if (!els.highlightLayer || !els.editorInput) return;
        
        const finalHTML = buildFinalHTML(textToRender, allRanges);
        els.highlightLayer.innerHTML = finalHTML;
        
        els.highlightLayer.scrollTop = els.editorInput.scrollTop;
        els.highlightLayer.scrollLeft = els.editorInput.scrollLeft;
    }
    
    function buildFinalHTML(text, ranges) {
        if (ranges.length === 0) {
            return escapeHTML(text);
        }

        let html = '';
        let lastEnd = 0;

        ranges.sort((a, b) => a.start - b.start);

        for (const range of ranges) {
            if (range.end <= range.start || range.start < lastEnd) {
                 // Xử lý ranges chồng lấn hoặc không hợp lệ: Bỏ qua
                 if (range.end > lastEnd) {
                     lastEnd = range.end;
                 }
                 continue;
            }
            
            // Thêm văn bản thuần trước range
            html += escapeHTML(text.substring(lastEnd, range.start));

            let className = '';
            if (range.type === RANGE_TYPE.REPLACE) {
                className = 'hl-yellow';
            } else if (range.type === RANGE_TYPE.AUTOCAPS) {
                className = 'hl-blue';
            } else if (range.type === RANGE_TYPE.KEYWORD && range.color !== undefined) {
                className = `keyword ${KW_COLORS[range.color % KW_COLORS.length]}`; 
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
    
    // 1. Luồng Search & Highlight (Chỉ đọc) - FIXED
    async function performSearchHighlight() {
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
            // 1. Tính toán ranges cho Replace/Auto-Caps TRÊN VĂN BẢN HIỆN TẠI (Không thay thế)
            // LƯU Ý: Vì hàm performReplaceAndGetRanges luôn trả về text ĐÃ thay thế nếu có match, 
            // nên ta phải ĐẢM BẢO CHỈ DÙNG TEXT GỐC CHO HIGHLIGHT TRONG SEARCH MODE,
            // HOẶC KHÔNG CHẠY REPLACE TRONG CHẾ ĐỘ NÀY.
            
            // Do cần highlight cả từ replace/autocaps, nên ta chỉ chạy highlight trên văn bản gốc.
            // Để đơn giản và chính xác, ta sẽ CHỈ TÍNH RANGES trên TEXT GỐC, KHÔNG THAY THẾ CHUỖI.
            
            // Tạm thời, để không làm lại toàn bộ hàm performReplaceAndGetRanges, ta sử dụng 
            // hàm hiện tại và DÙNG LẠI TEXT CŨ cho highlight layer. 
            // Tuy nhiên, logic này vẫn có thể gây ra lỗi nếu replace làm thay đổi độ dài,
            // nhưng vì Search mode là "Chỉ đọc", ta chỉ muốn ĐÁNH DẤU vị trí SẼ replace.
            
            // *** Sửa chuẩn theo yêu cầu: Khi search, ta vẫn chạy tính toán replace để lấy ranges, 
            // nhưng thay vì dùng temp.text đã replace, ta dùng textToSearch (text gốc) để highlight.
            // ranges tính ra từ performReplaceAndGetRanges() lúc này đang bị lệch offset.
            // => PHẢI DÙNG CHUỖI MỚI VÀ RANGES MỚI CHO HIGHLIGHT KEYWORD
            
            
            // Fix chuẩn: Dùng text gốc (textToSearch) để tìm kiếm.
            // Tuy nhiên, để hiện thị đúng lỗi Autocaps hoặc Replace, ta vẫn dùng text đã replace
            // và ranges đã tính offset.
            
            const temp = await performReplaceAndGetRanges(textToSearch);
            const finalText = temp.text; // Text sau khi Replace/AutoCaps
            const replaceRanges = temp.ranges;
            
            // 2. Tính toán Highlight Keywords trên TEXT MỚI
            const highlightResult = await performHighlight(finalText, replaceRanges); 
            
            // 3. Render trên TEXT MỚI (đã có ranges chuẩn)
            await updateHighlight(finalText, highlightResult.ranges);
            
            // Đặt lại văn bản editor về văn bản gốc (vì đây là Search mode)
            els.editorInput.value = textToSearch; 

            
            const totalHighlights = temp.count + highlightResult.count;
            if (totalHighlights > 0) notify(`Đã tìm thấy ${totalHighlights} vị trí cần chú ý.`);
            else notify('Không tìm thấy từ khóa nào hoặc cặp thay thế nào.', 'warning');

        } catch (e) {
            console.error(e);
            notify('Lỗi Search Highlight: ' + e.message, 'error');
        } finally {
            els.searchBtn.textContent = originalTextBtn;
            els.searchBtn.disabled = false;
        }
    }
    
    // 2. Luồng Replace & Highlight (Ghi đè) - FIXED
    async function performReplaceAll() {
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
            let ranges = replaceResult.ranges;
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


    // === UI SYNCHRONIZATION (Các hàm cũ) ===

    function syncStyles() {
        if (!els.editorInput || !els.highlightLayer) return;

        // Sync styles manually
        const family = els.fontFamily.value;
        const size = els.fontSize.value;
        
        // Cập nhật giá trị
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
        // Đếm từ: tách bằng khoảng trắng, không dùng regex /s+ để tránh performance issue trên văn bản lớn
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
    
    // --- KEYWORD UI (Các hàm cũ) ---
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
            // Sử dụng các class mới từ CSS bạn cung cấp
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

    function addKeyword(val) {
        if (!val) return;
        
        const newKws = val.split(/[,\n]/)
            .map(k => k.trim())
            .filter(k => k && !state.keywords.includes(k));
            
        if (newKws.length > 0) {
            state.keywords = state.keywords.concat(newKws);
            updateKwUI();
            notify(`Đã thêm ${newKws.length} từ khóa.`);
            performSearchHighlight();
        }
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
    }

    function removeKeyword(keyword) {
        state.keywords = state.keywords.filter(k => k !== keyword);
        updateKwUI();
        notify(`Đã xóa từ khóa: ${keyword}.`);
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
            // Cập nhật icon trong sidebar-toggle-btn
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
    
    if (els.sidebarInput) {
        els.sidebarInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
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

        // Khởi tạo font size/family từ state
        if (els.fontFamily) els.fontFamily.value = state.fontFamily;
        if (els.fontSize) els.fontSize.value = state.fontSize;
        
        updateFont(); // Đồng bộ style ban đầu
        updateWordCount();
        renderModeUI(); 
        updateKwUI();   
        
        switchTab('main-tab');
    }
    
    init();
});
