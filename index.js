document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v21_final_patched';
    
    // Ký tự Private Use Area để đánh dấu (Dùng cho Replace Logic)
    const MARK_REP_START = '\uE000';
    const MARK_REP_END = '\uE001';
    const MARK_CAP_START = '\uE002';
    const MARK_CAP_END = '\uE003';
    
    // Hệ thống 20 màu Pastel + 3 sắc độ = 60 màu hiệu dụng
    const PASTEL_COLORS = [
        "#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9", "#BAE1FF",
        "#E0BBE4", "#957DAD", "#D291BC", "#FFC72C", "#C5E3BF",
        "#8D9440", "#FEC8D8", "#D9E3F0", "#FFD6A5", "#ADF7F9",
        "#FEEAFA", "#C1E0D1", "#F7B801", "#98DBC6", "#5BC8AC"
    ];
    
    const SHADES = ['a', 'b', 'c']; // Sắc độ 1 (0.4), Sắc độ 2 (0.7), Sắc độ 3 (1.0 - màu gốc)

    const defaultState = {
        keywords: [],
        keywordSettings: { matchCase: false, wholeWord: false },
        activeMode: 'Mặc định',
        sidebarOpen: false, 
        modes: {
            'Mặc định': { pairs: [], matchCase: false, wholeWord: false, autoCaps: false }
        },
        editorContent: '' // Lưu trữ content của editor để render lại khi cần
    };

    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes[state.activeMode]) state.activeMode = Object.keys(state.modes)[0] || 'Mặc định';
    if (!state.keywordSettings) state.keywordSettings = { matchCase: false, wholeWord: false };

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
        copyKwBtn: document.getElementById('copy-kw-btn'), // Nút mới
        
        notify: document.getElementById('notification-container')
    };
    
    // Khôi phục nội dung editor từ state (nếu có)
    if (els.editor && state.editorContent) {
        els.editor.innerHTML = state.editorContent;
    }


    // === CORE FUNCTIONS & UTILS ===

    function saveState() {
        // Luôn lưu nội dung editor (text thuần) để khôi phục sau
        if (els.editor) state.editorContent = els.editor.innerText;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = msg;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }
    
    // Debounce function - ngăn hàm chạy quá nhiều lần
    function debounce(func, timeout = 300){
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => { func.apply(this, args); }, timeout);
        };
    }

    // FIX LỖI 1: XỬ LÝ PASTE
    // Đảm bảo khi Paste thì giữ nguyên cấu trúc dòng, đặc biệt là dòng trống
    if (els.editor) {
        els.editor.addEventListener('paste', (e) => {
            e.preventDefault();
            // Lấy text thuần
            let text = (e.clipboardData || window.clipboardData).getData('text/plain');
            
            // Chuẩn hóa xuống dòng để đảm bảo nhất quán
            text = text.replace(/\r\n/g, '\n');
            
            // Chèn text vào vị trí con trỏ
            document.execCommand('insertText', false, text);
            // Sau khi dán, gọi debounce highlight để không bị lag ngay lập tức
            debouncedHighlight();
        });
    }

    // --- UTILS ---
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

    /**
     * TỔNG HỢP REPLACE & HIGHLIGHT Keywords trên chuỗi thuần, sau đó render 1 lần.
     * @param {string} rawText - Văn bản thô từ editor.
     * @param {boolean} onlyKeywords - Chỉ chạy highlight keywords (bỏ qua replace/autocaps).
     */
    async function processAndRenderText(rawText, onlyKeywords = false) {
        if (!els.editor) return notify('Lỗi editor!', 'error');
        if (!rawText.trim()) return 0;
        
        let processedText = normalizeText(rawText);
        let replaceCount = 0;
        let finalHTML = '';
        
        const originalTextBtn = els.replaceBtn.textContent;
        if (!onlyKeywords) {
            els.replaceBtn.textContent = 'Đang xử lý...';
            els.replaceBtn.disabled = true;
        }

        // Tối ưu: Chia tác vụ để UI không bị block
        await new Promise(r => setTimeout(r, 0)); 

        try {
            // 1. User Replace Pairs (Chỉ chạy nếu không phải chế độ 'onlyKeywords')
            if (!onlyKeywords) {
                const mode = state.modes[state.activeMode];
                if (mode.pairs.length > 0) {
                    const rules = mode.pairs
                        .filter(p => p.find && p.find.trim())
                        .map(p => ({ find: normalizeText(p.find), replace: normalizeText(p.replace || '') }))
                        .sort((a,b) => b.find.length - a.find.length); // Sắp xếp theo độ dài giảm dần để ưu tiên replace cụm dài

                    // Gom tất cả rules vào 1 regex LỚN (không cần) vì cần preserveCase và wholeWord
                    // -> Vẫn phải lặp qua từng rule, nhưng tối ưu hơn cách làm DOM cũ
                    rules.forEach(rule => {
                        const pattern = escapeRegExp(rule.find);
                        const flags = mode.matchCase ? 'g' : 'gi';
                        let regex;
                        
                        if (mode.wholeWord) {
                            // Regex tìm toàn bộ từ (non-word boundary)
                            regex = new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u');
                        } else {
                            regex = new RegExp(pattern, flags);
                        }

                        // Replace trên chuỗi, đánh dấu bằng MARK_REP_START/END
                        processedText = processedText.replace(regex, (match) => {
                            replaceCount++;
                            let replacement = rule.replace;
                            if (!mode.matchCase) replacement = preserveCase(match, replacement);
                            return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                        });
                    });
                }

                // 2. Auto Caps (Chỉ chạy nếu không phải chế độ 'onlyKeywords')
                if (mode.autoCaps) {
                    const autoCapsRegex = /(^|[\.?!\n]\s*)(?:\uE000|\uE001|\uE002|\uE003)*([\p{Ll}])/gmu;
                    processedText = processedText.replace(autoCapsRegex, (fullMatch, prefix, char) => {
                        return `${prefix}${MARK_CAP_START}${char.toUpperCase()}${MARK_CAP_END}`;
                    });
                }
            }

            // Tối ưu: Chia tác vụ
            await new Promise(r => setTimeout(r, 0)); 
            
            // 3. Highlight Keywords (CHẠY LUÔN, ĐÈ LÊN KẾT QUẢ REPLACE/AUTOCAPS)
            if (state.keywords.length > 0) {
                const { outputText, count } = performHighlightString(processedText);
                processedText = outputText;
                if(onlyKeywords) replaceCount = count;
                // Lưu ý: Trong chế độ replace, replaceCount vẫn giữ nguyên (chỉ đếm replace, không đếm highlight)
            }

            // 4. Rebuild HTML
            // Chuyển ký tự MARK thành thẻ <span> tương ứng và áp dụng highlight keywords
            finalHTML = rebuildHTMLFromMarkedText(processedText);

            // 5. Cập nhật DOM (1 LẦN DUY NHẤT)
            els.editor.innerHTML = finalHTML;

            updateWordCount();
            
            if (onlyKeywords) {
                 if (replaceCount > 0) notify(`Đã tìm thấy & highlight ${replaceCount} từ khóa.`);
                 else notify('Không tìm thấy từ khóa nào trong văn bản.', 'warning');
            } else {
                if (replaceCount > 0) notify(`Thay thế ${replaceCount} cụm từ!`);
                else if (state.modes[state.activeMode].autoCaps) notify('Đã chạy Auto Caps!');
                else notify('Không tìm thấy gì để thay thế.', 'warning');
            }
            
            saveState(); // Cập nhật state với nội dung editor mới

        } catch (e) {
            console.error(e);
            notify('Lỗi: ' + e.message, 'error');
        } finally {
            if (!onlyKeywords) {
                els.replaceBtn.textContent = originalTextBtn;
                els.replaceBtn.disabled = false;
            }
        }
        return replaceCount;
    }
    
    /**
     * FIX LỖI 2: CHUYỂN HIGHLIGHT SANG XỬ LÝ CHUỖI VÀ GOM REGEX
     * @param {string} text - Chuỗi văn bản đã qua xử lý replace/autocaps
     */
    function performHighlightString(text) {
        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);
        if (sortedKws.length === 0) return { outputText: text, count: 0 };

        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        let highlightCount = 0;
        
        // 1. Gom tất cả Keywords thành 1 Regex LỚN
        const patterns = sortedKws.map(kw => `(${escapeRegExp(kw)})`).join('|');
        const flags = matchCase ? 'g' : 'gi';
        let regex;
        
        if (wholeWord) {
            // Regex tìm toàn bộ từ
            // \b không hoạt động chính xác với tiếng Việt, dùng [^\p{L}\p{N}_]
            // Hoặc đơn giản là lookbehind/lookahead phủ định
            regex = new RegExp(`(?<![\\p{L}\\p{N}_])(${patterns})(?![\\p{L}\\p{N}_])`, flags + 'u');
        } else {
            regex = new RegExp(`(${patterns})`, flags + 'u');
        }
        
        let outputText = text;
        const KW_MARK_START = '\uE004'; // Ký tự đánh dấu mới cho Keyword Highlight
        const KW_MARK_END = '\uE005';
        
        // 2. Chạy replace 1 lần duy nhất trên chuỗi
        // Dùng index của keyword trong mảng state.keywords để tạo class màu động
        outputText = outputText.replace(regex, (match) => {
            highlightCount++;
            
            // Tìm index của keyword trong mảng gốc để gán màu
            let kwIndex = -1;
            for(let i = 0; i < state.keywords.length; i++) {
                const kw = state.keywords[i];
                // So sánh match với keyword (có/không phân biệt chữ hoa)
                if ((!matchCase && match.toLowerCase() === kw.toLowerCase()) || (matchCase && match === kw)) {
                    kwIndex = i;
                    break;
                }
            }
            
            // Xử lý logic gán màu (dùng KW_COLORS cũ hoặc PASTEL_COLORS mới)
            const colorIndex = kwIndex !== -1 ? kwIndex : 0;
            const shadeIndex = colorIndex % SHADES.length; // 0, 1, 2
            const baseColorIndex = Math.floor(colorIndex / SHADES.length) % PASTEL_COLORS.length; // 0..19

            // Tạo class CSS động: hl-keyword-Index_Shade
            const className = `hl-keyword-${baseColorIndex}-${SHADES[shadeIndex]}`; 
            
            // Thay thế bằng đánh dấu: MARK_START_CLASSNAME + text + MARK_END
            return `${KW_MARK_START}${className}${KW_MARK_END}${match}`;
        });

        return { outputText, count: highlightCount };
    }

    /**
     * Dùng sau khi chuỗi đã được xử lý (replace, autocaps, keywords)
     */
    function rebuildHTMLFromMarkedText(processedText) {
        let finalHTML = '';
        let buffer = '';
        
        // Regex tìm tất cả các MARK
        const markRegex = new RegExp(`[${MARK_REP_START}-${MARK_CAP_END}\uE004\uE005]`, 'g');
        let match;
        let lastIndex = 0;

        while ((match = markRegex.exec(processedText)) !== null) {
            const index = match.index;
            const mark = match[0];
            
            // 1. Đưa buffer (text thuần) vào HTML
            if (index > lastIndex) {
                buffer = processedText.substring(lastIndex, index);
                finalHTML += escapeHTML(buffer);
            }

            // 2. Xử lý MARK
            switch (mark) {
                case MARK_REP_START: finalHTML += '<span class="hl-yellow">'; break;
                case MARK_REP_END: finalHTML += '</span>'; break;
                case MARK_CAP_START: finalHTML += '<span class="hl-blue">'; break;
                case MARK_CAP_END: finalHTML += '</span>'; break;
                case '\uE004': // KW_MARK_START
                    // Lấy ClassName nằm ngay sau MARK_START
                    const classMatch = processedText.substring(index + 1).match(/^([a-zA-Z0-9\-]+)\uE005/);
                    if (classMatch) {
                        const className = classMatch[1];
                        finalHTML += `<span class="keyword hl ${className}">`;
                        lastIndex = index + 1 + className.length + 1; // Bỏ qua MARK_START, ClassName và KW_MARK_END
                        markRegex.lastIndex = lastIndex; // Điều chỉnh vị trí bắt đầu tìm kiếm tiếp theo
                    }
                    break;
                case '\uE005': // KW_MARK_END (Chỉ áp dụng cho highlight keywords)
                    // Nếu gặp KW_MARK_END mà không đi sau KW_MARK_START (do lỗi/vô tình), ta bỏ qua
                    // Nếu là kết thúc của highlight keywords, ta đóng thẻ span
                    if (processedText.substring(index - 1, index + 1).match(/[\uE004]/)) break; // Bỏ qua vì đã xử lý ở KW_MARK_START
                    finalHTML += '</span>'; 
                    lastIndex = index + 1;
                    break;
                default: 
                    // Bỏ qua các MARK không xác định
                    lastIndex = index + 1;
                    break;
            }
        }

        // 3. Đưa phần còn lại của buffer vào HTML
        if (lastIndex < processedText.length) {
            buffer = processedText.substring(lastIndex);
            finalHTML += escapeHTML(buffer);
        }

        return finalHTML;
    }
    
    // Tạo hàm debounce
    const debouncedHighlight = debounce(() => {
        if(els.editor.innerText.trim()) {
            // Chế độ gõ/input: CHỈ highlight keywords, không chạy replace/autocaps
            processAndRenderText(els.editor.innerText, true);
        }
        saveState(); // Lưu trạng thái khi có thay đổi
    }, 300);

    // === EVENT LISTENERS CŨ ĐÃ SỬA ===
    if (els.editor) els.editor.addEventListener('input', () => { 
        updateWordCount();
        debouncedHighlight(); // Thay thế highlightKeywordsDOM cũ
    });

    if (els.searchBtn) {
        els.searchBtn.onclick = () => { 
            if (els.sidebarInput) addKeyword(els.sidebarInput.value);
            
            // Bước 1: Lấy text thuần
            const plainText = els.editor.innerText;
            els.editor.textContent = plainText; // Reset về text thuần (quan trọng!)
            
            // Bước 2: Chạy highlight keywords (chế độ onlyKeywords)
            processAndRenderText(plainText, true); 
        };
    }

    if (els.replaceBtn) {
        els.replaceBtn.onclick = () => {
            const rawText = els.editor.innerText;
            if (!rawText.trim()) return notify('Editor trống!', 'error');
            processAndRenderText(rawText, false); // Chạy chế độ Replace
        };
    }

    // === CÁC HÀM KHÁC GIỮ NGUYÊN HOẶC CHỈNH SỬA NHỎ ===

    // === TAB & SIDEBAR LOGIC ===
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
            els.sidebarToggle.classList.toggle('hidden', !(tabId === 'main-tab' || tabId === 'display-tab'));
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
            if (!state.keywords.includes(k)) {
                state.keywords.push(k);
                changed = true;
            }
        });
        if (changed) {
            renderTags(); saveState(); 
            // Sau khi thêm keyword, chạy lại highlight
            if(els.editor.innerText.trim()) processAndRenderText(els.editor.innerText, true);
        }
        if (els.sidebarInput) els.sidebarInput.value = '';
        if (els.fullKwInput) els.fullKwInput.value = '';
    }

    function renderTags() {
        const html = state.keywords.map(k => `
            <div class="tag"><span>${escapeHTML(k)}</span><span class="remove-tag" data-kw="${escapeHTML(k)}">×</span></div>
        `).join('');
        if (els.sidebarTags) els.sidebarTags.innerHTML = html;
        if (els.fullKwTags) els.fullKwTags.innerHTML = html;
        document.querySelectorAll('.remove-tag').forEach(btn => {
            btn.onclick = (e) => {
                state.keywords = state.keywords.filter(k => k !== e.target.dataset.kw);
                renderTags(); saveState(); 
                // Sau khi xóa keyword, chạy lại highlight
                if(els.editor.innerText.trim()) processAndRenderText(els.editor.innerText, true);
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
    
    // Nút COPY KEYWORDS (Yêu cầu mới)
    if (els.copyKwBtn) {
        els.copyKwBtn.onclick = () => {
            if (!state.keywords.length) return notify('Danh sách trống!', 'warning');
            const copyText = state.keywords.map(kw => {
                // Thêm dấu ngoặc kép nếu keyword có chứa dấu phẩy
                return kw.includes(',') ? `"${kw}"` : kw;
            }).join(', ');
            
            navigator.clipboard.writeText(copyText);
            notify('Đã copy keywords vào clipboard!');
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
                        if (!state.keywords.includes(l)) {
                            state.keywords.push(l); count++;
                        }
                    });
                    renderTags(); saveState(); 
                    if(els.editor.innerText.trim()) processAndRenderText(els.editor.innerText, true); // Update highlight
                    notify(`Đã thêm ${count} từ khóa!`);
                };
                r.readAsText(e.target.files[0]);
            };
            inp.click();
        };
    }

    // === SETTINGS UI (GIỮ NGUYÊN) ===
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
                        const m = lines[i].match(/^"(.*)","(.*)","(.*)"$/);
                        if (m) {
                            const [_, f, r, mn] = m;
                            if (!state.modes[mn]) state.modes[mn] = {pairs:[], matchCase:false, wholeWord:false, autoCaps:false};
                            state.modes[mn].pairs.push({find: f.replace(/""/g,'"'), replace: r.replace(/""/g,'"')});
                            count++;
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
    if (els.kwMatchCaseBtn) els.kwMatchCaseBtn.onclick = () => { state.keywordSettings.matchCase = !state.keywordSettings.matchCase; saveState(); updateKwUI(); if(els.editor.innerText.trim()) processAndRenderText(els.editor.innerText, true); };
    if (els.kwWholeWordBtn) els.kwWholeWordBtn.onclick = () => { state.keywordSettings.wholeWord = !state.keywordSettings.wholeWord; saveState(); updateKwUI(); if(els.editor.innerText.trim()) processAndRenderText(els.editor.innerText, true); };
    
    updateKwUI();

    function updateWordCount() {
        if (!els.editor || !els.wordCount) return;
        // Dùng textContent hoặc innerText (không dùng innerHTML)
        const txt = els.editor.innerText || ''; 
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
    }

    if (els.clearBtn) {
        els.clearBtn.onclick = () => { 
            if (els.editor) els.editor.innerHTML = ''; 
            updateWordCount(); 
            saveState();
        };
    }

    if (els.copyBtn) {
        els.copyBtn.onclick = () => { 
            if (!els.editor || !els.editor.innerText.trim()) return notify('Trống!', 'error'); 
            navigator.clipboard.writeText(els.editor.innerText); 
            notify('Đã copy vào clipboard!');
            els.editor.innerHTML = ''; 
            updateWordCount();
            saveState();
        };
    }

    // === INIT ===
    renderTags(); renderModeUI(); updateFont(); updateWordCount();
    // Chạy highlight ban đầu nếu có nội dung
    if(els.editor.innerText.trim()) processAndRenderText(els.editor.innerText, true); 
});
