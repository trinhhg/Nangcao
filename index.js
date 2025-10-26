// Translations object (from reference)
const translations = {
    vn: {
        appTitle: 'Tiện Ích Của Trịnh Hg',
        settingsTitle: 'Cài đặt tìm kiếm và thay thế',
        modeLabel: 'Chọn chế độ:',
        default: 'Mặc định',
        addMode: 'Thêm chế độ mới',
        copyMode: 'Sao Chép Chế Độ',
        matchCaseOn: 'Match Case: Bật',
        matchCaseOff: 'Match Case: Tắt',
        findPlaceholder: 'Tìm ví dụ dấu phẩy',
        replacePlaceholder: 'Thay thế ví dụ dấu chấm phẩy',
        removeButton: 'Xóa',
        addPair: 'Thêm',
        saveSettings: 'Lưu cài đặt',
        noPairsToSave: 'Không có cặp nào để lưu!',
        settingsSaved: 'Đã lưu cài đặt cho chế độ "{mode}"!',
        newModePrompt: 'Nhập tên chế độ mới:',
        invalidModeName: 'Tên chế độ không hợp lệ hoặc đã tồn tại!',
        modeCreated: 'Đã tạo chế độ "{mode}"!',
        switchedMode: 'Đã chuyển sang chế độ "{mode}"',
        modeDeleted: 'Đã xóa chế độ "{mode}"!',
        renamePrompt: 'Nhập tên mới cho chế độ:',
        renameSuccess: 'Đã đổi tên chế độ thành "{mode}"!',
        renameError: 'Lỗi khi đổi tên chế độ!',
        exportSettings: 'Xuất Cài Đặt',
        importSettings: 'Nhập Cài Đặt',
        settingsExported: 'Đã xuất cài đặt thành công!',
        settingsImported: 'Đã nhập cài đặt thành công!',
        importError: 'Lỗi khi nhập cài đặt!',
        noTextToReplace: 'Không có văn bản để thay thế!',
        noPairsConfigured: 'Không có cặp tìm-thay thế nào được cấu hình!',
        textReplaced: 'Đã thay thế văn bản thành công!'
    }
};

// State variables
let currentLang = 'vn';
let matchCaseEnabled = false;
let currentMode = 'default';
const LOCAL_STORAGE_KEY = 'local_settings';

// Khởi tạo Quill Editor
var quill = new Quill('#editor', {
  theme: 'snow'
});

// Danh sách từ khóa
let keywords = [];

// Lắng nghe nhập từ khóa
document.getElementById('keywords-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && this.value.trim()) {
    const value = this.value.trim();
    const newKeywords = value.split(',').map(k => k.trim()).filter(k => k);
    newKeywords.forEach(word => {
      if (!keywords.includes(word)) {
        keywords.push(word);
        addTagToList(word);
      }
    });
    this.value = '';
    highlightKeywords();
    saveSettings();
  }
});

// Hàm highlight
function highlightKeywords(isReplace = false) {
  const text = quill.getText();

  // Xóa highlight cũ
  quill.formatText(0, text.length, { background: false });

  // Highlight theo từ khóa
  keywords.forEach(word => {
    let regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      quill.formatText(match.index, word.length, {
        background: isReplace ? '#a29bfe' : pickColor(word)
      });
    }
  });
}

// Tạo màu riêng cho mỗi từ khóa
function pickColor(keyword) {
  const colors = ["#ff9ff3", "#feca57", "#54a0ff", "#1dd1a1", "#ff9f43", "#9b59b6"];
  let hash = 0;
  for (let i = 0; i < keyword.length; i++) {
    hash = keyword.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Tag logic
function getKeywordsFromTags() {
    return keywords;
}

function setKeywordsToTags(keywords) {
    const container = document.getElementById('keywords-tags');
    container.innerHTML = '';
    keywords.forEach(addTagToList);
}

function addTagToList(keyword) {
    if (!keyword) return;
    const container = document.getElementById('keywords-tags');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.dataset.keyword = keyword;
    tag.textContent = keyword;
    const remove = document.createElement('span');
    remove.className = 'remove-tag';
    remove.textContent = 'x';
    remove.onclick = () => {
      tag.remove();
      const index = keywords.indexOf(keyword);
      if (index > -1) {
        keywords.splice(index, 1);
      }
      highlightKeywords();
      saveSettings();
    };
    tag.appendChild(remove);
    container.appendChild(tag);
}

// Clear highlight button
document.getElementById('clear-highlight').addEventListener('click', () => {
  quill.formatText(0, quill.getLength(), { background: false });
});

// Văn bản mẫu để test
quill.setText("Ví dụ: Tôi đang kiểm tra highlight động bằng Quill.js. Hãy thử nhập các từ như 'highlight', 'Quill', hoặc 'động' vào ô dưới đây!");

// Load settings
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('searchSettings'));
    const fontFamilySelect = document.getElementById('fontFamily');
    const fontSizeSelect = document.getElementById('fontSize');
    const matchCaseCheckbox = document.getElementById('matchCase');
    const wholeWordsCheckbox = document.getElementById('wholeWords');

    if (settings) {
        matchCaseCheckbox.checked = settings.matchCase || false;
        wholeWordsCheckbox.checked = settings.wholeWords || false;
        keywords = settings.keywords ? settings.keywords.split(',') : [];
        setKeywordsToTags(keywords);
        highlightKeywords();
        fontFamilySelect.value = settings.fontFamily || 'Arial';
        fontSizeSelect.value = settings.fontSize || '16px';
        quill.root.style.fontFamily = settings.fontFamily || 'Arial';
        quill.root.style.fontSize = settings.fontSize || '16px';
    }
}

// Save settings
function saveSettings() {
    const settings = {
        matchCase: document.getElementById('matchCase').checked,
        wholeWords: document.getElementById('wholeWords').checked,
        keywords: keywords.join(','),
        fontFamily: document.getElementById('fontFamily').value,
        fontSize: document.getElementById('fontSize').value
    };
    localStorage.setItem('searchSettings', JSON.stringify(settings));
}

// Settings and search logic
function performSearch() {
    const matchCase = document.getElementById('matchCase').checked;
    const wholeWords = document.getElementById('wholeWords').checked;
    const message = document.getElementById('message');

    if (keywords.length === 0) {
        message.textContent = 'Vui lòng nhập ít nhất một từ khóa.';
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        quill.formatText(0, quill.getLength(), { background: false });
        return;
    }

    const text = quill.getText();
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
        message.textContent = 'Đã tìm thấy từ khóa!';
        message.className = 'mb-4 p-2 rounded bg-green-200 text-green-800';
        highlightKeywords();
    } else {
        message.textContent = 'Không tìm thấy từ khóa.';
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        quill.formatText(0, quill.getLength(), { background: false });
    }
}

function clearContent() {
    quill.setText('');
    document.getElementById('message').textContent = '';
    document.getElementById('message').className = 'mb-4 p-2 rounded';
    quill.formatText(0, quill.getLength(), { background: false });
}

// Replace logic
function performReplace() {
    const matchCase = document.getElementById('matchCase').checked;
    const wholeWords = document.getElementById('wholeWords').checked;
    const message = document.getElementById('message');

    let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
    const modeSettings = settings.modes[currentMode] || { pairs: [] };
    const pairs = modeSettings.pairs || [];

    if (quill.getLength() <= 1) {
        message.textContent = translations[currentLang].noTextToReplace;
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        return;
    }

    if (pairs.length === 0) {
        message.textContent = translations[currentLang].noPairsConfigured;
        message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
        return;
    }

    let text = quill.getText();
    let replacedWords = [];
    pairs.forEach(pair => {
        let find = pair.find;
        let replace = pair.replace !== null ? pair.replace : '';
        if (!find) return;
        const regex = wholeWords
            ? new RegExp(`\\b${escapeRegExp(find)}\\b`, matchCase ? 'g' : 'gi')
            : new RegExp(escapeRegExp(find), matchCase ? 'g' : 'gi');
        text = text.replace(regex, (match) => {
            replacedWords.push(replace);
            return replace;
        });
    });
    quill.setText(text);
    message.textContent = translations[currentLang].textReplaced;
    message.className = 'mb-4 p-2 rounded bg-green-200 text-green-800';
    highlightKeywords(true);
}

// Escape regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Settings tab logic (giữ nguyên)

function updateLanguage() {
    // ... (giữ nguyên code updateLanguage từ trước)
}

function updateModeButtons() {
    // ... (giữ nguyên code updateModeButtons từ trước)
}

function updateButtonStates() {
    // ... (giữ nguyên code updateButtonStates từ trước)
}

function showNotification(message, type = 'success') {
    // ... (giữ nguyên code showNotification từ trước)
}

function loadModes() {
    // ... (giữ nguyên code loadModes từ trước)
}

function loadReplacePairs() {
    // ... (giữ nguyên code loadReplacePairs từ trước)
}

function saveReplaceSettings() {
    // ... (giữ nguyên code saveReplaceSettings từ trước)
}

function addReplacePair(find = '', replace = '') {
    // ... (giữ nguyên code addReplacePair từ trước)
}

// Main logic
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadModes();
    updateLanguage();

    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const replaceBtn = document.getElementById('replace');
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');
    const matchCase = document.getElementById('matchCase');
    const wholeWords = document.getElementById('wholeWords');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');
    const keywordsInput = document.getElementById('keywords-input');
    const matchCaseBtn = document.getElementById('match-case');
    const deleteModeBtn = document.getElementById('delete-mode');
    const renameModeBtn = document.getElementById('rename-mode');
    const addModeBtn = document.getElementById('add-mode');
    const copyModeBtn = document.getElementById('copy-mode');
    const modeSelect = document.getElementById('mode-select');
    const exportSettingsBtn = document.getElementById('export-settings');
    const importSettingsBtn = document.getElementById('import-settings');
    const clearHighlightBtn = document.getElementById('clear-highlight');
    const settingsPanel = document.getElementById('settings-panel');
    const textPanel = document.getElementById('text-panel');

    if (searchBtn) searchBtn.addEventListener('click', performSearch);
    if (clearBtn) clearBtn.addEventListener('click', clearContent);
    if (replaceBtn) replaceBtn.addEventListener('click', performReplace);
    if (addPairBtn) addPairBtn.addEventListener('click', () => addReplacePair());
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveReplaceSettings);
    if (matchCase) matchCase.addEventListener('change', () => { saveSettings(); highlightKeywords(); });
    if (wholeWords) wholeWords.addEventListener('change', () => { saveSettings(); highlightKeywords(); });
    if (fontFamily) {
        fontFamily.addEventListener('change', () => {
            quill.root.style.fontFamily = fontFamily.value;
            saveSettings();
        });
    }
    if (fontSize) {
        fontSize.addEventListener('change', () => {
            quill.root.style.fontSize = fontSize.value;
            saveSettings();
        });
    }
    if (matchCaseBtn) matchCaseBtn.addEventListener('click', () => {
        matchCaseEnabled = !matchCaseEnabled;
        updateButtonStates();
        saveReplaceSettings();
    });
    if (deleteModeBtn) deleteModeBtn.addEventListener('click', () => {
        // ... (giữ nguyên code deleteModeBtn từ trước)
    });
    if (renameModeBtn) renameModeBtn.addEventListener('click', () => {
        // ... (giữ nguyên code renameModeBtn từ trước)
    });
    if (addModeBtn) addModeBtn.addEventListener('click', () => {
        // ... (giữ nguyên code addModeBtn từ trước)
    });
    if (copyModeBtn) copyModeBtn.addEventListener('click', () => {
        // ... (giữ nguyên code copyModeBtn từ trước)
    });
    if (exportSettingsBtn) exportSettingsBtn.addEventListener('click', () => {
        // ... (giữ nguyên code exportSettingsBtn từ trước)
    });
    if (importSettingsBtn) importSettingsBtn.addEventListener('click', () => {
        // ... (giữ nguyên code importSettingsBtn từ trước)
    });
    if (modeSelect) modeSelect.addEventListener('change', (e) => {
        // ... (giữ nguyên code modeSelect từ trước)
    });

    // Clear highlight button
    if (clearHighlightBtn) clearHighlightBtn.addEventListener('click', () => {
        quill.formatText(0, quill.getLength(), { background: false });
    });

    // Keywords input event
    if (keywordsInput) keywordsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = keywordsInput.value.trim();
            if (value) {
                const newKeywords = value.split(',').map(k => k.trim()).filter(k => k);
                newKeywords.forEach(word => {
                    if (!keywords.includes(word)) {
                        keywords.push(word);
                        addTagToList(word);
                    }
                });
                keywordsInput.value = '';
                saveSettings();
                highlightKeywords();
            }
        }
    });

    // Quill input event for auto highlight
    quill.on('text-change', function() {
        highlightKeywords();
    });

    // Tab switching with dynamic width
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.toggle('active', content.id === tabName);
            });
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.toggle('active', btn === button);
            });

            // Adjust widths
            if (tabName === 'main') {
                settingsPanel.classList.remove('w-1/2');
                settingsPanel.classList.add('w-1/4');
                textPanel.classList.remove('w-1/2');
                textPanel.classList.add('w-3/4');
            } else if (tabName === 'settings') {
                settingsPanel.classList.remove('w-1/4');
                settingsPanel.classList.add('w-1/2');
                textPanel.classList.remove('w-3/4');
                textPanel.classList.add('w-1/2');
            }
        });
    });
});
