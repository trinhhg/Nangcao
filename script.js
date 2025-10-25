// Highlight.js part
const highlightColors = ['highlight-pink', 'highlight-yellow', 'highlight-blue', 'highlight-green', 'highlight-orange'];
const replaceHighlight = 'highlight-purple';

function highlightText(text, keywords, matchCase, wholeWords, isReplace = false) {
    let highlightedText = text;
    keywords.forEach((keyword, index) => {
        const colorClass = isReplace ? replaceHighlight : highlightColors[index % highlightColors.length];
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

function clearHighlights() {
    const overlay = document.getElementById('highlight-overlay');
    overlay.innerHTML = '';
}

// Storage.js and Search.js part (merged, remove duplicates)
function saveSettings() {
    const keywords = getKeywordsFromTags();
    const replacePairs = getReplacePairs();
    const settings = {
        matchCase: document.getElementById('matchCase').checked,
        wholeWords: document.getElementById('wholeWords').checked,
        keywords: keywords.join(','),
        replacePairs: replacePairs,
        fontFamily: document.getElementById('fontFamily').value,
        fontSize: document.getElementById('fontSize').value
    };
    localStorage.setItem('searchSettings', JSON.stringify(settings));
}

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('searchSettings'));
    const textInput = document.getElementById('textInput');
    if (settings) {
        document.getElementById('matchCase').checked = settings.matchCase || false;
        document.getElementById('wholeWords').checked = settings.wholeWords || false;
        setKeywordsToTags(settings.keywords ? settings.keywords.split(',') : []);
        loadReplacePairs(settings.replacePairs || []);
        textInput.style.fontFamily = settings.fontFamily || 'Arial';
        textInput.style.fontSize = settings.fontSize || '16px';
        document.getElementById('fontFamily').value = settings.fontFamily || 'Arial';
        document.getElementById('fontSize').value = settings.fontSize || '16px';
    } else {
        textInput.style.fontFamily = 'Arial';
        textInput.style.fontSize = '16px';
    }
}

function extractChapters(text) {
    const chapterRegex = /Chương\s+\d+/gi;
    const chapters = text.match(chapterRegex) || [];
    return chapters;
}

function performSearch() {
    const textInput = document.getElementById('textInput');
    const keywords = getKeywordsFromTags();
    const matchCase = document.getElementById('matchCase').checked;
    const wholeWords = document.getElementById('wholeWords').checked;
    const message = document.getElementById('message');
    const results = document.getElementById('results');
    const overlay = document.getElementById('highlight-overlay');

    if (!keywords.length) {
        message.textContent = 'Vui lòng nhập ít nhất một từ khóa.';
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        clearHighlights();
        return;
    }

    const textContent = textInput.value;
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
        overlay.innerHTML = highlightText(textContent.replace(/\n/g, '<br>'), keywords, matchCase, wholeWords);
        const chapters = extractChapters(textContent);
        results.innerHTML = chapters.length ? chapters.map(ch => `<li>${ch}</li>`).join('') : '<li>Không tìm thấy chương nào.</li>';
    } else {
        message.textContent = 'Không tìm thấy từ khóa.';
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        clearHighlights();
    }
}

function performReplace() {
    const textInput = document.getElementById('textInput');
    const replacePairs = getReplacePairs();
    const matchCase = document.getElementById('matchCase').checked;
    const wholeWords = document.getElementById('wholeWords').checked;
    const message = document.getElementById('message');
    const overlay = document.getElementById('highlight-overlay');

    if (!replacePairs.length || replacePairs.every(pair => !pair.find)) {
        message.textContent = 'Vui lòng thêm ít nhất một cặp find-replace.';
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        return;
    }

    let text = textInput.value;
    let replacedWords = [];

    replacePairs.forEach(pair => {
        if (!pair.find) return;
        const regex = wholeWords
            ? new RegExp(`\\b${pair.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, matchCase ? 'g' : 'gi')
            : new RegExp(pair.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
        text = text.replace(regex, (match) => {
            replacedWords.push(pair.replace);
            return pair.replace;
        });
    });

    textInput.value = text;
    message.textContent = 'Đã thay thế thành công!';
    message.className = 'mb-4 p-2 rounded bg-green-200 text-green-800';
    overlay.innerHTML = highlightText(text.replace(/\n/g, '<br>'), replacedWords, matchCase, wholeWords, true);
}

function clearContent() {
    const textInput = document.getElementById('textInput');
    const message = document.getElementById('message');
    textInput.value = '';
    message.textContent = '';
    message.className = 'mb-4 p-2 rounded';
    clearHighlights();
}

// Functions for tags
function getKeywordsFromTags() {
    return Array.from(document.querySelectorAll('.tag')).map(tag => tag.textContent.slice(0, -1).trim());
}

function setKeywordsToTags(keywords) {
    const container = document.getElementById('keywords-container');
    container.innerHTML = '';
    keywords.forEach(addTag);
}

function addTag(keyword) {
    if (!keyword) return;
    const container = document.getElementById('keywords-container');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = keyword;
    const remove = document.createElement('span');
    remove.className = 'remove-tag';
    remove.textContent = 'x';
    remove.onclick = () => { tag.remove(); saveSettings(); };
    tag.appendChild(remove);
    container.appendChild(tag);
}

// Functions for replace pairs (inspired from reference)
function getReplacePairs() {
    return Array.from(document.querySelectorAll('.replace-pair')).map(pair => ({
        find: pair.querySelector('.find').value,
        replace: pair.querySelector('.replace').value
    }));
}

function loadReplacePairs(pairs) {
    const container = document.getElementById('replace-pairs');
    container.innerHTML = '';
    pairs.forEach(pair => addReplacePair(pair.find, pair.replace));
}

function addReplacePair(find = '', replace = '') {
    const container = document.getElementById('replace-pairs');
    const pairDiv = document.createElement('div');
    pairDiv.className = 'replace-pair';
    const findInput = document.createElement('input');
    findInput.className = 'find';
    findInput.placeholder = 'Tìm...';
    findInput.value = find;
    const replaceInput = document.createElement('input');
    replaceInput.className = 'replace';
    replaceInput.placeholder = 'Thay thế...';
    replaceInput.value = replace;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Xóa';
    removeBtn.onclick = () => { pairDiv.remove(); saveSettings(); };
    pairDiv.appendChild(findInput);
    pairDiv.appendChild(replaceInput);
    pairDiv.appendChild(removeBtn);
    container.appendChild(pairDiv);
    findInput.oninput = replaceInput.oninput = saveSettings;
}

// Main.js part
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();

    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const replaceBtn = document.getElementById('replace');
    const addPairBtn = document.getElementById('add-pair');
    const matchCase = document.getElementById('matchCase');
    const wholeWords = document.getElementById('wholeWords');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    const textInput = document.getElementById('textInput');
    const keywordsContainer = document.getElementById('keywords-container');
    const keywordsInput = document.getElementById('keywords-input'); // Hidden input for focus

    if (searchBtn) searchBtn.addEventListener('click', performSearch);
    if (clearBtn) clearBtn.addEventListener('click', clearContent);
    if (replaceBtn) replaceBtn.addEventListener('click', performReplace);
    if (addPairBtn) addPairBtn.addEventListener('click', () => addReplacePair());
    if (matchCase) matchCase.addEventListener('change', saveSettings);
    if (wholeWords) wholeWords.addEventListener('change', saveSettings);
    if (fontFamily) {
        fontFamily.addEventListener('change', () => {
            textInput.style.fontFamily = fontFamily.value;
            saveSettings();
        });
    }
    if (fontSize) {
        fontSize.addEventListener('change', () => {
            textInput.style.fontSize = fontSize.value;
            saveSettings();
        });
    }

    // Tag input logic
    keywordsContainer.onclick = () => keywordsInput.focus();
    keywordsInput.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const value = keywordsInput.value.trim();
            if (value) addTag(value);
            keywordsInput.value = '';
            saveSettings();
        }
    };
    textInput.oninput = () => {
        clearHighlights(); // Update overlay on edit
    };
});
