document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v21_final_patched';
    
    // Ký tự Private Use Area để đánh dấu (Dùng cho Replace Logic)
    const MARK_REP_START = '\uE000';
    const MARK_REP_END = '\uE001';
    const MARK_CAP_START = '\uE002';
    const MARK_CAP_END = '\uE003';
    
    // HỆ THỐNG MÀU PASTEL - 30 màu pastel sáng
    const PASTEL_COLORS = [
        "#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9", "#BAE1FF", "#C9BAFF", "#FFBAE1", "#FFBAC9", // 8
        "#B8D3F3", "#B3FFF8", "#B5FFB3", "#F3FFB3", "#FFF8B3", "#FFC5B3", "#F4B3FF", "#B3FFC5", // 16
        "#7FFFD4", "#E0BBE4", "#957DAD", "#D291BC", "#FEC8D8", "#FFEDAE", "#A4F0B7", "#C9F7F5", // 24
        "#ADD8E6", "#F08080", "#E6E6FA", "#FFDEAD", "#F0FFF0", "#AFEEEE" // 30
    ];
    
    const KW_COLOR_CLASSES = PASTEL_COLORS.map((_, i) => `hl-keyword-${i + 1}`);

    const defaultState = {
        keywords: [],
        keywordSettings: { matchCase: false, wholeWord: false },
        activeMode: 'Mặc định',
        sidebarOpen: false, 
        modes: {
            'Mặc định': { pairs: [], matchCase: false, wholeWord: false, autoCaps: false }
        },
        editorContent: '' // Thêm state lưu nội dung editor
    };

    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes[state.activeMode]) state.activeMode = Object.keys(state.modes)[0] || 'Mặc định';
    if (!state.keywordSettings) state.keywordSettings = { matchCase: false, wholeWord: false };
    if (state.keywords.length > PASTEL_COLORS.length) state.keywords.length = PASTEL_COLORS.length; // Giới hạn số lượng keyword để đảm bảo màu

    // === DOM ELEMENTS ===
    const els = {
        tabs: document.querySelectorAll('.tab-button'),
        contents: document.querySelectorAll('.tab-content'),
        
        editor: document.getElementById('editor'),
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
        copyKwBtn: document.getElementById('copy-kw-list'), // Nút Copy Keywords Mới
        
        notify: document.getElementById('notification-container')
    };

    // === UTILS ===

    // Debounce function (simple implementation)
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

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

    // --- Text Utilities ---
    function normalizeText(text) {
        if (!text) return '';
        // Chuẩn hóa một số ký tự đặc biệt, nhưng giữ nguyên \n
        return text
            .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'")
            .replace(/\u00A0/g, ' ');
    }

    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[m]);
    }
    
    function escapeRegExp(string) {
        // Thoát ký tự regex đặc biệt, trừ dấu cách, để cho phép cả từ khóa có dấu cách
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function preserveCase(original, replacement) {
        // Logic bảo toàn chữ hoa/thường (ví dụ: TRINH -> HUONG, Trinh -> Huong)
        if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
        if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
        }
        return replacement;
    }

    // === TỐI ƯU HÓA: CẬP NHẬT EDITOR SAU KHI XỬ LÝ CHUỖI ===

    // Tối ưu hóa: Hàm gom keyword thành 1 regex và thay thế trên chuỗi
    function highlightKeywordsString(rawText) {
        if (!rawText || !state.keywords.length) return rawText;
        
        // 1. Gom Keywords thành Regex lớn (Tối ưu performance)
        // Sort theo độ dài giảm dần để ưu tiên từ dài hơn
        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        
        // Thoát ký tự regex và nối lại
        // Dùng `\b` (word boundary) cho chế độ Whole Word, nếu không thì dùng lookbehind/lookahead
        const keywordsPattern = sortedKws
            .map(kw => `(${escapeRegExp(state.keywordSettings.matchCase ? kw : kw.toLowerCase())})`)
            .join('|');
            
        if (!keywordsPattern) return rawText;

        const flags = state.keywordSettings.matchCase ? 'g' : 'gi';
        let regex;
        const wordChar = '[\\p{L}\\p{N}_]'; // Ký tự từ (chữ, số, gạch dưới)

        if (state.keywordSettings.wholeWord) {
             // Sử dụng lookbehind/lookahead cho Whole Word để hoạt động với cả ký tự Unicode
             // (?<![...]) : không đứng sau ký tự từ
             // (?! [...]) : không đứng trước ký tự từ
             regex = new RegExp(`(?<!${wordChar})(${keywordsPattern})(?!${wordChar})`, flags + 'u');
        } else {
             // Nếu không match case, chúng ta đã normalize keywords to lower case
             regex = new RegExp(`(${keywordsPattern})`, flags + 'u');
        }

        let highlightedText = rawText;
        let replaceCount = 0;

        // 2. Replace 1 lần với regex lớn
        highlightedText = highlightedText.replace(regex, (match, ...groups) => {
            
            // Tìm index của keyword đã match trong mảng sortedKws
            let matchedKwIndex = -1;
            let matchedKwValue = '';
            
            // groups[0] chứa toàn bộ match (theo regex), groups[1] đến groups[N] là các nhóm con
            // Vị trí match thực tế nằm ở groups[0]
            
            // Tìm nhóm con nào match. Groups.length-3 vì 3 tham số cuối là index, full string, groups
            for (let i = 0; i < groups.length - 3; i++) { 
                if (groups[i] !== undefined) {
                    // i là index của nhóm con (keyword) trong regexPattern (và cũng là index trong sortedKws)
                    matchedKwIndex = i;
                    matchedKwValue = sortedKws[i];
                    break;
                }
            }
            
            if (matchedKwIndex !== -1) {
                replaceCount++;
                const colorClass = KW_COLOR_CLASSES[matchedKwIndex % KW_COLOR_CLASSES.length];

                // Bọc bằng thẻ span HTML
                // Match: Giá trị thực tế được tìm thấy (giữ case gốc nếu không matchCase)
                return `<span class="hl ${colorClass}">${match}</span>`;
            }
            
            return match; // Trả về match gốc nếu có lỗi (nên không xảy ra)
        });

        // console.log('Keyword Highlight Count:', replaceCount);
        return highlightedText;
    }

    function renderEditorContent(text) {
        if (!els.editor) return;
        
        // 1. Escape HTML cho text
        let finalHTML = escapeHTML(text);
        
        // 2. Thay thế các marker bằng tag HTML tương ứng
        // **Lưu ý:** Chạy sau khi escapeHTML để các marker không bị escape.
        finalHTML = finalHTML.replace(new RegExp(MARK_REP_START, 'g'), '<span class="hl hl-yellow">')
                             .replace(new RegExp(MARK_REP_END, 'g'), '</span>')
                             .replace(new RegExp(MARK_CAP_START, 'g'), '<span class="hl hl-blue">')
                             .replace(new RegExp(MARK_CAP_END, 'g'), '</span>');

        // 3. Chèn HTML đã được xử lý vào editor
        els.editor.innerHTML = finalHTML;
        
        // 4. Chạy highlight keywords đè lên các span replace/autocaps
        // Dùng logic cũ `highlightKeywordsDOM` vì nó hoạt động với DOM TreeWalker
        // (Ưu điểm: có thể highlight từ khóa bên trong các span đã replace/autocaps nếu cần)
        highlightKeywordsDOM(); 

        updateWordCount();
    }
    
    // Hàm này giữ lại để xử lý highlight đè lên các span Vàng/Xanh.
    // Logic được tối ưu hơn (bỏ contentEditable="false", bỏ ZWS)
    function highlightKeywordsDOM() {
        if (!els.editor || !state.keywords.length) return 0;
        
        // Remove old keyword highlights ONLY (giữ lại replace/autocaps spans: hl-yellow, hl-blue)
        const oldKws = els.editor.querySelectorAll('.hl-keyword-1, .hl-keyword-2, .hl-keyword-3, .hl-keyword-4, .hl-keyword-5, .hl-keyword-6, .hl-keyword-7, .hl-keyword-8, .hl-keyword-9, .hl-keyword-10, .hl-keyword-11, .hl-keyword-12, .hl-keyword-13, .hl-keyword-14, .hl-keyword-15, .hl-keyword-16, .hl-keyword-17, .hl-keyword-18, .hl-keyword-19, .hl-keyword-20, .hl-keyword-21, .hl-keyword-22, .hl-keyword-23, .hl-keyword-24, .hl-keyword-25, .hl-keyword-26, .hl-keyword-27, .hl-keyword-28, .hl-keyword-29, .hl-keyword-30'); // Dùng selector cho tất cả class hl-keyword
        oldKws.forEach(span => {
            const parent = span.parentNode;
            while(span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
        });
        // Normalize: gộp các text node liền kề lại
        els.editor.normalize();

        const walker = document.createTreeWalker(els.editor, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while(node = walker.nextNode()) {
            // Loại bỏ text node rỗng
            if(node.nodeValue.trim()) textNodes.push(node);
        }

        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        let wordCharRegex = /[\p{L}\p{N}_]/u;
        let highlightCount = 0;

        for (const textNode of textNodes) {
            if (!textNode.parentNode) continue;
            let currentNode = textNode;
            
            outer: while(currentNode && currentNode.nodeValue) {
                const text = matchCase ? currentNode.nodeValue : currentNode.nodeValue.toLowerCase();
                let bestIdx = -1, bestKw = '', colorIdx = 0;

                for (let i = 0; i < sortedKws.length; i++) {
                    const kw = sortedKws[i];
                    const searchKw = matchCase ? kw : kw.toLowerCase();
                    const idx = text.indexOf(searchKw);

                    if (idx !== -1) {
                        if (wholeWord) {
                            const prev = idx > 0 ? text[idx-1] : '';
                            const next = idx + searchKw.length < text.length ? text[idx+searchKw.length] : '';
                            if (wordCharRegex.test(prev) || wordCharRegex.test(next)) continue;
                        }
                        if (bestIdx === -1 || idx < bestIdx) {
                            bestIdx = idx; 
                            bestKw = currentNode.nodeValue.substring(idx, idx + searchKw.length); // Lấy match với case gốc
                            colorIdx = i;
                            break; // Ưu tiên match đầu tiên
                        }
                    }
                }

                if (bestIdx === -1) break;

                const matchNode = currentNode.splitText(bestIdx);
                const afterNode = matchNode.splitText(bestKw.length);
                
                const span = document.createElement('span');
                span.className = `hl ${KW_COLOR_CLASSES[colorIdx % KW_COLOR_CLASSES.length]}`;
                span.textContent = matchNode.nodeValue; 
                
                matchNode.parentNode.replaceChild(span, matchNode);
                
                highlightCount++;
                currentNode = afterNode;
            }
        }
        return highlightCount;
    }


    // === FIX LỖI 1: XỬ LÝ PASTE & INPUT (DEBOUNCE) ===
    
    // Hàm xử lý highlight khi input/paste (Debounced)
    const highlightOnInput = debounce(() => {
        // Chỉ cần chạy highlightKeywordsDOM, vì nó đã remove highlight cũ trước khi highlight mới
        highlightKeywordsDOM(); 
        updateWordCount();
    }, 200); // Debounce 200ms

    if (els.editor) {
        // FIX LỖI 1 (chính): Đảm bảo khi Paste thì giữ nguyên cấu trúc dòng
        els.editor.addEventListener('paste', (e) => {
            e.preventDefault();
            let text = (e.clipboardData || window.clipboardData).getData('text/plain');
            text = text.replace(/\r\n/g, '\n'); // Chuẩn hóa xuống dòng
            document.execCommand('insertText', false, text);
            highlightOnInput(); // Kích hoạt highlight sau khi dán
        });
        
        // Kích hoạt debounce cho input/keyup
        els.editor.addEventListener('input', highlightOnInput);
    }
    
    // === CORE FUNCTIONS (REPLACE) ===

    // Tối ưu hóa: Chạy replace trên chuỗi và dùng marker
    function performReplaceAll() {
        if (!els.editor) return notify('Lỗi editor!', 'error');

        const mode = state.modes[state.activeMode];
        // Lấy text thuần, bao gồm cả dấu xuống dòng
        let rawText = els.editor.innerText; 
        if (!rawText.trim()) return notify('Editor trống!', 'error');

        const originalTextBtn = els.replaceBtn.textContent;
        els.replaceBtn.textContent = 'Đang xử lý...';
        els.replaceBtn.disabled = true;

        // Async Batching: Dùng setTimeout để chia tác vụ, không block UI
        setTimeout(() => {
            try {
                let processedText = normalizeText(rawText);
                let replaceCount = 0;

                // 1. User Replace Pairs
                if (mode.pairs.length > 0) {
                    // Sắp xếp theo độ dài giảm dần để ưu tiên từ dài hơn
                    const rules = mode.pairs
                        .filter(p => p.find && p.find.trim())
                        .map(p => ({ find: normalizeText(p.find), replace: normalizeText(p.replace || '') }))
                        .sort((a,b) => b.find.length - a.find.length);

                    // Tối ưu hóa: Gom tất cả find pattern vào 1 regex lớn (Complex nhưng hiệu quả)
                    const replacePatterns = rules.map(r => `(${escapeRegExp(r.find)})`).join('|');
                    const flags = mode.matchCase ? 'g' : 'gi';
                    let regex;
                    const wordChar = '[\\p{L}\\p{N}_]'; 

                    if (mode.wholeWord) {
                        regex = new RegExp(`(?<!${wordChar})(${replacePatterns})(?!${wordChar})`, flags + 'u');
                    } else {
                        regex = new RegExp(`(${replacePatterns})`, flags + 'u');
                    }

                    processedText = processedText.replace(regex, (match, ...groups) => {
                        replaceCount++;
                        
                        // Tìm index của nhóm con (group) đã match (giống logic highlight)
                        let ruleIndex = -1;
                        for (let i = 0; i < groups.length - 3; i++) { 
                            if (groups[i] !== undefined) {
                                ruleIndex = i; // i là index của rule trong mảng `rules`
                                break;
                            }
                        }
                        
                        if (ruleIndex !== -1) {
                            let replacement = rules[ruleIndex].replace;
                            if (!mode.matchCase) replacement = preserveCase(match, replacement);
                            
                            // Dùng marker để đánh dấu vùng được replace
                            return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                        }
                        return match; // Trả về match gốc nếu không tìm thấy rule
                    });
                }
                
                // 2. Auto Caps (Chạy trên chuỗi đã replace, giữ lại marker)
                if (mode.autoCaps) {
                    const autoCapsRegex = /(^|[\.?!\n]\s*)(?:\uE000|\uE001|\uE002|\uE003)*([\p{Ll}])/gmu;
                    processedText = processedText.replace(autoCapsRegex, (fullMatch, prefix, char) => {
                        // Bọc ký tự hoa bằng marker xanh
                        return `${prefix}${MARK_CAP_START}${char.toUpperCase()}${MARK_CAP_END}`;
                    });
                }

                // 3. Rebuild HTML và Cập nhật DOM 1 lần
                els.editor.textContent = processedText; // Reset về text thuần mới
                renderEditorContent(processedText);
                
                if (replaceCount > 0) notify(`Thay thế ${replaceCount} cụm từ!`);
                else if (mode.autoCaps) notify('Đã chạy Auto Caps!');
                else notify('Không tìm thấy gì để thay thế.', 'warning');

            } catch (e) {
                console.error(e);
                notify('Lỗi: ' + e.message, 'error');
            } finally {
                els.replaceBtn.textContent = originalTextBtn;
                els.replaceBtn.disabled = false;
            }
        }, 50); // Cho phép UI Thread giải lao
    }


    // === TAB & SIDEBAR LOGIC (GIỮ NGUYÊN) ===
    function switchTab(tabId) {
        els.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        els.contents.forEach(c => {
            if (c.id === tabId) {
                c.classList.remove('hidden');
                c.classList.add('active');
            } else {
                c.classList.add('hidden');
                c.classList.remove('active');
            }
        });
        if (els.sidebarToggle) {
            els.sidebarToggle.classList.toggle('hidden', !(tabId === 'main-tab' || tabId === 'settings-tab' || tabId === 'display-tab'));
        }
    }
    els.tabs.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));

    if (els.sidebar && els.sidebarToggle) {
        function toggleSidebar(forceState) {
            const isOpen = forceState !== undefined ? forceState : !state.sidebarOpen;
            state.sidebarOpen = isOpen;
            if (isOpen) {
                els.sidebar.classList.remove('closed');
                els.sidebarToggle.querySelector('.icon').textContent = '«';
            } else {
                els.sidebar.classList.add('closed');
                els.sidebarToggle.querySelector('.icon').textContent = '»';
            }
            saveState();
        }
        els.sidebarToggle.onclick = () => toggleSidebar();
        toggleSidebar(state.sidebarOpen);
    }

    // === KEYWORDS MANAGEMENT ===
    function addKeyword(val) {
        if (!val.trim()) return;
        const keys = val.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        let changed = false;
        keys.forEach(k => {
            if (!state.keywords.includes(k) && state.keywords.length < PASTEL_COLORS.length) { // Giới hạn số lượng keyword
                state.keywords.push(k);
                changed = true;
            }
        });
        if (changed) {
            renderTags(); saveState(); highlightOnInput(); // Dùng highlightOnInput (debounced)
        }
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
        if (changed && state.keywords.length >= PASTEL_COLORS.length) {
             notify(`Đã đạt giới hạn ${PASTEL_COLORS.length} từ khóa (để đảm bảo màu sắc)!`, 'warning');
        }
    }

    function renderTags() {
        // Tối ưu: Dùng KW_COLOR_CLASSES cho tags
        const html = state.keywords.map((k, i) => `
            <div class="tag ${KW_COLOR_CLASSES[i % KW_COLOR_CLASSES.length]}">
                <span>${escapeHTML(k)}</span>
                <span class="remove-tag" data-kw="${escapeHTML(k)}">×</span>
            </div>
        `).join('');
        
        if (els.sidebarTags) els.sidebarTags.innerHTML = html;
        if (els.fullKwTags) els.fullKwTags.innerHTML = html;
        document.querySelectorAll('.remove-tag').forEach(btn => {
            btn.onclick = (e) => {
                state.keywords = state.keywords.filter(k => k !== e.target.dataset.kw);
                renderTags(); saveState(); highlightOnInput();
            }
        });
    }

    [els.sidebarInput, els.fullKwInput].forEach(inp => {
        if (inp) {
            inp.addEventListener('keydown', e => { 
                if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    addKeyword(inp.value); 
                } 
            });
            inp.addEventListener('blur', () => addKeyword(inp.value));
        }
    });

    if (els.exportKwBtn) {
        els.exportKwBtn.onclick = () => {
            if (!state.keywords.length) return notify('Danh sách trống!', 'warning');
            const csvContent = "\uFEFF" + state.keywords.join('\n');
            const url = URL.createObjectURL(new Blob([csvContent], {type:'text/csv;charset=utf-8;'}));
            const a = document.createElement('a'); a.href=url; a.download='keywords.csv'; a.click();
        };
    }

    if (els.copyKwBtn) { // Logic Nút Copy Keywords
        els.copyKwBtn.onclick = () => {
            if (!state.keywords.length) return notify('Danh sách trống!', 'warning');
            
            // Định dạng: "kw1","kw2",...
            const keywordString = state.keywords
                .map(kw => kw.includes(',') || kw.includes('"') || kw.includes(' ') ? `"${kw.replace(/"/g, '""')}"` : kw)
                .join(', ');
            
            navigator.clipboard.writeText(keywordString)
                .then(() => notify('Đã copy danh sách từ khóa vào clipboard!'))
                .catch(err => notify('Lỗi khi copy: ' + err, 'error'));
        };
    }
    
    if (els.importKwBtn) {
        els.importKwBtn.onclick = () => {
            const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv, .txt';
            inp.onchange = e => {
                if(!e.target.files[0]) return;
                const r = new FileReader();
                r.onload = ev => {
                    const lines = ev.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    let count = 0;
                    lines.forEach(l => {
                        if (!state.keywords.includes(l) && state.keywords.length < PASTEL_COLORS.length) {
                            state.keywords.push(l); count++;
                        }
                    });
                    renderTags(); saveState(); highlightOnInput();
                    notify(`Đã thêm ${count} từ khóa!`);
                    if (state.keywords.length >= PASTEL_COLORS.length) {
                        notify(`Đã đạt giới hạn ${PASTEL_COLORS.length} từ khóa (để đảm bảo màu sắc)!`, 'warning');
                    }
                };
                r.readAsText(e.target.files[0]);
            };
            inp.click();
        };
    }

    // === SETTINGS UI (GIỮ NGUYÊN LOGIC) ===
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
        div.innerHTML = `
            <input type="text" class="find" placeholder="Tìm" value="${escapeHTML(f)}">
            <input type="text" class="replace" placeholder="Thay" value="${escapeHTML(r)}">
            <button class="remove" tabindex="-1">×</button>
        `;
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

    if (els.matchCaseBtn) els.matchCaseBtn.onclick = () => { state.modes[state.activeMode].matchCase = !state.modes[state.activeMode].matchCase; saveState(); renderModeUI(); };
    if (els.wholeWordBtn) els.wholeWordBtn.onclick = () => { state.modes[state.activeMode].wholeWord = !state.modes[state.activeMode].wholeWord; saveState(); renderModeUI(); };
    if (els.autoCapsBtn) els.autoCapsBtn.onclick = () => { state.modes[state.activeMode].autoCaps = !state.modes[state.activeMode].autoCaps; saveState(); renderModeUI(); };
    if (els.modeSelect) els.modeSelect.onchange = () => { state.activeMode = els.modeSelect.value; saveState(); renderModeUI(); };
    if (els.addModeBtn) els.addModeBtn.onclick = () => { const n = prompt('Tên mới:'); if (n && !state.modes[n]) { state.modes[n] = { pairs: [], matchCase:false, wholeWord:false, autoCaps:false }; state.activeMode = n; saveState(); renderModeUI(); } };
    if (els.renameModeBtn) els.renameModeBtn.onclick = () => { const n = prompt('Tên mới:', state.activeMode); if (n && !state.modes[n]) { state.modes[n] = state.modes[state.activeMode]; delete state.modes[state.activeMode]; state.activeMode = n; saveState(); renderModeUI(); } };
    if (els.deleteModeBtn) els.deleteModeBtn.onclick = () => { if (confirm('Xóa?')) { delete state.modes[state.activeMode]; state.activeMode = 'Mặc định'; saveState(); renderModeUI(); } };
    if (els.addPairBtn) els.addPairBtn.onclick = () => { addPairUI(); els.puncList.firstChild.querySelector('input').focus(); };
    if (els.saveSettingsBtn) els.saveSettingsBtn.onclick = () => { savePairs(); notify('Đã lưu tất cả!'); };

    if (els.exportReplaceBtn) {
        els.exportReplaceBtn.onclick = () => {
            let csv = "\uFEFFfind,replace,mode\n";
            Object.keys(state.modes).forEach(m => state.modes[m].pairs.forEach(p => csv += `"${p.find.replace(/"/g,'""')}","${p.replace.replace(/"/g,'""')}","${m}"\n`));
            const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
            const a = document.createElement('a'); a.href=url; a.download='settings.csv'; a.click();
        };
    }
    if (els.importReplaceBtn) {
        els.importReplaceBtn.onclick = () => {
            const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv';
            inp.onchange = e => {
                if(!e.target.files[0]) return;
                const r = new FileReader();
                r.onload = ev => {
                    const lines = ev.target.result.split(/\r?\n/);
                    if (!lines[0].toLowerCase().includes('find,replace,mode')) return notify('Lỗi file CSV!', 'error');
                    let count = 0;
                    for(let i=1; i<lines.length; i++) {
                        // Regex đơn giản để bắt find, replace, mode (chấp nhận cả giá trị rỗng)
                        const match = lines[i].match(/^\s*"(.*?)","(.*?)"\s*,\s*"(.*?)"\s*$/); // Cải tiến regex để bắt các trường có dấu ""
                        if (match) {
                            const [_, f, r, mn] = match;
                            if (!state.modes[mn]) state.modes[mn] = {pairs:[], matchCase:false, wholeWord:false, autoCaps:false};
                            state.modes[mn].pairs.push({find: f.replace(/""/g,'"'), replace: r.replace(/""/g,'"')});
                            count++;
                        } else {
                            // Xử lý các dòng không có dấu nháy kép (simple case)
                            const parts = lines[i].split(',');
                            if(parts.length >= 3) {
                                const [f, r, mn] = parts;
                                if (!state.modes[mn]) state.modes[mn] = {pairs:[], matchCase:false, wholeWord:false, autoCaps:false};
                                state.modes[mn].pairs.push({find: f.trim(), replace: r.trim()});
                                count++;
                            }
                        }
                    }
                    saveState(); renderModeUI(); notify(`Nhập ${count} cặp thay thế thành công!`);
                };
                r.readAsText(e.target.files[0]);
            };
            inp.click();
        };
    }

    function updateFont() {
        if (!els.editor || !els.fontFamily || !els.fontSize) return;
        els.editor.style.setProperty('font-family', els.fontFamily.value, 'important');
        els.editor.style.setProperty('font-size', els.fontSize.value, 'important');
    }
    if (els.fontFamily) els.fontFamily.onchange = updateFont;
    if (els.fontSize) els.fontSize.onchange = updateFont;
    
    function updateKwUI() {
        if (els.kwMatchCaseBtn) updateToggle(els.kwMatchCaseBtn, state.keywordSettings.matchCase);
        if (els.kwWholeWordBtn) updateToggle(els.kwWholeWordBtn, state.keywordSettings.wholeWord);
    }
    if (els.kwMatchCaseBtn) els.kwMatchCaseBtn.onclick = () => { 
        state.keywordSettings.matchCase = !state.keywordSettings.matchCase; saveState(); updateKwUI(); highlightOnInput(); 
    };
    if (els.kwWholeWordBtn) els.kwWholeWordBtn.onclick = () => { 
        state.keywordSettings.wholeWord = !state.keywordSettings.wholeWord; saveState(); updateKwUI(); highlightOnInput(); 
    };
    
    updateKwUI();

    function updateWordCount() {
        if (!els.editor || !els.wordCount) return;
        const txt = els.editor.innerText || '';
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
    }
    
    // === NÚT HIGHLIGHT KEYWORDS ONLY ===
    if (els.searchBtn) {
        els.searchBtn.onclick = () => { 
            if (els.sidebarInput) addKeyword(els.sidebarInput.value);
            
            // Bước 1: Lấy text thuần
            const plainText = els.editor.innerText;
            
            // Bước 2: Chạy highlight trên chuỗi (không cần, vì highlightKeywordsDOM() đã làm việc đó)
            // Thay vì dùng highlightKeywordsString() (tạo HTML và thay thế), ta chỉ cần reset text về thuần
            // và gọi highlightKeywordsDOM() để tối ưu cho việc gõ/xóa.
            
            els.editor.textContent = plainText; // Reset về text thuần, xóa hết Vàng/Xanh/Tím
            
            // Bước 3: Chạy highlight keywords trên DOM
            // Dùng setTimeout để không chặn UI và để đảm bảo `textContent = plainText` được render
            setTimeout(() => {
                const count = highlightKeywordsDOM(); 
                
                if (count > 0) notify(`Đã tìm thấy & highlight ${count} từ khóa.`);
                else notify('Không tìm thấy từ khóa nào trong văn bản.', 'warning');
            }, 50); // Cho phép UI Thread giải lao
        };
    }

    if (els.clearBtn) {
        els.clearBtn.onclick = () => { 
            if (els.editor) els.editor.innerHTML = ''; 
            updateWordCount(); 
        };
    }

    if (els.copyBtn) {
        els.copyBtn.onclick = () => { 
            if (!els.editor || !els.editor.innerText.trim()) return notify('Trống!', 'error'); 
            navigator.clipboard.writeText(els.editor.innerText); 
            notify('Đã copy vào clipboard!');
            els.editor.innerHTML = ''; 
            updateWordCount();
        };
    }

    if (els.replaceBtn) {
        els.replaceBtn.onclick = performReplaceAll;
    }

    // === INIT ===
    renderTags(); renderModeUI(); updateFont(); updateWordCount();
    // Chạy highlight lần đầu tiên khi load nếu có nội dung
    if (els.editor.innerHTML.trim()) {
        setTimeout(() => highlightKeywordsDOM(), 100);
    }
    
    // Khôi phục nội dung editor từ state nếu có
    if (els.editor && state.editorContent) {
        els.editor.innerHTML = state.editorContent;
        // els.editor.addEventListener('input', () => state.editorContent = els.editor.innerHTML); // Giữ nguyên, không lưu
    }
});
