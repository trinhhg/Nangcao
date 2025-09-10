document.addEventListener('DOMContentLoaded', () => {
    // Load saved settings
    loadSettings();

    // Event listeners
    document.getElementById('saveSettings').addEventListener('click', () => {
        saveSettings();
        alert('Đã lưu cài đặt!');
    });

    document.getElementById('search').addEventListener('click', performSearch);
    document.getElementById('clear').addEventListener('click', clearContent);
});
