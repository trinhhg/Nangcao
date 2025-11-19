document.addEventListener('DOMContentLoaded', () => {
    const keywordsInput    = document.getElementById('keywords-input');
    const keywordsTags     = document.getElementById('keywords-tags');
    const searchBtn        = document.getElementById('search');
    const clearBtn         = document.getElementById('clear');
    const fontFamily       = document.getElementById('fontFamily');
    const fontSize         = document.getElementById('fontSize');
    const matchCaseCb      = document.getElementById('matchCase');
    const wholeWordsCb     = document.getElementById('wholeWords');
    const replaceAllBtn    = document.getElementById('replace-all');
    const punctuationList  = document.getElementById('punctuation-list');
    const textLayer        = document.getElementById('text-layer');

    let currentKeywords  = [];
    let replacedKeywords = [];
    const HIGHLIGHT_CLASSES = ['hl-yellow','hl-pink','hl-blue','hl-green','hl-orange','hl-purple'];

    const REPLACE_MODES_KEY = 'replaceModes';
    const ACTIVE_MODE_NAME_KEY = 'activeReplaceMode';
    let replaceModes = {};
    let activeModeName = 'Mặc định';

    const modeSelect = document.getElementById('mode-select');
    const addPairBtn = document.getElementById('add-pair');
    const saveSettingsBtn = document.getElementById('save-settings');
    const deleteModeBtn = document.getElementById('delete-mode');
    const matchCaseReplaceBtn = document.getElementById('match-case');

    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let savedRange = null;
    function saveSelection() { const sel = window.getSelection(); if(!sel.rangeCount) return; savedRange = sel.getRangeAt(0).cloneRange(); }
    function restoreSelection() { if(!savedRange) return; try { const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); } catch(e){savedRange=null;} }

    function showNotification(message,type){
        const container=document.getElementById('notification-container');
        const notif=document.createElement('div');
        notif.className=`notification ${type}`;
        notif.textContent=message;
        container.prepend(notif);
        setTimeout(()=>notif.remove(),3000);
    }

    function buildRegex(word,isWholeWords=wholeWordsCb.checked,isMatchCase=matchCaseCb.checked){
        if(!word) return null;
        const escaped = escapeRegex(word);
        const flags = isMatchCase?'g':'gi';
        const pattern = isWholeWords?`\\b${escaped}\\b`:escaped;
        return new RegExp(pattern,flags);
    }

    function removeHighlightsSafe(root=textLayer){
        root.querySelectorAll('mark[data-hl]').forEach(mark=>mark.replaceWith(document.createTextNode(mark.textContent)));
        root.normalize();
    }

    function highlightKeywords(){
        saveSelection();
        removeHighlightsSafe();
        const searchWholeWords = wholeWordsCb.checked;
        const searchMatchCase = matchCaseCb.checked;

        const keywordsToHighlight=[
            ...replacedKeywords.map((t,i)=>({text:t,cls:HIGHLIGHT_CLASSES[i%6],priority:999,isWholeWords:searchWholeWords,isMatchCase:searchMatchCase})),
            ...currentKeywords.map((t,i)=>({text:t,cls:HIGHLIGHT_CLASSES[(replacedKeywords.length+i)%6],priority:100,isWholeWords:searchWholeWords,isMatchCase:searchMatchCase}))
        ].filter(kw=>kw.text);

        if(!keywordsToHighlight.length){restoreSelection(); return;}

        const walker=document.createTreeWalker(textLayer,NodeFilter.SHOW_TEXT,null,false);
        let node;
        while(node=walker.nextNode()){
            const originalText=node.nodeValue;
            let allMatchesInNode=[];
            for(const kw of keywordsToHighlight){
                const regex=buildRegex(kw.text,kw.isWholeWords,kw.isMatchCase);
                if(!regex) continue;
                let match;
                regex.lastIndex=0;
                while(match=regex.exec(originalText)) allMatchesInNode.push({index:match.index,length:match[0].length,content:match[0],cls:kw.cls,priority:kw.priority});
            }
            if(!allMatchesInNode.length) continue;
            allMatchesInNode.sort((a,b)=>a.index-b.index||b.priority-a.priority||b.length-a.length);
            let lastIndex=0,tempFragment=document.createDocumentFragment();
            allMatchesInNode.forEach(m=>{
                if(m.index>=lastIndex){
                    if(m.index>lastIndex) tempFragment.appendChild(document.createTextNode(originalText.substring(lastIndex,m.index)));
                    const mark=document.createElement('mark');
                    mark.className=m.cls;
                    mark.setAttribute('data-hl','1');
                    mark.textContent=m.content;
                    tempFragment.appendChild(mark);
                    lastIndex=m.index+m.length;
                }
            });
            if(lastIndex<originalText.length) tempFragment.appendChild(document.createTextNode(originalText.substring(lastIndex)));
            if(tempFragment.childNodes.length>0) node.replaceWith(tempFragment);
        }
        restoreSelection();
    }

    function replaceAllSafe(){
        saveSelection();
        removeHighlightsSafe();
        const mode = replaceModes[activeModeName];
        if(!mode){showNotification('Chế độ không tồn tại','error');return;}
        const pairs = mode.pairs.filter(p=>p.find);
        const replaceMatchCase=mode.options.matchCase||false;
        const replaceWholeWords=mode.options.wholeWords||false;
        if(!pairs.length){showNotification('Chưa có cặp thay thế','error'); highlightKeywords(); return;}
        let changed=false;
        const walker=document.createTreeWalker(textLayer,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()){
            let node=walker.currentNode;
            let text=node.nodeValue;
            let originalText=text;
            pairs.forEach(pair=>{
                const regex=buildRegex(pair.find,replaceWholeWords,replaceMatchCase);
                if(!regex) return;
                text=text.replace(regex,_=>{
                    changed=true;
                    return pair.replace;
                });
            });
            if(text!==originalText) node.nodeValue=text;
        }
        if(changed) replacedKeywords=pairs.map(p=>p.replace).filter(Boolean);
        else replacedKeywords=[];
        highlightKeywords();
        showNotification(changed?'Đã thay thế tất cả':'Không tìm thấy từ để thay thế',changed?'success':'error');
        restoreSelection();
    }

    const addKeywords=()=>{
        const vals=keywordsInput.value.split(',').map(s=>s.trim()).filter(Boolean);
        if(!vals.length){keywordsInput.value='';return;}
        vals.forEach(v=>{
            if(v&&!currentKeywords.includes(v)){
                currentKeywords.push(v);
                const tag=document.createElement('div');
                tag.className='tag';
                tag.innerHTML=`${v} <span class="remove-tag">×</span>`;
                tag.querySelector('.remove-tag').onclick=e=>{
                    e.stopPropagation();
                    tag.remove();
                    currentKeywords=currentKeywords.filter(x=>x!==v);
                    highlightKeywords();
                };
                keywordsTags.appendChild(tag);
            }
        });
        keywords
