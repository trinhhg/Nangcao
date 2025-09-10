// Save settings to localStorage
function saveSettings() {
    const settings = {
        matchCase: document.getElementById('matchCase').checked,
        wholeWords: document.getElementById('wholeWords').checked,
        keywords: document.getElementById('keywords').value
    };
    localStorage.setItem('searchSettings', JSON.stringify(settings));
}

// Load settings from localStorage
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('searchSettings'));
    if (settings) {
        document.getElementById('matchCase').checked = settings.matchCase || false;
        document.getElementById('wholeWords').checked = settings.wholeWords || false;
        document.getElementById('keywords').value = settings.keywords || '';
    }
}
