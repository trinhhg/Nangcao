document.addEventListener('DOMContentLoaded', () => {
    // Tải cài đặt
    loadSettings();

    // Các sự kiện
    document.getElementById('search').addEventListener('click', performSearch);
    document.getElementById('clear').addEventListener('click', clearContent);

    // Tự động lưu và áp dụng cài đặt khi thay đổi
    document.getElementById('matchCase').addEventListener('change', () => {
        saveSettings();
    });
    document.getElementById('wholeWords').addEventListener('change', () => {
        saveSettings();
    });
    document.getElementById('keywords').addEventListener('input', () => {
        saveSettings();
    });
    document.getElementById('fontFamily').addEventListener('change', () => {
        document.getElementById('textInput').style.fontFamily = document.getElementById('fontFamily').value;
        saveSettings();
    });
    document.getElementById('fontSize').addEventListener('change', () => {
        document.getElementById('textInput').style.fontSize = document.getElementById('fontSize').value;
        saveSettings();
    });
});
