document.addEventListener('DOMContentLoaded', () => {
    // 1. BLOCK EXTENSIONS
    window.addEventListener('error', e => {
        if (e.filename && (e.filename.includes('contentScript') || e.message.includes('extension'))) {
            e.stopImmediatePropagation(); e.preventDefault(); return false;
        }
    });

    // 2. DOM ELEMENTS
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
        editor: document.getElementById('editor'),
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
        modes: {},
        activeMode: 'Mặc định'
    };

    const KW_COLORS = ['hl-pink', 'hl-blue', 'hl-green', 'hl-orange', 'hl-purple', 'hl-red'];

    // 3. UTILS
    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.innerHTML = type === 'success' ? `✓ ${msg}` : `⚠️ ${msg}`;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }

    // --- DOM HELPER ---
    function getTextNodesSnapshot(root, opts = {}) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (!node.nodeValue) continue;
            let p = node.parentElement;
            let skip = false;
            while (p && p !== root) {
                if (p.classList && (
                    (opts.skipClass1 && p.classList.contains(opts.skipClass1)) || 
                    (opts.skipClass2 && p.classList.contains(opts.skipClass2))
                )) {
                    skip = true; break;
                }
                p = p.parentElement;
            }
            if (!skip) nodes.push(node);
        }
        return nodes;
    }

    const VIET_LETTERS = 'a-zA-Z0-9àáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳỵỷỹýđÀÁÃẠẢĂẮẰẲẴẶÂẤẦẨẪẬÈÉẸẺẼÊỀẾỂỄỆÌÍĨỈỊÒÓÕỌỎÔỐỒỔỖỘƠỚỜỞỠỢÙÚŨỤỦƯỨỪỬỮỰỲỴỶỸÝĐ_';
    const escRgx = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // === 4. LOGIC CHÍNH ===

    function unwrapClasses(classesToRemove) {
        classesToRemove.forEach(cls => {
            const spans = els.editor.querySelectorAll(`span.${cls}`);
            spans.forEach(span => {
                const parent = span.parentNode;
                while(span.firstChild) parent.insertBefore(span.firstChild, span);
                parent.removeChild(span);
            });
        });
        els.editor.normalize();
    }

    function highlightKeywords() {
        unwrapClasses(['keyword']); 
        let totalMatches = 0;

        if (!state.keywords.length) return 0;

        const nodes = getTextNodesSnapshot(els.editor, { skipClass1: 'replaced', skipClass2: 'keyword' });
        const caseSensitive = els.matchCase.checked;
        const isWholeWord = els.wholeWords.checked;
        const sortedKws = [...state.keywords].sort((a,b) => b.length - a.length);

        for (const textNode of nodes) {
            if (!textNode.parentNode) continue;
            let node = textNode;

            outer: while (node && node.nodeValue) {
                const nodeText = caseSensitive ? node.nodeValue : node.nodeValue.toLowerCase();
                let foundIdx = -1, foundWord = null, colorIdx = 0;

                for (let i = 0; i < sortedKws.length; i++) {
                    const w = sortedKws[i];
                    const mw = caseSensitive ? w : w.toLowerCase();
                    const idx = nodeText.indexOf(mw);
                    
                    if (idx !== -1) {
                        if (isWholeWord) {
                            const charBefore = idx > 0 ? nodeText[idx-1] : '';
                            const charAfter = idx + mw.length < nodeText.length ? nodeText[idx+mw.length] : '';
                            const isWordChar = new RegExp(`[${VIET_LETTERS}]`, 'i');
                            
                            if (isWordChar.test(charBefore) || isWordChar.test(charAfter)) {
                                continue; 
                            }
                        }

                        if (foundIdx === -1 || idx < foundIdx) {
                            foundIdx = idx; 
                            foundWord = w;
                            colorIdx = i;
                        }
                    }
                }

                if (foundIdx === -1) break;

                const matchNode = node.splitText(foundIdx);
                const afterNode = matchNode.splitText(foundWord.length);

                const span = document.createElement('span');
                span.className = `keyword ${KW_COLORS[colorIdx % KW_COLORS.length]}`;
                span.textContent = matchNode.nodeValue;

                matchNode.parentNode.replaceChild(span, matchNode);
                totalMatches++; 

                node = afterNode;
                continue outer;
            }
        }
        return totalMatches;
    }

    function performReplace() {
        saveData();
        const mode = state.modes[state.activeMode];
        if (!mode.pairs.length) return notify('Chưa có từ khóa để thay thế!', 'error');
        if (!els.editor.textContent.trim()) return notify('Văn bản trống!', 'error');

        unwrapClasses(['keyword']); 
        const caseSensitive = mode.case;
        const pairs = [...mode.pairs].sort((a, b) => b.find.length - a.find.length);
        let count = 0;

        pairs.forEach(pair => {
            const fromWord = pair.find;
            const toWord = pair.replace;
            if(!fromWord) return;

            const nodes = getTextNodesSnapshot(els.editor, { skipClass1: 'replaced' });

            for (const textNode of nodes) {
                if (!textNode.parentNode) continue;
                let node = textNode;
                while (node && node.nodeValue) {
                    const nodeText = caseSensitive ? node.nodeValue : node.nodeValue.toLowerCase();
                    const searchFor = caseSensitive ? fromWord : fromWord.toLowerCase();
                    const idx = nodeText.indexOf(searchFor);

                    if (idx === -1) break;

                    const matchNode = node.splitText(idx);
                    const afterNode = matchNode.splitText(fromWord.length);

                    const span = document.createElement('span');
                    span.className = 'replaced';
                    span.setAttribute('data-original', matchNode.nodeValue);
                    span.textContent = toWord; 

                    matchNode.parentNode.replaceChild(span, matchNode);
                    count++;
                    node = afterNode; 
                }
            }
        });

        if (count > 0) {
            notify(`Đã thay thế ${count} từ!`, 'success');
            if(state.keywords.length > 0) highlightKeywords();
        } else {
            notify('Không tìm thấy từ nào.', 'error');
        }
    }

    // --- EVENT HANDLERS ---

    // PASTE: Xử lý quan trọng để giữ dòng
    els.editor.addEventListener('paste', e => {
        e.preventDefault();
        let text = (e.clipboardData || window.clipboardData).getData('text/plain');
        // Chuẩn hóa dòng cho mọi OS
        text = text.replace(/\r\n/g, '\n'); 
        document.execCommand('insertText', false, text);
    });

    // 1. COPY & CLEAR
    els.copyContent.onclick = () => {
        const text = els.editor.innerText;
        if (!text.trim()) return notify('Không có nội dung!', 'error');
        navigator.clipboard.writeText(text);
        
        els.editor.innerHTML = ''; 
        notify('Đã copy và xóa nội dung!', 'success');
    };

    els.clear.onclick = () => {
        els.editor.innerHTML = ''; 
        state.keywords = [];
        els.tags.innerHTML = '';
        notify('Đã xóa tất cả.');
    };

    // 2. SEARCH
    els.search.onclick = () => {
        if (!state.keywords.length) return notify('Chưa nhập từ khóa!', 'error');
        const count = highlightKeywords();
        notify(`Đã highlight ${count} từ khóa!`, 'success');
    };

    els.replace.onclick = performReplace;

    // --- UI/UX & DATA ---
    function updateFont() {
        els.editor.style.fontFamily = els.font.value;
        els.editor.style.fontSize = els.size.value;
    }
    els.font.addEventListener('change', updateFont);
    els.size.addEventListener('change', updateFont);

    function addKw() {
        const raw = els.input.value;
        if (!raw.trim()) return;
        const newKws = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        newKws.forEach(k => {
            if (!state.keywords.includes(k)) {
                state.keywords.push(k);
                renderTag(k);
            }
        });
        els.input.value = '';
        highlightKeywords(); 
    }
    function renderTag(txt) {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `<span>${txt.replace(/</g, "&lt;")}</span><span class="remove-tag">×</span>`;
        tag.querySelector('.remove-tag').onclick = () => {
            state.keywords = state.keywords.filter(k => k !== txt);
            tag.remove();
            highlightKeywords(); 
        };
        els.tags.appendChild(tag);
    }
    els.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKw(); } });
    els.input.addEventListener('blur', addKw);

    els.matchCase.onchange = highlightKeywords;
    els.wholeWords.onchange = highlightKeywords;

    function loadData() {
        try {
            const raw = localStorage.getItem('replace_data');
            const data = JSON.parse(raw);
            if (data && data.modes) {
                state.modes = data.modes;
                state.activeMode = data.active || 'Mặc định';
            }
        } catch {
            state.modes = { 'Mặc định': { pairs: [], case: false } };
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
        Object.keys(state.modes).forEach(k => els.modeSel.add(new Option(k, k, false, k === state.activeMode)));
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

    loadData();
    updateFont();
});
