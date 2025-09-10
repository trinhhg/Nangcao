document.addEventListener('DOMContentLoaded', () => {
    // Load saved settings
    loadSettings();

    // Event listeners
    document.getElementById('saveSettings').addEventListener('click', () => {
        saveSettings();
        alert('Settings saved!');
    });

    document.getElementById('search').addEventListener('click', performSearch);
});
