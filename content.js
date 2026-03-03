// ============================================================
//  CONTENT SCRIPT — CC Subtitle Extractor
//  Control channel: chrome.storage.local  (no message passing)
//  Output channel:  chrome.storage.local  { ccScript: string }
// ============================================================

let isRecording = false;
let fullScript = "";
let lastProcessedText = "";
let subtitleObserver = null;

// --- Listen to storage for start/stop/clear commands ---
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.ccActive !== undefined) {
        const shouldRecord = changes.ccActive.newValue;
        if (shouldRecord && !isRecording) {
            isRecording = true;
            startObserver();
        } else if (!shouldRecord && isRecording) {
            isRecording = false;
            if (subtitleObserver) subtitleObserver.disconnect();
        }
    }

    if (changes.ccClearSignal !== undefined) {
        fullScript = '';
        lastProcessedText = '';
        chrome.storage.local.set({ ccScript: '' });
    }
});

// --- Overlap merging algorithm ---
function adjustTextOverlap(existingText, newText) {
    if (!existingText) return newText;

    const existingWords = existingText.split(/\s+/);
    const newWords = newText.split(/\s+/);

    let overlapCount = 0;
    const maxTestLen = Math.min(existingWords.length, newWords.length);

    for (let testLen = 1; testLen <= maxTestLen; testLen++) {
        let match = true;
        for (let k = 0; k < testLen; k++) {
            if (existingWords[existingWords.length - testLen + k] !== newWords[k]) {
                match = false;
                break;
            }
        }
        if (match) overlapCount = testLen;
    }

    const remaining = overlapCount > 0 ? newWords.slice(overlapCount) : newWords;
    const wordsToAdd = remaining.join(' ');
    if (wordsToAdd.length === 0) return existingText;

    return existingText + (existingText.endsWith(' ') ? '' : ' ') + wordsToAdd;
}

// --- Process visible captions ---
function processSubtitles() {
    if (!isRecording) return;

    const segments = document.querySelectorAll('.ytp-caption-segment');
    if (!segments || segments.length === 0) return;

    const currentText = Array.from(segments)
        .map(el => el.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (currentText && currentText !== lastProcessedText) {
        fullScript = adjustTextOverlap(fullScript, currentText);
        lastProcessedText = currentText;
        chrome.storage.local.set({ ccScript: fullScript });
    }
}

// --- MutationObserver on YouTube's player ---
function startObserver() {
    // Look for the caption container first (more specific and reliable)
    const captionWindow = document.querySelector('.ytp-caption-window-container');
    const target = captionWindow || document.querySelector('#ytd-player') || document.querySelector('#movie_player');

    if (!target) {
        // Player hasn't loaded yet — retry
        setTimeout(startObserver, 1500);
        return;
    }

    if (subtitleObserver) subtitleObserver.disconnect();

    subtitleObserver = new MutationObserver(processSubtitles);
    subtitleObserver.observe(target, {
        childList: true,
        subtree: true,
        characterData: true
    });

    // Trigger once immediately in case captions are already visible
    processSubtitles();
}
