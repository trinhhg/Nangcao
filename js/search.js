// Trích xuất các chương từ văn bản
function extractChapters(text) {
    const chapterRegex = /Chương\s+\d+/gi;
    const chapters = text.match(chapterRegex) || [];
    return chapters;
}

// Thực hiện tìm kiếm và cập nhật giao diện
function performSearch() {
    const textInput = document.getElementById('textInput');
    const keywordsInput = document.getElementById('keywords').value;
    const matchCase = document.getElementById('matchCase').checked;
    const wholeWords = document.getElementById('wholeWords').checked;
    const message = document.getElementById('message');
    const results = document.getElementById('results');

    const keywords = keywordsInput.split(',').map(k => k.trim()).filter(k => k);
    if (!keywords.length) {
        message.textContent = 'Vui lòng nhập ít nhất một từ khóa.';
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        clearHighlights(textInput);
        return; // Không xóa danh sách chương
    }

    // Lấy innerHTML để giữ định dạng
    let text = textInput.innerHTML;
    // Chuyển nội dung về dạng text để kiểm tra từ khóa
    const textContent = textInput.textContent;
    let found = false;
    for (const keyword of keywords) {
        const regex = wholeWords
            ? new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, matchCase ? 'g' : 'gi')
            : new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
        if (textContent.match(regex)) {
            found = true;
            break;
        }
    }

    if (found) {
        message.textContent = 'Đã tìm thấy từ khóa!';
        message.className = 'mb-4 p-2 rounded bg-green-200 text-green-800';
        // Đánh dấu trên innerHTML để giữ định dạng
        textInput.innerHTML = highlightText(text, keywords, matchCase, wholeWords);
        const chapters = extractChapters(textContent);
        results.innerHTML = chapters.length ? chapters.map(ch => `<li>${ch}</li>`).join('') : '<li>Không tìm thấy chương nào.</li>';
    } else {
        message.textContent = 'Không tìm thấy từ khóa.';
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        clearHighlights(textInput);
    }
}

// Xóa nội dung văn bản nhưng giữ danh sách chương
function clearContent() {
    const textInput = document.getElementById('textInput');
    const message = document.getElementById('message');
    textInput.textContent = '';
    message.textContent = '';
    message.className = 'mb-4 p-2 rounded';
    // Không xóa results
}
