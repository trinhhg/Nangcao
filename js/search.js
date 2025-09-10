// Extract chapters from text
function extractChapters(text) {
    const chapterRegex = /Chương\s+\d+/gi;
    const chapters = text.match(chapterRegex) || [];
    return chapters;
}

// Perform search and update UI
function performSearch() {
    const textInput = document.getElementById('textInput');
    const keywordsInput = document.getElementById('keywords').value;
    const matchCase = document.getElementById('matchCase').checked;
    const wholeWords = document.getElementById('wholeWords').checked;
    const message = document.getElementById('message');
    const results = document.getElementById('results');

    const keywords = keywordsInput.split(',').map(k => k.trim()).filter(k => k);
    if (!keywords.length) {
        message.textContent = 'Please enter at least one keyword.';
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        clearHighlights(textInput);
        results.innerHTML = '';
        return;
    }

    const text = textInput.textContent;
    let found = false;
    for (const keyword of keywords) {
        const regex = wholeWords
            ? new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, matchCase ? 'g' : 'gi')
            : new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
        if (text.match(regex)) {
            found = true;
            break;
        }
    }

    if (found) {
        message.textContent = 'Keywords found!';
        message.className = 'mb-4 p-2 rounded bg-green-200 text-green-800';
        textInput.innerHTML = highlightText(text, keywords, matchCase, wholeWords);
        const chapters = extractChapters(text);
        results.innerHTML = chapters.map(ch => `<li>${ch}</li>`).join('');
    } else {
        message.textContent = 'No keywords found.';
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        clearHighlights(textInput);
        results.innerHTML = '';
    }
}
