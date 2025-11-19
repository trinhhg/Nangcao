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

    // === STATE ===
    // FIX: Khởi tạo mảng trống
    let currentKeywords  =; 
    let replacedKeywords =; 
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    // === UTILS ===
    // Thoát các ký tự đặc biệt Regex, quan trọng cho việc tìm kiếm chính xác
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Lưu/trả con trỏ an toàn (Selection/Range Safety)
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

    // === 1. TẠO REGEX CHUẨN KHÔNG LỖI ===
    function buildRegex(word) {
        if (!word) return null;
        const escaped = escapeRegex(word);
        const flags = matchCaseCb.checked? 'g' : 'gi';
        // Sử dụng \b (đã được thoát) để đảm bảo RegExp nhận được \b (Word boundary)
        const pattern = wholeWordsCb.checked? `\\b${escaped}\\b` : escaped;
        return new RegExp(pattern, flags);
    }

    // === 2. XÓA HIGHLIGHT AN TOÀN (VÀ NORMALIZE) ===
    function removeHighlightsSafe(root = textLayer) {
        root.querySelectorAll('mark[data-hl]').forEach(mark => {
            // Thay thế thẻ mark bằng chính nội dung text của nó
            mark.replaceWith(document.createTextNode(mark.textContent));
        });
        // Normalize: gộp các text node liền kề, giảm phân mảnh
        root.normalize();
    }

    // === 3. HIGHLIGHT CHUẨN (ROBUST TEXT NODE REPLACEMENT) ===
    function highlightKeywords() {
        saveSelection();
        removeHighlightsSafe();

        // FIX: Khởi tạo mảng keywordsToHighlight đúng cú pháp
        const keywordsToHighlight =, priority: 999 })),
            // Priority 100: Các từ khóa tìm kiếm hiện tại
           ...currentKeywords.map((t, i) => ({ text: t, cls: HIGHLIGHT_CLASSES[(replacedKeywords.length + i) % 6], priority: 100 }))
        ];

        if (!keywordsToHighlight.length) {
            restoreSelection();
            return;
        }

        // Ưu tiên: 1. Priority cao (999); 2. Độ dài giảm dần (từ dài trước)
        keywordsToHighlight.sort((a, b) => b.priority - a.priority |

| b.text.length - a.text.length);

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT, null, false);
        let node;

        // Duyệt từng text node một cách an toàn
        while (node = walker.nextNode()) {
            const originalText = node.nodeValue;
            let hasMatch = false;
            let bestFragment = null;

            // Chạy qua các từ khóa theo thứ tự ưu tiên
            for (const kw of keywordsToHighlight) {
                const regex = buildRegex(kw.text);
                if (!regex) continue;

                // FIX: Khởi tạo mảng allMatches đúng cú pháp
                const allMatches =; 
                let match;
                regex.lastIndex = 0;
                while ((match = regex.exec(originalText))!== null) {
                    allMatches.push({ 
                        index: match.index, 
                        length: match.length, 
                        content: match, 
                        cls: kw.cls 
                    });
                    hasMatch = true;
                }

                if (hasMatch) {
                    // Sắp xếp các match theo vị trí bắt đầu
                    allMatches.sort((a, b) => a.index - b.index);

                    let lastIndex = 0;
                    let tempFragment = document.createDocumentFragment(); 

                    allMatches.forEach(match => {
                        // Thêm text thuần trước match
                        if (match.index > lastIndex) {
                            tempFragment.appendChild(document.createTextNode(originalText.substring(lastIndex, match.index)));
                        }

                        // Thêm thẻ mark
                        const mark = document.createElement('mark');
                        mark.className = match.cls;
                        mark.setAttribute('data-hl', '1');
                        mark.textContent = match.content;
                        tempFragment.appendChild(mark);

                        lastIndex = match.index + match.length;
                    });

                    // Thêm phần text thuần còn lại
                    if (lastIndex < originalText.length) {
                        tempFragment.appendChild(document.createTextNode(originalText.substring(lastIndex)));
                    }

                    // Lưu fragment tốt nhất và thoát vòng lặp keywords (ưu tiên cao hơn đã được xử lý)
                    bestFragment = tempFragment;
                    break;
                }
            }

            // Nếu tìm thấy match (bestFragment!== null), thực hiện thay thế nguyên tử
            if (bestFragment) {
                // Thay thế node văn bản gốc bằng fragment mới (Thao tác nguyên tử)
                node.replaceWith(bestFragment);
                // TreeWalker sẽ tự động tìm node văn bản tiếp theo sau khi thay thế
            }
        }

        restoreSelection();
    }

    // === 4. REPLACE ALL SIÊU AN TOÀN & CHÍNH XÁC (JOYDEEPDEB MODEL) ===
    function replaceAllSafe() {
        saveSelection();
        removeHighlightsSafe();

        const pairs = Array.from(punctuationList.querySelectorAll('.punctuation-item'))
          .map(el => ({
                find: el.querySelector('.find').value.trim(),
                replace: el.querySelector('.replace').value
            }))
          .filter(p => p.find);

        if (!pairs.length) return alert('Chưa có cặp thay thế nào!');

        let changed = false;
        // Chỉ duyệt qua text nodes
        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);

        while (walker.nextNode()) {
            let node = walker.currentNode;
            let text = node.nodeValue;
            let originalText = text;

            // Xử lý tuần tự từng cặp thay thế
            pairs.forEach(pair => {
                const regex = buildRegex(pair.find);
                if (!regex) return;

                // Thực hiện replace trên chuỗi (không phải DOM)
                text = text.replace(regex, () => {
                    changed = true; // Chỉ cần match là đánh dấu changed
                    return pair.replace;
                });
            });

            // Chỉ ghi DOM nếu chuỗi đã thay đổi, tối ưu hóa hiệu năng
            if (text!== originalText) {
                node.nodeValue = text;
            }
        }

        if (changed) {
            replacedKeywords = pairs.map(p => p.replace).filter(Boolean);
            highlightKeywords();
            alert('Đã thay thế tất cả thành công!');
        } else {
            highlightKeywords(); // Vẫn gọi highlight để khôi phục trạng thái
            alert('Không tìm thấy từ nào để thay thế.');
        }

        restoreSelection();
    }

    // === PASTE SẠCH – GIỮ NGUYÊN ĐOẠN, KHÔNG DÍNH HTML ===
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

        // Highlight lại sau khi paste
        setTimeout(highlightKeywords, 0);
    });

    // === INPUT DEBOUNCE ===
    let highlightTimeout;
    textLayer.addEventListener('input', () => {
        clearTimeout(highlightTimeout);
        // Debounce 100ms cho các thao tác DOM nặng
        highlightTimeout = setTimeout(highlightKeywords, 100); 
    });

    // === KEYWORDS TAG SYSTEM + FIX FOCUS ===
    const addKeywords = () => {
        // Chỉ tách bằng Enter hoặc dấu phẩy
        const vals = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        if (!vals.length) {
            keywordsInput.value = '';
            return;
        }

        vals.forEach(v => {
            if (v &&!currentKeywords.includes(v)) {
                currentKeywords.push(v);

                const tag = document.createElement('div');
                tag.className = 'tag inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1';
                tag.innerHTML = `${v} <span class="remove-tag cursor-pointer ml-1">×</span>`;

                tag.querySelector('.remove-tag').onclick = (e) => {
                    e.stopPropagation();
                    tag.remove();
                    currentKeywords = currentKeywords.filter(x => x!== v);
                    highlightKeywords();
                };

                keywordsTags.appendChild(tag);
            }
        });

        keywordsInput.value = '';
        highlightKeywords();

        // FIX FOCUS – Đảm bảo focus được khôi phục sau thao tác DOM
        setTimeout(() => keywordsInput.focus(), 0);
    };

    // FIX LỖI: Xử lý keydown cho Enter và Comma, chặn hành vi mặc định
    keywordsInput.addEventListener('keydown', e => {
        // FIX CÚ PHÁP: Sử dụng ||
        if (e.key === 'Enter' |

| e.key === ',') { 
            e.preventDefault(); 
            addKeywords();
        }
    });

    // Xử lý blur: chỉ thêm keywords nếu có nội dung
    keywordsInput.addEventListener('blur', () => {
        if (keywordsInput.value.trim()) {
            setTimeout(addKeywords, 100);
        }
    });

    // === BUTTONS ===
    searchBtn.onclick = () => {
        replacedKeywords =;
        highlightKeywords();
    };

    clearBtn.onclick = () => {
        keywordsTags.innerHTML = '';
        currentKeywords =;
        replacedKeywords =;
        highlightKeywords();
    };

    replaceAllBtn.onclick = replaceAllSafe;

    // === FONT SETTINGS ===
    const syncFont = () => {
        textLayer.style.fontFamily = fontFamily.value;
        textLayer.style.fontSize = fontSize.value;
        // Đồng bộ font cho lớp highlight (quan trọng cho layout)
        document.getElementById('highlight-layer').style.fontFamily = fontFamily.value;
        document.getElementById('highlight-layer').style.fontSize = fontSize.value;
    };
    fontFamily.onchange = syncFont;
    fontSize.onchange = syncFont;

    // === KHỞI ĐỘNG ===
    syncFont();
    highlightKeywords();
});
