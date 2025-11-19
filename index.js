document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    const keywordsInput    = document.getElementById('keywords-input');
    const keywordsTags     = document.getElementById('keywords-tags');
    const searchBtn        = document.getElementById('search');
    const clearBtn         = document.getElementById('clear');
    const fontFamily       = document.getElementById('fontFamily');
    const fontSize         = document.getElementById('fontSize');
    const matchCaseCb      = document.getElementById('matchCase'); // Phân biệt case TÌM KIẾM
    const wholeWordsCb     = document.getElementById('wholeWords'); // Từ hoàn chỉnh TÌM KIẾM
    const replaceAllBtn    = document.getElementById('replace-all');
    const punctuationList  = document.getElementById('punctuation-list');
    const textLayer        = document.getElementById('text-layer');

    // === STATE ===
    let currentKeywords  = [];
    // FIX 1: Chứa các từ GỐC đã bị thay thế trong lần Replace cuối cùng
    let lastReplacedFinds = []; 
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    // === REPLACE MODE STATE & STORAGE ===
    const REPLACE_MODES_KEY = 'replaceModes';
    const ACTIVE_MODE_NAME_KEY = 'activeReplaceMode';
    let replaceModes = {};
    let activeModeName = 'Mặc định'; // Tên chế độ đang hoạt động

    // DOM Elements cho chế độ Thay Thế
    const modeSelect = document.getElementById('mode-select');
    const addModeBtn = document.getElementById('add-mode');
    const matchCaseReplaceBtn = document.getElementById('match-case'); // Phân biệt case THAY THẾ
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');
    const deleteModeBtn = document.getElementById('delete-mode');
    const renameModeBtn = document.getElementById('rename-mode');

    // === UTILS ===
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Lưu/trả con trỏ an toàn
    let savedRange = null;
    function saveSelection() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        savedRange = sel.getRangeAt(0).cloneRange();
    }
    function restoreSelection() {
        if (!savedRange) return;
        try {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
        } catch(e) {
            savedRange = null;
        }
    }

    /**
     * @param {string} message 
     * @param {'success'|'error'} type 
     */
    function showNotification(message, type) {
        const container = document.getElementById('notification-container');
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        container.prepend(notif); 

        setTimeout(() => {
            notif.remove();
        }, 3000);
    }

    // === 1. TẠO REGEX CHUẨN ===
    // FIX 2: Tùy chọn wholeWords và matchCase được truyền vào để đảm bảo tính linh hoạt
    function buildRegex(word, isWholeWords = false, isMatchCase = false) {
        if (!word) return null;
        const escaped = escapeRegex(word);
        const flags = isMatchCase ? 'g' : 'gi';
        // FIX 2: Logic wholeWords
        const pattern = isWholeWords ? `\\b${escaped}\\b` : escaped; 
        return new RegExp(pattern, flags);
    }

    // === 2. XÓA HIGHLIGHT AN TOÀN ===
    function removeHighlightsSafe(root = textLayer) {
        root.querySelectorAll('mark[data-hl]').forEach(mark => {
            mark.replaceWith(document.createTextNode(mark.textContent));
        });
        root.normalize();
    }

    // === 3. HIGHLIGHT CHUẨN (VỚI THUẬT TOÁN GIẢI QUYẾT XUNG ĐỘT) ===
    function highlightKeywords() {
        saveSelection();
        removeHighlightsSafe();

        const searchWholeWords = wholeWordsCb.checked;
        const searchMatchCase = matchCaseCb.checked;
        
        // FIX 1: Ưu tiên highlight các từ đã bị thay thế (lastReplacedFinds)
        const keywordsToHighlight = [
            // Priority 999: Các từ gốc đã bị thay thế (màu vàng - chỉ dùng hl-yellow)
            ...lastReplacedFinds.map(t => ({ 
                text: t, 
                cls: 'hl-yellow', // Màu cố định cho từ đã bị thay thế
                priority: 999,
                isWholeWords: searchWholeWords, 
                isMatchCase: searchMatchCase
            })),
            // Priority 100: Các từ khóa đang tìm kiếm
            ...currentKeywords.map((t, i) => ({ 
                text: t, 
                // Dùng màu khác, bắt đầu từ index 1 để màu vàng (index 0) được ưu tiên cho replace
                cls: HIGHLIGHT_CLASSES[(1 + i) % 6], 
                priority: 100,
                isWholeWords: searchWholeWords,
                isMatchCase: searchMatchCase
            }))
        ].filter(kw => kw.text);

        if (!keywordsToHighlight.length) {
            restoreSelection();
            return;
        }

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while (node = walker.nextNode()) {
            const originalText = node.nodeValue;
            let allMatchesInNode = [];

            // Phase 1: Aggregating All Matches 
            for (const kw of keywordsToHighlight) {
                // FIX 2: Truyền đúng tùy chọn tìm kiếm (matchCase/wholeWords) vào buildRegex
                const regex = buildRegex(kw.text, kw.isWholeWords, kw.isMatchCase); 
                if (!regex) continue;

                let match;
                regex.lastIndex = 0;
                while ((match = regex.exec(originalText)) !== null) {
                    allMatchesInNode.push({ 
                        index: match.index, 
                        length: match[0].length,
                        content: match[0], 
                        cls: kw.cls,
                        priority: kw.priority
                    });
                }
            }

            if (!allMatchesInNode.length) continue;

            // Phase 2: Sorting and Conflict Resolution Setup
            // Sắp xếp: Vị trí (Tăng dần) -> Ưu tiên (Giảm dần) -> Độ dài (Giảm dần)
            allMatchesInNode.sort((a, b) => 
                a.index - b.index || b.priority - a.priority || b.length - a.length
            );

            // Phase 3: Building the Fragment and Non-Overlapping Mutation
            let lastIndex = 0;
            const tempFragment = document.createDocumentFragment();

            allMatchesInNode.forEach(m => {
                if (m.index >= lastIndex) {
                    // 1. Thêm đoạn văn bản không highlight 
                    if (m.index > lastIndex) {
                        tempFragment.appendChild(
                            document.createTextNode(originalText.substring(lastIndex, m.index))
                        );
                    }
                    
                    // 2. Thêm thẻ <mark>
                    const mark = document.createElement('mark');
                    mark.className = m.cls;
                    mark.setAttribute('data-hl', '1');
                    mark.textContent = m.content;
                    tempFragment.appendChild(mark);

                    // 3. Cập nhật con trỏ cuối
                    lastIndex = m.index + m.length;
                }
            });

            // 4. Thêm đoạn văn bản còn lại ở cuối
            if (lastIndex < originalText.length) {
                tempFragment.appendChild(
                    document.createTextNode(originalText.substring(lastIndex))
                );
            }

            if (tempFragment.childNodes.length > 0) {
                node.replaceWith(tempFragment);
            }
        }

        restoreSelection();
    }

    // === 4. REPLACE ALL SIÊU AN TOÀN ===
    function replaceAllSafe() {
        saveSelection();
        removeHighlightsSafe();

        const mode = replaceModes[activeModeName];
        if (!mode) {
             showNotification('Lỗi: Chế độ thay thế không tồn tại.', 'error');
             return;
        }
        // Lấy danh sách cặp hiện tại từ UI (chưa lưu) để đảm bảo thay thế là mới nhất
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        })).filter(p => p.find);

        // Đảm bảo lấy đúng options đã lưu
        const replaceMatchCase = mode.options.matchCase || false;
        const replaceWholeWords = mode.options.wholeWords || false; 

        if (!pairs.length) {
            showNotification('Chưa có cặp thay thế nào trong chế độ này!', 'error');
            highlightKeywords(); 
            return;
        }

        let changed = false;
        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        let findsUsed = new Set(); 

        // Sắp xếp lại pairs theo độ dài giảm dần
        pairs.sort((a, b) => b.find.length - a.find.length); 

        while (walker.nextNode()) {
            let node = walker.currentNode;
            let text = node.nodeValue;
            let originalText = text;
            let tempText = text;

            // Áp dụng từng cặp thay thế lên tempText
            pairs.forEach(pair => {
                const regex = buildRegex(pair.find, replaceWholeWords, replaceMatchCase);
                if (!regex) return;
                
                tempText = tempText.replace(regex, (match) => {
                    if (match !== pair.replace) { 
                        changed = true;
                        findsUsed.add(pair.find); // Lưu từ gốc đã bị thay thế
                        return pair.replace;
                    }
                    return match; 
                });
            });

            if (tempText !== originalText) {
                node.nodeValue = tempText;
            }
        }

        // FIX 1: Cập nhật lastReplacedFinds cho highlight từ đã thay thế
        lastReplacedFinds = Array.from(findsUsed);

        if (changed) {
            highlightKeywords();
            showNotification('Đã thay thế tất cả thành công!', 'success');
        } else {
            lastReplacedFinds = []; // Không thay thế gì, reset
            highlightKeywords();
            showNotification('Không tìm thấy từ nào để thay thế.', 'error');
        }

        restoreSelection();
    }

    // === KEYWORDS TAG SYSTEM ===
    const addKeywords = () => {
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        if (!vals.length) {
            keywordsInput.value = '';
            return;
        }

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
                    // Chỉ xóa khỏi danh sách, không highlight ngay
                };

                keywordsTags.appendChild(tag);
            }
        });

        keywordsInput.value = '';
        // FIX 6: KHÔNG highlight ngay khi thêm, chỉ thêm vào danh sách
        setTimeout(() => keywordsInput.focus(), 0);
    };

    // FIX 6: Thêm keywords khi Enter/dấu phẩy, KHÔNG highlight ngay
    keywordsInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addKeywords();
        }
    });

    keywordsInput.addEventListener('blur', () => {
        if (keywordsInput.value.trim()) {
            setTimeout(addKeywords, 100);
        }
    });
    // === END KEYWORDS TAG SYSTEM ===


    // === FONT SETTINGS & INPUT/PASTE LISTENERS ===
    textLayer.addEventListener('paste', e => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        range.deleteContents();

        const lines = text.split(/\r?\n/);
        const frag = document.createDocumentFragment();

        lines.forEach((line, i) => {
            if (i > 0) frag.appendChild(document.createElement('br'));
            frag.appendChild(document.createTextNode(line));
        });

        range.insertNode(frag);
        range.collapse(false);

        // Vẫn highlight khi Paste để người dùng thấy kết quả
        setTimeout(highlightKeywords, 0); 
    });

    let highlightTimeout;
    textLayer.addEventListener('input', () => {
        clearTimeout(highlightTimeout);
        highlightTimeout = setTimeout(highlightKeywords, 100);
    });

    const syncFont = () => {
        textLayer.style.fontFamily = fontFamily.value;
        textLayer.style.fontSize   = fontSize.value;
        const highlightLayer = document.getElementById('highlight-layer');
        if (highlightLayer) {
            highlightLayer.style.fontFamily = fontFamily.value;
            highlightLayer.style.fontSize   = fontSize.value;
        }
    };
    fontFamily.onchange = syncFont;
    fontSize.onchange   = syncFont;
    
    // Khi thay đổi tùy chọn tìm kiếm (Case/Whole Word), cần highlight lại ngay
    matchCaseCb.onchange = highlightKeywords; 
    wholeWordsCb.onchange = highlightKeywords; 
    // === END FONT SETTINGS & INPUT/PASTE LISTENERS ===


    // =========================================================
    // === CHỨC NĂNG THAY THẾ (REPLACE MODE MANAGEMENT) ===
    // =========================================================

    // --- A. Khởi tạo & Đồng bộ ---

    function loadModesFromStorage() {
        try {
            const storedModes = localStorage.getItem(REPLACE_MODES_KEY);
            replaceModes = storedModes ? JSON.parse(storedModes) : {};
            
            const storedActiveMode = localStorage.getItem(ACTIVE_MODE_NAME_KEY);
            activeModeName = storedActiveMode || 'Mặc định';

            if (Object.keys(replaceModes).length === 0) {
                replaceModes['Mặc định'] = { pairs: [], options: { matchCase: false, wholeWords: false } };
                saveModesToStorage();
            }

            if (!replaceModes[activeModeName]) {
                activeModeName = Object.keys(replaceModes)[0];
                localStorage.setItem(ACTIVE_MODE_NAME_KEY, activeModeName);
            }
        } catch (e) {
            console.error("Lỗi khi tải dữ liệu từ localStorage:", e);
            replaceModes = { 'Mặc định': { pairs: [], options: { matchCase: false, wholeWords: false } } };
            activeModeName = 'Mặc định';
        }
    }

    function saveModesToStorage() {
        try {
            localStorage.setItem(REPLACE_MODES_KEY, JSON.stringify(replaceModes));
            localStorage.setItem(ACTIVE_MODE_NAME_KEY, activeModeName);
        } catch (e) {
            console.error("Lỗi khi lưu dữ liệu vào localStorage:", e);
            showNotification('Không thể lưu cấu hình thay thế.', 'error');
        }
    }

    function updateModeSelectUI() {
        modeSelect.innerHTML = '';
        Object.keys(replaceModes).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            if (name === activeModeName) {
                option.selected = true;
            }
            modeSelect.appendChild(option);
        });
        
        const isDefaultMode = activeModeName === 'Mặc định';
        deleteModeBtn.classList.toggle('hidden', isDefaultMode);
        renameModeBtn.classList.toggle('hidden', isDefaultMode);
        
        const activeMode = replaceModes[activeModeName];
        if (activeMode && activeMode.options) {
            matchCaseReplaceBtn.textContent = activeMode.options.matchCase ? 'Case: BẬT' : 'Case: TẮT';
            matchCaseReplaceBtn.classList.toggle('bg-gray-500', !activeMode.options.matchCase);
            matchCaseReplaceBtn.classList.toggle('bg-green-600', activeMode.options.matchCase);
        }
    }

    function updatePunctuationListUI() {
        punctuationList.innerHTML = '';
        const mode = replaceModes[activeModeName];
        if (mode && mode.pairs) {
            mode.pairs.forEach(pair => addPairUI(pair.find, pair.replace, false));
        }
    }
    
    // --- B. Quản lý cặp thay thế (UI) ---

    function addPairUI(find = '', replace = '', shouldFocus = true) {
        const item = document.createElement('div');
        item.className = 'punctuation-item'; 

        item.innerHTML = `
            <input type="text" class="find" placeholder="Tìm" value="${find}">
            <input type="text" class="replace" placeholder="Thay thế" value="${replace}">
            <button class="remove-pair" title="Xóa">×</button>
        `;

        item.querySelector('.remove-pair').onclick = () => {
            item.remove();
            // KHÔNG tự động lưu
        };
        
        item.querySelectorAll('input').forEach(input => {
            // FIX 4: Loại bỏ logic tự động lưu khi input
            // input.oninput = ... (Đã loại bỏ)
        });

        punctuationList.appendChild(item);
        if (shouldFocus) {
            item.querySelector('.find').focus();
        }
    }
    
    // --- C. Xử lý sự kiện (Persistence) ---

    // FIX 4: Hàm này chỉ được gọi khi bấm nút "Lưu"
    function saveCurrentModeSettings() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        }));
        
        if (replaceModes[activeModeName]) {
            replaceModes[activeModeName].pairs = pairs;
        }
        
        saveModesToStorage();
        showNotification(`Đã lưu cấu hình cho chế độ "${activeModeName}".`, 'success');
    }
    
    function updateModeOptions(key, value) {
        if (replaceModes[activeModeName]) {
            replaceModes[activeModeName].options[key] = value;
            saveModesToStorage();
            updateModeSelectUI(); 
            showNotification(`Đã cập nhật tùy chọn cho chế độ "${activeModeName}".`, 'success');
        }
    }

    // --- D. Chức năng Quản lý Chế độ (Mode Handlers) ---
    
    function loadActiveMode(name) {
        if (replaceModes[name]) {
            activeModeName = name;
            localStorage.setItem(ACTIVE_MODE_NAME_KEY, activeModeName);
            updateModeSelectUI();
            updatePunctuationListUI();
            
            // Khi đổi chế độ, reset trạng thái highlight thay thế
            lastReplacedFinds = []; 
            highlightKeywords();
        }
    }

    modeSelect.onchange = (e) => loadActiveMode(e.target.value);
    addPairBtn.onclick = () => addPairUI('', '', true);
    saveSettingsBtn.onclick = saveCurrentModeSettings;
    replaceAllBtn.onclick = replaceAllSafe;

    matchCaseReplaceBtn.onclick = () => {
        const mode = replaceModes[activeModeName];
        if (!mode.options) mode.options = { matchCase: false, wholeWords: false }; 

        const newCase = !mode.options.matchCase;
        updateModeOptions('matchCase', newCase);
    };
    
    addModeBtn.onclick = () => {
        let newName = prompt("Nhập tên cho chế độ thay thế mới:");
        if (!newName || !newName.trim()) return;
        newName = newName.trim();
        
        if (replaceModes[newName]) {
            showNotification(`Chế độ "${newName}" đã tồn tại.`, 'error');
            return;
        }

        replaceModes[newName] = { pairs: [], options: { matchCase: false, wholeWords: false } };
        loadActiveMode(newName);
    };
    
    deleteModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định' || !confirm(`Bạn có chắc muốn xóa chế độ "${activeModeName}"?`)) return;
        
        delete replaceModes[activeModeName];
        
        activeModeName = Object.keys(replaceModes)[0]; 
        
        saveModesToStorage();
        loadActiveMode(activeModeName); 
        showNotification('Đã xóa chế độ thành công.', 'success');
    };
    
    renameModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định') return; 
        let newName = prompt(`Đổi tên chế độ "${activeModeName}" thành:`);
        if (!newName || !newName.trim() || newName === activeModeName) return;
        newName = newName.trim();
        
        if (replaceModes[newName]) {
            showNotification(`Chế độ "${newName}" đã tồn tại.`, 'error');
            return;
        }

        const modeToRename = replaceModes[activeModeName];
        delete replaceModes[activeModeName];
        replaceModes[newName] = modeToRename;
        loadActiveMode(newName); 
    }
    
    // =========================================================
    // === BUTTONS VÀ KHỞI ĐỘNG ===
    // =========================================================

    // FIX 6: Highlight chỉ chạy khi bấm nút Tìm Kiếm
    searchBtn.onclick = () => {
        // Cần highlight lại khi tìm kiếm để reset lại highlight
        highlightKeywords();
    };

    clearBtn.onclick = () => {
        keywordsTags.innerHTML = '';
        currentKeywords = [];
        lastReplacedFinds = [];
        highlightKeywords(); // Highlight sau khi xóa để xóa hết highlight cũ
    };

    // === KHỞI ĐỘNG CHÍNH ===
    syncFont();
    loadModesFromStorage();
    updateModeSelectUI();
    updatePunctuationListUI();
    
    // FIX 5: Xóa văn bản mẫu.
    textLayer.textContent = ""; 
    highlightKeywords();
});
