// Available highlight colors
const highlightColors = ['highlight-pink', 'highlight-yellow', 'highlight-blue', 'highlight-green', 'highlight-orange'];

// Highlight keywords in text
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
        highlightedText = highlightedText.replace(regex, `<span class="${colorClass}">$&</span>`);
    });
    return highlightedText;
}

// Clear existing highlights
function clearHighlights(element) {
    element.innerHTML = element.textContent;
}
