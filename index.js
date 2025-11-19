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
    let replacedKeywords = []; // Chứa các từ đã được thay thế (chỉ dùng cho highlight)
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    // === REPLACE MODE STATE & STORAGE ===
    const REPLACE_MODES_KEY = 'replaceModes';
    const ACTIVE_MODE_NAME_KEY = 'activeReplaceMode';
    let replaceModes = {};
    let activeModeName = 'Mặc định'; // Tên chế độ đang hoạt động

    // DOM Elements cho chế độ Thay Thế
    const modeSelect = document.getElementById('mode-select');
    const addModeBtn = document.getElementById('add-mode');
    const copyModeBtn = document.getElementById('copy-mode');
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
        container.prepend(notif); // Đặt thông báo mới nhất lên trên cùng

        setTimeout(() => {
            notif.remove();
        }, 3000);
    }

    // === 1. TẠO REGEX CHUẨN ===
    function buildRegex(word, isWholeWords = wholeWordsCb.checked, isMatchCase = matchCaseCb.checked) {
        if (!word) return null;
        const escaped = escapeRegex(word);
        const flags = isMatchCase ? 'g' : 'gi';
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

        const activeMode = replaceModes[activeModeName] || { options: {} };
        const searchWholeWords = wholeWordsCb.checked;
        const searchMatchCase = matchCaseCb.checked;
        
        // Cấu trúc từ khóa ưu tiên
        const keywordsToHighlight = [
            // Priority 999: Các từ đã được replace (ưu tiên cao nhất)
            ...replacedKeywords.map((t, i) => ({ 
                text: t, 
                cls: HIGHLIGHT_CLASSES[i % 6], 
                priority: 999,
                isWholeWords: searchWholeWords, // Dùng tùy chọn tìm kiếm
                isMatchCase: searchMatchCase
            })),
            // Priority 100: Các từ khóa đang tìm kiếm
            ...currentKeywords.map((t, i) => ({ 
                text: t, 
                cls: HIGHLIGHT_CLASSES[(replacedKeywords.length + i) % 6], 
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

            // Phase 1: Aggregating All Matches (Thu thập tất cả các kết quả khớp)
            for (const kw of keywordsToHighlight) {
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

            // Phase 2: Definitive Sorting and Conflict Resolution Setup
            // Sắp xếp: Vị trí (Tăng dần) -> Ưu tiên (Giảm dần, P999 trước P100) -> Độ dài (Giảm dần, từ dài trước)
            allMatchesInNode.sort((a, b) => 
                a.index - b.index || b.priority - a.priority || b.length - a.length
            );

            // Phase 3: Building the Fragment and Non-Overlapping Mutation
            let lastIndex = 0;
            const tempFragment = document.createDocumentFragment();

            allMatchesInNode.forEach(m => {
                // Kiểm tra xung đột không gian: chỉ chấp nhận nếu bắt đầu sau kết thúc của kết quả trước đó
                if (m.index >= lastIndex) {
                    // 1. Thêm đoạn văn bản không highlight (khe hở)
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

            // Thay thế node gốc bằng fragment mới
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

        const pairs = mode.pairs.filter(p => p.find);
        const replaceMatchCase = mode.options.matchCase || false;
        const replaceWholeWords = mode.options.wholeWords || false;

        if (!pairs.length) {
            showNotification('Chưa có cặp thay thế nào trong chế độ này!', 'error');
            highlightKeywords(); // Trả lại highlight ban đầu
            return;
        }

        let changed = false;
        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);

        while (walker.nextNode()) {
            let node = walker.currentNode;
            let text = node.nodeValue;
            let originalText = text;

            pairs.forEach(pair => {
                // Sử dụng tùy chọn matchCase/wholeWords của chế độ thay thế
                const regex = buildRegex(pair.find, replaceWholeWords, replaceMatchCase);
                if (!regex) return;
                
                // Thực hiện thay thế
                text = text.replace(regex, (match) => {
                    changed = true;
                    // match là chuỗi khớp thực tế, thay thế nó bằng pair.replace
                    return pair.replace;
                });
            });

            if (text !== originalText) {
                node.nodeValue = text;
            }
        }

        if (changed) {
            // Cập nhật replacedKeywords cho việc highlight ưu tiên
            replacedKeywords = pairs.map(p => p.replace).filter(Boolean);
            highlightKeywords();
            showNotification('Đã thay thế tất cả thành công!', 'success');
        } else {
            replacedKeywords = []; // Không thay thế gì, reset
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
                tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
                tag.innerHTML = `${v} <span class="remove-tag cursor-pointer ml-1">×</span>`;

                tag.querySelector('.remove-tag').onclick = (e) => {
                    e.stopPropagation();
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x => x !== v);
                    highlightKeywords();
                };

                keywordsTags.appendChild(tag);
            }
        });

        keywordsInput.value = '';
        // Reset replacedKeywords khi người dùng thêm từ khóa tìm kiếm mới
        replacedKeywords = []; 
        highlightKeywords();
        setTimeout(() => keywordsInput.focus(), 0);
    };

    // ... (Phần Event Listeners cho keywordsInput không đổi) ...
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
    // ... (Phần Paste sạch, Input Debounce không đổi) ...
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

        setTimeout(highlightKeywords, 0);
    });

    let highlightTimeout;
    textLayer.addEventListener('input', () => {
        clearTimeout(highlightTimeout);
        highlightTimeout = setTimeout(highlightKeywords, 100);
    });

    // ... (Phần syncFont không đổi) ...
    const syncFont = () => {
        textLayer.style.fontFamily = fontFamily.value;
        textLayer.style.fontSize   = fontSize.value;
        // Bổ sung đồng bộ cho highlight-layer
        const highlightLayer = document.getElementById('highlight-layer');
        if (highlightLayer) {
            highlightLayer.style.fontFamily = fontFamily.value;
            highlightLayer.style.fontSize   = fontSize.value;
        }
    };
    fontFamily.onchange = syncFont;
    fontSize.onchange   = syncFont;
    matchCaseCb.onchange = highlightKeywords; // Cập nhật highlight khi thay đổi tùy chọn
    wholeWordsCb.onchange = highlightKeywords; // Cập nhật highlight khi thay đổi tùy chọn
    // === END FONT SETTINGS & INPUT/PASTE LISTENERS ===


    // =========================================================
    // === CHỨC NĂNG THAY THẾ (REPLACE MODE MANAGEMENT) - FIX BUG II ===
    // =========================================================

    // --- A. Khởi tạo & Đồng bộ ---

    function loadModesFromStorage() {
        try {
            const storedModes = localStorage.getItem(REPLACE_MODES_KEY);
            replaceModes = storedModes ? JSON.parse(storedModes) : {};
            
            const storedActiveMode = localStorage.getItem(ACTIVE_MODE_NAME_KEY);
            activeModeName = storedActiveMode || 'Mặc định';

            // Nếu không có chế độ nào, tạo chế độ mặc định
            if (Object.keys(replaceModes).length === 0) {
                replaceModes['Mặc định'] = { pairs: [], options: { matchCase: false, wholeWords: false } };
                saveModesToStorage();
            }

            // Đảm bảo chế độ hoạt động tồn tại
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
        
        // Hiện/Ẩn nút Xóa/Đổi tên
        const isDefaultMode = activeModeName === 'Mặc định';
        deleteModeBtn.classList.toggle('hidden', isDefaultMode);
        renameModeBtn.classList.toggle('hidden', isDefaultMode);
        
        // Cập nhật trạng thái nút Match Case
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
        item.className = 'punctuation-item flex gap-1 items-center';

        item.innerHTML = `
            <input type="text" class="find flex-1 p-1 border rounded text-xs" placeholder="Tìm" value="${find}">
            <span class="text-gray-500 text-sm">→</span>
            <input type="text" class="replace flex-1 p-1 border rounded text-xs" placeholder="Thay thế" value="${replace}">
            <button class="remove-pair p-0.5 bg-red-500 text-white rounded text-xs w-6 h-6 flex items-center justify-center" title="Xóa">×</button>
        `;

        item.querySelector('.remove-pair').onclick = () => {
            item.remove();
            // Lưu lại để đồng bộ hóa
            saveCurrentModeSettings();
        };
        
        // Event listener để tự động lưu khi thay đổi
        item.querySelectorAll('input').forEach(input => {
            input.oninput = () => {
                // Sử dụng debounce để tránh lưu quá nhiều lần
                clearTimeout(input.saveTimeout);
                input.saveTimeout = setTimeout(saveCurrentModeSettings, 500);
            };
        });

        punctuationList.appendChild(item);
        if (shouldFocus) {
            item.querySelector('.find').focus();
        }
    }
    
    // --- C. Xử lý sự kiện (Persistence) ---

    function saveCurrentModeSettings() {
        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item')).map(el => ({
            find: el.querySelector('.find').value.trim(),
            replace: el.querySelector('.replace').value
        }));
        
        if (replaceModes[activeModeName]) {
            replaceModes[activeModeName].pairs = pairs;
            // options được quản lý riêng qua updateModeOptions
        }
        
        saveModesToStorage();
        showNotification(`Đã lưu cấu hình cho chế độ "${activeModeName}".`, 'success');
        // Sau khi lưu, cập nhật lại highlight để phản ánh các từ khóa thay thế mới
        // reset replacedKeywords khi lưu
        replacedKeywords = []; 
        highlightKeywords(); 
    }
    
    function updateModeOptions(key, value) {
        if (replaceModes[activeModeName]) {
            replaceModes[activeModeName].options[key] = value;
            saveModesToStorage();
            updateModeSelectUI(); // Cập nhật nút Case
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
            
            // Xóa highlight cũ và highlight lại dựa trên cài đặt mới (dù nó chỉ ảnh hưởng đến replaceAllSafe)
            replacedKeywords = []; 
            highlightKeywords();
        }
    }

    modeSelect.onchange = (e) => loadActiveMode(e.target.value);
    addPairBtn.onclick = () => addPairUI('', '', true);
    saveSettingsBtn.onclick = saveCurrentModeSettings;
    replaceAllBtn.onclick = replaceAllSafe;

    matchCaseReplaceBtn.onclick = () => {
        const mode = replaceModes[activeModeName];
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
    
    copyModeBtn.onclick = () => {
        let newName = prompt(`Sao chép chế độ "${activeModeName}" thành tên mới:`);
        if (!newName || !newName.trim()) return;
        newName = newName.trim();
        
        if (replaceModes[newName]) {
            showNotification(`Chế độ "${newName}" đã tồn tại.`, 'error');
            return;
        }

        // Sao chép sâu
        const currentModeData = JSON.parse(JSON.stringify(replaceModes[activeModeName]));
        replaceModes[newName] = currentModeData;
        loadActiveMode(newName);
    };
    
    deleteModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định' || !confirm(`Bạn có chắc muốn xóa chế độ "${activeModeName}"?`)) return;
        
        delete replaceModes[activeModeName];
        
        // Chuyển sang chế độ đầu tiên còn lại
        activeModeName = Object.keys(replaceModes)[0]; 
        
        saveModesToStorage();
        loadActiveMode(activeModeName); // Tải lại giao diện
        showNotification('Đã xóa chế độ thành công.', 'success');
    };
    
    renameModeBtn.onclick = () => {
        if (activeModeName === 'Mặc định') return; // Không cho đổi tên mặc định
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
        loadActiveMode(newName); // Tải lại với tên mới
    }
    
    // =========================================================
    // === BUTTONS VÀ KHỞI ĐỘNG ===
    // =========================================================

    searchBtn.onclick = () => {
        replacedKeywords = []; // Reset replaced khi tìm mới
        highlightKeywords();
    };

    clearBtn.onclick = () => {
        keywordsTags.innerHTML = '';
        currentKeywords = [];
        replacedKeywords = [];
        highlightKeywords();
    };

    // === KHỞI ĐỘNG CHÍNH ===
    syncFont();
    loadModesFromStorage();
    updateModeSelectUI();
    updatePunctuationListUI();
    highlightKeywords();
});
