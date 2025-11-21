document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    const keywordsInput    = document.getElementById('keywords-input');
    const keywordsTags     = document.getElementById('keywords-tags');
    const searchBtn        = document.getElementById('search');
    const clearBtn         = document.getElementById('clear');
    const fontFamily       = document.getElementById('fontFamily');
    const fontSize         = document.getElementById('fontSize');
    const matchCaseCb      = document.getElementById('matchCase');
    const wholeWordsCb     = document.getElementById('wholeWords');
    const replaceAllBtn    = document.getElementById('replace-all');
    const punctuationList  = document.getElementById('punctuation-list');
    const textLayer        = document.getElementById('text-layer');
    const highlightLayer   = document.getElementById('highlight-layer');

    // Replace mode elements
    const modeSelect       = document.getElementById('mode-select');
    const addModeBtn       = document.getElementById('add-mode');
    const matchCaseReplaceBtn = document.getElementById('match-case');
    const deleteModeBtn    = document.getElementById('delete-mode-btn');
    const renameModeBtn    = document.getElementById('rename-mode');
    const addPairBtn       = document.getElementById('add-pair');
    const saveSettingsBtn  = document.getElementById('save-settings');

    // === STATE ===
    let currentKeywords = [];
    let lastReplacedFinds = []; // Từ gốc đã bị thay thế
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    // Replace modes
    const REPLACE_MODES_KEY = 'replaceModes';
    const ACTIVE_MODE_NAME_KEY = 'activeReplaceMode';
    let replaceModes = {};
    let activeModeName = 'Mặc định';

    // === UTILS ===
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

    function showNotification(message, type = 'success') {
        const container = document.getElementById('notification-container');
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        container.prepend(notif);
        setTimeout(() => notif.remove(), 3000);
    }

    function buildRegex(word, wholeWords = false, matchCase = false) {
        if (!word) return null;
        const escaped = escapeRegex(word);
        let pattern = escaped;
        if (wholeWords) {
            // Fix giống Word: boundary non-alphanumeric (không match trong "cats" nhưng match "cat ")
            pattern = `(^|[^a-zA-Z0-9])(\( {escaped})( \)|[^a-zA-Z0-9])`;
        }
        const flags = matchCase ? 'g' : 'gi';
        return new RegExp(pattern, flags);
    }

    function removeHighlightsSafe() {
        textLayer.querySelectorAll('mark[data-hl]').forEach(mark => {
            mark.replaceWith(...mark.childNodes);
        });
        textLayer.normalize();
    }

    // === HIGHLIGHT CHUẨN (fix reversed + whole words) ===
    function highlightKeywords() {
        saveSelection(); // Fix reversed: save cursor trước
        removeHighlightsSafe();

        const searchWholeWords = wholeWordsCb.checked;
        const searchMatchCase = matchCaseCb.checked;

        const keywordsToHighlight = [
            // Từ đã replace: luôn màu vàng, ưu tiên cao nhất
            ...lastReplacedFinds.map(t => ({ text: t, cls: 'hl-yellow', priority: 999 })),
            // Từ khóa tìm kiếm: dùng các màu còn lại
            ...currentKeywords.map((t, i) => ({ 
                text: t, 
                cls: HIGHLIGHT_CLASSES[(i + 1) % 6], // bỏ qua màu vàng
                priority: 100 
            }))
        ].map(k => ({ ...k, wholeWords: searchWholeWords, matchCase: searchMatchCase }));

        if (!keywordsToHighlight.length) {
            setTimeout(restoreSelection, 0); // Defer restore để tránh jump
            return;
        }

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
            const text = node.nodeValue;
            const matches = [];

            for (const kw of keywordsToHighlight) {
                const regex = buildRegex(kw.text, kw.wholeWords, kw.matchCase);
                if (!regex) continue;
                let m;
                while ((m = regex.exec(text)) !== null) {
                    // Fix whole words: nếu dùng group, adjust index cho group 2 (word chính)
                    const matchStart = kw.wholeWords ? m.index + m[1].length : m.index;
                    const matchEnd = matchStart + (kw.text.length);
                    matches.push({
                        start: matchStart,
                        end: matchEnd,
                        cls: kw.cls,
                        priority: kw.priority
                    });
                }
            }

            if (!matches.length) continue;

            // Sort: vị trí -> priority cao trước -> dài hơn trước
            matches.sort((a, b) => a.start - b.start || b.priority - a.priority || b.end - a.end);

            // Loại bỏ chồng lấn
            const finalMatches = [];
            let lastEnd = 0;
            for (const m of matches) {
                if (m.start >= lastEnd) {
                    finalMatches.push(m);
                    lastEnd = m.end;
                }
            }

            if (!finalMatches.length) continue;

            const frag = document.createDocumentFragment();
            let pos = 0;
            for (const m of finalMatches) {
                if (m.start > pos) {
                    frag.appendChild(document.createTextNode(text.slice(pos, m.start)));
                }
                const mark = document.createElement('mark');
                mark.className = m.cls;
                mark.setAttribute('data-hl', '1');
                mark.textContent = text.slice(m.start, m.end);
                frag.appendChild(mark);
                pos = m.end;
            }
            if (pos < text.length) {
                frag.appendChild(document.createTextNode(text.slice(pos)));
            }
            node.replaceWith(frag);
        }

        setTimeout(restoreSelection, 0); // Defer restore fix reversed
    }

    // === REPLACE ALL SIÊU AN TOÀN (giữ format) ===
    function replaceAllSafe() {
        saveSelection();
        removeHighlightsSafe();

        const mode = replaceModes[activeModeName];
        if (!mode) return showNotification('Chưa chọn chế độ!', 'error');

        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item'))
            .map(el => ({
                find: el.querySelector('.find').value.trim(),
                replace: el.querySelector('.replace').value
            }))
            .filter(p => p.find);

        if (!pairs.length) return showNotification('Chưa có cặp thay thế!', 'error');

        // Sắp xếp theo độ dài giảm dần để tránh thay thế sai
        pairs.sort((a, b) => b.find.length - a.find.length);

        const wholeWords = mode.options?.wholeWords || false;
        const matchCase = mode.options?.matchCase || false;

        let changed = false;
        const findsUsed = new Set();

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
            let text = node.nodeValue;
            let newText = text;

            for (const pair of pairs) {
                const regex = buildRegex(pair.find, wholeWords, matchCase);
                if (!regex) continue;

                newText = newText.replace(regex, (match) => {
                    if (match !== pair.replace) {
                        changed = true;
                        findsUsed.add(pair.find);
                    }
                    return pair.replace;
                });
            }

            if (newText !== text) {
                node.nodeValue = newText;
            }
        }

        lastReplacedFinds = Array.from(findsUsed);
        highlightKeywords();

        if (changed) {
            showNotification('Thay thế thành công!', 'success');
        } else {
            lastReplacedFinds = [];
            highlightKeywords();
            showNotification('Không tìm thấy từ nào để thay thế.', 'error');
        }

        restoreSelection();
    }

    // === KEYWORDS TAG SYSTEM (giữ nguyên) ===
    function addKeywords() {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        vals.forEach(v => {
            if (v && !currentKeywords.includes(v)) {
                currentKeywords.push(v);
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.innerHTML = `${v} <span class="remove-tag">×</span>`;
                tag.querySelector('.remove-tag').onclick = (e) => {
                    e.stopPropagation();
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x => x !== v);
                };
                keywordsTags.appendChild(tag);
            }
        });
        keywordsInput.value = '';
        keywordsInput.focus();
    }

    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addKeywords();
        }
    });
    keywordsInput.addEventListener('blur', () => {
        if (keywordsInput.value.trim()) addKeywords();
    });

    // === PASTE & INPUT (fix giữ format + reversed) ===
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const htmlData = (e.clipboardData || window.clipboardData).getData('text/html');
        const plainData = (e.clipboardData || window.clipboardData).getData('text/plain');

        if (htmlData) {
            // Parse HTML để giữ format selective (bold, italic, lists)
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlData, 'text/html');
            // Clean: giữ <strong>, <em>, <br>, <ol>, <li>; bỏ font/size
            const allowedTags = ['STRONG', 'EM', 'BR', 'OL', 'UL', 'LI'];
            doc.querySelectorAll('*').forEach(el => {
                if (!allowedTags.includes(el.tagName)) {
                    el.replaceWith(...el.childNodes);
                } else {
                    el.removeAttribute('style');
                }
            });
            const frag = document.createDocumentFragment();
            frag.append(...doc.body.childNodes);
            document.execCommand('insertHTML', false, frag.innerHTML); // Insert giữ structure
        } else {
            // Fallback plain text với line breaks
            document.execCommand('insertText', false, plainData);
        }
        setTimeout(highlightKeywords, 100); // Delay để DOM ổn định, fix reversed
    });

    let highlightTimer;
    textLayer.addEventListener('input', () => {
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(highlightKeywords, 150);
    });

    // === FONT SYNC ===
    function syncFont() {
        const family = fontFamily.value;
        const size = fontSize.value;
        textLayer.style.fontFamily = highlightLayer.style.fontFamily = family;
        textLayer.style.fontSize = highlightLayer.style.fontSize = size;
    }
    fontFamily.onchange = fontSize.onchange = syncFont;

    matchCaseCb.onchange = wholeWordsCb.onchange = highlightKeywords;

    // === REPLACE MODE MANAGEMENT (giữ nguyên) ===
    function loadModes() {
        try {
            const data = localStorage.getItem(REPLACE_MODES_KEY);
            replaceModes = data ? JSON.parse(data) : {};
            activeModeName = localStorage.getItem(ACTIVE_MODE_NAME_KEY) || 'Mặc định';

            if (!replaceModes['Mặc định']) {
                replaceModes['Mặc định'] = { pairs: [], options: { matchCase: false, wholeWords: false } };
            }
            if (!replaceModes[activeModeName]) activeModeName = Object.keys(replaceModes)[0];
        } catch (e) {
            replaceModes = { 'Mặc định': { pairs: [], options: { matchCase: false, wholeWords: false } } };
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
        modeSelect.innerHTML = '';
        Object.keys(replaceModes).forEach(name => {
            const opt = new Option(name, name, false, name === activeModeName);
            modeSelect.add(opt);
        });

        const isDefault = activeModeName === 'Mặc định';
        deleteModeBtn.classList.toggle('hidden', isDefault);
        renameModeBtn.classList.toggle('hidden', isDefault);

        const opt = replaceModes[activeModeName].options || { matchCase: false };
        matchCaseReplaceBtn.textContent = opt.matchCase ? 'Case: BẬT' : 'Case: TẮT';
        matchCaseReplaceBtn.classList.toggle('bg-green-600', opt.matchCase);
        matchCaseReplaceBtn.classList.toggle('bg-gray-500', !opt.matchCase);

        punctuationList.innerHTML = '';
        (replaceModes[activeModeName].pairs || []).forEach(p => addPairUI(p.find, p.replace));
    }

    function addPairUI(find = '', replace = '', focus = true) {
        const div = document.createElement('div');
        div.className = 'punctuation-item';
        div.innerHTML = `
            <input type="text" class="find" placeholder="Tìm" value="${find}">
            <input type="text" class="replace" placeholder="Thay bằng" value="${replace}">
            <button class="remove-pair" title="Xóa">×</button>
        `;
        div.querySelector('.remove-pair').onclick = () => div.remove();
        punctuationList.prepend(div); // Thêm lên đầu
        if (focus) div.querySelector('.find').focus();
    }

    function saveCurrentMode() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        }));
        replaceModes[activeModeName].pairs = pairs;
        saveModes();
        showNotification(`Đã lưu chế độ "${activeModeName}"`, 'success');
    }

    // === EVENTS ===
    searchBtn.onclick = () => { lastReplacedFinds = []; highlightKeywords(); };
    clearBtn.onclick = () => {
        currentKeywords = [];
        lastReplacedFinds = [];
        keywordsTags.innerHTML = '';
        highlightKeywords();
    };
    replaceAllBtn.onclick = replaceAllSafe;
    addPairBtn.onclick = () => addPairUI('', '', true);
    saveSettingsBtn.onclick = saveCurrentMode;

    modeSelect.onchange = () => {
        activeModeName = modeSelect.value;
        saveModes();
        lastReplacedFinds = [];
        updateUI();
        highlightKeywords();
    };

    addModeBtn.onclick = () => {
        const name = prompt('Tên chế độ mới:')?.trim();
        if (!name || replaceModes[name]) {
            if (name) showNotification('Tên đã tồn tại!', 'error');
            return;
        }
        replaceModes[name] = { pairs: [], options: { matchCase: false, wholeWords: false } };
        activeModeName = name;
        saveModes();
        updateUI();
    };

    deleteModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định' || !confirm(`Xóa chế độ "${activeModeName}"?`)) return;
        delete replaceModes[activeModeName];
        activeModeName = Object.keys(replaceModes)[0];
        saveModes();
        updateUI();
    };

    renameModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định') return;
        const newName = prompt(`Đổi tên "${activeModeName}" thành:`, activeModeName)?.trim();
        if (!newName || newName === activeModeName || replaceModes[newName]) return;
        replaceModes[newName] = replaceModes[activeModeName];
        delete replaceModes[activeModeName];
        activeModeName = newName;
        saveModes();
        updateUI();
    };

    matchCaseReplaceBtn.onclick = () => {
        const opt = replaceModes[activeModeName].options ||= {};
        opt.matchCase = !opt.matchCase;
        saveModes();
        updateUI();
    };

    // === KHỞI ĐỢNG ===
    syncFont();
    loadModes();
    textLayer.textContent = '';
    highlightKeywords();
});
