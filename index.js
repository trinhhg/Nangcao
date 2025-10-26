// Translations object
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
let keywords = [];

// Khởi tạo Trumbowyg
document.addEventListener('DOMContentLoaded', () => {
  // Kiểm tra xem jQuery đã sẵn sàng chưa
  if (typeof jQuery === 'undefined') {
    console.error('jQuery không được tải. Vui lòng kiểm tra kết nối mạng hoặc CDN.');
    return;
  }

  $('#editor').trumbowyg({
    height: '80vh',
    btns: [
      ['undo', 'redo'],
      ['bold', 'italic', 'underline'],
      ['alignleft', 'aligncenter', 'alignright'],
      ['unorderedList', 'orderedList']
    ],
    autogrow: false
  });

  // Theo dõi sự thay đổi nội dung để tự động highlight
  $('#editor').on('tbwchange', function () {
    autoHighlight();
  });

  // Lắng nghe nhập từ khóa
  const keywordsInput = document.getElementById('keywords-input');
  keywordsInput.addEventListener('keydown', function (e) {
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
      autoHighlight();
      saveSettings();
    }
  });

  // Các sự kiện khác
  const searchBtn = document.getElementById('search');
  const clearBtn = document.getElementById('clear');
  const replaceBtn = document.getElementById('replace');
  const addPairBtn = document.getElementById('add-pair');
  const saveSettingsBtn = document.getElementById('save-settings');
  const matchCase = document.getElementById('matchCase');
  const wholeWords = document.getElementById('wholeWords');
  const fontFamily = document.getElementById('fontFamily');
  const fontSize = document.getElementById('fontSize');
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
  if (matchCase) matchCase.addEventListener('change', () => { saveSettings(); performSearch(); });
  if (wholeWords) wholeWords.addEventListener('change', () => { saveSettings(); performSearch(); });
  if (fontFamily) {
    fontFamily.addEventListener('change', () => {
      $('#editor').trumbowyg('html', $('#editor').trumbowyg('html').replace(/<p[^>]*>/gi, `<p style="font-family: ${fontFamily.value};">`));
      saveSettings();
    });
  }
  if (fontSize) {
    fontSize.addEventListener('change', () => {
      $('#editor').trumbowyg('html', $('#editor').trumbowyg('html').replace(/<p[^>]*>/gi, `<p style="font-size: ${fontSize.value};">`));
      saveSettings();
    });
  }
  if (matchCaseBtn) matchCaseBtn.addEventListener('click', () => {
    matchCaseEnabled = !matchCaseEnabled;
    updateButtonStates();
    saveReplaceSettings();
  });
  if (deleteModeBtn) deleteModeBtn.addEventListener('click', () => {
    if (currentMode !== 'default') {
      if (confirm(`Bạn có chắc chắn muốn xóa chế độ "${currentMode}"?`)) {
        let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
        if (settings.modes[currentMode]) {
          delete settings.modes[currentMode];
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
          currentMode = 'default';
          loadModes();
          showNotification(translations[currentLang].modeDeleted.replace('{mode}', currentMode), 'success');
        }
      }
    }
  });
  if (renameModeBtn) renameModeBtn.addEventListener('click', () => {
    const newName = prompt(translations[currentLang].renamePrompt);
    if (newName && !newName.includes('mode_') && newName.trim() !== '' && newName !== currentMode) {
      let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
      if (settings.modes[currentMode]) {
        settings.modes[newName] = settings.modes[currentMode];
        delete settings.modes[currentMode];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
        currentMode = newName;
        loadModes();
        showNotification(translations[currentLang].renameSuccess.replace('{mode}', newName), 'success');
      } else {
        showNotification(translations[currentLang].renameError, 'error');
      }
    }
  });
  if (addModeBtn) addModeBtn.addEventListener('click', () => {
    const newMode = prompt(translations[currentLang].newModePrompt);
    if (newMode && !newMode.includes('mode_') && newMode.trim() !== '' && newMode !== 'default') {
      let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
      if (settings.modes[newMode]) {
        showNotification(translations[currentLang].invalidModeName, 'error');
        return;
      }
      settings.modes[newMode] = { pairs: [], matchCase: false };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      currentMode = newMode;
      loadModes();
      showNotification(translations[currentLang].modeCreated.replace('{mode}', newMode), 'success');
    } else {
      showNotification(translations[currentLang].invalidModeName, 'error');
    }
  });
  if (copyModeBtn) copyModeBtn.addEventListener('click', () => {
    const newMode = prompt(translations[currentLang].newModePrompt);
    if (newMode && !newMode.includes('mode_') && newMode.trim() !== '' && newMode !== 'default') {
      let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
      if (settings.modes[newMode]) {
        showNotification(translations[currentLang].invalidModeName, 'error');
        return;
      }
      settings.modes[newMode] = JSON.parse(JSON.stringify(settings.modes[currentMode] || { pairs: [], matchCase: false }));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      currentMode = newMode;
      loadModes();
      showNotification(translations[currentLang].modeCreated.replace('{mode}', newMode), 'success');
    } else {
      showNotification(translations[currentLang].invalidModeName, 'error');
    }
  });
  if (exportSettingsBtn) exportSettingsBtn.addEventListener('click', () => {
    try {
      let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'extension_settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification(translations[currentLang].settingsExported, 'success');
    } catch (err) {
      showNotification(translations[currentLang].importError, 'error');
    }
  });
  if (importSettingsBtn) importSettingsBtn.addEventListener('click', () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const settings = JSON.parse(e.target.result);
              if (!settings.modes || typeof settings.modes !== 'object') {
                throw new Error('Cấu trúc file JSON không hợp lệ');
              }
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
              loadModes();
              showNotification(translations[currentLang].settingsImported, 'success');
            } catch (err) {
              showNotification(translations[currentLang].importError, 'error');
            }
          };
          reader.readAsText(file);
        } else {
          showNotification(translations[currentLang].importError, 'error');
        }
      });
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
    } catch (err) {
      showNotification(translations[currentLang].importError, 'error');
    }
  });
  if (modeSelect) modeSelect.addEventListener('change', (e) => {
    currentMode = e.target.value;
    loadReplacePairs();
    showNotification(translations[currentLang].switchedMode.replace('{mode}', currentMode), 'success');
    updateModeButtons();
  });
  if (clearHighlightBtn) clearHighlightBtn.addEventListener('click', () => {
    const editor = $('#editor').trumbowyg('html');
    const cleared = editor.replace(/<mark.*?>(.*?)<\/mark>/gi, "$1");
    $('#editor').trumbowyg('html', cleared);
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

  // Load settings
  loadSettings();
  loadModes();
  updateLanguage();
});

// Hàm auto highlight
function autoHighlight() {
  const editor = $('#editor').trumbowyg('html');
  if (!editor || keywords.length === 0) return;

  let highlighted = editor;

  keywords.forEach((word, i) => {
    const colorClass = `highlight${(i % 3) + 1}`;
    const regex = new RegExp(`(${word})`, 'gi');
    highlighted = highlighted.replace(regex, `<mark class="${colorClass}">$1</mark>`);
  });

  // Xóa highlight cũ trước khi áp dụng mới
  const cleared = editor.replace(/<mark.*?>(.*?)<\/mark>/gi, "$1");
  $('#editor').trumbowyg('html', cleared);
  $('#editor').trumbowyg('html', highlighted);
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
    autoHighlight();
    saveSettings();
  };
  tag.appendChild(remove);
  container.appendChild(tag);
}

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
    autoHighlight();
    fontFamilySelect.value = settings.fontFamily || 'Arial';
    fontSizeSelect.value = settings.fontSize || '16px';
    $('#editor').trumbowyg('html', $('#editor').trumbowyg('html').replace(/<p[^>]*>/gi, `<p style="font-family: ${settings.fontFamily || 'Arial'}; font-size: ${settings.fontSize || '16px'};">`));
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
    $('#editor').trumbowyg('html', $('#editor').trumbowyg('html').replace(/<mark.*?>(.*?)<\/mark>/gi, "$1"));
    return;
  }

  const text = $('#editor').trumbowyg('html').replace(/<[^>]+>/g, '');
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
    autoHighlight();
  } else {
    message.textContent = 'Không tìm thấy từ khóa.';
    message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
    $('#editor').trumbowyg('html', $('#editor').trumbowyg('html').replace(/<mark.*?>(.*?)<\/mark>/gi, "$1"));
  }
}

function clearContent() {
  $('#editor').trumbowyg('html', '');
  document.getElementById('message').textContent = '';
  document.getElementById('message').className = 'mb-4 p-2 rounded';
  $('#editor').trumbowyg('html', $('#editor').trumbowyg('html').replace(/<mark.*?>(.*?)<\/mark>/gi, "$1"));
}

// Replace logic
function performReplace() {
  const matchCase = document.getElementById('matchCase').checked;
  const wholeWords = document.getElementById('wholeWords').checked;
  const message = document.getElementById('message');

  let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
  const modeSettings = settings.modes[currentMode] || { pairs: [] };
  const pairs = modeSettings.pairs || [];

  if (!$('#editor').trumbowyg('html').trim()) {
    message.textContent = translations[currentLang].noTextToReplace;
    message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
    return;
  }

  if (pairs.length === 0) {
    message.textContent = translations[currentLang].noPairsConfigured;
    message.className = 'mb-4 p-2 rounded bg-red-200 text-red-800';
    return;
  }

  let text = $('#editor').trumbowyg('html').replace(/<[^>]+>/g, '');
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
  $('#editor').trumbowyg('html', text);
  message.textContent = translations[currentLang].textReplaced;
  message.className = 'mb-4 p-2 rounded bg-green-200 text-green-800';
  autoHighlight();
}

// Escape regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Settings tab logic
function updateLanguage() {
  const elements = {
    settingsTitle: document.getElementById('settings-title'),
    modeLabel: document.getElementById('mode-label'),
    addMode: document.getElementById('add-mode'),
    copyMode: document.getElementById('copy-mode'),
    matchCase: document.getElementById('match-case'),
    findPlaceholder: document.querySelector('.punctuation-item .find'),
    replacePlaceholder: document.querySelector('.punctuation-item .replace'),
    removeButton: document.querySelector('.punctuation-item .remove'),
    addPair: document.getElementById('add-pair'),
    saveSettings: document.getElementById('save-settings'),
    exportSettings: document.getElementById('export-settings'),
    importSettings: document.getElementById('import-settings')
  };

  if (elements.settingsTitle) elements.settingsTitle.textContent = translations[currentLang].settingsTitle;
  if (elements.modeLabel) elements.modeLabel.textContent = translations[currentLang].modeLabel;
  if (elements.addMode) elements.addMode.textContent = translations[currentLang].addMode;
  if (elements.copyMode) elements.copyMode.textContent = translations[currentLang].copyMode;
  if (elements.matchCase) elements.matchCase.textContent = matchCaseEnabled ? translations[currentLang].matchCaseOn : translations[currentLang].matchCaseOff;
  if (elements.findPlaceholder) elements.findPlaceholder.placeholder = translations[currentLang].findPlaceholder;
  if (elements.replacePlaceholder) elements.replacePlaceholder.placeholder = translations[currentLang].replacePlaceholder;
  if (elements.removeButton) elements.removeButton.textContent = translations[currentLang].removeButton;
  if (elements.addPair) elements.addPair.textContent = translations[currentLang].addPair;
  if (elements.saveSettings) elements.saveSettings.textContent = translations[currentLang].saveSettings;
  if (elements.exportSettings) elements.exportSettings.textContent = translations[currentLang].exportSettings;
  if (elements.importSettings) elements.importSettings.textContent = translations[currentLang].importSettings;

  const punctuationItems = document.querySelectorAll('.punctuation-item');
  punctuationItems.forEach(item => {
    const findInput = item.querySelector('.find');
    const replaceInput = item.querySelector('.replace');
    const removeBtn = item.querySelector('.remove');
    if (findInput) findInput.placeholder = translations[currentLang].findPlaceholder;
    if (replaceInput) replaceInput.placeholder = translations[currentLang].replacePlaceholder;
    if (removeBtn) removeBtn.textContent = translations[currentLang].removeButton;
  });
}

function updateModeButtons() {
  const renameMode = document.getElementById('rename-mode');
  const deleteMode = document.getElementById('delete-mode');
  if (currentMode !== 'default' && renameMode && deleteMode) {
    renameMode.style.display = 'inline-block';
    deleteMode.style.display = 'inline-block';
  } else if (renameMode && deleteMode) {
    renameMode.style.display = 'none';
    deleteMode.style.display = 'none';
  }
}

function updateButtonStates() {
  const matchCaseButton = document.getElementById('match-case');
  if (matchCaseButton) {
    matchCaseButton.textContent = matchCaseEnabled ? translations[currentLang].matchCaseOn : translations[currentLang].matchCaseOff;
    matchCaseButton.style.background = matchCaseEnabled ? '#28a745' : '#6c757d';
  }
}

function showNotification(message, type = 'success') {
  const container = document.getElementById('notification-container');
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  container.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

function loadModes() {
  const modeSelect = document.getElementById('mode-select');
  let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
  const modes = Object.keys(settings.modes || { default: {} });

  modeSelect.innerHTML = '';
  modes.forEach(mode => {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    modeSelect.appendChild(option);
  });
  modeSelect.value = currentMode;
  loadReplacePairs();
  updateModeButtons();
}

function loadReplacePairs() {
  const list = document.getElementById('punctuation-list');
  let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
  const modeSettings = settings.modes?.[currentMode] || { pairs: [], matchCase: false };
  list.innerHTML = '';
  if (!modeSettings.pairs || modeSettings.pairs.length === 0) {
    addReplacePair('', '');
  } else {
    modeSettings.pairs.slice().reverse().forEach(pair => addReplacePair(pair.find || '', pair.replace || ''));
  }
  matchCaseEnabled = modeSettings.matchCase || false;
  updateButtonStates();
}

function saveReplaceSettings() {
  const pairs = Array.from(document.querySelectorAll('.punctuation-item')).map(item => ({
    find: item.querySelector('.find')?.value || '',
    replace: item.querySelector('.replace')?.value || ''
  }));

  if (pairs.every(pair => !pair.find && !pair.replace)) {
    showNotification(translations[currentLang].noPairsToSave, 'error');
    return;
  }

  let settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || { modes: { default: { pairs: [], matchCase: false } } };
  settings.modes[currentMode] = {
    pairs: pairs.filter(pair => pair.find || pair.replace),
    matchCase: matchCaseEnabled
  };
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
  showNotification(translations[currentLang].settingsSaved.replace('{mode}', currentMode), 'success');
}

function addReplacePair(find = '', replace = '') {
  const list = document.getElementById('punctuation-list');
  const item = document.createElement('div');
  item.className = 'punctuation-item';

  const findInput = document.createElement('input');
  findInput.type = 'text';
  findInput.className = 'find';
  findInput.placeholder = translations[currentLang].findPlaceholder;
  findInput.value = find;

  const replaceInput = document.createElement('input');
  replaceInput.type = 'text';
  replaceInput.className = 'replace';
  replaceInput.placeholder = translations[currentLang].replacePlaceholder;
  replaceInput.value = replace;

  const removeButton = document.createElement('button');
  removeButton.className = 'remove';
  removeButton.textContent = translations[currentLang].removeButton;

  item.appendChild(findInput);
  item.appendChild(replaceInput);
  item.appendChild(removeButton);
  if (list.firstChild) {
    list.insertBefore(item, list.firstChild);
  } else {
    list.appendChild(item);
  }

  removeButton.addEventListener('click', () => {
    item.remove();
    saveReplaceSettings();
  });
  findInput.addEventListener('input', saveReplaceSettings);
  replaceInput.addEventListener('input', saveReplaceSettings);
}
