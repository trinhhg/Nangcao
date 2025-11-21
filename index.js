document.addEventListener('DOMContentLoaded', () => {
    const keywordsInput = document.getElementById('keywords-input');
    const keywordsTags = document.getElementById('keywords-tags');
    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    const matchCaseCb = document.getElementById('matchCase');
    const wholeWordsCb = document.getElementById('wholeWords'); // Có thể null nếu không có
    const replaceAllBtn = document.getElementById('replace-all');
    const punctuationList = document.getElementById('punctuation-list');
    const textLayer = document.getElementById('text-layer');
    const highlightLayer = document.getElementById('highlight-layer');

    const modeSelect = document.getElementById('mode-select');
    const addModeBtn = document.getElementById('add-mode');
    const matchCaseReplaceBtn = document.getElementById('match-case');
    const deleteModeBtn = document.getElementById('delete-mode-btn');
    const renameModeBtn = document.getElementById('rename-mode');
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');

    let currentKeywords = [];
    let replacedRanges = [];
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    const REPLACE_MODES_KEY = 'replaceModes';
    const ACTIVE_MODE_NAME_KEY = 'activeReplaceMode';
    let replaceModes = {};
    let activeModeName = 'Mặc định';

    let savedRange = null;
    function saveSelection() {
        const sel = window.getSelection();
        if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
    }
    function restoreSelection() {
        if (!savedRange) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
        savedRange = null;
    }

    function showNotification(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = msg;
        document.getElementById('notification-container').prepend(div);
        setTimeout(() => div.remove(), 3000);
    }

    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Vietnamese word boundaries
    const VIET_BOUNDARIES = '[^a-zA-Z0-9àáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳỵỷỹýđÀÁÃẠẢĂẮẰẲẴẶÂẤẦẨẪẬÈÉẸẺẼÊỀẾỂỄỆÌÍĨỈỊÒÓÕỌỎÔỐỒỔỖỘƠỚỜỞỠỢÙÚŨỤỦƯỨỪỬỮỰỲỴỶỸÝĐ ]';

    function buildRegex(word, wholeWords = false, matchCase = false) {
        if (!word) return null;
        const escaped = escapeRegex(word);
        let pattern = escaped;
        if (wholeWords) {
            pattern = `(^|\( {VIET_BOUNDARIES})( \){escaped})(\( | \){VIET_BOUNDARIES})`;
        }
        const flags = matchCase ? 'g' : 'gi';
        return new RegExp(pattern, flags);
    }

    function highlightKeywords() {
        saveSelection();
        const text = textLayer.textContent || '';
        highlightLayer.innerHTML = '';

        if (!text) { 
            restoreSelection(); 
            return; 
        }

        // Fallback nếu crash: Tạm hiện text
        textLayer.style.color = 'black';
        highlightLayer.style.display = 'none';

        try {
            const matches = [];

            // Replaced ranges: Vàng, priority cao nhất
            replacedRanges.forEach(r => {
                if (r.start >= 0 && r.end <= text.length && r.start < r.end) {
                    matches.push({start: r.start, end: r.end, cls: 'hl-yellow', priority: 999});
                }
            });

            // Keywords: Màu luân phiên
            currentKeywords.forEach((kw, i) => {
                const isWholeWords = wholeWordsCb ? wholeWordsCb.checked : false;
                const isMatchCase = matchCaseCb ? matchCaseCb.checked : false;
                const regex = buildRegex(kw, isWholeWords, isMatchCase);
                if (!regex) return;
                let m;
                while ((m = regex.exec(text)) !== null) {
                    const start = wholeWordsCb && wholeWordsCb.checked ? m.index + m[1].length : m.index;
                    const end = start + kw.length;
                    matches.push({start, end, cls: HIGHLIGHT_CLASSES[(i % 5) + 1], priority: 100});
                }
            });

            // Sort và loại overlap
            matches.sort((a, b) => a.start - b.start || b.priority - a.priority || a.end - b.end);
            const final = [];
            let lastEnd = 0;
            for (const m of matches) {
                if (m.start >= lastEnd) {
                    final.push(m);
                    lastEnd = m.end;
                } else {
                    const overlapped = final.findLast(p => p.end > m.start);
                    if (overlapped && m.priority > overlapped.priority) {
                        const idx = final.indexOf(overlapped);
                        if (idx > -1) final[idx] = m;
                        lastEnd = Math.max(lastEnd, m.end);
                    }
                }
            }

            // Build highlight
            const frag = document.createDocumentFragment();
            let pos = 0;
            for (const m of final) {
                if (m.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, m.start)));
                const mark = document.createElement('mark');
                mark.className = m.cls;
                mark.textContent = text.slice(m.start, m.end);
                frag.appendChild(mark);
                pos = m.end;
            }
            if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
            highlightLayer.appendChild(frag);

            // Sync font
            highlightLayer.style.fontFamily = textLayer.style.fontFamily;
            highlightLayer.style.fontSize = textLayer.style.fontSize;

            // Thành công: Ẩn fallback
            textLayer.style.color = 'transparent';
            highlightLayer.style.display = 'block';
        } catch (e) {
            console.error('Highlight error:', e);
            showNotification('Lỗi highlight, hiển thị text gốc', 'error');
            textLayer.style.color = 'black';
            highlightLayer.style.display = 'none';
        }

        restoreSelection();
    }

    function replaceAllSafe() {
        saveSelection();
        const text = textLayer.textContent || '';
        const mode = replaceModes[activeModeName];
        if (!mode || !mode.pairs?.length) { showNotification('Chưa có cặp thay thế!', 'error'); restoreSelection(); return; }

        let newText = text;
        replacedRanges = [];
        const pairs = mode.pairs.filter(p => p.find).sort((a, b) => b.find.length - a.find.length);
        let globalOffset = 0;

        pairs.forEach(p => {
            const isMatchCase = mode.options?.matchCase || false;
            const regex = buildRegex(p.find, false, isMatchCase);
            if (!regex) return;
            let match;
            while ((match = regex.exec(newText)) !== null) {
                const idx = match.index;
                const origLength = p.find.length;
                const newLength = p.replace.length;
                const delta = newLength - origLength;

                newText = newText.slice(0, idx) + p.replace + newText.slice(idx + origLength);

                const newStart = idx + globalOffset;
                const newEnd = newStart + newLength;
                replacedRanges.push({start: newStart, end: newEnd});

                globalOffset += delta;
                regex.lastIndex = idx + newLength;
            }
            regex.lastIndex = 0;
        });

        textLayer.textContent = newText;
        highlightKeywords();
        showNotification(`Đã thay thế ${replacedRanges.length} vị trí!`, 'success');
        restoreSelection();
    }

    // Sync scroll mượt (sử dụng requestAnimationFrame)
    let rafId;
    function syncScroll() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            highlightLayer.scrollTop = textLayer.scrollTop;
            highlightLayer.scrollLeft = textLayer.scrollLeft;
        });
    }
    textLayer.addEventListener('scroll', syncScroll);

    // Keywords
    function addKeywords() {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        vals.forEach(v => {
            if (v && !currentKeywords.includes(v)) {
                currentKeywords.push(v);
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.innerHTML = `${v} <span class="remove-tag">×</span>`;
                tag.querySelector('.remove-tag').onclick = () => {
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x => x !== v);
                    highlightKeywords();
                };
                keywordsTags.appendChild(tag);
            }
        });
        keywordsInput.value = '';
        highlightKeywords();
        keywordsInput.focus();
    }
    keywordsInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeywords(); } });
    keywordsInput.addEventListener('blur', () => { if (keywordsInput.value.trim()) addKeywords(); });

    // Paste
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        setTimeout(highlightKeywords, 50);
    });

    let timer;
    textLayer.addEventListener('input', () => { 
        clearTimeout(timer); 
        timer = setTimeout(highlightKeywords, 200); // Tăng debounce để mượt
    });

    function syncFont() {
        const newFont = fontFamily.value;
        const newSize = fontSize.value;
        textLayer.style.fontFamily = newFont;
        textLayer.style.fontSize = newSize;
        highlightLayer.style.fontFamily = newFont;
        highlightLayer.style.fontSize = newSize;
        setTimeout(highlightKeywords, 100);
    }

    // Gán events với check null
    if (fontFamily) fontFamily.onchange = syncFont;
    if (fontSize) fontSize.onchange = syncFont;
    if (matchCaseCb) matchCaseCb.onchange = highlightKeywords;
    if (wholeWordsCb) wholeWordsCb.onchange = highlightKeywords; // Skip nếu null

    // Replace modes
    function loadModes() {
        try {
            replaceModes = JSON.parse(localStorage.getItem(REPLACE_MODES_KEY)) || {};
            activeModeName = localStorage.getItem(ACTIVE_MODE_NAME_KEY) || 'Mặc định';
            if (!replaceModes['Mặc định']) replaceModes['Mặc định'] = {pairs: [], options: {matchCase: false}};
            if (!replaceModes[activeModeName]) activeModeName = 'Mặc định';
        } catch { 
            replaceModes = {'Mặc định': {pairs: [], options: {matchCase: false}}}; 
            activeModeName = 'Mặc định'; 
        }
        saveModes(); 
        updateUI();
    }
    function saveModes() {
        localStorage.setItem(REPLACE_MODES_KEY, JSON.stringify(replaceModes));
        localStorage.setItem(ACTIVE_MODE_NAME_KEY, activeModeName);
    }
    function updateUI() {
        if (!modeSelect) return;
        modeSelect.innerHTML = '';
        Object.keys(replaceModes).forEach(n => modeSelect.add(new Option(n, n, false, n === activeModeName)));
        const isDefault = activeModeName === 'Mặc định';
        if (deleteModeBtn) deleteModeBtn.classList.toggle('hidden', isDefault);
        if (renameModeBtn) renameModeBtn.classList.toggle('hidden', isDefault);
        const opt = replaceModes[activeModeName].options || {matchCase: false};
        if (matchCaseReplaceBtn) {
            matchCaseReplaceBtn.textContent = opt.matchCase ? 'Case: BẬT' : 'Case: TẮT';
            matchCaseReplaceBtn.classList.toggle('bg-green-600', opt.matchCase);
            matchCaseReplaceBtn.classList.toggle('bg-gray-500', !opt.matchCase);
        }
        if (punctuationList) {
            punctuationList.innerHTML = '';
            (replaceModes[activeModeName].pairs || []).forEach(p => addPairUI(p.find, p.replace));
        }
    }
    function addPairUI(find = '', replace = '', focus = true) {
        if (!punctuationList) return;
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${find}">
                         <input type="text" class="replace" placeholder="Thay bằng" value="${replace}">
                         <button class="remove-pair" title="Xóa">×</button>`;
        div.querySelector('.remove-pair').onclick = () => div.remove();
        punctuationList.prepend(div);
        if (focus) div.querySelector('.find').focus();
    }
    function saveCurrentMode() {
        if (!punctuationList) return;
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);
        replaceModes[activeModeName].pairs = pairs;
        saveModes();
        showNotification(`Đã lưu "${activeModeName}"`);
        highlightKeywords();
    }

    if (searchBtn) searchBtn.onclick = () => { replacedRanges = []; highlightKeywords(); };
    if (clearBtn) clearBtn.onclick = () => { currentKeywords = []; replacedRanges = []; keywordsTags.innerHTML = ''; highlightKeywords(); };
    if (replaceAllBtn) replaceAllBtn.onclick = replaceAllSafe;
    if (addPairBtn) addPairBtn.onclick = () => addPairUI('', '', true);
    if (saveSettingsBtn) saveSettingsBtn.onclick = saveCurrentMode;
    if (modeSelect) modeSelect.onchange = () => { activeModeName = modeSelect.value; saveModes(); replacedRanges = []; updateUI(); highlightKeywords(); };
    if (addModeBtn) addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ mới:')?.trim();
        if (!name || replaceModes[name]) { if (name) showNotification('Tên đã tồn tại!', 'error'); return; }
        replaceModes[name] = {pairs: [], options: {matchCase: false}};
        activeModeName = name; saveModes(); updateUI();
    };
    if (deleteModeBtn) deleteModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định' || !confirm(`Xóa "${activeModeName}"?`)) return;
        delete replaceModes[activeModeName];
        activeModeName = Object.keys(replaceModes)[0] || 'Mặc định';
        if (!replaceModes[activeModeName]) replaceModes[activeModeName] = {pairs: [], options: {matchCase: false}};
        saveModes(); updateUI();
    };
    if (renameModeBtn) renameModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định') return;
        const newName = prompt(`Đổi tên "${activeModeName}" thành:`, activeModeName)?.trim();
        if (!newName || newName === activeModeName || replaceModes[newName]) return;
        replaceModes[newName] = replaceModes[activeModeName];
        delete replaceModes[activeModeName];
        activeModeName = newName; saveModes(); updateUI();
    };
    if (matchCaseReplaceBtn) matchCaseReplaceBtn.onclick = () => {
        const opt = replaceModes[activeModeName].options ||= {};
        opt.matchCase = !opt.matchCase;
        saveModes(); updateUI();
        highlightKeywords();
    };

    // Khởi động
    syncFont();
    loadModes();
    if (textLayer) textLayer.textContent = '';
    highlightKeywords();
});
