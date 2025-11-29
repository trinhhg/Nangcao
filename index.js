document.addEventListener('DOMContentLoaded', () => {
  // === CONFIG & STATE ===
  const STORAGE_KEY = 'trinh_hg_settings_v5';
  const INPUT_STATE_KEY = 'trinh_hg_input_state_v5';

  const defaultState = {
    currentMode: 'default',
    modes: {
      default: { pairs: [], matchCase: false, wholeWord: false }
    }
  };

  let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
  let currentSplitMode = 2;
  let saveTimeout;

  // DOM ELEMENTS
  const els = {
    modeSelect: document.getElementById('mode-select'),
    list: document.getElementById('punctuation-list'),
    inputText: document.getElementById('input-text'),
    outputText: document.getElementById('output-text'),
    splitInput: document.getElementById('split-input-text'),
    splitWrapper: document.getElementById('split-outputs-wrapper'),
    matchCaseBtn: document.getElementById('match-case'),
    wholeWordBtn: document.getElementById('whole-word'),
    renameBtn: document.getElementById('rename-mode'),
    deleteBtn: document.getElementById('delete-mode'),
    emptyState: document.getElementById('empty-state')
  };

  // === CORE FUNCTIONS ===

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function showNotification(msg, type = 'success') {
    const container = document.getElementById('notification-container');
    const note = document.createElement('div');
    note.className = `notification ${type}`;
    note.textContent = msg;
    container.appendChild(note);
    setTimeout(() => {
      note.style.opacity = '0';
      setTimeout(() => note.remove(), 300);
    }, 3000);
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
  }

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
  }

  // --- LOGIC TÌM VÀ THAY THẾ CHÍNH ---
  function performReplace(text) {
    if (!text) return { text: '', count: 0 };
    const mode = state.modes[state.currentMode];
    const rules = mode.pairs.filter(p => p.find && p.find.length > 0);

    let result = text;
    let totalCount = 0;

    for (const rule of rules) {
      try {
        let patternStr = escapeRegExp(rule.find);
        
        // Whole Word Logic
        if (mode.wholeWord) {
             patternStr = `(?<![\\p{L}\\p{N}_])${patternStr}(?![\\p{L}\\p{N}_])`;
        }

        const flags = 'g' + 'u' + (mode.matchCase ? '' : 'i');
        const regex = new RegExp(patternStr, flags);
        const replaceVal = rule.replace; 

        result = result.replace(regex, (match, ...args) => {
          totalCount++; 
          const offset = args[args.length - 2];
          const wholeString = args[args.length - 1];
          let finalReplace = replaceVal;

          // Match Case Logic
          if (!mode.matchCase) {
             if (match === match.toUpperCase()) finalReplace = replaceVal.toUpperCase();
             else if (match === match.toLowerCase()) finalReplace = replaceVal.toLowerCase();
             else if (match[0] === match[0].toUpperCase() && replaceVal.length > 0) {
                finalReplace = replaceVal.charAt(0).toUpperCase() + replaceVal.slice(1);
             }
          }

          // Context-Aware Capitalization
          if (finalReplace.length > 0) {
              const textBefore = wholeString.slice(0, offset);
              const isStartOfLine = /^\s*$/.test(textBefore) || /\n\s*$/.test(textBefore);
              const isAfterPunctuation = /(\.|\?|!)\s*$/.test(textBefore);
              if (isStartOfLine || isAfterPunctuation) {
                  finalReplace = finalReplace.charAt(0).toUpperCase() + finalReplace.slice(1);
              }
          }
          return finalReplace;
        });

      } catch (e) {
        console.warn('Regex Error:', rule.find, e);
      }
    }

    const formatted = result.split(/\n/).map(l => l.trim()).filter(l => l).join('\n\n');
    return { text: formatted, count: totalCount };
  }

  // === RENDER HIGHLIGHTS (NEW) ===
  // Hàm này sẽ lấy kết quả, tìm các từ nằm trong cột Replace và tô màu
  function renderHighlightedOutput(plainText) {
    if (!plainText) {
        els.outputText.innerHTML = '';
        return;
    }

    const mode = state.modes[state.currentMode];
    // Lấy danh sách các từ dùng để thay thế (để highlight)
    const replaceTerms = mode.pairs
        .map(p => p.replace)
        .filter(r => r && r.trim().length > 0); // Loại bỏ thay thế rỗng
    
    // Nếu không có gì để highlight
    if (replaceTerms.length === 0) {
        els.outputText.innerText = plainText;
        return;
    }

    // Sort theo độ dài giảm dần để match từ dài trước
    replaceTerms.sort((a, b) => b.length - a.length);

    // Escape HTML text gốc trước khi xử lý highlight để tránh lỗi XSS
    let safeText = escapeHtml(plainText);
    
    replaceTerms.forEach(term => {
        // Escape term để dùng trong regex
        const safeTerm = escapeRegExp(escapeHtml(term));
        const regex = new RegExp(`(${safeTerm})`, 'g');
        // Wrap bằng thẻ mark
        safeText = safeText.replace(regex, '<mark class="hl-yellow">$1</mark>');
    });

    els.outputText.innerHTML = safeText;
  }

  // === UI MANIPULATION ===

  function renderModeSelect() {
    els.modeSelect.innerHTML = '';
    Object.keys(state.modes).sort().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      els.modeSelect.appendChild(opt);
    });
    els.modeSelect.value = state.currentMode;
    updateModeButtons();
  }

  function updateModeButtons() {
    const isDefault = state.currentMode === 'default';
    els.renameBtn.classList.toggle('hidden', isDefault);
    els.deleteBtn.classList.toggle('hidden', isDefault);
    const mode = state.modes[state.currentMode];
    els.matchCaseBtn.textContent = `Match Case: ${mode.matchCase ? 'BẬT' : 'Tắt'}`;
    els.matchCaseBtn.classList.toggle('active', mode.matchCase);
    els.wholeWordBtn.textContent = `Whole Word: ${mode.wholeWord ? 'BẬT' : 'Tắt'}`;
    els.wholeWordBtn.classList.toggle('active', mode.wholeWord);
  }

  function addPairToUI(find = '', replace = '', append = false) {
    const item = document.createElement('div');
    item.className = 'punctuation-item';
    const safeFind = find.replace(/"/g, '&quot;');
    const safeReplace = replace.replace(/"/g, '&quot;');

    item.innerHTML = `
      <input type="text" class="find" placeholder="Tìm" value="${safeFind}">
      <input type="text" class="replace" placeholder="Thay thế" value="${safeReplace}">
      <button class="remove" tabindex="-1">×</button>
    `;

    item.querySelector('.remove').onclick = () => {
      item.remove();
      checkEmptyState();
      saveTempInput(); 
    };
    item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', saveTempInputDebounced));

    if (append) els.list.appendChild(item);
    else els.list.insertBefore(item, els.list.firstChild);
    checkEmptyState();
  }

  function loadSettingsToUI() {
    els.list.innerHTML = '';
    const mode = state.modes[state.currentMode];
    if (mode.pairs && mode.pairs.length > 0) {
      mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true));
    }
    updateModeButtons();
    checkEmptyState();
  }

  function checkEmptyState() {
    els.emptyState.classList.toggle('hidden', els.list.children.length > 0);
  }

  function saveCurrentPairsToState(silent = false) {
    const items = Array.from(els.list.children);
    const newPairs = items.map(item => ({
      find: item.querySelector('.find').value,
      replace: item.querySelector('.replace').value 
    })).filter(p => p.find !== '');

    state.modes[state.currentMode].pairs = newPairs;
    saveState();
    if (!silent) showNotification('Đã lưu cài đặt!', 'success');
  }

  // === SPLIT LOGIC ===
  function renderSplitOutputs(count) {
    els.splitWrapper.innerHTML = '';
    for(let i = 1; i <= count; i++) {
        const div = document.createElement('div');
        div.className = 'split-box';
        div.innerHTML = `
            <div class="split-header">
                <span>Phần ${i}</span>
                <span id="out-${i}-count" class="badge">Words: 0</span>
            </div>
            <textarea id="out-${i}-text" class="custom-scrollbar" readonly></textarea>
            <div class="split-footer">
              <button class="btn btn-secondary full-width copy-btn" data-target="out-${i}-text">Sao chép phần ${i}</button>
            </div>
        `;
        els.splitWrapper.appendChild(div);
    }
    els.splitWrapper.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.target;
            const el = document.getElementById(id);
            if(el.value) {
                navigator.clipboard.writeText(el.value);
                showNotification(`Đã sao chép Phần ${id.split('-')[1]}`, 'success');
            }
        });
    });
  }

  function performSplit() {
    const text = els.splitInput.value;
    if(!text.trim()) return showNotification('Chưa có nội dung để chia!', 'error');

    const lines = text.split('\n');
    const firstLine = lines[0].trim();
    let chapterHeader = '';
    let contentBody = text;
    
    if (/^(Chương|Chapter)\s+\d+/.test(firstLine)) {
        chapterHeader = firstLine;
        contentBody = lines.slice(1).join('\n');
    }

    const paragraphs = contentBody.split('\n').filter(p => p.trim());
    const totalWords = countWords(contentBody);
    const targetWords = Math.ceil(totalWords / currentSplitMode);
    
    let parts = [];
    let currentPart = [];
    let currentCount = 0;

    for (let p of paragraphs) {
        const wCount = countWords(p);
        if (currentCount + wCount > targetWords && parts.length < currentSplitMode - 1) {
            parts.push(currentPart.join('\n\n'));
            currentPart = [p];
            currentCount = wCount;
        } else {
            currentPart.push(p);
            currentCount += wCount;
        }
    }
    if (currentPart.length) parts.push(currentPart.join('\n\n'));

    for(let i = 0; i < currentSplitMode; i++) {
        const el = document.getElementById(`out-${i+1}-text`);
        const countEl = document.getElementById(`out-${i+1}-count`);
        if(el) {
            let partHeader = '';
            if (chapterHeader) {
                partHeader = chapterHeader.replace(/(\d+)/, `$1.${i+1}`) + '\n\n';
            }
            el.value = (parts[i] ? partHeader + parts[i] : '');
            if(countEl) countEl.textContent = 'Words: ' + countWords(el.value);
        }
    }
    els.splitInput.value = '';
    updateCounters();
    saveTempInput();
    showNotification('Đã chia thành công!', 'success');
  }

  // === CSV EXPORT & IMPORT (FIXED BOM) ===
  function exportCSV() {
    let csvContent = "\uFEFFfind,replace,mode\n"; 
    Object.keys(state.modes).forEach(modeName => {
        const mode = state.modes[modeName];
        if (mode.pairs && mode.pairs.length > 0) {
            mode.pairs.forEach(p => {
                const safeFind = p.find ? p.find.replace(/"/g, '""') : '';
                const safeReplace = p.replace ? p.replace.replace(/"/g, '""') : '';
                csvContent += `"${safeFind}","${safeReplace}","${modeName}"\n`;
            });
        }
    });
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'settings_trinh_hg.csv';
    a.click();
  }

  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        let text = e.target.result;
        const lines = text.split(/\r?\n/);
        if (!lines[0].toLowerCase().includes('find,replace,mode')) {
            return showNotification('File không đúng định dạng!', 'error');
        }
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const match = line.match(/^"(.*)","(.*)","(.*)"$/);
            if (match) {
                const find = match[1].replace(/""/g, '"');
                const replace = match[2].replace(/""/g, '"');
                const modeName = match[3];
                if (!state.modes[modeName]) {
                    state.modes[modeName] = { pairs: [], matchCase: false, wholeWord: false };
                }
                state.modes[modeName].pairs.push({ find, replace });
                count++;
            }
        }
        saveState();
        renderModeSelect();
        loadSettingsToUI();
        if (count > 0) showNotification(`Đã nhập thành công ${count} cặp từ!`, 'success');
        else showNotification('Không tìm thấy dữ liệu hợp lệ!', 'error');
    };
    reader.readAsText(file);
  }

  // === UTILS & EVENTS ===
  function countWords(str) {
    return str.trim() ? str.trim().split(/\s+/).length : 0;
  }
  
  function updateCounters() {
    document.getElementById('input-word-count').textContent = 'Words: ' + countWords(els.inputText.value);
    // innerText để lấy nội dung trong div
    document.getElementById('output-word-count').textContent = 'Words: ' + countWords(els.outputText.innerText);
    document.getElementById('split-input-word-count').textContent = 'Words: ' + countWords(els.splitInput.value);
  }

  function saveTempInputDebounced() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveTempInput, 500);
  }

  function saveTempInput() {
    const inputState = {
      inputText: els.inputText.value,
      splitInput: els.splitInput.value,
      tempPairs: Array.from(els.list.children).map(item => ({
          find: item.querySelector('.find').value,
          replace: item.querySelector('.replace').value
      }))
    };
    localStorage.setItem(INPUT_STATE_KEY, JSON.stringify(inputState));
  }

  function loadTempInput() {
    const saved = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
    if(saved) {
        if(saved.inputText) els.inputText.value = saved.inputText;
        if(saved.splitInput) els.splitInput.value = saved.splitInput;
    }
    updateCounters();
  }

  function initEvents() {
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    els.matchCaseBtn.onclick = () => {
      state.modes[state.currentMode].matchCase = !state.modes[state.currentMode].matchCase;
      saveState(); updateModeButtons();
    };
    els.wholeWordBtn.onclick = () => {
      state.modes[state.currentMode].wholeWord = !state.modes[state.currentMode].wholeWord;
      saveState(); updateModeButtons();
    };

    els.modeSelect.onchange = (e) => {
      state.currentMode = e.target.value;
      saveState(); loadSettingsToUI();
      showNotification(`Chuyển sang: ${state.currentMode}`);
    };
    
    document.getElementById('add-mode').onclick = () => {
      const name = prompt('Tên chế độ mới:');
      if(name && !state.modes[name]) {
        state.modes[name] = { pairs: [], matchCase: false, wholeWord: false };
        state.currentMode = name;
        saveState(); renderModeSelect(); loadSettingsToUI();
      }
    };

    document.getElementById('copy-mode').onclick = () => {
      const name = prompt('Tên chế độ sao chép:');
      if(name && !state.modes[name]) {
        state.modes[name] = JSON.parse(JSON.stringify(state.modes[state.currentMode]));
        state.currentMode = name;
        saveState(); renderModeSelect(); loadSettingsToUI();
      }
    };
    
    els.renameBtn.onclick = () => {
      const newName = prompt('Tên mới:', state.currentMode);
      if(newName && newName !== state.currentMode && !state.modes[newName]) {
        state.modes[newName] = state.modes[state.currentMode];
        delete state.modes[state.currentMode];
        state.currentMode = newName;
        saveState(); renderModeSelect();
      }
    };

    els.deleteBtn.onclick = () => {
      if(confirm(`Xóa chế độ ${state.currentMode}?`)) {
        delete state.modes[state.currentMode];
        state.currentMode = 'default';
        saveState(); renderModeSelect(); loadSettingsToUI();
      }
    };

    document.getElementById('add-pair').onclick = () => addPairToUI('', '', false); 
    document.getElementById('save-settings').onclick = () => saveCurrentPairsToState(false);

    document.getElementById('replace-button').onclick = () => {
        saveCurrentPairsToState(true);
        const result = performReplace(els.inputText.value);
        
        // Render kết quả có highlight vào DIV
        renderHighlightedOutput(result.text);

        els.inputText.value = '';
        updateCounters();
        saveTempInput();
        showNotification(`Đã thay thế ${result.count} vị trí!`, 'info');
    };

    document.getElementById('copy-button').onclick = () => {
        // Với DIV, ta lấy innerText để copy text thuần
        if(!els.outputText.innerText) return;
        navigator.clipboard.writeText(els.outputText.innerText);
        showNotification('Đã sao chép kết quả!', 'success');
    };

    document.querySelectorAll('.split-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.split-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSplitMode = parseInt(btn.dataset.split);
            renderSplitOutputs(currentSplitMode);
        });
    });

    document.getElementById('split-action-btn').onclick = performSplit;
    document.getElementById('export-settings').onclick = exportCSV;
    document.getElementById('import-settings').onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
            if(e.target.files.length > 0) importCSV(e.target.files[0]);
        };
        input.click();
    };

    [els.inputText, els.splitInput].forEach(el => {
        el.addEventListener('input', () => {
            updateCounters();
            saveTempInputDebounced();
        });
    });
  }

  // === INIT ===
  renderModeSelect();
  loadSettingsToUI();
  loadTempInput();
  renderSplitOutputs(2); 
  initEvents();
});
