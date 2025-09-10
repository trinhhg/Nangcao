// Lưu cài đặt vào localStorage
function saveSettings() {
    const settings = {
        matchCase: document.getElementById('matchCase').checked,
        wholeWords: document.getElementById('wholeWords').checked,
        keywords: document.getElementById('keywords').value,
        fontFamily: document.getElementById('fontFamily').value,
        fontSize: document.getElementById('fontSize').value
    };
    localStorage.setItem('searchSettings', JSON.stringify(settings));
}

// Tải cài đặt từ localStorage
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('searchSettings'));
    if (settings) {
        document.getElementById('matchCase').checked = settings.matchCase || false;
        document.getElementById('wholeWords').checked = settings.wholeWords || false;
        document.getElementById('keywords').value = settings.keywords || '';
        document.getElementById('fontFamily').value = settings.fontFamily || 'Arial';
        document.getElementById('fontSize').value = settings.fontSize || '16px';
        // Áp dụng font chữ và kích thước chữ
        document.getElementById('textInput').style.fontFamily = settings.fontFamily || 'Arial';
        document.getElementById('textInput').style.fontSize = settings.fontSize || '16px';
    } else {
        // Giá trị mặc định
        document.getElementById('textInput').style.fontFamily = 'Arial';
        document.getElementById('textInput').style.fontSize = '16px';
    }
}
