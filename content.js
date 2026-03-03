// ============================================================
//  CONTENT SCRIPT — CC Subtitle Extractor  v5
//  Dual strategy: MutationObserver + polling fallback
//  Fixes: CC not detected unless video is restarted.
// ============================================================

let isRecording = false;
let fullScript = "";
let lastProcessedText = "";
let subtitleObserver = null;
let pollTimer = null;           // fallback polling timer
let playerWatchTimer = null;    // waits for #movie_player to appear

// ── Init: restore state from storage ─────────────────────────
chrome.storage.local.get(['ccActive', 'ccScript'], (data) => {
    if (data.ccScript) {
        fullScript = data.ccScript;
        lastProcessedText = '';
    }
    if (data.ccActive) {
        isRecording = true;
        startCapture();
    }
});

// ── Storage listener: start / stop / clear ───────────────────
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.ccActive !== undefined) {
        const shouldRecord = changes.ccActive.newValue;
        if (shouldRecord && !isRecording) {
            isRecording = true;
            startCapture();
        } else if (!shouldRecord && isRecording) {
            isRecording = false;
            stopCapture();
        }
    }

    if (changes.ccClearSignal !== undefined) {
        fullScript = '';
        lastProcessedText = '';
        chrome.storage.local.set({ ccScript: '' });
    }
});

// ── Overlap-merging algorithm ─────────────────────────────────
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

// ── Read visible captions and append to script ───────────────
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

// ── MutationObserver anchored to the stable #movie_player ────
// We ALWAYS observe #movie_player (not the caption container)
// because the caption container is created/destroyed dynamically.
function attachObserver(player) {
    if (subtitleObserver) subtitleObserver.disconnect();
    subtitleObserver = new MutationObserver(processSubtitles);
    subtitleObserver.observe(player, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

// ── Polling fallback: runs every 800ms as a safety net ───────
// Catches any captions the observer may have missed (e.g. when
// YouTube recycles DOM nodes instead of mutating them).
function startPollFallback() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(processSubtitles, 800);
}

function stopPollFallback() {
    clearInterval(pollTimer);
    pollTimer = null;
}

// ── Wait until #movie_player exists, then attach both strategies
function startCapture() {
    // Clear any pending player-wait timer
    clearInterval(playerWatchTimer);

    function tryAttach() {
        // #movie_player is the most stable YouTube player container.
        // It exists from the moment the video page loads.
        const player = document.querySelector('#movie_player');
        if (!player) return false;   // not ready yet

        attachObserver(player);
        startPollFallback();
        processSubtitles();          // read immediately if CC already showing
        return true;
    }

    if (!tryAttach()) {
        // Player not ready — poll every 500ms until it appears
        playerWatchTimer = setInterval(() => {
            if (tryAttach()) clearInterval(playerWatchTimer);
        }, 500);
    }
}

// ── Clean up everything when recording stops ─────────────────
function stopCapture() {
    if (subtitleObserver) { subtitleObserver.disconnect(); subtitleObserver = null; }
    stopPollFallback();
    clearInterval(playerWatchTimer);
}

