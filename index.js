document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const STORAGE_KEY = 'trinh_hg_pro_v21_final_patched';
    
    // Ký tự Private Use Area để đánh dấu (Dùng cho Replace Logic)
    const MARK_REP_START = '\uE000';
    const MARK_REP_END = '\uE001';
    const MARK_CAP_START = '\uE002';
    const MARK_CAP_END = '\uE003';
    
    // Bổ sung ký tự PUA để dễ dàng loại bỏ/phân biệt trong quá trình xử lý chuỗi
    const MARK_KW_START = '\uE004';
    const MARK_KW_END = '\uE005';
    const PUA_CHARS = [MARK_REP_START, MARK_REP_END, MARK_CAP_START, MARK_CAP_END, MARK_KW_START, MARK_KW_END];

    const KW_COLORS = ['hl-pink', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red'];
    const KW_SPANS_REGEX = new RegExp(`(${KW_COLORS.map(c => `<span class="${c}">.*?<\/span>`).join('|')})`, 'g');

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
        
        notify: document.getElementById('notification-container')
    };

    // === CORE FUNCTIONS ===

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

    // === FIX LỖI 1: XỬ LÝ PASTE ===
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
    
    // Hàm loại bỏ tất cả các đánh dấu PUA (chuẩn hóa về text thuần sau khi replace)
    function stripPUAMarks(text) {
        return text.replace(/[\uE000-\uE005]/g, '');
    }

    // === TÁC VỤ ẢNH HƯỞNG LỚN ĐẾN HIỆU SUẤT ===
    
    // Tối ưu hóa: Thay thế từng chunk (block) để không block UI thread
    // Hàm này chỉ thực hiện logic thay thế, trả về chuỗi đã đánh dấu PUA
    function performChunkedReplace(rawText) {
        const mode = state.modes[state.activeMode];
        const rules = mode.pairs
            .filter(p => p.find && p.find.trim())
            .map(p => ({ find: normalizeText(p.find), replace: normalizeText(p.replace || '') }))
            .sort((a,b) => b.find.length - a.find.length);

        const textLines = rawText.split('\n');
        let processedLines = [];
        let replaceCount = 0;
        
        return new Promise(resolve => {
            let i = 0;
            
            function processLine() {
                if (i >= textLines.length) {
                    return resolve({ text: processedLines.join('\n'), count: replaceCount });
                }

                let line = normalizeText(textLines[i]);
                
                // 1. User Replace Pairs
                rules.forEach(rule => {
                    const pattern = escapeRegExp(rule.find);
                    const flags = mode.matchCase ? 'g' : 'gi';
                    let regex;
                    
                    // Sử dụng lookbehind (?<!...) và lookahead (?!...) với Unicode property \p{L}\p{N}_
                    if (mode.wholeWord) {
                        regex = new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u');
                    } else {
                        regex = new RegExp(pattern, flags);
                    }

                    line = line.replace(regex, (match) => {
                        replaceCount++;
                        let replacement = rule.replace;
                        if (!mode.matchCase) replacement = preserveCase(match, replacement);
                        return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                    });
                });

                // 2. Auto Caps
                if (mode.autoCaps) {
                    // Regex tìm ký tự chữ cái thường (\p{Ll}) ngay sau dấu chấm/chấm hỏi/chấm than/xuống dòng
                    const autoCapsRegex = /(^|[\.?!\n]\s*)(?:\uE000|\uE001|\uE002|\uE003)*([\p{Ll}])/gmu;
                    line = line.replace(autoCapsRegex, (fullMatch, prefix, char) => {
                        // Tránh Auto Caps vào giữa các đánh dấu PUA của replace, nhưng cho phép nó đi qua
                        const cleanPrefix = prefix.replace(/[\uE000-\uE003]/g, '');
                        return `${cleanPrefix}${MARK_CAP_START}${char.toUpperCase()}${MARK_CAP_END}`;
                    });
                }
                
                processedLines.push(line);
                i++;
                // Sử dụng setTimeout để nhường lại quyền điều khiển cho UI thread (giống Web Worker/Promise.resolve)
                setTimeout(processLine, 0); 
            }
            processLine();
        });
    }

    // Hàm xây dựng HTML từ chuỗi đã đánh dấu PUA
    function buildFinalHTML(processedText) {
        let finalHTML = '';
        let buffer = '';
        
        for (let i = 0; i < processedText.length; i++) {
            const c = processedText[i];
            
            if (c === MARK_REP_START) {
                finalHTML += escapeHTML(buffer) + '<span class="hl-yellow">';
                buffer = '';
            } else if (c === MARK_REP_END) {
                finalHTML += escapeHTML(buffer) + '</span>';
                buffer = '';
            } else if (c === MARK_CAP_START) {
                finalHTML += escapeHTML(buffer) + '<span class="hl-blue">';
                buffer = '';
            } else if (c === MARK_CAP_END) {
                finalHTML += escapeHTML(buffer) + '</span>';
                buffer = '';
            } else if (c === MARK_KW_START) {
                // Đánh dấu keyword được xử lý sau, không cần escape buffer
                const colorIdx = parseInt(processedText[i + 1]);
                i++; // Bỏ qua index màu
                finalHTML += escapeHTML(buffer) + `<span class="keyword ${KW_COLORS[colorIdx % KW_COLORS.length]}">`;
                buffer = '';
            } else if (c === MARK_KW_END) {
                finalHTML += escapeHTML(buffer) + '</span>';
                buffer = '';
            } else {
                buffer += c;
            }
        }
        finalHTML += escapeHTML(buffer);
        return finalHTML;
    }

    // === FIX LỖI 3 (PHẦN 1): REPLACE LOGIC CHÍNH ===
    // Tách UI Update ra khỏi Logic nặng
    async function performReplaceAll() {
        if (!els.editor) return notify('Lỗi editor!', 'error');

        // Lấy text thuần từ editor (bảo toàn cấu trúc dòng)
        let rawText = els.editor.innerText; 
        if (!rawText.trim()) return notify('Editor trống!', 'error');

        const originalTextBtn = els.replaceBtn.textContent;
        els.replaceBtn.textContent = 'Đang xử lý Replace...';
        els.replaceBtn.disabled = true;

        try {
            // Bước 1: Replace nặng (Chunked/Async)
            const replaceResult = await performChunkedReplace(rawText);
            let processedText = replaceResult.text;
            const replaceCount = replaceResult.count;
            
            // Bước 2: Highlight Keywords (Sau Replace)
            if (state.keywords.length > 0) {
                els.replaceBtn.textContent = 'Đang xử lý Highlight...';
                const highlightResult = await performChunkedHighlight(processedText, false);
                processedText = highlightResult.text;
            }
            
            // Bước 3: Build HTML & Update DOM
            els.replaceBtn.textContent = 'Đang cập nhật DOM...';
            const finalHTML = buildFinalHTML(processedText);

            // Gán innerHTML 1 lần duy nhất!
            // Đây là bước nặng nhất, nhưng nó được thực hiện sau tất cả logic chuỗi.
            els.editor.innerHTML = finalHTML;
            
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

    // === FIX LỖI 2: HIGHLIGHT KHÔNG GÂY LAG/NHẢY CON TRỎ ===
    // Tối ưu hóa: Highlight trên chuỗi thuần, dùng PUA, không đụng DOM.
    // Nếu isStandalone=true: Xóa tất cả đánh dấu PUA cũ (Reset)
    async function performChunkedHighlight(rawText, isStandalone) {
        if (!state.keywords.length) return { text: rawText, count: 0 };

        let text = rawText;
        if (isStandalone) {
            // Nếu là Standalone Search (nút Highlight Keywords Only), cần xóa tất cả đánh dấu PUA cũ (Replace/Caps/Keyword cũ)
            text = stripPUAMarks(rawText);
        }

        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.find.length);
        const matchCase = state.keywordSettings.matchCase;
        const wholeWord = state.keywordSettings.wholeWord;
        const wordCharRegex = /[\p{L}\p{N}_]/u;
        
        let highlightCount = 0;

        return new Promise(resolve => {
            const lines = text.split('\n');
            let processedLines = [];
            let i = 0;

            function processLine() {
                if (i >= lines.length) {
                    return resolve({ text: processedLines.join('\n'), count: highlightCount });
                }

                let line = lines[i];
                let lineText = matchCase ? line : line.toLowerCase();
                let lineCount = 0;
                let replacements = [];

                // Tìm tất cả vị trí highlight
                for (let k = 0; k < sortedKws.length; k++) {
                    const kw = sortedKws[k];
                    const searchKw = matchCase ? kw : kw.toLowerCase();
                    let cursor = 0;

                    while (cursor < lineText.length) {
                        const idx = lineText.indexOf(searchKw, cursor);
                        if (idx === -1) break;
                        
                        if (wholeWord) {
                            const prev = idx > 0 ? lineText[idx-1] : '';
                            const next = idx + searchKw.length < lineText.length ? lineText[idx+searchKw.length] : '';
                            if (wordCharRegex.test(prev) || wordCharRegex.test(next)) {
                                cursor = idx + 1; continue;
                            }
                        }
                        
                        // Đảm bảo không highlight đè lên ký tự PUA (của replace/caps)
                        if (PUA_CHARS.includes(line[idx]) || PUA_CHARS.includes(line[idx + searchKw.length - 1])) {
                             cursor = idx + 1; continue;
                        }
                        
                        replacements.push({ start: idx, end: idx + searchKw.length, color: k });
                        cursor = idx + searchKw.length;
                    }
                }
                
                // Sắp xếp theo vị trí bắt đầu và xử lý chồng lấn (chọn từ dài hơn)
                replacements.sort((a, b) => a.start - b.start);
                
                let finalReplacements = [];
                let lastEnd = -1;
                let buffer = '';

                for(let j = 0; j < replacements.length; j++) {
                    const current = replacements[j];
                    
                    if (current.start >= lastEnd) {
                        // Tìm đoạn chồng lấn tốt nhất (từ dài hơn)
                        let best = current;
                        let maxEnd = current.end;
                        let nextIdx = j + 1;
                        
                        while(nextIdx < replacements.length && replacements[nextIdx].start < maxEnd) {
                            if (replacements[nextIdx].end > maxEnd) {
                                best = replacements[nextIdx].end > current.end ? replacements[nextIdx] : best;
                            }
                            nextIdx++;
                        }
                        
                        if(best.start >= lastEnd) {
                            finalReplacements.push(best);
                            lastEnd = best.end;
                            lineCount++;
                        }
                    }
                }
                
                // Chèn đánh dấu PUA vào chuỗi line
                lastEnd = 0;
                buffer = '';
                for(const r of finalReplacements) {
                    buffer += line.substring(lastEnd, r.start);
                    buffer += `${MARK_KW_START}${r.color}${line.substring(r.start, r.end)}${MARK_KW_END}`;
                    lastEnd = r.end;
                }
                buffer += line.substring(lastEnd);
                
                processedLines.push(buffer);
                highlightCount += lineCount;
                i++;
                // Sử dụng setTimeout để nhường lại quyền điều khiển cho UI thread
                setTimeout(processLine, 0); 
            }
            processLine();
        });
    }

    // === TAB & SIDEBAR LOGIC (Không thay đổi) ===
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
            els.sidebarToggle.classList.toggle('hidden', !(tabId === 'main-tab' || tabId === 'settings-tab'));
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

    // === KEYWORDS MANAGEMENT (Giữ nguyên logic) ===
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
            // KHÔNG highlightKeywordsDOM() ngay, chờ user ấn nút Search
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
                // KHÔNG highlightKeywordsDOM() ngay, chờ user ấn nút Search
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
                    renderTags(); saveState(); notify(`Đã thêm ${count} từ khóa!`);
                };
                r.readAsText(e.target.files[0]);
            };
            inp.click();
        };
    }

    // === SETTINGS UI (Không thay đổi) ===
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
    if (els.kwMatchCaseBtn) els.kwMatchCaseBtn.onclick = () => { state.keywordSettings.matchCase = !state.keywordSettings.matchCase; saveState(); updateKwUI(); }; // Bỏ highlightKeywordsDOM()
    if (els.kwWholeWordBtn) els.kwWholeWordBtn.onclick = () => { state.keywordSettings.wholeWord = !state.keywordSettings.wholeWord; saveState(); updateKwUI(); }; // Bỏ highlightKeywordsDOM()
    
    updateKwUI();

    function updateWordCount() {
        if (!els.editor || !els.wordCount) return;
        const txt = els.editor.innerText || '';
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
    }
    if (els.editor) els.editor.addEventListener('input', updateWordCount);

    // === NÚT HIGHLIGHT KEYWORDS ONLY ===
    if (els.searchBtn) {
        els.searchBtn.onclick = async () => { 
            if (els.sidebarInput) addKeyword(els.sidebarInput.value);
            if (!els.editor.innerText.trim()) return notify('Editor trống!', 'error');

            els.searchBtn.disabled = true;
            els.searchBtn.textContent = 'Đang xử lý...';
            
            try {
                // Bước 1: Lấy text thuần
                const plainText = els.editor.innerText;
                
                // Bước 2: Chạy highlight keywords (Standalone=true -> Reset tất cả đánh dấu PUA)
                const highlightResult = await performChunkedHighlight(plainText, true); 
                
                // Bước 3: Build HTML & Update DOM
                const finalHTML = buildFinalHTML(highlightResult.text);
                els.editor.innerHTML = finalHTML;
                
                if (highlightResult.count > 0) notify(`Đã tìm thấy & highlight ${highlightResult.count} từ khóa.`);
                else notify('Không tìm thấy từ khóa nào trong văn bản.', 'warning');
            } catch(e) {
                console.error(e);
                notify('Lỗi: ' + e.message, 'error');
            } finally {
                els.searchBtn.textContent = 'Highlight Keywords Only';
                els.searchBtn.disabled = false;
            }
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
});
