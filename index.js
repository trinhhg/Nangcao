document.addEventListener('DOMContentLoaded', () => {
    const keywordsInput = document.getElementById('keywords-input');
    const keywordsTags = document.getElementById('keywords-tags');
    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    const matchCaseCb = document.getElementById('matchCase');
    const wholeWordsCb = document.getElementById('wholeWords');
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
    function buildRegex(word, wholeWords = false, matchCase = false) {
        if (!word) return null;
        const escaped = escapeRegex(word);
        let pattern = escaped;
        if (wholeWords) pattern = `(^|[^a-zA-Z0-9áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ])(\( {escaped})( \)|[^a-zA-Z0-9áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ])`;
        const flags = matchCase ? 'g' : 'gi';
        return new RegExp(pattern, flags);
    }

    function highlightKeywords() {
        saveSelection();
        const text = textLayer.textContent || '';
        highlightLayer.innerHTML = '';

        if (!text) { restoreSelection(); return; }

        const matches = [];

        // Từ đã replace → vàng (ưu tiên cao nhất)
        replacedRanges.forEach(r => matches.push({start: r.start, end: r.end, cls: 'hl-yellow', priority: 999}));

        // Keywords hiện tại
        currentKeywords.forEach((kw, i) => {
            const regex = buildRegex(kw, wholeWordsCb.checked, matchCaseCb.checked);
            if (!regex) return;
            let m;
            while ((m = regex.exec(text)) !== null) {
                const start = wholeWordsCb.checked ? m.index + m[1].length : m.index;
                const end = start + kw.length;
                matches.push({start, end, cls: HIGHLIGHT_CLASSES[(i+1)%6], priority: 100});
            }
        });

        // Sắp xếp + loại chồng lấn
        matches.sort((a,b) => a.start - b.start || b.priority - a.priority || b.end - a.end);
        const final = [];
        let last = 0;
        for (const m of matches) {
            if (m.start >= last) { final.push(m); last = m.end; }
        }

        // Rebuild highlight layer
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

        highlightLayer.style.fontFamily = textLayer.style.fontFamily;
        highlightLayer.style.fontSize = textLayer.style.fontSize;
        restoreSelection();
    }

    function replaceAllSafe() {
        saveSelection();
        const text = textLayer.textContent || '';
        const mode = replaceModes[activeModeName];
        if (!mode || !mode.pairs?.length) { showNotification('Chưa có cặp thay thế!', 'error'); restoreSelection(); return; }

        let newText = text;
        replacedRanges = [];
        let offset = 0;
        const pairs = mode.pairs.filter(p => p.find).sort((a,b) => b.find.length - a.find.length);

        pairs.forEach(p => {
            const regex = buildRegex(p.find, false, mode.options?.matchCase);
            if (!regex) return;
            newText = newText.replace(regex, (match, idx) => {
                const start = idx + offset;
                const end = start + p.replace.length;
                replacedRanges.push({start, end});
                offset += p.replace.length - match.length;
                return p.replace;
            });
        });

        textLayer.textContent = newText;
        highlightKeywords();
        showNotification(`Đã thay thế ${replacedRanges.length} vị trí!`, 'success');
        restoreSelection();
    }

    // Keywords
    function addKeywords() {
        const vals = keywordsInput.value.split(',').map(s=>s.trim()).filter(Boolean);
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
    keywordsInput.addEventListener('keydown', e => { if (e.key==='Enter' || e.key===',') { e.preventDefault(); addKeywords(); }});
    keywordsInput.addEventListener('blur', () => { if (keywordsInput.value.trim()) addKeywords(); });

    // Paste giữ dòng + format cơ bản
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        setTimeout(highlightKeywords, 50);
    });

    let timer;
    textLayer.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(highlightKeywords, 150); });

    function syncFont() {
        textLayer.style.fontFamily = fontFamily.value;
        textLayer.style.fontSize = fontSize.value;
        highlightKeywords();
    }
    fontFamily.onchange = fontSize.onchange = syncFont;
    matchCaseCb.onchange = wholeWordsCb.onchange = highlightKeywords;

    // Replace modes
    function loadModes() {
        try {
            replaceModes = JSON.parse(localStorage.getItem(REPLACE_MODES_KEY)) || {};
            activeModeName = localStorage.getItem(ACTIVE_MODE_NAME_KEY) || 'Mặc định';
            if (!replaceModes['Mặc định']) replaceModes['Mặc định'] = {pairs: [], options: {matchCase: false}};
            if (!replaceModes[activeModeName]) activeModeName = 'Mặc định';
        } catch { replaceModes = {'Mặc định': {pairs: [], options: {matchCase: false}}}; activeModeName = 'Mặc định'; }
        saveModes(); updateUI();
    }
    function saveModes() {
        localStorage.setItem(REPLACE_MODES_KEY, JSON.stringify(replaceModes));
        localStorage.setItem(ACTIVE_MODE_NAME_KEY, activeModeName);
    }
    function updateUI() {
        modeSelect.innerHTML = '';
        Object.keys(replaceModes).forEach(n => modeSelect.add(new Option(n, n, false, n===activeModeName)));
        const isDefault = activeModeName === 'Mặc định';
        deleteModeBtn.classList.toggle('hidden', isDefault);
        renameModeBtn.classList.toggle('hidden', isDefault);
        const opt = replaceModes[activeModeName].options || {matchCase: false};
        matchCaseReplaceBtn.textContent = opt.matchCase ? 'Case: BẬT' : 'Case: TẮT';
        matchCaseReplaceBtn.classList.toggle('bg-green-600', opt.matchCase);
        matchCaseReplaceBtn.classList.toggle('bg-gray-500', !opt.matchCase);
        punctuationList.innerHTML = '';
        (replaceModes[activeModeName].pairs || []).forEach(p => addPairUI(p.find, p.replace));
    }
    function addPairUI(find='', replace='', focus=true) {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${find}">
                         <input type="text" class="replace" placeholder="Thay bằng" value="${replace}">
                         <button class="remove-pair" title="Xóa">×</button>`;
        div.querySelector('.remove-pair').onclick = () => div.remove();
        punctuationList.prepend(div); // Mới lên trên
        if (focus) div.querySelector('.find').focus();
    }
    function saveCurrentMode() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        }));
        replaceModes[activeModeName].pairs = pairs;
        saveModes();
        showNotification(`Đã lưu "${activeModeName}"`);
    }

    searchBtn.onclick = () => { replacedRanges = []; highlightKeywords(); };
    clearBtn.onclick = () => { currentKeywords = []; replacedRanges = []; keywordsTags.innerHTML = ''; highlightKeywords(); };
    replaceAllBtn.onclick = replaceAllSafe;
    addPairBtn.onclick = () => addPairUI('', '', true);
    saveSettingsBtn.onclick = saveCurrentMode;
    modeSelect.onchange = () => { activeModeName = modeSelect.value; saveModes(); replacedRanges = []; updateUI(); highlightKeywords(); };
    addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ mới:')?.trim();
        if (!name || replaceModes[name]) { if (name) showNotification('Tên đã tồn tại!', 'error'); return; }
        replaceModes[name] = {pairs: [], options: {matchCase: false}};
        activeModeName = name; saveModes(); updateUI();
    };
    deleteModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định' || !confirm(`Xóa "${activeModeName}"?`)) return;
        delete replaceModes[activeModeName];
        activeModeName = Object.keys(replaceModes)[0] || 'Mặc định';
        saveModes(); updateUI();
    };
    renameModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định') return;
        const newName = prompt(`Đổi tên "${activeModeName}" thành:`, activeModeName)?.trim();
        if (!newName || newName === activeModeName || replaceModes[newName]) return;
        replaceModes[newName] = replaceModes[activeModeName];
        delete replaceModes[activeModeName];
        activeModeName = newName; saveModes(); updateUI();
    };
    matchCaseReplaceBtn.onclick = () => {
        const opt = replaceModes[activeModeName].options ||= {};
        opt.matchCase = !opt.matchCase;
        saveModes(); updateUI();
    };

    // Khởi động
    syncFont();
    loadModes();
    textLayer.textContent = '';
    highlightKeywords();
});
