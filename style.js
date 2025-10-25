#textInput {
    min-height: 80vh;
    overflow-y: auto;
    white-space: pre-wrap;
    font-family: Arial;
    font-size: 16px;
    z-index: 2;
    position: relative;
    background: transparent;
}

#highlight-overlay {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    color: transparent; /* Để text không che textarea */
}

.highlight-pink { background-color: #ffcccc; }
.highlight-yellow { background-color: #ffff99; }
.highlight-blue { background-color: #99ccff; }
.highlight-green { background-color: #ccffcc; }
.highlight-orange { background-color: #ffcc99; }
.highlight-purple { background-color: #e6ccff; } /* Màu cho replaced words */

#keywords-container {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 5px;
}

.tag {
    background: #e0e0e0;
    padding: 5px 10px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    gap: 5px;
}

.tag .remove-tag {
    cursor: pointer;
    font-weight: bold;
}

.replace-pair {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
}

.replace-pair input {
    flex: 1;
    padding: 5px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

.replace-pair button {
    background: #dc3545;
    color: white;
    border: none;
    padding: 5px 10px;
    cursor: pointer;
}
