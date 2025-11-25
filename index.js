document.addEventListener('DOMContentLoaded', () => {
    // === 1. BLOCK EXTENSION ERRORS ===
    window.addEventListener('error', e => {
        if (e.filename && (e.filename.includes('contentScript') || e.message.includes('extension'))) {
            e.stopImmediatePropagation(); e.preventDefault(); return false;
        }
    });

    // === 2. DOM ELEMENTS ===
    const els = {
        input: document.getElementById('keywords-input'),
        tags: document.getElementById('keywords-tags'),
        search: document.getElementById('search'),
        clear: document.getElementById('clear'),
        copyContent: document.getElementById('copy-editor-content'),
        font: document.getElementById('fontFamily'),
        size: document.getElementById('fontSize'),
        matchCase: document.getElementById('matchCase'),
        wholeWords: document.getElementById('wholeWords'),
        editor: document.getElementById('editor'), // DIV ContentEditable
        modeSel: document.getElementById('mode-select'),
        addMode: document.getElementById('add-mode'),
        delMode: document.getElementById('delete-mode-btn'),
        renameMode: document.getElementById('rename-mode'),
        caseMode: document.getElementById('match-case-replace'),
        puncList: document.getElementById('punctuation-list'),
        addPair: document.getElementById('add-pair'),
        save: document.getElementById('save-settings'),
        replace: document.getElementById('replace-all'),
        notify: document.getElementById('notification-container'),
        exportBtn: document.getElementById('export-csv'),
        importBtn: document.getElementById('import-csv')
    };

    let state = {
        keywords: [],
        replacedTargets: [],
        modes: {},
        activeMode: 'Mặc định'
    };

    const KW_COLORS = ['hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red'];
    const VIET_LETTERS = 'a-zA-Z0-9àáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳỵỷỹýđÀÁÃẠẢĂẮẰẲẴẶÂẤẦẨẪẬÈÉẸẺẼÊỀẾỂỄỆÌÍĨỈỊÒÓÕỌỎÔỐỒỔỖỘƠỚỜỞỠỢÙÚŨỤỦƯỨỪỬỮỰỲỴỶỸÝĐ_';

    // === 3. CORE UTILS ===
    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.innerHTML = type === 'success' ? `✓ ${msg}` : `⚠️ ${msg}`;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }

    const escRgx = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // === 4. HIGHLIGHT ENGINE (DOM BASED) ===
    
    // Hàm tạo Regex
    function getRegex(kw, isWhole, isCase) {
        if (!kw) return null;
        const flags = isCase ? 'g' : 'gi';
        // Logic Whole Words cho Tiếng Việt
        const pattern = isWhole 
            ? `(?<![${VIET_LETTERS}])(${escRgx(kw)})(?![${VIET_LETTERS}])`
            : `(${escRgx(kw)})`;
        try { return new RegExp(pattern, flags); } catch { return null; }
    }

    // Xóa toàn bộ highlight, đưa về text thuần trong DOM nhưng giữ cấu trúc dòng
    function stripHighlights() {
        const spans = els.editor.querySelectorAll('span[class^="hl-"], span.highlight-replaced');
        spans.forEach(span => {
            const parent = span.parentNode;
            while(span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
        });
        // Normalize để gộp các text node bị rời rạc
        els.editor.normalize();
    }

    // Quản lý con trỏ chuột (Caret) để không bị nhảy khi highlight
    function saveCaret() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(els.editor);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    }

    function restoreCaret(charIndex) {
        if (charIndex === null) return;
        const sel = window.getSelection();
        const range = document.createRange();
        let current = 0;
        
        // Hàm đệ quy tìm vị trí caret
        function traverse(node) {
            if (node.nodeType === 3) { // Text node
                const next = current + node.length;
                if (charIndex >= current && charIndex <= next) {
                    range.setStart(node, charIndex - current);
                    range.collapse(true);
                    return true;
                }
                current = next;
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    if (traverse(node.childNodes[i])) return true;
                }
            }
            return false;
        }

        traverse(els.editor);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    // MAIN HIGHLIGHT FUNCTION
    function applyHighlights() {
        // 1. Lưu vị trí con trỏ
        const caretPos = saveCaret();

        // 2. Xóa highlight cũ
        stripHighlights();

        // 3. Chuẩn bị danh sách từ cần tìm
        // Gộp keyword và replaced word. 
        // Replaced words: Luôn highlight vàng (.highlight-replaced).
        // Keywords: Màu theo index.
        const tasks = [];

        // Thêm replaced words (Ưu tiên highlight vàng)
        // Yêu cầu: Highlight từ đã replace chỉ tìm từ hoàn chỉnh
        state.replacedTargets.forEach(word => {
            if(word && word.trim()) {
                tasks.push({ 
                    regex: getRegex(word, true, state.modes[state.activeMode].case), // true = Whole Word
                    className: 'highlight-replaced' 
                });
            }
        });

        // Thêm keywords
        state.keywords.forEach((kw, idx) => {
            if(kw && kw.trim()) {
                tasks.push({
                    regex: getRegex(kw, els.wholeWords.checked, els.matchCase.checked),
                    className: KW_COLORS[idx % KW_COLORS.length]
                });
            }
        });

        if (tasks.length === 0) {
            restoreCaret(caretPos);
            return;
        }

        // 4. Duyệt cây DOM (TreeWalker) để tìm và wrap text
        const walker = document.createTreeWalker(els.editor, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        while(walker.nextNode()) textNodes.push(walker.currentNode);

        // Duyệt từng text node
        textNodes.forEach(node => {
            if (!node.nodeValue.trim()) return;

            // Tìm match đầu tiên tốt nhất trong node này
            // Lưu ý: Chỉ xử lý text thuần, không chèn HTML string
            let content = node.nodeValue;
            let bestMatch = null;
            let bestTask = null;

            // Đơn giản hóa: Duyệt qua các task, tìm task nào match sớm nhất trong node này
            // (Thực tế để tối ưu hoàn hảo cần tách node đệ quy, nhưng ở mức độ này ta ưu tiên replaced word trước)
            
            // Cách làm an toàn: Quét text, tìm tất cả match, sort theo vị trí, split và wrap
            // Nhưng để tránh phức tạp, ta sẽ wrap lần lượt. 
            // Do đã stripHighlights, ta chỉ việc xử lý trên text node.
            
            // Chiến lược: Replace nội dung text node bằng fragment chứa span
            let fragment = document.createDocumentFragment();
            let lastIdx = 0;
            
            // Gộp tất cả regex thành 1 master regex hoặc quét lần lượt?
            // Để đơn giản và hiệu quả: Ta dùng regex exec loop cho từng task, sau đó merge ranges.
            // Nhưng merge ranges phức tạp. 
            // Cách tốt nhất cho Editor đơn giản: Dùng Highlight đè (cái nào tìm thấy trước thì ăn).
            
            // Logic đơn giản hóa cho performance: 
            // Tìm tất cả occurrences của tất cả từ, sort theo index, sau đó build fragment.
            
            let matches = [];
            tasks.forEach(task => {
                if(!task.regex) return;
                let m;
                // Reset lastIndex nếu global
                task.regex.lastIndex = 0; 
                // Regex exec loop
                while ((m = task.regex.exec(content)) !== null) {
                    matches.push({
                        start: m.index,
                        end: m.index + m[0].length,
                        text: m[0],
                        cls: task.className
                    });
                    if(!task.regex.global) break; // Safety
                }
            });

            if (matches.length === 0) return; // Next node

            // Sort matches: Tăng dần theo start. Nếu trùng start, ưu tiên dài hơn (để không bị lồng)
            matches.sort((a, b) => a.start - b.start || b.end - a.end);

            // Filter overlaps (Loại bỏ các match bị chồng lấn)
            const filtered = [];
            let lastEnd = 0;
            matches.forEach(m => {
                if (m.start >= lastEnd) {
                    filtered.push(m);
                    lastEnd = m.end;
                }
            });

            // Build Fragment
            lastIdx = 0;
            filtered.forEach(m => {
                // Text trước match
                if (m.start > lastIdx) {
                    fragment.appendChild(document.createTextNode(content.slice(lastIdx, m.start)));
                }
                // Match -> Span
                const span = document.createElement('span');
                span.className = m.cls;
                span.textContent = m.text;
                fragment.appendChild(span);
                lastIdx = m.end;
            });
            // Text còn lại
            if (lastIdx < content.length) {
                fragment.appendChild(document.createTextNode(content.slice(lastIdx)));
            }

            // Replace text node bằng fragment
            node.parentNode.replaceChild(fragment, node);
        });

        // 5. Restore Caret
        restoreCaret(caretPos);
    }

    // Debounce cho input event đỡ lag
    let debounceTimer;
    els.editor.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            applyHighlights();
        }, 300); // Delay 300ms sau khi gõ xong mới highlight
    });

    // === 5. PASTE HANDLING (SANITIZE) ===
    els.editor.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        // Sau khi paste, trigger highlight ngay
        setTimeout(applyHighlights, 50);
    });

    // === 6. EVENT HANDLERS KHÁC ===
    
    // Copy
    els.copyContent.onclick = () => {
        const text = els.editor.innerText;
        if (!text.trim()) return notify('Không có nội dung!', 'error');
        navigator.clipboard.writeText(text);
        notify('Đã copy nội dung (Plain Text)!', 'success');
    };

    // Font update
    function updateFont() {
        els.editor.style.fontFamily = els.font.value;
        els.editor.style.fontSize = els.size.value;
    }
    els.font.addEventListener('change', updateFont);
    els.size.addEventListener('change', updateFont);

    // Keywords Logic
    function addKw() {
        const raw = els.input.value;
        if (!raw.trim()) return;
        const newKws = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        let changed = false;
        newKws.forEach(k => {
            if (!state.keywords.includes(k)) {
                state.keywords.push(k);
                renderTag(k);
                changed = true;
            }
        });
        els.input.value = '';
        if (changed) applyHighlights();
    }
    function renderTag(txt) {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `<span>${txt.replace(/</g, "&lt;")}</span><span class="remove-tag">×</span>`;
        tag.querySelector('.remove-tag').onclick = () => {
            state.keywords = state.keywords.filter(k => k !== txt);
            tag.remove();
            applyHighlights();
        };
        els.tags.appendChild(tag);
    }
    els.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKw(); } });
    els.input.addEventListener('blur', addKw);

    // Search & Clear
    els.search.onclick = () => {
        if (!state.keywords.length) return notify('Chưa nhập từ khóa!', 'error');
        applyHighlights();
        // Đếm sơ bộ
        const text = els.editor.innerText;
        let count = 0;
        state.keywords.forEach(kw => {
            const regex = getRegex(kw, els.wholeWords.checked, els.matchCase.checked);
            const m = text.match(regex);
            if(m) count += m.length;
        });
        notify(count > 0 ? `Tìm thấy ~${count} kết quả!` : 'Không tìm thấy kết quả.', count > 0 ? 'success' : 'error');
    };
    els.clear.onclick = () => {
        state.keywords = [];
        state.replacedTargets = [];
        els.tags.innerHTML = '';
        els.editor.innerText = els.editor.innerText; // Xóa sạch HTML span
        notify('Đã xóa dữ liệu.');
    };
    
    // Checkbox triggers
    els.matchCase.onchange = applyHighlights;
    els.wholeWords.onchange = applyHighlights;

    // --- REPLACE LOGIC ---
    els.replace.onclick = () => {
        saveData();
        const mode = state.modes[state.activeMode];
        if (!mode.pairs.length) return notify('Chưa có từ khóa để thay thế!', 'error');
        
        let content = els.editor.innerText; // Lấy text thuần
        if (!content.trim()) return notify('Văn bản trống!', 'error');

        const pairs = [...mode.pairs].sort((a, b) => b.find.length - a.find.length);
        let count = 0;
        state.replacedTargets = [];

        pairs.forEach(p => {
            // Khi replace thực tế, ta dùng regex thường (không nhất thiết whole word trừ khi user muốn strict mode cho replace - ở đây user chỉ yêu cầu highlight whole word cho từ đã replace)
            // Tuy nhiên để an toàn, replace cứ theo logic case của mode.
            const regex = getRegex(p.find, false, mode.case); 
            if (regex) {
                const matches = content.match(regex);
                if (matches) {
                    count += matches.length;
                    content = content.replace(regex, p.replace);
                    // Lưu target để highlight (chỉ lưu nếu có replace text)
                    if (p.replace && p.replace.trim()) {
                        if (!state.replacedTargets.includes(p.replace)) {
                            state.replacedTargets.push(p.replace);
                        }
                    }
                }
            }
        });

        if (count === 0) return notify('Không tìm thấy từ nào.', 'error');

        // Cập nhật nội dung editor
        els.editor.innerText = content;
        
        // Trigger highlight
        applyHighlights();
        notify(`Đã thay thế ${count} vị trí!`, 'success');
    };

    // --- DATA & MODE & CSV (Giữ nguyên logic cũ nhưng cập nhật UI) ---
    function loadData() {
        try {
            const raw = localStorage.getItem('replace_data');
            const data = JSON.parse(raw);
            if (data && data.modes) {
                state.modes = data.modes;
                state.activeMode = data.active || 'Mặc định';
            } else throw 1;
        } catch {
            state.modes = { 'Mặc định': { pairs: [], case: false } };
            state.activeMode = 'Mặc định';
        }
        updateModeUI();
    }
    function saveData() {
        const pairs = [];
        els.puncList.querySelectorAll('.punctuation-item').forEach(div => {
            const find = div.querySelector('.find').value;
            const rep = div.querySelector('.replace').value;
            if (find) pairs.push({ find, replace: rep });
        });
        state.modes[state.activeMode].pairs = pairs;
        localStorage.setItem('replace_data', JSON.stringify({ modes: state.modes, active: state.activeMode }));
    }
    function updateModeUI() {
        els.modeSel.innerHTML = '';
        Object.keys(state.modes).forEach(k => {
            els.modeSel.add(new Option(k, k, false, k === state.activeMode));
        });
        const isDef = state.activeMode === 'Mặc định';
        els.delMode.classList.toggle('hidden', isDef);
        els.renameMode.classList.toggle('hidden', isDef);
        const mode = state.modes[state.activeMode];
        els.caseMode.textContent = mode.case ? 'Case Sensitive: BẬT' : 'Case Sensitive: TẮT';
        els.caseMode.className = mode.case ? 'w-full py-1.5 mt-1 rounded text-xs font-bold bg-green-200 text-green-800' : 'w-full py-1.5 mt-1 rounded text-xs font-bold bg-gray-200 text-gray-600';
        els.puncList.innerHTML = '';
        mode.pairs.forEach(p => addPairUI(p.find, p.replace));
    }
    function addPairUI(f = '', r = '') {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${f.replace(/"/g, '&quot;')}"><span class="text-gray-400">→</span><input type="text" class="replace" placeholder="Thay" value="${r.replace(/"/g, '&quot;')}"><button class="remove-pair" tabindex="-1">×</button>`;
        div.querySelector('.remove-pair').onclick = () => div.remove();
        els.puncList.prepend(div);
    }

    // CSV logic
    els.exportBtn.onclick = () => {
        saveData();
        let csvContent = "\uFEFFfind,replace,mode\n"; 
        Object.keys(state.modes).forEach(modeName => {
            state.modes[modeName].pairs.forEach(p => {
                csvContent += `"${p.find.replace(/"/g, '""')}","${p.replace.replace(/"/g, '""')}","${modeName}"\n`;
            });
        });
        const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement("a");
        link.href = url; link.download = "data_thay_the.csv";
        link.click();
        notify('Đã xuất file CSV!');
    };
    els.importBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.csv';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const lines = evt.target.result.split(/\r?\n/);
                let count = 0;
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    const match = line.match(/^"(.*)","(.*)","(.*)"$/);
                    if (match) {
                        const modeName = match[3];
                        if (!state.modes[modeName]) state.modes[modeName] = { pairs: [], case: false };
                        state.modes[modeName].pairs.push({ find: match[1].replace(/""/g, '"'), replace: match[2].replace(/""/g, '"') });
                        count++;
                    }
                }
                saveData(); updateModeUI(); notify(`Nhập ${count} dòng thành công!`);
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // Mode Buttons Events
    els.addPair.onclick = () => { addPairUI(); els.puncList.querySelector('input').focus(); };
    els.save.onclick = () => { saveData(); notify(`Đã lưu "${state.activeMode}"`); };
    els.modeSel.onchange = () => { saveData(); state.activeMode = els.modeSel.value; updateModeUI(); };
    els.addMode.onclick = () => {
        const name = prompt('Tên chế độ mới:');
        if (name && !state.modes[name]) {
            saveData(); state.modes[name] = { pairs: [], case: false }; state.activeMode = name; updateModeUI();
        }
    };
    els.delMode.onclick = () => { if (confirm('Xóa?')) { delete state.modes[state.activeMode]; state.activeMode = 'Mặc định'; updateModeUI(); saveData(); } };
    els.renameMode.onclick = () => {
        const newName = prompt('Tên mới:', state.activeMode);
        if (newName && !state.modes[newName]) {
            state.modes[newName] = state.modes[state.activeMode]; delete state.modes[state.activeMode];
            state.activeMode = newName; updateModeUI(); saveData();
        }
    };
    els.caseMode.onclick = () => { state.modes[state.activeMode].case = !state.modes[state.activeMode].case; updateModeUI(); };

    // Init
    loadData();
    updateFont();
});
