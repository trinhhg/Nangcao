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
    let saveTimeout;
  
    // DOM ELEMENTS (Đã Map lại ID cho khớp với HTML)
    const els = {
      modeSelect: document.getElementById('mode-select'),
      list: document.getElementById('punctuation-list'),
      
      // HTML mới dùng div contenteditable id="editor"
      editor: document.getElementById('editor'), 
      
      // Mapping các nút bấm
      matchCaseBtn: document.getElementById('match-case-replace'),
      wholeWordBtn: null, // HTML bên cột Replace chưa có nút này, để null để tránh lỗi
      renameBtn: document.getElementById('rename-mode'),
      deleteBtn: document.getElementById('delete-mode-btn'), // Sửa ID: delete-mode -> delete-mode-btn
      emptyState: document.getElementById('empty-state'), // Có thể null nếu chưa thêm vào HTML
      
      // Nút hành động
      replaceAllBtn: document.getElementById('replace-all'),
      saveSettingsBtn: document.getElementById('save-settings'),
      addPairBtn: document.getElementById('add-pair')
    };
  
    // === CORE FUNCTIONS ===
  
    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  
    function showNotification(msg, type = 'success') {
      const container = document.getElementById('notification-container');
      if (!container) return;
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
            
            // Context-Aware Capitalization (đầu dòng hoặc sau dấu câu)
            if (finalReplace.length > 0) {
                const textBefore = wholeString.slice(0, offset);
                // Logic này đơn giản, có thể cần tinh chỉnh cho editor HTML
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
  
      return { text: result, count: totalCount };
    }
  
    // === RENDER HIGHLIGHTS ===
    function renderHighlightedOutput(plainText) {
      if (!els.editor) return;
      
      if (!plainText) {
          els.editor.innerText = '';
          return;
      }
  
      const mode = state.modes[state.currentMode];
      const replaceTerms = mode.pairs
          .map(p => p.replace)
          .filter(r => r && r.trim().length > 0); 
      
      // Nếu không có gì để highlight
      if (replaceTerms.length === 0) {
          els.editor.innerText = plainText; // Dùng innerText để giữ format dòng
          return;
      }
  
      replaceTerms.sort((a, b) => b.length - a.length);
  
      let safeText = escapeHtml(plainText);
      
      // Highlight các từ vừa thay thế
      replaceTerms.forEach(term => {
          const safeTerm = escapeRegExp(escapeHtml(term));
          // Tìm chính xác từ đó để highlight
          const regex = new RegExp(`(${safeTerm})`, 'g');
          safeText = safeText.replace(regex, '<mark class="replaced">$1</mark>');
      });
  
      // Chuyển đổi xuống dòng thành thẻ <br> hoặc bao thẻ div để hiển thị đúng trong contenteditable
      // Cách đơn giản nhất cho text thuần:
      safeText = safeText.replace(/\n/g, '<br>');
      
      els.editor.innerHTML = safeText;
    }
  
    // === UI MANIPULATION ===
  
    function renderModeSelect() {
      if(!els.modeSelect) return;
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
      
      // Sửa lỗi crash: Kiểm tra phần tử tồn tại trước khi gọi classList
      if (els.renameBtn) els.renameBtn.classList.toggle('hidden', isDefault);
      if (els.deleteBtn) els.deleteBtn.classList.toggle('hidden', isDefault);
      
      const mode = state.modes[state.currentMode];
      
      if (els.matchCaseBtn) {
        els.matchCaseBtn.textContent = `Case Sensitive: ${mode.matchCase ? 'BẬT' : 'Tắt'}`;
        els.matchCaseBtn.classList.toggle('active', mode.matchCase);
        if(mode.matchCase) {
             els.matchCaseBtn.classList.remove('bg-gray-200', 'text-gray-600');
             els.matchCaseBtn.classList.add('bg-blue-600', 'text-white');
        } else {
             els.matchCaseBtn.classList.add('bg-gray-200', 'text-gray-600');
             els.matchCaseBtn.classList.remove('bg-blue-600', 'text-white');
        }
      }
  
      // Nút Whole Word hiện không có trong HTML cột thay thế, bỏ qua hoặc thêm logic nếu bạn thêm nút vào HTML
      if (els.wholeWordBtn) {
        els.wholeWordBtn.textContent = `Whole Word: ${mode.wholeWord ? 'BẬT' : 'Tắt'}`;
        els.wholeWordBtn.classList.toggle('active', mode.wholeWord);
      }
    }
  
    function addPairToUI(find = '', replace = '', append = false) {
      if(!els.list) return;
      const item = document.createElement('div');
      item.className = 'punctuation-item';
      const safeFind = find.replace(/"/g, '&quot;');
      const safeReplace = replace.replace(/"/g, '&quot;');
  
      item.innerHTML = `
        <input type="text" class="find" placeholder="Tìm" value="${safeFind}">
        <input type="text" class="replace" placeholder="Thay thế" value="${safeReplace}">
        <button class="remove-pair" tabindex="-1">×</button>
      `;
  
      item.querySelector('.remove-pair').onclick = () => {
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
      if(!els.list) return;
      els.list.innerHTML = '';
      const mode = state.modes[state.currentMode];
      if (mode.pairs && mode.pairs.length > 0) {
        mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true));
      }
      updateModeButtons();
      checkEmptyState();
    }
  
    function checkEmptyState() {
      if(els.emptyState) {
          els.emptyState.classList.toggle('hidden', els.list.children.length > 0);
      }
    }
  
    function saveCurrentPairsToState(silent = false) {
      if(!els.list) return;
      const items = Array.from(els.list.children);
      const newPairs = items.map(item => ({
        find: item.querySelector('.find').value,
        replace: item.querySelector('.replace').value 
      })).filter(p => p.find !== '');
  
      state.modes[state.currentMode].pairs = newPairs;
      saveState();
      if (!silent) showNotification('Đã lưu cài đặt!', 'success');
    }
  
    // === CSV EXPORT & IMPORT ===
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
  
    function saveTempInputDebounced() {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveTempInput, 500);
    }
  
    function saveTempInput() {
      if(!els.editor || !els.list) return;
      const inputState = {
        // Dùng innerText cho editor
        inputText: els.editor.innerText,
        tempPairs: Array.from(els.list.children).map(item => ({
            find: item.querySelector('.find').value,
            replace: item.querySelector('.replace').value
        }))
      };
      localStorage.setItem(INPUT_STATE_KEY, JSON.stringify(inputState));
    }
  
    function loadTempInput() {
      const saved = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
      if(saved && els.editor) {
          if(saved.inputText) els.editor.innerText = saved.inputText;
      }
    }
  
    function initEvents() {
  
      if (els.matchCaseBtn) {
          els.matchCaseBtn.onclick = () => {
            state.modes[state.currentMode].matchCase = !state.modes[state.currentMode].matchCase;
            saveState(); updateModeButtons();
          };
      }
  
      if (els.modeSelect) {
          els.modeSelect.onchange = (e) => {
            state.currentMode = e.target.value;
            saveState(); loadSettingsToUI();
            showNotification(`Chuyển sang: ${state.currentMode}`);
          };
      }
      
      const addModeBtn = document.getElementById('add-mode');
      if (addModeBtn) {
          addModeBtn.onclick = () => {
            const name = prompt('Tên chế độ mới:');
            if(name && !state.modes[name]) {
              state.modes[name] = { pairs: [], matchCase: false, wholeWord: false };
              state.currentMode = name;
              saveState(); renderModeSelect(); loadSettingsToUI();
            }
          };
      }
      
      if (els.renameBtn) {
          els.renameBtn.onclick = () => {
            const newName = prompt('Tên mới:', state.currentMode);
            if(newName && newName !== state.currentMode && !state.modes[newName]) {
              state.modes[newName] = state.modes[state.currentMode];
              delete state.modes[state.currentMode];
              state.currentMode = newName;
              saveState(); renderModeSelect();
            }
          };
      }
  
      if (els.deleteBtn) {
          els.deleteBtn.onclick = () => {
            if(confirm(`Xóa chế độ ${state.currentMode}?`)) {
              delete state.modes[state.currentMode];
              state.currentMode = 'default';
              saveState(); renderModeSelect(); loadSettingsToUI();
            }
          };
      }
  
      if (els.addPairBtn) els.addPairBtn.onclick = () => addPairToUI('', '', false); 
      if (els.saveSettingsBtn) els.saveSettingsBtn.onclick = () => saveCurrentPairsToState(false);
  
      // XỬ LÝ NÚT THAY THẾ (QUAN TRỌNG)
      if (els.replaceAllBtn) {
          els.replaceAllBtn.onclick = () => {
              saveCurrentPairsToState(true);
              // Lấy text thuần từ div contenteditable
              const currentText = els.editor.innerText;
              const result = performReplace(currentText);
              
              // Render kết quả có highlight vào lại div
              renderHighlightedOutput(result.text);
  
              saveTempInput();
              showNotification(`Đã thay thế ${result.count} vị trí!`, 'info');
          };
      }
  
      // Export/Import
      const exportBtn = document.getElementById('export-csv');
      if(exportBtn) exportBtn.onclick = exportCSV;
      
      const importBtn = document.getElementById('import-csv');
      if(importBtn) {
          importBtn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv';
            input.onchange = e => {
                if(e.target.files.length > 0) importCSV(e.target.files[0]);
            };
            input.click();
        };
      }
  
      // Copy Editor Content
      const copyEditorBtn = document.getElementById('copy-editor-content');
      if(copyEditorBtn) {
          copyEditorBtn.onclick = () => {
              if(!els.editor) return;
              navigator.clipboard.writeText(els.editor.innerText);
              showNotification('Đã copy nội dung!', 'success');
          }
      }
  
      // Editor Auto Save
      if (els.editor) {
          els.editor.addEventListener('input', () => {
              saveTempInputDebounced();
          });
      }
      
      // Font settings
      const fontSelect = document.getElementById('fontFamily');
      const sizeSelect = document.getElementById('fontSize');
      if(fontSelect && els.editor) {
          fontSelect.onchange = () => els.editor.style.fontFamily = fontSelect.value;
      }
      if(sizeSelect && els.editor) {
          sizeSelect.onchange = () => els.editor.style.fontSize = sizeSelect.value;
      }
      
      // Xử lý nút xóa trong cột Tìm Kiếm (Clear)
      const clearSearchBtn = document.getElementById('clear');
      if(clearSearchBtn) {
          clearSearchBtn.onclick = () => {
              document.getElementById('keywords-tags').innerHTML = '';
              document.getElementById('keywords-input').value = '';
          }
      }
    }
  
    // === INIT ===
    renderModeSelect();
    loadSettingsToUI();
    loadTempInput();
    initEvents();
  });
