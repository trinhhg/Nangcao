// editor.js
document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG & STATE ===
    const KW_COLORS = ['hl-red', 'hl-green', 'hl-blue', 'hl-yellow', 'hl-purple'];
    const KW_REGEX_FLAGS = 'giu'; // Global, Case-Insensitive, Unicode
    const HIGHLIGHT_CHUNK_SIZE = 5000; // Số ký tự xử lý mỗi lần (cho async chunking)
    const MAX_HIGHLIGHT_BOXES = 3000; // Giới hạn số lượng DOM nodes highlight để pooling

    let state = {
        text: '',
        keywords: [],
        highlightRanges: [], // Array of { start: number, end: number, colorIndex: number }
        fontFamily: "'Montserrat', sans-serif",
        fontSize: '16px',
        isRecalculating: false,
        highlightBoxPool: [] // Pool of reusable DIV elements
    };

    // === DOM ELEMENTS ===
    const els = {
        wrapper: document.getElementById('editor-wrapper'),
        pasteArea: document.getElementById('paste-area'),
        viewLayer: document.getElementById('view-layer'),
        overlay: document.getElementById('overlay'),
        measureLayer: document.getElementById('measure-layer'),
        keywordsInput: document.getElementById('keywords-input'),
        fontFamilySelect: document.getElementById('fontFamily'),
        fontSizeSelect: document.getElementById('fontSize'),
        recalculateBtn: document.getElementById('recalculate-btn'),
        clearBtn: document.getElementById('clear-btn'),
        wordCount: document.getElementById('word-count-display'),
        notify: document.getElementById('notification-container')
    };
    
    // === UTILS ===

    // Chú thích: Hàm này dùng để thông báo nhỏ ở góc màn hình (giống như code gốc của bạn)
    function notify(msg, type = 'success') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = msg;
        els.notify.prepend(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }
    
    // Hàm Debounce: Đảm bảo một hàm không chạy quá thường xuyên
    function debounce(func, timeout = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => { func.apply(this, args); }, timeout);
        };
    }
    
    // Hàm Throttle: Đảm bảo hàm chỉ chạy một lần trong một khoảng thời gian (tốt cho scroll/resize)
    function throttle(func, limit) {
        let inThrottle;
        let lastResult;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
                lastResult = func.apply(context, args);
            }
            return lastResult;
        }
    }

    // Cập nhật Word Count
    function updateWordCount() {
        const txt = state.text || '';
        const count = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        els.wordCount.textContent = `Words: ${count}`;
    }

    // Đồng bộ Font giữa 4 lớp View/Paste/Overlay/Measure
    function syncFont() {
        const font = els.fontFamilySelect.value;
        const size = els.fontSizeSelect.value;

        // Cập nhật state
        state.fontFamily = font;
        state.fontSize = size;
        
        // Cập nhật CSS cho các lớp
        [els.viewLayer, els.pasteArea, els.measureLayer].forEach(el => {
            el.style.setProperty('font-family', font, 'important');
            el.style.setProperty('font-size', size, 'important');
        });
        
        // Cần tính toán lại highlight khi Font/Size thay đổi
        // Tối ưu hóa: Dùng debounce để tránh tính toán liên tục khi người dùng đổi font
        debouncedRecalculate();
    }
    
    // === CORE LOGIC - BƯỚC 1: XỬ LÝ PASTE/TEXT ===
    
    // Đặt text mới vào View Layer và Measure Layer
    function setText(newText) {
        // Loại bỏ các ký tự PUA nếu có từ hệ thống cũ
        state.text = newText.replace(/[\uE000-\uE005]/g, ''); 
        
        // Cập nhật View Layer (1 DOM Operation - Rất nhanh)
        els.viewLayer.textContent = state.text;
        
        // Cập nhật Measure Layer (1 DOM Operation - Rất nhanh)
        // Measure Layer được dùng để tính toán Range.getClientRects()
        els.measureLayer.textContent = state.text;

        updateWordCount();
        
        // Kích hoạt tính toán highlight (Async)
        scheduleHighlightRecalculation();
    }

    // Xử lý Paste: KHÔNG BLOCK UI THREAD
    function handlePaste(e) {
        e.preventDefault();
        
        // Lấy text thuần từ clipboard
        let text = (e.clipboardData || window.clipboardData).getData('text/plain');
        
        // Chuẩn hóa xuống dòng (cần thiết cho white-space: pre-wrap)
        text = text.replace(/\r\n/g, '\n');
        
        // Cập nhật Text
        setText(text);
        
        // Đặt lại giá trị của pasteArea để nó hoạt động như một input
        els.pasteArea.value = '';
        notify('Đã dán văn bản! Đang xử lý highlight...', 'warning');
    }
    
    // Xử lý Input trực tiếp vào Paste Area (nếu cần)
    function handleInput() {
        // Chỉ xử lý nếu có text mới, dùng debounce để tránh xử lý liên tục
        debouncedInputProcess();
    }
    const debouncedInputProcess = debounce(() => {
        setText(els.pasteArea.value);
        els.pasteArea.value = ''; // Xóa input sau khi xử lý
    }, 500);

    // === CORE LOGIC - BƯỚC 2: TÍNH TOÁN HIGHLIGHT (ASYNCHRONOUS) ===
    
    // Tìm kiếm offsets của Keywords (Chunked/Async)
    async function computeHighlights(text, keywords) {
        if (!text || keywords.length === 0) return [];

        state.isRecalculating = true;
        
        const textToSearch = text.toLowerCase();
        // Sắp xếp từ dài nhất đến ngắn nhất để xử lý chồng lấn
        const sortedKws = keywords.map(kw => kw.trim()).filter(Boolean).sort((a,b) => b.length - a.length);
        const allRanges = [];
        let totalMatches = 0;
        
        for (let i = 0; i < text.length; i += HIGHLIGHT_CHUNK_SIZE) {
            // Nhường lại UI Thread mỗi lần xử lý chunk mới
            await new Promise(resolve => setTimeout(resolve, 0)); 
            
            const chunk = textToSearch.substring(i, i + HIGHLIGHT_CHUNK_SIZE);
            const offset = i;
            
            // Tìm kiếm tất cả từ khóa trong chunk
            for (let k = 0; k < sortedKws.length; k++) {
                const kw = sortedKws[k].toLowerCase();
                let cursor = 0;

                while (cursor < chunk.length) {
                    const idx = chunk.indexOf(kw, cursor);
                    if (idx === -1) break;
                    
                    // Chỉ thêm vào nếu không chồng lấn với highlight đã tìm được (chọn từ dài nhất)
                    const newStart = offset + idx;
                    const newEnd = offset + idx + kw.length;

                    // Kiểm tra chồng lấn: nếu vị trí mới nằm trong một range đã tìm thấy (và range cũ dài hơn), bỏ qua
                    let isOverlapped = allRanges.some(range => {
                        return newStart >= range.start && newEnd <= range.end && (range.end - range.start) >= kw.length;
                    });
                    
                    if (!isOverlapped) {
                        // Loại bỏ các range ngắn hơn/bị chứa bởi range mới
                        allRanges = allRanges.filter(range => {
                            return !(newStart <= range.start && newEnd >= range.end);
                        });

                        allRanges.push({ start: newStart, end: newEnd, colorIndex: k % KW_COLORS.length });
                        totalMatches++;
                    }
                    
                    cursor = idx + kw.length;
                }
            }
        }
        
        // Sắp xếp lại theo vị trí bắt đầu
        allRanges.sort((a, b) => a.start - b.start);
        state.isRecalculating = false;
        return allRanges;
    }

    // Hàm lên lịch tính toán (dùng setTimeout 0 để không block paste)
    function scheduleHighlightRecalculation() {
        if (state.isRecalculating) return;

        // Reset highlight ngay lập tức
        clearOverlay();
        
        if (!state.text || state.keywords.length === 0) {
            state.highlightRanges = [];
            return;
        }

        // Dùng setTimeout(0) để nhường quyền điều khiển cho UI Thread (rất quan trọng)
        setTimeout(async () => {
            const t0 = performance.now();
            try {
                const ranges = await computeHighlights(state.text, state.keywords);
                state.highlightRanges = ranges;
                renderOverlay(); // Sau khi tính toán xong, tiến hành vẽ
                const t1 = performance.now();
                notify(`Highlight hoàn tất. Thời gian tính toán: ${(t1 - t0).toFixed(2)}ms`, 'success');
            } catch (error) {
                console.error("Highlight computation error:", error);
                notify('Lỗi tính toán highlight', 'error');
            }
        }, 0);
    }
    
    // === CORE LOGIC - BƯỚC 3: RENDER OVERLAY (DOM Boxes) ===

    // Lấy lại một Div Highlight từ Pool hoặc tạo mới
    function getHighlightBox(index) {
        let box = state.highlightBoxPool[index];
        if (!box) {
            box = document.createElement('div');
            box.classList.add('highlight-box');
            state.highlightBoxPool.push(box);
            els.overlay.appendChild(box);
        }
        return box;
    }
    
    // Ẩn các box thừa trong Pool
    function clearOverlay() {
        state.highlightBoxPool.forEach(box => box.classList.add('hidden'));
    }

    // Vẽ highlight bằng DOM Divs và Range.getClientRects()
    function renderOverlay() {
        if (!state.text) {
            clearOverlay();
            return;
        }
        
        // 1. Chuẩn bị Measure Layer và TextNode
        const textNode = els.measureLayer.firstChild;
        if (!textNode || textNode.nodeType !== 3) { // Phải là Text Node
             // Tạo Text Node mới nếu chưa có
            els.measureLayer.textContent = state.text; 
            if(els.measureLayer.firstChild) {
                els.measureLayer.removeChild(els.measureLayer.firstChild);
            }
            els.measureLayer.appendChild(document.createTextNode(state.text));
        }
        
        // 2. Clear Overlay trước khi vẽ lại
        clearOverlay();
        let boxIndex = 0;
        
        // 3. Tính toán vị trí và Render
        const range = document.createRange();
        // Lấy tọa độ tương đối của container (Wrapper)
        const wrapperRect = els.wrapper.getBoundingClientRect(); 

        for (const { start, end, colorIndex } of state.highlightRanges) {
            if (boxIndex >= MAX_HIGHLIGHT_BOXES) break; // Giới hạn DOM node

            try {
                // Thiết lập Range trên TextNode của Measure Layer
                range.setStart(els.measureLayer.firstChild, start);
                range.setEnd(els.measureLayer.firstChild, end);

                const rects = range.getClientRects();
                const colorClass = KW_COLORS[colorIndex];
                
                // Mỗi Range có thể tạo ra nhiều rect (nếu từ khóa nằm trên nhiều dòng)
                for (const r of rects) {
                    if (boxIndex >= MAX_HIGHLIGHT_BOXES) break;

                    const box = getHighlightBox(boxIndex++);
                    
                    // Tính tọa độ tuyệt đối so với container
                    // Tọa độ tuyệt đối = (Tọa độ Viewport của Rect - Tọa độ Viewport của Wrapper) + Scroll của Wrapper
                    // Ở đây wrapper không có scroll bar, chỉ có View Layer có.
                    // Kỹ thuật Range.getClientRects() trả về tọa độ của text trong #measure-layer
                    // Vì #measure-layer và #view-layer đồng bộ CSS, tọa độ này là chính xác.
                    
                    // Vị trí Top tuyệt đối (relative to #editor-wrapper, not viewport)
                    const topAbs = r.top - wrapperRect.top;
                    const leftAbs = r.left - wrapperRect.left;

                    box.className = `highlight-box ${colorClass}`;
                    box.style.top = `${topAbs}px`;
                    box.style.left = `${leftAbs}px`;
                    box.style.width = `${r.width}px`;
                    box.style.height = `${r.height}px`;
                    box.classList.remove('hidden');
                }

            } catch (e) {
                console.warn("Lỗi khi Range.setStart/setEnd (text node bug):", e);
                continue;
            }
        }
        
        // Sau khi render xong, ta sẽ đồng bộ vị trí cuộn
        syncScroll(); 
    }
    
    // === SYNCHRONIZATION LOGIC ===
    
    // Đồng bộ cuộn (Scroll Sync) TỐI ƯU
    function syncScroll() {
        // Lấy vị trí cuộn của View Layer (có thanh cuộn)
        const scrollTop = els.viewLayer.scrollTop;
        const scrollLeft = els.viewLayer.scrollLeft;

        // Áp dụng Transform ngược lại lên lớp Overlay (RẤT RẺ VÀ NHANH - GPU Accelerated)
        // Việc này làm cho các khối highlight Absolute position dịch chuyển ngược với text cuộn
        els.overlay.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
        
        // Đồng bộ vị trí của Paste Area để user có thể click vào đúng vị trí text
        els.pasteArea.scrollTop = scrollTop;
        els.pasteArea.scrollLeft = scrollLeft;
    }
    const throttledScrollSync = throttle(syncScroll, 16); // 16ms ~ 60FPS

    // Xử lý Resize/Zoom (Recalculate)
    const handleResize = debounce(() => {
        // Cần tính toán lại tọa độ khi Wrapper hoặc Font/Zoom thay đổi
        if (state.text && state.highlightRanges.length > 0) {
            renderOverlay();
            notify('Đã cập nhật lại Highlight do Resize/Zoom.', 'warning');
        }
    }, 200);
    const debouncedRecalculate = debounce(scheduleHighlightRecalculation, 200);


    // === INIT & EVENT LISTENERS ===
    function init() {
        // Khởi tạo Text Area Placeholders
        els.pasteArea.setAttribute('placeholder', 'Dán văn bản vào đây (Ctrl+V)');
        
        // 1. INPUT/PASTE LISTENER: Nhận paste tức thì
        els.pasteArea.addEventListener('paste', handlePaste);
        els.pasteArea.addEventListener('input', handleInput);

        // 2. SCROLL LISTENER: Đồng bộ cuộn
        els.viewLayer.addEventListener('scroll', throttledScrollSync);
        
        // 3. CONTROL LISTENERS: Font/Size
        els.fontFamilySelect.value = state.fontFamily;
        els.fontSizeSelect.value = state.fontSize;
        els.fontFamilySelect.addEventListener('change', syncFont);
        els.fontSizeSelect.addEventListener('change', syncFont);
        
        // 4. KEYWORDS LISTENER:
        els.keywordsInput.addEventListener('input', debounce(() => {
            state.keywords = els.keywordsInput.value.split(',').map(k => k.trim()).filter(Boolean);
            scheduleHighlightRecalculation();
        }, 300));

        // 5. BUTTON LISTENERS
        els.recalculateBtn.addEventListener('click', () => {
             if (state.text) {
                scheduleHighlightRecalculation();
             } else {
                 notify('Chưa có văn bản!', 'error');
             }
        });
        els.clearBtn.addEventListener('click', () => {
            setText('');
            els.pasteArea.value = '';
            els.viewLayer.textContent = '';
            clearOverlay();
            notify('Đã xóa trắng Editor.', 'warning');
        });

        // 6. RESIZE LISTENER: Đồng bộ lại vị trí highlight khi thay đổi kích thước
        window.addEventListener('resize', handleResize);
        
        // Tự động đồng bộ font lúc khởi tạo
        syncFont(); 
        
        // Tự động focus vào paste area
        els.pasteArea.focus();
    }

    init();
});
