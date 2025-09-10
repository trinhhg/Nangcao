// Màu đánh dấu
const highlightColors = ['highlight-pink', 'highlight-yellow', 'highlight-blue', 'highlight-green', 'highlight-orange'];

// Đánh dấu từ khóa trong văn bản
function highlightText(text, keywords, matchCase, wholeWords) {
    let highlightedText = text;
    keywords.forEach((keyword, index) => {
        const colorClass = highlightColors[index % highlightColors.length];
        let regex;
        if (wholeWords) {
            regex = new RegExp(`\\b${keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, matchCase ? 'g' : 'gi');
        } else {
            regex = new RegExp(keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
        }
        // Giữ nguyên định dạng bằng cách thay thế mà không làm mất ký tự xuống dòng
        highlightedText = highlightedText.replace(regex, `<span class="${colorClass}">$&</span>`);
    });
    return highlightedText;
}

// Xóa đánh dấu
function clearHighlights(element) {
    element.innerHTML = element.textContent.replace(/\n/g, '<br>'); // Giữ các ký tự xuống dòng
}
