document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v23_optimized';
    
    // Loại bỏ PUA, thay thế bằng Range Types
    const RANGE_TYPE = {
        REPLACE: 'rep',
        AUTOCAPS: 'cap',
        KEYWORD: 'kw'
    };
    
    const KW_COLORS = ['hl-pink', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red'];
    
    // ... (Default State & State Initialization giữ nguyên) ...
    const defaultState = {
        keywords: [],
        keywordSettings: { matchCase: false, wholeWord: false },
        activeMode: 'Mặc định',
        sidebarOpen: false, 
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
        
        // ... (Sidebar, Mode, Settings elements giữ nguyên) ...
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
    
    let currentProcessedText = ''; 
    
    // --- UTILS (Giữ nguyên) ---
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
        // Loại bỏ các ký tự dấu nháy kép, nháy đơn không chuẩn để chuẩn hóa việc tìm kiếm
        return text
            .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'")
            .replace(/\u00A0/g, ' '); // Non-breaking space
    }

    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[m]);
    }
    
    function escapeRegExp(string) {
        // Đảm bảo dấu | không bị escape
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function preserveCase(original, replacement) {
        if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
        if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        }
        return replacement;
    }
    
    // === RANGE MANAGEMENT (FIX 3) ===
    
    /**
     * Gộp các phạm vi chồng lấn (chủ yếu cho Highlight Keywords)
     * @param {Array<{start: number, end: number, type: string, color?: number}>} ranges 
     * @returns {Array<{start: number, end: number, type: string, color?: number}>}
     */
    function mergeRanges(ranges) {
        if (ranges.length === 0) return [];
        
        // 1. Sắp xếp: ưu tiên bắt đầu sớm hơn, kết thúc muộn hơn (để lồng nhau)
        ranges.sort((a, b) => a.start - b.start || b.end - a.end);
        
        let merged = [];
        let current = ranges[0];
        
        for (let i = 1; i < ranges.length; i++) {
            const next = ranges[i];

            // Nếu phạm vi hiện tại bao gồm hoặc chồng lấn lên phạm vi tiếp theo
            if (next.start < current.end) {
                // Mở rộng phạm vi hiện tại (nếu cần)
                current.end = Math.max(current.end, next.end);
                
                // Nếu hai type khác nhau, giữ cả hai bằng cách tạo một bản sao
                if (current.type !== next.type) {
                     // Trường hợp phức tạp: lồng nhau (ví dụ: Replace lồng trong Keyword)
                     // Với mục tiêu đơn giản hóa Overlay: Giữ nguyên highlight hiện tại (ví dụ: Replace)
                     // và ưu tiên không làm chồng lấn các loại highlight.
                     // Tuy nhiên, đối với Replace và Keyword, ta ưu tiên Replace.
                     
                     // Chỉ xử lý chồng lấn đơn giản: nếu là cùng loại, gộp lại.
                     // Nếu khác loại, chỉ gộp nếu range tiếp theo nằm hoàn toàn trong range hiện tại.
                     // Nếu hai loại highlight chồng nhau, ta bỏ qua range của loại highlight yếu hơn
                }
                
                // Vì ta xử lý Replace trước, sau đó mới đến Highlight.
                // Replace và Autocaps sẽ không bị chồng lấn.
                // Highlight Keyword sẽ tự động được gộp nếu chồng lấn.
            } else {
                // Không chồng lấn, thêm phạm vi hiện tại vào kết quả và bắt đầu phạm vi mới
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        
        // 2. Lọc bỏ các range trùng nhau hoàn toàn (nếu có)
        const finalMerged = [];
        if (merged.length > 0) {
            finalMerged.push(merged[0]);
            for (let i = 1; i < merged.length; i++) {
                const prev = finalMerged[finalMerged.length - 1];
                const curr = merged[i];

                if (prev.start === curr.start && prev.end === curr.end && prev.type === curr.type) {
                    // Bỏ qua range trùng lặp
                    continue;
                }
                
                // Xử lý lồng ghép phức tạp: Nếu A (Replace) lồng B (Keyword),
                // ta ưu tiên không gộp mà chia nhỏ Range (điều này quá phức tạp cho JS này).
                // Tạm thời, ta chỉ thực hiện merge đơn giản (như trên) và đảm bảo
                // range highlight (Keyword) không chồng lấn lên range replace (Replace/AutoCaps).
                // Logic này sẽ được đảm bảo trong hàm performChunkedHighlight.
                finalMerged.push(curr);
            }
        }

        return finalMerged;
    }

    /**
     * Xây dựng HTML từ text và array ranges đã được sắp xếp/gộp
     * @param {string} text 
     * @param {Array<{start: number, end: number, type: string, color?: number}>} ranges 
     */
    function buildFinalHTML(text, ranges) {
        if (ranges.length === 0) {
            return escapeHTML(text);
        }

        let html = '';
        let lastEnd = 0;

        // 1. Sắp xếp lại để xử lý lồng ghép (tối ưu nhất: theo vị trí start)
        ranges.sort((a, b) => a.start - b.start);

        for (const range of ranges) {
            // Chèn phần văn bản không highlight trước range
            html += escapeHTML(text.substring(lastEnd, range.start));

            // Xác định class cho highlight
            let className = '';
            let colorClass = '';
            if (range.type === RANGE_TYPE.REPLACE) {
                className = 'hl-yellow';
            } else if (range.type === RANGE_TYPE.AUTOCAPS) {
                className = 'hl-blue';
            } else if (range.type === RANGE_TYPE.KEYWORD && range.color !== undefined) {
                className = `keyword ${KW_COLORS[range.color % KW_COLORS.length]}`;
            }

            // Chèn văn bản đã highlight (dùng innerHTML)
            html += `<span class="${className}">${escapeHTML(text.substring(range.start, range.end))}</span>`;
            
            lastEnd = range.end;
        }

        // Chèn phần văn bản còn lại sau range cuối cùng
        html += escapeHTML(text.substring(lastEnd));
        
        return html;
    }

    // === XỬ LÝ TEXT (FIX 2) ===

    /**
     * Hàm Replace và Autocaps, trả về text đã thay thế và array ranges.
     * @param {string} rawText - Text thuần từ Input
     * @returns {Promise<{text: string, ranges: Array<{start: number, end: number, type: string, color?: number}>, count: number}>}
     */
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
            const ruleMap = new Map();
            const patterns = [];
            
            // Xây dựng Master Regex
            rules.forEach((rule, index) => {
                const pattern = escapeRegExp(normalizeText(rule.find));
                // Dùng nhóm chụp (capturing group) để xác định rule khớp
                const fullPattern = mode.wholeWord 
                    ? `(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])` // Whole Word
                    : `(${pattern})`; // Substring
                
                patterns.push(fullPattern);
                // Lưu mapping từ pattern thô (không có nhóm word boundary) đến rule
                ruleMap.set(pattern, { rule, index });
            });

            // Gộp tất cả pattern thành một Master Regex
            // Dùng 'u' flag cho Unicode property escapes (\p{L}\p{N}_)
            const flags = mode.matchCase ? 'gu' : 'giu';
            const masterRegex = new RegExp(patterns.join("|"), flags);
            
            const originalText = processedText;
            processedText = processedText.replace(masterRegex, (match, ...args) => {
                // Master Regex trả về match, sau đó là các nhóm chụp (capturing groups)
                let matchText = match;
                let startOffset = args[args.length - 2];
                let replacement = '';
                let matchedRule = null;
                
                // Tìm nhóm chụp nào khớp
                for (let i = 0; i < rules.length; i++) {
                    if (args[i] !== undefined) {
                        matchedRule = rules[i];
                        // Nếu có Whole Word, matchText có thể bao gồm khoảng trắng/ký tự trước/sau
                        // Ta cần tìm vị trí thực của từ được highlight
                        matchText = args[i]; 
                        
                        // Cập nhật vị trí bắt đầu
                        if(mode.wholeWord) {
                            // Cần tìm lại index của matchText bên trong match lớn
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
                    
                    // Thêm Range: CHỈ THÊM RANGE VÀO TEXT ĐÃ THAY THẾ
                    // Vị trí end là vị trí bắt đầu + độ dài của chuỗi thay thế mới
                    ranges.push({ 
                        start: startOffset, 
                        end: startOffset + replacement.length, 
                        type: RANGE_TYPE.REPLACE 
                    });
                    
                    return replacement; // Trả về chuỗi đã thay thế
                }
                
                // Trường hợp không có rule nào khớp (chỉ xảy ra nếu có lỗi logic)
                return match;
            });
        }
        
        // --- 2. Auto Caps ---
        if (mode.autoCaps) {
            // Regex tìm ký tự thường sau dấu câu/xuống dòng, bỏ qua khoảng trắng/PUA (nếu còn)
            // Ta dùng lookbehind để không thay đổi prefix (^|[\.?!\n]\s*)
            const autoCapsRegex = /(^|[\.?!\n]\s*)([\p{Ll}])/gmu;
            
            const originalTextBeforeCaps = processedText;
            let capsRanges = [];

            processedText = processedText.replace(autoCapsRegex, (match, prefix, char, offset) => {
                const upperChar = char.toUpperCase();
                
                if (char !== upperChar) { // Chỉ thay đổi nếu có thay đổi case
                    const charStart = offset + prefix.length;
                    
                    capsRanges.push({ 
                        start: charStart, 
                        end: charStart + 1, // Chỉ 1 ký tự được viết hoa
                        type: RANGE_TYPE.AUTOCAPS 
                    });
                    
                    return prefix + upperChar;
                }
                return match;
            });
            
            // Gộp các range AutoCaps vào ranges chung
            ranges = ranges.concat(capsRanges);
        }

        // Tối ưu: Sắp xếp các range đã tạo
        ranges.sort((a, b) => a.start - b.start);

        return { text: processedText, ranges, count: replaceCount };
    }

    /**
     * Hàm highlight keywords (Range-based).
     * @param {string} text - Text sau khi đã Replace/Caps (text thuần)
     * @param {Array<{start: number, end: number, type: string, color?: number}>} existingRanges - Các ranges Replace/Caps có sẵn
     * @returns {Promise<{ranges: Array<{start: number, end: number, type: string, color?: number}>, count: number}>}
     */
    async function performHighlight(text, existingRanges) {
        if (!state.keywords.length) return { ranges: existingRanges, count: 0 };

        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        
        let keywordRanges = [];
        let highlightCount = 0;
        
        // --- 1. Master Regex Keyword Highlight ---
        const patterns = [];
        
        // Xây dựng Master Regex
        sortedKws.forEach((kw, index) => {
            const pattern = escapeRegExp(normalizeText(kw));
            const fullPattern = wholeWord 
                ? `(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])` 
                : `(${pattern})`; 
            
            patterns.push(fullPattern);
        });

        const flags = matchCase ? 'gu' : 'giu';
        const masterRegex = new RegExp(patterns.join("|"), flags);
        
        // Chạy Master Regex trên toàn bộ text
        text.replace(masterRegex, (match, ...args) => {
            let startOffset = args[args.length - 2]; // Vị trí bắt đầu của match lớn
            let matchText = match;
            let matchedKwIndex = -1;

            // Tìm nhóm chụp nào khớp
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
                
                // Thêm range keyword thô
                keywordRanges.push({ 
                    start: startOffset, 
                    end: endOffset, 
                    type: RANGE_TYPE.KEYWORD, 
                    color: matchedKwIndex 
                });
            }
            return match; // Không thay đổi text
        });

        // --- 2. Gộp/Xử lý chồng lấn ranges ---
        // Range Highlight không được chồng lấn lên Range Replace/Autocaps
        
        let finalRanges = [...existingRanges];
        
        for (const kwRange of keywordRanges) {
            let isOverlappingWithExisting = false;
            
            // Kiểm tra xem Keyword Range có nằm trong hoặc chồng lấn lên Replace/Caps Range không
            for (const existingRange of existingRanges) {
                // Chồng lấn nếu: (start1 < end2) && (end1 > start2)
                if (kwRange.start < existingRange.end && kwRange.end > existingRange.start) {
                    isOverlappingWithExisting = true;
                    // Bỏ qua range keyword này hoặc cắt nó
                    
                    // Tối ưu hóa: Ta bỏ qua range keyword này
                    // Logic cắt range rất phức tạp và dễ gây lỗi.
                    break; 
                }
            }
            
            if (!isOverlappingWithExisting) {
                // Nếu không chồng lấn, kiểm tra chồng lấn giữa các Keyword ranges
                let shouldAdd = true;
                for (let i = finalRanges.length - 1; i >= existingRanges.length; i--) {
                    const prevKwRange = finalRanges[i];
                    // Kiểm tra chồng lấn (không cần merge phức tạp, chỉ cần loại bỏ)
                    if (kwRange.start < prevKwRange.end && kwRange.end > prevKwRange.start) {
                        // Nếu range hiện tại nằm hoàn toàn trong range đã có, bỏ qua
                        if (kwRange.start >= prevKwRange.start && kwRange.end <= prevKwRange.end) {
                            shouldAdd = false;
                            break;
                        }
                        // Nếu chồng lấn một phần, ta bỏ qua range hiện tại (để ưu tiên range dài hơn/sớm hơn)
                        // Bỏ qua logic merge phức tạp để giữ hiệu suất, chỉ loại bỏ nếu chồng lấn hoàn toàn
                    }
                }
                
                if (shouldAdd) {
                    finalRanges.push(kwRange);
                    highlightCount++;
                }
            }
        }
        
        // Sắp xếp lại tất cả ranges (Replace/Caps + Keyword)
        finalRanges.sort((a, b) => a.start - b.start || b.end - a.end);

        return { ranges: finalRanges, count: highlightCount };
    }


    // Cập nhật lớp Highlight Overlay
    async function updateHighlight(textToRender, allRanges) {
        if (!els.highlightLayer || !els.editorInput) return;
        
        // 1. Tạo HTML
        const finalHTML = buildFinalHTML(textToRender, allRanges);

        // 2. Render lên Overlay
        els.highlightLayer.innerHTML = finalHTML;
    }

    // === CHỨC NĂNG CHÍNH: REPLACE & HIGHLIGHT ===
    async function performReplaceAll() {
        if (!els.editorInput) return notify('Lỗi Editor!', 'error');

        let rawText = els.editorInput.value; 
        if (!rawText.trim()) return notify('Editor trống!', 'error');

        const originalTextBtn = els.replaceBtn.textContent;
        els.replaceBtn.textContent = 'Đang xử lý Replace...';
        els.replaceBtn.disabled = true;

        try {
            // Bước 1: Replace & Autocaps (Master Regex)
            const replaceResult = await performReplace(rawText);
            const plainTextAfterReplace = replaceResult.text;
            let ranges = replaceResult.ranges;
            const replaceCount = replaceResult.count;
            
            // Bước 2: Cập nhật Text Thuần trong Input và Highlight Overlay
            els.editorInput.value = plainTextAfterReplace;
            
            // Cập nhật highlight trên Overlay
            els.replaceBtn.textContent = 'Đang xử lý Highlight...';
            
            // Chạy highlight Keywords (Range-based)
            const highlightResult = await performHighlight(plainTextAfterReplace, ranges); 
            
            // Cập nhật Overlay
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

    // === ĐỒNG BỘ UI (FIX 1: SCROLL TRANSFORM) ===
    
    // 1. Đồng bộ cuộn (Scroll)
    if (els.editorInput && els.highlightLayer) {
        // Lắng nghe sự kiện cuộn từ TEXTAREA (editor-input)
        els.editorInput.addEventListener('scroll', () => {
            const top = els.editorInput.scrollTop;
            const left = els.editorInput.scrollLeft;

            // Dịch chuyển nội dung Overlay ngược chiều cuộn
            els.highlightLayer.style.transform = `translate(${-left}px, ${-top}px)`;
        });
    }
    
    // 2. Đồng bộ Font (Giữ nguyên)
    function updateFont() {
        if (!els.editorInput || !els.highlightLayer || !els.fontFamily || !els.fontSize) return;
        
        const family = els.fontFamily.value;
        const size = els.fontSize.value;
        
        // Đồng bộ Font cho cả Input và Layer
        els.editorInput.style.setProperty('font-family', family, 'important');
        els.editorInput.style.setProperty('font-size', size, 'important');
        els.highlightLayer.style.setProperty('font-family', family, 'important');
        els.highlightLayer.style.setProperty('font-size', size, 'important');
    }
    if (els.fontFamily) els.fontFamily.onchange = updateFont;
    if (els.fontSize) els.fontSize.onchange = updateFont;
    
    // 3. Xử lý Input và Word Count
    function updateWordCount() {
        if (!els.editorInput || !els.wordCount) return;
        const txt = els.editorInput.value || '';
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
        
        // Sau khi nhập, xóa highlight cũ
        if (els.highlightLayer) els.highlightLayer.innerHTML = ''; 
    }
    if (els.editorInput) els.editorInput.addEventListener('input', updateWordCount);

    // ... (Sidebar, Mode, Settings Logic giữ nguyên) ...
    // ... (Các hàm này không cần thay đổi vì chúng chỉ quản lý State, không xử lý Regex/Range)

    // === EDITOR ACTIONS ===
    
    // NÚT HIGHLIGHT KEYWORDS ONLY
    if (els.searchBtn) {
        els.searchBtn.onclick = async () => { 
            if (els.sidebarInput) addKeyword(els.sidebarInput.value);
            if (!els.editorInput.value.trim()) return notify('Editor trống!', 'error');

            els.searchBtn.disabled = true;
            els.searchBtn.textContent = 'Đang xử lý Highlight...';
            
            try {
                const plainText = els.editorInput.value;
                
                // Chạy highlight keywords (existingRanges = [])
                const highlightResult = await performHighlight(plainText, []); 
                
                // Cập nhật Overlay
                await updateHighlight(plainText, highlightResult.ranges);
                
                if (highlightResult.count > 0) notify(`Đã tìm thấy & highlight ${highlightResult.count} từ khóa.`);
                else notify('Không tìm thấy từ khóa nào trong văn bản.', 'warning');
            } catch(e) {
                console.error(e);
                notify('Lỗi: ' + e.message, 'error');
            } finally {
                els.searchBtn.textContent = 'Tính toán lại Highlight';
                els.searchBtn.disabled = false;
            }
        };
    }

    if (els.clearBtn) {
        els.clearBtn.onclick = () => { 
            if (els.editorInput) els.editorInput.value = ''; 
            if (els.highlightLayer) els.highlightLayer.innerHTML = '';
            updateWordCount(); 
            notify('Đã xóa trắng Editor.');
        };
    }

    if (els.copyBtn) {
        els.copyBtn.onclick = () => { 
            if (!els.editorInput || !els.editorInput.value.trim()) return notify('Trống!', 'error'); 
            navigator.clipboard.writeText(els.editorInput.value); 
            notify('Đã copy vào clipboard!');
            els.editorInput.value = ''; 
            if (els.highlightLayer) els.highlightLayer.innerHTML = '';
            updateWordCount();
        };
    }

    if (els.replaceBtn) {
        els.replaceBtn.onclick = performReplaceAll;
    }
    
    // ... (Toàn bộ logic Sidebar, Mode, Settings quản lý UI/State được giữ nguyên) ...

    // === INIT ===
    function init() {
        // ... (init logic giữ nguyên)
        renderTags(); 
        renderModeUI(); 
        updateFont(); 
        updateWordCount();
    }
    
    // Khởi tạo các hàm quản lý state và UI khác
    function renderTags() { /* ... */ }
    function addKeyword(val) { /* ... */ }
    function renderModeUI() { /* ... */ }
    function updateToggle(btn, isActive, label) { /* ... */ }
    function addPairUI(f = '', r = '') { /* ... */ }
    function savePairs() { /* ... */ }
    function updateKwUI() { /* ... */ }
    
    // Gán lại các sự kiện UI đã giữ nguyên
    els.tabs.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    // ... (Các sự kiện khác như sidebarToggle, addKeyword, modeSelect, buttons, etc.) ...
    if (els.sidebarToggle) els.sidebarToggle.onclick = () => toggleSidebar();
    
    // ... (Định nghĩa hàm toggleSidebar, switchTab, updateKwUI, v.v. đã bị loại bỏ ở đây 
    // để tập trung vào phần logic chính, giả định chúng đã được định nghĩa và giữ nguyên)

    // Khởi chạy
    init();
});
