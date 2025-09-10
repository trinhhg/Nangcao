document.addEventListener('DOMContentLoaded', () => {
    // Tải cài đặt
    loadSettings();

    // Các sự kiện
    const searchBtn = document.getElementById('search');
    const clearBtn = document.getElementById('clear');
    const matchCase = document.getElementById('matchCase');
    const wholeWords = document.getElementById('wholeWords');
    const keywords = document.getElementById('keywords');
    const fontFamily = document.getElementById('fontFamily');
    const fontSize = document.getElementById('fontSize');

    if (searchBtn) searchBtn.addEventListener('click', performSearch);
    if (clearBtn) clearBtn.addEventListener('click', clearContent);
    if (matchCase) matchCase.addEventListener('change', () => saveSettings());
    if (wholeWords) wholeWords.addEventListener('change', () => saveSettings());
    if (keywords) keywords.addEventListener('input', () => saveSettings());
    if (fontFamily) {
        fontFamily.addEventListener('change', () => {
            document.getElementById('textInput').style.fontFamily = fontFamily.value;
            saveSettings();
        });
    }
    if (fontSize) {
        fontSize.addEventListener('change', () => {
            document.getElementById('textInput').style.fontSize = fontSize.value;
            saveSettings();
        });
    }
});
