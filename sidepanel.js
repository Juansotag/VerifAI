// ============================================================
//  EXTRACTOR DE GUION — Side Panel v4
//  Fix: CC append logic with ccExtensionScript initialized from storage
//  New: Verificador de Declaraciones (GPT-4o fact-checker)
// ============================================================

const ICON_PLAY = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const ICON_PAUSE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

// ── DOM ──────────────────────────────────────────────────────
const apiKeyInput = document.getElementById('api-key-input');
const geminiKeyInput = document.getElementById('gemini-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const languageSelect = document.getElementById('language-select');
const chunkSecondsInput = document.getElementById('chunk-seconds-input');
const tabBtns = document.querySelectorAll('.tab-btn');
const mainPanels = document.querySelectorAll('.panel');

const ccToggleBtn = document.getElementById('cc-toggle-btn');
const ccScriptArea = document.getElementById('cc-script');
const ccCopyBtn = document.getElementById('cc-copy-btn');
const ccClearBtn = document.getElementById('cc-clear-btn');
const ccStatusDot = document.getElementById('cc-status-dot');
const ccStatusText = document.getElementById('cc-status-text');
const ccCorrectBtn = document.getElementById('cc-correct-btn');
const ccCorrectStatus = document.getElementById('cc-correct-status');
const ccCorrectedArea = document.getElementById('cc-corrected');

const audioToggleBtn = document.getElementById('audio-toggle-btn');
const audioScriptArea = document.getElementById('audio-script');
const audioCopyBtn = document.getElementById('audio-copy-btn');
const audioClearBtn = document.getElementById('audio-clear-btn');
const audioStatusDot = document.getElementById('audio-status-dot');
const audioStatusText = document.getElementById('audio-status-text');
const audioCorrectBtn = document.getElementById('audio-correct-btn');
const audioCorrectStatus = document.getElementById('audio-correct-status');
const audioCorrectedArea = document.getElementById('audio-corrected');

const verifSource = document.getElementById('verif-source');
const verifContext = document.getElementById('verif-context');
const extractClaimsBtn = document.getElementById('extract-claims-btn');
const verifyAllBtn = document.getElementById('verify-all-btn');
const clearClaimsBtn = document.getElementById('clear-claims-btn');
const addClaimBtn = document.getElementById('add-claim-btn');
const claimsStatus = document.getElementById('claims-status');
const claimsList = document.getElementById('claims-list');

const toast = document.getElementById('toast');
const descBanner = document.getElementById('desc-banner');
const settingsVideoContextArea = document.getElementById('settings-video-context');
const settingsAutoContextBtn = document.getElementById('settings-auto-context-btn');

// Auto-correction controls
const ccAutocorrectToggle = document.getElementById('cc-autocorrect-toggle');
const audioAutocorrectToggle = document.getElementById('audio-autocorrect-toggle');
const ccAutocorrectIntervalInput = document.getElementById('cc-autocorrect-interval');
const audioAutocorrectIntervalInput = document.getElementById('audio-autocorrect-interval');

// Auto-claims controls
const claimsAutoToggle = document.getElementById('claims-auto-toggle');
const claimsAutoverifyToggle = document.getElementById('claims-autoverify-toggle');
const claimsAutoIntervalInput = document.getElementById('claims-auto-interval');
const claimsLimitInput = document.getElementById('claims-limit-input');
const claimsAutoStatus = document.getElementById('claims-auto-status');
const clearAllChannelsBtn = document.getElementById('clear-all-channels-btn');

// Auto-discourse controls
const discAutoToggle = document.getElementById('disc-auto-toggle');
const discAutoIntervalInput = document.getElementById('disc-auto-interval');
const discAutoStatus = document.getElementById('disc-auto-status');
const clearDiscBtn = document.getElementById('clear-disc-btn');

// ── Description banner ───────────────────────────────────────
// if (localStorage.getItem('descBannerClosed')) descBanner.classList.add('hidden');
document.getElementById('desc-close-btn').addEventListener('click', () => {
    descBanner.classList.add('hidden');
    // localStorage.setItem('descBannerClosed', '1');
});

// ── Clear all claims & reset scan position ──────────────────
clearClaimsBtn.addEventListener('click', () => {
    claims = [];
    lastScannedPos = {};          // reset so next search reads from start
    claimsList.innerHTML = '';
    claimsStatus.textContent = '';
    showToast('Declaraciones limpiadas. Próxima búsqueda desde el inicio.');
});

// ── Verify ALL claims sequentially ──────────────────────────
verifyAllBtn.addEventListener('click', async () => {
    if (claims.length === 0) { showToast('No hay declaraciones para verificar'); return; }

    // If all already verified, re-verify from scratch
    const pending = claims.map((c, i) => i).filter(i => !claims[i].verdict);
    const queue = pending.length > 0 ? pending : claims.map((_, i) => i);

    verifyAllBtn.disabled = true;
    extractClaimsBtn.disabled = true;

    for (let pos = 0; pos < queue.length; pos++) {
        const idx = queue[pos];
        claimsStatus.textContent = `Verificando ${pos + 1} de ${queue.length}...`;
        try {
            await verifyClaim(idx);
        } catch (_) { /* individual errors already handled inside verifyClaim */ }
    }

    verifyAllBtn.disabled = false;
    extractClaimsBtn.disabled = false;
    claimsStatus.textContent = `✓ ${queue.length} declaración${queue.length > 1 ? 'es' : ''} verificada${queue.length > 1 ? 's' : ''}.`;
});

// ── Add empty claim manually ───────────────────────────────
addClaimBtn.addEventListener('click', () => {
    claims.push({ text: '', verdict: null, reasoning: '', searchUrl: '', sources: [] });
    renderClaims();
    claimsStatus.textContent = `${claims.length} declaración${claims.length > 1 ? 'es' : ''}. Edita y verifica.`;

    // Focus the newest textarea
    setTimeout(() => {
        const textareas = claimsList.querySelectorAll('.claim-input');
        if (textareas.length > 0) {
            textareas[textareas.length - 1].focus();
        }
    }, 50);
});

// ── Auto-fill context from YouTube page (shared helper) ─────
async function fetchVideoContext(targetTextarea, btn) {
    const prevHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url?.includes('youtube.com/watch')) {
            showToast('Abre un video de YouTube primero');
            return;
        }
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim()
                    || document.title.replace(' - YouTube', '').trim();
                const channel = document.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim() || '';
                const desc = document.querySelector('#description-inline-expander, #description yt-formatted-string, #description')
                    ?.textContent?.trim().substring(0, 400) || '';
                return { title, channel, desc };
            }
        });
        const { title, channel, desc } = results[0].result;
        const parts = [];
        if (title) parts.push(`Título: ${title}`);
        if (channel) parts.push(`Canal: ${channel}`);
        if (desc) parts.push(`Descripción: ${desc}`);
        if (parts.length === 0) { showToast('No se pudo obtener info del video'); return; }
        const ctx = parts.join('\n');
        // Update both context inputs simultaneously
        settingsVideoContextArea.value = ctx;
        verifContext.value = ctx;
        chrome.storage.local.set({ videoContext: ctx });
        showToast('Contexto actualizado ✓');
    } catch (err) {
        showToast('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = prevHTML;
    }
}

// ── Auto-fill context from settings panel btn ────────────────
settingsAutoContextBtn.addEventListener('click', () => fetchVideoContext(settingsVideoContextArea, settingsAutoContextBtn));

// ── Keep both context textareas in sync ──────────────────────
settingsVideoContextArea.addEventListener('input', () => {
    verifContext.value = settingsVideoContextArea.value;
    chrome.storage.local.set({ videoContext: settingsVideoContextArea.value });
});
verifContext.addEventListener('input', () => {
    settingsVideoContextArea.value = verifContext.value;
    chrome.storage.local.set({ videoContext: verifContext.value });
});



// ── State ────────────────────────────────────────────────────
let ccRecording = false;
let audioRecording = false;
let mediaRecorder = null;
let audioStream = null;
let audioContextRef = null;
let audioChunks = [];
let audioFullScript = '';
let chunkTimer = null;
let chunkMs = 10000;

// FIX: tracks what content script has stored, initialized from storage on load
let ccExtensionScript = '';

let ccActiveSubTab = 'raw';
let audioActiveSubTab = 'raw';

let claims = [];  // [{text, verdict, reasoning, searchUrl, sources:[]}]
let lastScannedPos = {};  // {sourceId: charOffset} — for incremental extraction

// ── Incremental correction state ─────────────────────────────
// Tracks how many raw chars have already been corrected for each source.
// key: 'cc' | 'audio'
let lastCorrectedRawPos = { cc: 0, audio: 0 };
let ccAutocorrectTimer = null;
let audioAutocorrectTimer = null;
let claimsAutoTimer = null;
let discAutoTimer = null;

// ── Init ─────────────────────────────────────────────────────
ccToggleBtn.innerHTML = ICON_PLAY;
audioToggleBtn.innerHTML = ICON_PLAY;

chrome.storage.local.get(
    ['openaiApiKey', 'geminiKey', 'transcriptLang', 'chunkSeconds', 'ccScript', 'ccActive', 'videoContext', 'claimsLimit'],
    (data) => {
        if (data.openaiApiKey) apiKeyInput.value = data.openaiApiKey;
        if (data.geminiKey) geminiKeyInput.value = data.geminiKey;
        if (data.transcriptLang) languageSelect.value = data.transcriptLang;
        if (data.ccScript) {
            ccScriptArea.value = data.ccScript;
            ccExtensionScript = data.ccScript;
        }
        if (data.videoContext) {
            settingsVideoContextArea.value = data.videoContext;
            verifContext.value = data.videoContext;
        }
        const s = parseInt(data.chunkSeconds, 10);
        if (s >= 3 && s <= 60) { chunkSecondsInput.value = s; chunkMs = s * 1000; }

        if (data.claimsLimit) {
            claimsLimitInput.value = data.claimsLimit;
        }

        // Restore CC recording state visually if it was active
        if (data.ccActive) {
            ccRecording = true;
            updateCCUI();
        }
    }
);

// Auto-fetch video context silently when the panel opens on a YouTube watch page
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.url?.includes('youtube.com/watch')) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim()
                    || document.title.replace(' - YouTube', '').trim();
                const channel = document.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim() || '';
                const desc = document.querySelector('#description-inline-expander, #description yt-formatted-string, #description')
                    ?.textContent?.trim().substring(0, 400) || '';
                return { title, channel, desc };
            }
        }).then(results => {
            const { title, channel, desc } = results[0].result;
            const parts = [];
            if (title) parts.push(`Título: ${title}`);
            if (channel) parts.push(`Canal: ${channel}`);
            if (desc) parts.push(`Descripción: ${desc}`);
            if (parts.length === 0) return;
            const ctx = parts.join('\n');
            settingsVideoContextArea.value = ctx;
            verifContext.value = ctx;
            chrome.storage.local.set({ videoContext: ctx });
        }).catch(() => { /* silently ignore */ });
    }
});

// ── Settings handled by tab system (panel-config) ───────────

saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const gkey = geminiKeyInput.value.trim();
    const lang = languageSelect.value;
    const sec = clampChunk();
    chrome.storage.local.set({ openaiApiKey: key, geminiKey: gkey, transcriptLang: lang, chunkSeconds: sec });
    chunkMs = sec * 1000;
    showToast('Configuración guardada');
});

languageSelect.addEventListener('change', () =>
    chrome.storage.local.set({ transcriptLang: languageSelect.value }));

chunkSecondsInput.addEventListener('change', () => {
    const s = clampChunk();
    chrome.storage.local.set({ chunkSeconds: s });
    chunkMs = s * 1000;
});

claimsLimitInput.addEventListener('change', () => {
    let v = parseInt(claimsLimitInput.value, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > 25) v = 25;
    claimsLimitInput.value = v;
    chrome.storage.local.set({ claimsLimit: v });
});

function clampChunk() {
    let v = parseInt(chunkSecondsInput.value, 10);
    if (isNaN(v) || v < 3) v = 3;
    if (v > 60) v = 60;
    chunkSecondsInput.value = v;
    return v;
}

function clampAutocorrectInterval(input) {
    let v = parseInt(input.value, 10);
    if (isNaN(v) || v < 10) v = 10;
    if (v > 60) v = 60;
    input.value = v;
    return v;
}

// ── Main tabs ────────────────────────────────────────────────
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(t => t.classList.remove('active'));
        mainPanels.forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
        btn.classList.add('active');
        const panel = document.getElementById(`panel-${btn.dataset.mode}`);
        panel.classList.remove('hidden');
        panel.classList.add('active');
    });
});

// ── Sub-tabs ──────────────────────────────────────────────────
document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const p = btn.dataset.panel;
        const s = btn.dataset.subtab;
        document.querySelectorAll(`.sub-tab-btn[data-panel="${p}"]`).forEach(t => t.classList.remove('active'));
        document.querySelectorAll(`#panel-${p} .sub-panel`).forEach(el => {
            el.classList.remove('active'); el.classList.add('hidden');
        });
        btn.classList.add('active');
        const target = document.getElementById(`subtab-${p}-${s}`);
        target.classList.remove('hidden');
        target.classList.add('active');
        if (p === 'cc') ccActiveSubTab = s;
        if (p === 'audio') audioActiveSubTab = s;
    });
});

// ══════════════════════════════════════════════════════════════
//  CC MODE
// ══════════════════════════════════════════════════════════════

ccToggleBtn.addEventListener('click', () => {
    ccRecording = !ccRecording;
    if (ccRecording) {
        // Content script ALWAYS starts fresh (fullScript = "").
        // Reset our tracker so new subtitles aren't blocked by old length comparison.
        ccExtensionScript = '';
    }
    chrome.storage.local.set({ ccActive: ccRecording });
    updateCCUI();
});

function updateCCUI() {
    ccToggleBtn.innerHTML = ccRecording ? ICON_PAUSE : ICON_PLAY;
    ccToggleBtn.classList.toggle('recording', ccRecording);
    ccStatusDot.classList.toggle('active', ccRecording);
    ccStatusText.textContent = ccRecording ? 'Grabando subtítulos...' : 'Pausado';
}

ccCopyBtn.addEventListener('click', () => {
    const txt = (ccActiveSubTab === 'corrected' ? ccCorrectedArea : ccScriptArea).value.trim();
    if (!txt) { showToast('No hay texto para copiar'); return; }
    navigator.clipboard.writeText(txt);
    showToast('Copiado al portapapeles');
});

ccClearBtn.addEventListener('click', () => {
    chrome.storage.local.set({ ccActive: false, ccScript: '', ccClearSignal: Date.now() });
    ccScriptArea.value = '';
    ccCorrectedArea.value = '';
    ccCorrectStatus.textContent = '';
    ccExtensionScript = '';       // reset tracker
    lastCorrectedRawPos.cc = 0;  // reset incremental correction position
    ccRecording = false;
    updateCCUI();
    showToast('Texto limpiado');
});

// FIX: append only the new portion to preserve user edits
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || changes.ccScript === undefined) return;
    const newScript = changes.ccScript.newValue || '';
    if (newScript.length > ccExtensionScript.length) {
        const addition = newScript.substring(ccExtensionScript.length).trim();
        if (addition) {
            const cur = ccScriptArea.value.trimEnd();
            ccScriptArea.value = cur + (cur ? ' ' : '') + addition;
            ccScriptArea.scrollTop = ccScriptArea.scrollHeight;
        }
    }
    ccExtensionScript = newScript;
});

ccCorrectBtn.addEventListener('click', () =>
    correctWithGPTIncremental('cc', ccScriptArea, ccCorrectedArea, ccCorrectStatus, ccCorrectBtn));

// ── Auto-correction for CC ────────────────────────────────────
ccAutocorrectToggle.addEventListener('change', () => {
    clearInterval(ccAutocorrectTimer);
    if (ccAutocorrectToggle.checked) {
        const ms = clampAutocorrectInterval(ccAutocorrectIntervalInput) * 1000;
        ccAutocorrectTimer = setInterval(() => {
            correctWithGPTIncremental('cc', ccScriptArea, ccCorrectedArea, ccCorrectStatus, ccCorrectBtn, true);
        }, ms);
        showToast(`Auto-corrección CC cada ${ccAutocorrectIntervalInput.value}s`);
    }
});

// ══════════════════════════════════════════════════════════════
//  AUDIO MODE (Whisper)
// ══════════════════════════════════════════════════════════════

audioToggleBtn.addEventListener('click', async () => {
    if (!audioRecording) await startAudioCapture();
    else await stopAudioCapture();
});

async function startAudioCapture() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        showToast('Guarda tu API Key de OpenAI → Configuración ⚙️');
        document.getElementById('settings-toggle-btn').click();
        return;
    }
    setAudioStatus('Solicitando permiso de captura...');
    try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_TAB_STREAM_ID' });
        if (res.error) { setAudioStatus('Error: ' + res.error); return; }

        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: res.streamId } },
            video: false
        });

        // 🔊 Route audio back to speakers
        audioContextRef = new AudioContext();
        audioContextRef.createMediaStreamSource(audioStream).connect(audioContextRef.destination);

        audioRecording = true;
        updateAudioUI();
        recordNextChunk(apiKey);
    } catch (err) {
        setAudioStatus('Error: ' + err.message);
    }
}

function recordNextChunk(apiKey) {
    if (!audioRecording || !audioStream) return;
    audioChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
    mediaRecorder = new MediaRecorder(audioStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0)
            await sendToWhisper(new Blob(audioChunks, { type: mimeType }), apiKey);
        if (audioRecording) recordNextChunk(apiKey);
    };
    mediaRecorder.start();
    chunkTimer = setTimeout(() => {
        if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    }, chunkMs);
}

async function sendToWhisper(blob, apiKey) {
    audioStatusDot.classList.remove('active');
    audioStatusDot.classList.add('transcribing');
    setAudioStatus('Transcribiendo...');

    const fd = new FormData();
    fd.append('file', blob, 'chunk.webm');
    fd.append('model', 'whisper-1');
    fd.append('language', languageSelect.value || 'es');

    try {
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: fd
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            setAudioStatus('Error: ' + (e?.error?.message || `HTTP ${res.status}`));
            return;
        }
        const text = ((await res.json()).text || '').trim();
        if (text) {
            audioFullScript += (audioFullScript ? ' ' : '') + text;
            // FIX: append only the new chunk, not the full script
            const cur = audioScriptArea.value.trimEnd();
            audioScriptArea.value = cur + (cur ? ' ' : '') + text;
            audioScriptArea.scrollTop = audioScriptArea.scrollHeight;
        }
    } catch (err) {
        setAudioStatus('Error de red: ' + err.message);
    } finally {
        audioStatusDot.classList.remove('transcribing');
        if (audioRecording) {
            audioStatusDot.classList.add('active');
            setAudioStatus(`Grabando... (cada ~${chunkSecondsInput.value}s)`);
        } else {
            updateAudioUI();
            setAudioStatus('Detenido');
        }
    }
}

async function stopAudioCapture() {
    audioRecording = false;
    clearTimeout(chunkTimer);
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null; }
    if (audioContextRef) { audioContextRef.close(); audioContextRef = null; }
    updateAudioUI();
    setAudioStatus('Detenido');
}

function updateAudioUI() {
    audioToggleBtn.innerHTML = audioRecording ? ICON_PAUSE : ICON_PLAY;
    audioToggleBtn.classList.toggle('recording', audioRecording);
    audioStatusDot.classList.toggle('active', audioRecording);
    if (audioRecording) setAudioStatus(`Grabando... (cada ~${chunkSecondsInput.value}s)`);
}

function setAudioStatus(msg) { audioStatusText.textContent = msg; }

audioCopyBtn.addEventListener('click', () => {
    const txt = (audioActiveSubTab === 'corrected' ? audioCorrectedArea : audioScriptArea).value.trim();
    if (!txt) { showToast('No hay texto para copiar'); return; }
    navigator.clipboard.writeText(txt);
    showToast('Copiado al portapapeles');
});

audioClearBtn.addEventListener('click', () => {
    audioFullScript = '';
    audioScriptArea.value = '';
    audioCorrectedArea.value = '';
    audioCorrectStatus.textContent = '';
    lastCorrectedRawPos.audio = 0;  // reset incremental correction position
    showToast('Texto limpiado');
});

audioCorrectBtn.addEventListener('click', () =>
    correctWithGPTIncremental('audio', audioScriptArea, audioCorrectedArea, audioCorrectStatus, audioCorrectBtn));

// ── Auto-correction for Audio ─────────────────────────────────
audioAutocorrectToggle.addEventListener('change', () => {
    clearInterval(audioAutocorrectTimer);
    if (audioAutocorrectToggle.checked) {
        const ms = clampAutocorrectInterval(audioAutocorrectIntervalInput) * 1000;
        audioAutocorrectTimer = setInterval(() => {
            correctWithGPTIncremental('audio', audioScriptArea, audioCorrectedArea, audioCorrectStatus, audioCorrectBtn, true);
        }, ms);
        showToast(`Auto-corrección Whisper cada ${audioAutocorrectIntervalInput.value}s`);
    }
});

// ══════════════════════════════════════════════════════════════
//  INCREMENTAL GPT CORRECTION (shared)
// ══════════════════════════════════════════════════════════════

// Merges corrected text by overlapping the last N words at the boundary.
// This prevents duplicates while also healing any split sentences.
function mergeWithOverlap(existingCorrected, newCorrectedChunk, overlapWords = 100) {
    if (!existingCorrected) return newCorrectedChunk;
    if (!newCorrectedChunk) return existingCorrected;

    // Use word arrays ONLY for overlap detection — never for reconstruction.
    const existingWords = existingCorrected.trim().split(/\s+/);
    const newWords = newCorrectedChunk.trim().split(/\s+/);

    // Find the longest suffix of existing that matches a prefix of the new chunk.
    let overlapCount = 0;
    const maxCheck = Math.min(overlapWords, existingWords.length, newWords.length);
    for (let testLen = 1; testLen <= maxCheck; testLen++) {
        const suffix = existingWords.slice(-testLen).join(' ').toLowerCase();
        const prefix = newWords.slice(0, testLen).join(' ').toLowerCase();
        if (suffix === prefix) overlapCount = testLen;
    }

    // Surgically remove the last `overlapCount` words from the END of the raw
    // string — this preserves every \n and paragraph break in the body.
    let base = existingCorrected.trimEnd();
    for (let i = 0; i < overlapCount; i++) {
        // Remove the last non-whitespace token (word) from the string tail.
        base = base.replace(/\s*\S+\s*$/, '');
    }

    // Always join with a paragraph break so GPT's internal \n\n are kept.
    return base.trimEnd() + (base.trimEnd() ? '\n\n' : '') + newCorrectedChunk.trim();
}

// correctWithGPTIncremental: only sends raw text that hasn't been corrected yet.
// Then merges the result into the corrected area.
async function correctWithGPTIncremental(sourceKey, rawArea, targetArea, statusEl, btnEl, silent = false) {
    const fullRaw = rawArea.value;
    const from = lastCorrectedRawPos[sourceKey] || 0;
    const newRaw = fullRaw.substring(from).trim();

    if (!newRaw) {
        if (!silent) showToast('No hay texto nuevo para corregir');
        return;
    }
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) { showToast('Necesitas una API Key → Configuración ⚙️'); document.getElementById('settings-toggle-btn').click(); return; }

    btnEl.disabled = true;
    statusEl.textContent = 'Corrigiendo...';

    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system', content: `Eres un editor profesional de transcripciones. Tu tarea:
1. Corrige errores de transcripción obvios y errores de pronunciación.
2. Añade puntuación correcta.
3. Elimina repeticiones y muletillas excesivas.
4. Organiza en párrafos coherentes.
5. No agregues información nueva ni cambies el significado.
${settingsVideoContextArea.value.trim() ? `Contexto del contenido: ${settingsVideoContextArea.value.trim()}\n` : ''}Devuelve únicamente el texto corregido, sin comentarios.`
                    },
                    { role: 'user', content: newRaw }
                ],
                temperature: 0.3
            })
        });
        const data = await res.json();
        if (!res.ok) { statusEl.textContent = 'Error: ' + (data?.error?.message || res.status); return; }
        const correctedChunk = data.choices?.[0]?.message?.content?.trim() || '';

        if (correctedChunk) {
            // Merge with existing corrected text using 7-word overlap
            const merged = mergeWithOverlap(targetArea.value, correctedChunk, 100);
            targetArea.value = merged;
            targetArea.scrollTop = targetArea.scrollHeight;

            // Advance the raw pointer: we snapshot the raw length at time of request
            lastCorrectedRawPos[sourceKey] = from + newRaw.length;
        }

        statusEl.textContent = '✓ Listo';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (err) {
        statusEl.textContent = 'Error de red: ' + err.message;
    } finally {
        btnEl.disabled = false;
    }
}

// Legacy full-text correction (kept for potential future use)
async function correctWithGPT(rawText, targetArea, statusEl, btnEl) {
    if (!rawText) { showToast('No hay texto para corregir'); return; }
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) { showToast('Necesitas una API Key → Configuración ⚙️'); document.getElementById('settings-toggle-btn').click(); return; }

    btnEl.disabled = true;
    statusEl.textContent = 'Corrigiendo...';
    targetArea.value = '';

    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system', content: `Eres un editor profesional de transcripciones. Tu tarea:
1. Corrige errores de transcripción obvios.
2. Añade puntuación correcta.
3. Elimina repeticiones y muletillas excesivas.
4. Organiza en párrafos coherentes.
5. No agregues información nueva ni cambies el significado.
Devuelve únicamente el texto corregido, sin comentarios.` },
                    { role: 'user', content: rawText }
                ],
                temperature: 0.3
            })
        });
        const data = await res.json();
        if (!res.ok) { statusEl.textContent = 'Error: ' + (data?.error?.message || res.status); return; }
        targetArea.value = data.choices?.[0]?.message?.content?.trim() || '';
        statusEl.textContent = '✓ Listo';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (err) {
        statusEl.textContent = 'Error de red: ' + err.message;
    } finally {
        btnEl.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════
//  VERIFICADOR DE DECLARACIONES
// ══════════════════════════════════════════════════════════════

function getSourceText(sourceId) {
    switch (sourceId) {
        case 'cc-corrected': return ccCorrectedArea.value;
        case 'cc-raw': return ccScriptArea.value;
        case 'audio-corrected': return audioCorrectedArea.value;
        case 'audio-raw': return audioScriptArea.value;
        default: return '';
    }
}

extractClaimsBtn.addEventListener('click', async () => {
    const sourceId = verifSource.value;
    const fullText = getSourceText(sourceId);
    const from = lastScannedPos[sourceId] || 0;
    const newText = fullText.substring(from).trim();

    if (!fullText.trim()) { claimsStatus.textContent = 'El texto fuente está vacío.'; return; }
    if (!newText) { showToast('No hay texto nuevo desde la última búsqueda'); return; }

    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) { showToast('Necesitas una API Key → Configuración ⚙️'); document.getElementById('settings-toggle-btn').click(); return; }

    const curLimit = parseInt(claimsLimitInput.value, 10) || 8;

    extractClaimsBtn.disabled = true;
    claimsStatus.textContent = 'Extrayendo declaraciones verificables...';

    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Eres un asistente experto en análisis de discurso y extracción de afirmaciones.
Tu trabajo es leer el texto y extraer CUALQUIER frase, idea o declaración que afirme algo sobre la realidad, no tomes declaraciones que sean opiniones sobre la realidad o apreciaciones propias.

INSTRUCCIONES CLAVE:
1. Extrae TODO aquello que suene a una afirmación, dato, anécdota, evento, o acusación (ej. "nuestro país está en ruinas", "la política X fue un éxito", "ellos robaron el dinero"). NO importa si carece de números o cifras exactas.
2. Si alguien afirma algo sobre el estado de las cosas, extráelo. Las afirmaciones cualitativas (sin números) también ameritan fact-checking o análisis de discurso.
3. Ignora únicamente: saludos, despedidas, y preguntas abiertas.
4. Contexto del video: "${verifContext.value.trim()}"
5. Devuelve UNICAMENTE un objeto JSON con este formato exacto: {"claims": ["afirmación 1", "afirmación 2", ...]}.
6. Máximo ${curLimit} declaraciones. Si el texto es muy corto o puramente un saludo, devuelve {"claims": []}.`
                    },
                    { role: 'user', content: newText }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.1
            })
        });

        const data = await res.json();
        if (!res.ok) { claimsStatus.textContent = 'Error: ' + (data?.error?.message || res.status); return; }

        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        const newClaims = (parsed.claims || []).map(c => ({ text: c, verdict: null, reasoning: '', searchUrl: '', sources: [] }));

        if (newClaims.length === 0) {
            claimsStatus.textContent = 'No se encontraron declaraciones verificables en el texto nuevo.';
            // Don't advance lastScannedPos if zero found, so user can try again if they add more text
            return;
        }

        // Append to existing and advance position
        claims = claims.concat(newClaims);
        lastScannedPos[sourceId] = fullText.length;

        claimsStatus.textContent = `${claims.length} declaración${claims.length > 1 ? 'es' : ''} en total(+${newClaims.length} nuevas).Edita y verifica.`;
        renderClaims();

        if (claimsAutoverifyToggle && claimsAutoverifyToggle.checked) {
            setTimeout(() => verifyAllBtn.click(), 100);
        }

    } catch (err) {
        claimsStatus.textContent = 'Error: ' + err.message;
    } finally {
        extractClaimsBtn.disabled = false;
    }
});

// ── Auto-claims extraction ─────────────────────────────────────────
claimsAutoToggle.addEventListener('change', () => {
    clearInterval(claimsAutoTimer);
    if (claimsAutoToggle.checked) {
        let v = parseInt(claimsAutoIntervalInput.value, 10);
        if (isNaN(v) || v < 10) v = 10;
        if (v > 60) v = 60;
        claimsAutoIntervalInput.value = v;
        claimsAutoStatus.textContent = `Cada ${v}s`;
        claimsAutoTimer = setInterval(() => {
            extractClaimsBtn.click();
        }, v * 1000);
        showToast(`Auto - búsqueda de declaraciones cada ${v}s`);
    } else {
        claimsAutoStatus.textContent = '';
    }
});

// Reset scanned position when source changes
verifSource.addEventListener('change', () => { /* keep positions; user may switch back */ });

function renderClaims() {
    claimsList.innerHTML = '';
    claims.forEach((claim, i) => {
        const card = document.createElement('div');
        card.className = 'claim-card';
        card.dataset.index = i;
        card.innerHTML = buildClaimCard(claim, i);
        claimsList.appendChild(card);
        card.querySelector('.verify-btn').addEventListener('click', () => verifyClaim(i));
        card.querySelector('.delete-btn').addEventListener('click', () => deleteClaim(i));
    });
}

function deleteClaim(index) {
    claims.splice(index, 1);
    renderClaims();
    claimsStatus.textContent = claims.length
        ? `${claims.length} declaración${claims.length > 1 ? 'es' : ''}.Edita y verifica.`
        : 'No hay más declaraciones.';
}

function buildClaimCard(claim, i) {
    const VERDICTS = {
        'VERDADERO': { cls: 'verdict-true', label: '✓ Verdadera' },
        'MAYORMENTE_VERDADERO': { cls: 'verdict-mostly-true', label: '◐ Mayormente cierta' },
        'MAYORMENTE_FALSO': { cls: 'verdict-mostly-false', label: '◑ Mayormente falsa' },
        'FALSO': { cls: 'verdict-false', label: '✕ Falsa' },
        'NO_DETERMINADO': { cls: 'verdict-unknown-result', label: 'Desconocido' },
    };
    const v = VERDICTS[claim.verdict] || { cls: 'verdict-pending', label: 'Sin verificar' };

    const reasoningHtml = claim.reasoning
        ? `<div class="claim-reasoning">${claim.reasoning}</div>` : '';

    const sourcesHtml = (claim.sources || []).length
        ? `<div class="claim-sources">${claim.sources.map(s =>
            `<a class="claim-source-link" href="${s.uri}" target="_blank" title="${s.title}">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  ${s.title.length > 55 ? s.title.substring(0, 55) + '…' : s.title}
                </a>`
        ).join('')
        }</div>` : '';

    const searchHtml = claim.searchUrl
        ? `<a class="claim-search-link" href="${claim.searchUrl}" target="_blank">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        Buscar en Google
      </a>` : '';

    return `
      <div class="claim-header">
      <span class="claim-num">#${i + 1}</span>
      <span class="verdict-badge ${v.cls}">${v.label}</span>
      <div class="claim-actions">
        <button class="btn btn-sm verify-btn">Verificar</button>
        <button class="icon-btn delete-btn" title="Eliminar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
            <textarea class="claim-input" rows="3" data-index="${i}">${claim.text}</textarea>
    ${reasoningHtml}
    ${sourcesHtml}
        <div class="claim-footer">${searchHtml}</div>
        `;
}

async function verifyClaim(index) {
    const card = claimsList.querySelector(`.claim-card[data-index="${index}"]`);
    const textarea = card.querySelector('.claim-input');
    const btn = card.querySelector('.verify-btn');

    claims[index].text = textarea.value.trim();
    const claimText = claims[index].text;
    if (!claimText) { showToast('La declaración está vacía'); return; }

    const geminiKey = geminiKeyInput.value.trim();
    const openaiKey = apiKeyInput.value.trim();

    if (!geminiKey && !openaiKey) {
        showToast('Necesitas al menos una API Key → Configuración');
        document.getElementById('settings-toggle-btn').click();
        return;
    }

    btn.disabled = true;
    btn.textContent = '...';

    try {
        if (geminiKey) {
            await verifyWithGemini(index, claimText, geminiKey);
        } else {
            await verifyWithGPT(index, claimText, openaiKey);
        }
        card.innerHTML = buildClaimCard(claims[index], index);
        card.querySelector('.verify-btn').addEventListener('click', () => verifyClaim(index));
        card.querySelector('.delete-btn').addEventListener('click', () => deleteClaim(index));
    } catch (err) {
        showToast('Error de red: ' + err.message);
    }
}

// Gemini 2.5 Flash + Google Search grounding — búsqueda web en tiempo real
async function verifyWithGemini(index, claimText, apiKey) {
    const systemInstruction =
        `Eres el motor principal de factualidad de Fact-Check Vivo, una herramienta de análisis y verificación en tiempo real de videos de YouTube.
Tu tarea es analizar la declaración dada, usando herramientas de búsqueda en vivo.

CONTEXTO DEL VIDEO DE ORIGEN (usa esta información para acotar tus búsquedas si la declaración es ambigua):
"${verifContext.value.trim() || 'Sin contexto disponible'}"

INSTRUCCIONES DE FACTUALIDAD:
1. Las figuras retóricas o exageraciones obvias pueden ser "FALSO" o "MAYORMENTE_FALSO" si se usan para informar mal, pero valora el contexto.
2. Si una cifra es conceptualmente correcta pero difiere ligeramente (ej. 3.9M vs 4M), califícala como "MAYORMENTE_VERDADERO".
3. Busca evidencia sólida.

Responde EXCLUSIVAMENTE con este JSON (sin formato Markdown adicional):
{ "veredicto": "VERDADERO|MAYORMENTE_VERDADERO|MAYORMENTE_FALSO|FALSO|NO_DETERMINADO", "razonamiento": "Justificación de 2-3 oraciones citando datos exactos y fuentes concretas.", "busqueda": "query de búsqueda que utilizaste" }
REGLA: Usa NO_DETERMINADO SOLO si es verdaderamente imposible determinar la veracidad, incluso después de buscar.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: `Verifica esta declaración: "${claimText}"` }] }],
            tools: [{ google_search: {} }]
        })
    });

    const data = await res.json();
    if (!res.ok) { showToast('Gemini error: ' + (data?.error?.message || res.status)); return; }

    const candidate = data.candidates?.[0];
    const raw = candidate?.content?.parts?.[0]?.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let result = {};
    try { result = jsonMatch ? JSON.parse(jsonMatch[0]) : {}; } catch (_) { }

    // Extract grounding sources from Gemini's groundingMetadata
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    claims[index].sources = chunks
        .filter(c => c.web?.uri)
        .map(c => ({ uri: c.web.uri, title: c.web.title || c.web.uri }))
        .slice(0, 5);

    claims[index].verdict = result.veredicto || 'NO_DETERMINADO';
    claims[index].reasoning = (result.razonamiento || '') + ' 🌐 Verificado con Google Search.';
    claims[index].searchUrl = result.busqueda
        ? `https://www.google.com/search?q=${encodeURIComponent(result.busqueda)}` : '';
}

// GPT-4o fallback — solo conocimiento hasta 2024, sin fuentes web
async function verifyWithGPT(index, claimText, apiKey) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `Eres el motor principal de factualidad de Fact-Check Vivo, una herramienta de análisis y verificación de YouTube.
Tu tarea es analizar la declaración dada usando tu base de datos y conocimiento previo.

CONTEXTO DEL VIDEO DE ORIGEN:
"${verifContext.value.trim() || 'Sin contexto disponible'}"

Responde EXCLUSIVAMENTE con este objeto JSON:
{"veredicto":"VERDADERO|MAYORMENTE_VERDADERO|MAYORMENTE_FALSO|FALSO|NO_DETERMINADO","razonamiento":"Justificación de 2-3 oraciones detallando qué evidencias históricas, conceptuales o factuales apoyan tu veredicto.","busqueda":"término clave sugerido para Google"}
REGLA: Prefiere MAYORMENTE_VERDADERO o MAYORMENTE_FALSO. Usa NO_DETERMINADO solo si necesitas datos en tiempo real de los que careces. Si la afirmación contradice el consenso histórico o científico comprobado, es FALSO.`
                },
                { role: 'user', content: `Declaración: "${claimText}"` }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1
        })
    });

    const data = await res.json();
    if (!res.ok) { showToast('Error: ' + (data?.error?.message || res.status)); return; }

    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    claims[index].verdict = result.veredicto || 'NO_DETERMINADO';
    claims[index].reasoning = (result.razonamiento || '') + ' ⚠️ Sin búsqueda web — datos hasta 2024.';
    claims[index].sources = [];  // GPT doesn't provide real sources
    claims[index].searchUrl = result.busqueda
        ? `https://www.google.com/search?q=${encodeURIComponent(result.busqueda)}` : '';
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
    clearTimeout(toastTimeout);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// 
//  DISCOURSE ANALYSIS MODULE
// 

if (clearAllChannelsBtn) {
    clearAllChannelsBtn.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres borrar TODAS las transcripciones, contexto y declaraciones?')) {
            ccScriptArea.value = '';
            ccExtensionScript = '';
            ccCorrectedArea.value = '';
            audioScriptArea.value = '';
            audioCorrectedArea.value = '';
            chrome.storage.local.set({ ccScript: '' });
            verifContext.value = '';
            settingsVideoContextArea.value = '';
            chrome.storage.local.set({ videoContext: '' });

            claims = [];
            lastScannedPos = {};
            claimsList.innerHTML = '';
            claimsStatus.textContent = '';
            lastCorrectedRawPos = { cc: 0, audio: 0 };

            showToast('Todos los datos han sido reiniciados.');
        }
    });
}

if (clearDiscBtn) {
    clearDiscBtn.addEventListener('click', () => {
        discResults.classList.add('hidden');
        discStatus.textContent = 'Análisis borrado.';
        showToast('Análisis borrado');
    });
}

const discSource = document.getElementById('disc-source');
const analyzeDiscBtn = document.getElementById('analyze-disc-btn');
const discStatus = document.getElementById('disc-status');
const discResults = document.getElementById('disc-results');
const discToneBadge = document.getElementById('disc-tone-badge');
const discToneFill = document.getElementById('disc-tone-fill');
const discToneDesc = document.getElementById('disc-tone-desc');
const discEmotionsList = document.getElementById('disc-emotions-list');
const discFalaciasList = document.getElementById('disc-falacias-list');
const discFalaciasCount = document.getElementById('disc-falacias-count');
const discEufList = document.getElementById('disc-euf-list');
const discPolBadge = document.getElementById('disc-pol-badge');
const discPolDesc = document.getElementById('disc-pol-desc');
const discPolMarkers = document.getElementById('disc-pol-markers');
const discKeywords = document.getElementById('disc-keywords-list');
const discFrameBadge = document.getElementById('disc-frame-badge');
const discFrameDesc = document.getElementById('disc-frame-desc');
const discFrameSecondary = document.getElementById('disc-frame-secondary');

analyzeDiscBtn.addEventListener('click', async () => {
    const text = getSourceText(discSource.value).trim();
    if (!text) { discStatus.textContent = 'El texto fuente esta vacio.'; return; }
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) { showToast('Necesitas tu API Key de OpenAI → Configuración ⚙️'); document.getElementById('settings-toggle-btn').click(); return; }
    analyzeDiscBtn.disabled = true;
    discStatus.textContent = 'Analizando discurso con IA...';
    discResults.classList.add('hidden');
    const PROMPT = 'Eres un experto en analisis critico del discurso, linguistica forense y retorica politica. Tu trabajo es analizar textos con precision academica, sin suavizar hallazgos. Debes ser directo, especifico y citar palabras reales del texto. Devuelve UNICAMENTE un objeto JSON (sin bloques de codigo, sin explicaciones fuera del JSON) con este esquema:\n\n{"tono":{"valor":"positivo|negativo|neutral|mixto","intensidad":"alta|media|baja","positividad":0,"descripcion":"Describe en 2-3 oraciones el tono predominante citando fragmentos literales del texto que lo evidencian. No seas vago."},"emociones":[{"nombre":"...","porcentaje":0,"evidencia":"cita literal del texto que genera esta emocion"}],"falacias":[{"tipo":"...","cita_textual":"copia el fragmento exacto del texto","explicacion":"explica por que es una falacia"}],"eufemismos_disfemismos":[{"termino":"palabra o frase exacta del texto","tipo":"eufemismo|disfemismo","efecto":"que realidad oculta o agrava"}],"polarizacion":{"nivel":"ninguna|baja|media|alta","descripcion":"2-3 oraciones explicando la dinamica nosotros/ellos o ingroup/outgroup. Cita las palabras de alta carga emocional (insultos, deshumanizacion, amenazas). Si hay palabras como parasitos, delincuentes, enemigos, invasores, traidores u otras con carga negativa intensa, DEBES mencionarlas.","marcadores":["frases o palabras exactas del texto que generan polarizacion"],"palabras_carga_alta":["lista de palabras emotivamente cargadas encontradas"]},"palabras_clave":[{"palabra":"...","peso":1,"carga":"neutral|positiva|negativa"}],"encuadre":{"marco_principal":"nombre del marco","descripcion":"2-4 oraciones explicando que narrativa construye el texto: que problema define, quien es el culpable, quien es la victima, que solucion propone. Cita fragmentos.","estrategias_narrativas":["lista de estrategias retorico-narrativas usadas: victimizacion, heroizacion, demonizacion, catastrofismo, etc."],"marcos_secundarios":["otros marcos presentes"]}}\n\nREGLAS CRITICAS:\n- positividad 0-100: 0=extremadamente negativo, 50=neutral, 100=muy positivo\n- emociones: incluye TODAS las negativas detectables (miedo, rabia, indignacion, asco, ansiedad, resentimiento, desprecio). Maximo 6. No pongas alegria si no hay evidencia clara.\n- falacias: sospecha de ellas activamente. Incluye generalizaciones indebidas, falsas equivalencias, ad hominem, hombre de paja, pendiente resbaladiza, apelacion al miedo, ad populum. Sé SENSIBLE, incluye falacias debiles si las hay.\n- eufemismos/disfemismos: maximo 8. Un disfemismo es cualquier palabra que degrada, insulta o deshumaniza. Busca activamente lenguaje agresivo o eufemistico.\n- palabras_clave: maximo 14, incluye palabras con carga emocional alta aunque no sean "tematicas"\n- encuadre: profundiza en la narrativa. Identifica mecanismos de construccion de enemigo, victima y heroe.\n\nTEXTO A ANALIZAR:\n"""\n' + text.substring(0, 5000) + '\n"""';
    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: PROMPT }], response_format: { type: 'json_object' }, temperature: 0.4 })
        });
        const data = await res.json();
        if (!res.ok) { discStatus.textContent = 'Error: ' + (data?.error?.message || res.status); return; }
        const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        renderDiscourseResults(result);
        discStatus.textContent = 'Analisis completado.';
        discResults.classList.remove('hidden');
    } catch (err) {
        discStatus.textContent = 'Error: ' + err.message;
    } finally {
        analyzeDiscBtn.disabled = false;
    }
});

// ── Auto-discourse analysis ────────────────────────────────────────────
discAutoToggle.addEventListener('change', () => {
    clearInterval(discAutoTimer);
    if (discAutoToggle.checked) {
        let v = parseInt(discAutoIntervalInput.value, 10);
        if (isNaN(v) || v < 30) v = 30;
        if (v > 300) v = 300;
        discAutoIntervalInput.value = v;
        discAutoStatus.textContent = `Cada ${v}s`;
        discAutoTimer = setInterval(() => {
            analyzeDiscBtn.click();
        }, v * 1000);
        showToast(`Auto-análisis de discurso cada ${v}s`);
    } else {
        discAutoStatus.textContent = '';
    }
});

function renderDiscourseResults(d) {
    renderTone(d.tono || {});
    renderEmotions(d.emociones || []);
    renderFallacies(d.falacias || []);
    renderEuphemisms(d.eufemismos_disfemismos || []);
    renderPolarization(d.polarizacion || {});
    renderKeywords(d.palabras_clave || []);
    renderFraming(d.encuadre || {});
}

function renderTone(tono) {
    const val = (tono.valor || 'neutral').toLowerCase();
    const labels = { positivo: 'Positivo', negativo: 'Negativo', neutral: 'Neutral', mixto: 'Mixto' };
    discToneBadge.textContent = labels[val] || val;
    discToneBadge.className = 'disc-tone-badge ' + val;
    const pct = typeof tono.positividad === 'number' ? tono.positividad : 50;
    discToneFill.style.width = pct + '%';
    discToneDesc.textContent = tono.descripcion || '';
}

function renderEmotions(emociones) {
    const COLORS = { 'Miedo': '#7c3aed', 'Rabia': '#dc2626', 'Tristeza': '#2563eb', 'Alegria': '#059669', 'Alegría': '#059669', 'Sorpresa': '#d97706', 'Asco': '#65a30d', 'Ansiedad': '#9333ea', 'Indignacion': '#b91c1c', 'Indignación': '#b91c1c', 'Resentimiento': '#be123c', 'Desprecio': '#9f1239', 'Esperanza': '#0891b2' };
    discEmotionsList.innerHTML = emociones.length ? emociones.map(e => {
        const color = COLORS[e.nombre] || '#64748b';
        const evidencia = e.evidencia ? '<div class="disc-fallacy-quote" style="margin-top:3px">' + e.evidencia + '</div>' : '';
        return '<div style="display:flex;flex-direction:column;gap:2px"><div class="disc-emotion-row"><span class="disc-emotion-name">' + e.nombre + '</span><div class="disc-emotion-bar-wrap"><div class="disc-emotion-fill" style="width:' + e.porcentaje + '%;background:' + color + '"></div></div><span class="disc-emotion-pct">' + e.porcentaje + '%</span></div>' + evidencia + '</div>';
    }).join('') : '<span class="disc-none-msg">No se detectaron emociones predominantes.</span>';
}

function renderFallacies(falacias) {
    if (falacias.length) { discFalaciasCount.textContent = falacias.length; discFalaciasCount.style.display = 'inline'; } else { discFalaciasCount.style.display = 'none'; }
    discFalaciasList.innerHTML = falacias.length ? falacias.map(f =>
        '<div class="disc-fallacy-item"><span class="disc-fallacy-type">' + f.tipo + '</span>' + (f.cita_textual ? '<span class="disc-fallacy-quote">"' + f.cita_textual + '"</span>' : '') + '<span class="disc-fallacy-exp">' + f.explicacion + '</span></div>'
    ).join('') : '<span class="disc-none-msg">No se detectaron falacias logicas.</span>';
}

function renderEuphemisms(items) {
    discEufList.innerHTML = items.length ? items.map(e =>
        '<span class="disc-chip ' + e.tipo + '" title="' + e.efecto + '">' + (e.tipo === 'eufemismo' ? 'E' : 'D') + ' ' + e.termino + '</span>'
    ).join('') : '<span class="disc-none-msg">No se detectaron eufemismos ni disfemismos.</span>';
}

function renderPolarization(pol) {
    const nivel = (pol.nivel || 'ninguna').toLowerCase();
    const labels = { ninguna: 'Ninguna', baja: 'Baja', media: 'Media', alta: 'Alta' };
    discPolBadge.textContent = labels[nivel] || nivel;
    discPolBadge.className = 'disc-pol-badge ' + nivel;
    discPolDesc.textContent = pol.descripcion || '';

    let chips = (pol.marcadores || []).map(m => '<span class="disc-chip marker">' + m + '</span>').join('');
    if ((pol.palabras_carga_alta || []).length) {
        chips += '<div style="width:100%;margin-top:4px;font-size:10px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Carga emocional alta</div>';
        chips += (pol.palabras_carga_alta || []).map(p => '<span class="disc-chip disfemismo">' + p + '</span>').join('');
    }
    discPolMarkers.innerHTML = chips || '';
}

function renderKeywords(keywords) {
    discKeywords.innerHTML = keywords.length ? keywords.map(k => {
        const cargaClass = k.carga === 'negativa' ? 'style="background:rgba(220,38,38,0.08);color:#b91c1c;border-color:rgba(220,38,38,0.2)"' : k.carga === 'positiva' ? 'style="background:rgba(5,150,105,0.08);color:#065f46;border-color:rgba(5,150,105,0.2)"' : '';
        return '<span class="disc-keyword disc-kw-' + Math.min(10, Math.max(1, k.peso)) + '" ' + cargaClass + '>' + k.palabra + '</span>';
    }).join('') : '<span class="disc-none-msg">-</span>';
}

function renderFraming(enc) {
    discFrameBadge.textContent = enc.marco_principal || '-';
    discFrameDesc.textContent = enc.descripcion || '';

    let secondary = (enc.marcos_secundarios || []).map(m => '<span class="disc-chip secondary">' + m + '</span>').join('');
    if ((enc.estrategias_narrativas || []).length) {
        secondary += '<div style="width:100%;margin-top:4px;font-size:10px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Estrategias narrativas</div>';
        secondary += (enc.estrategias_narrativas || []).map(s => '<span class="disc-chip marker">' + s + '</span>').join('');
    }
    discFrameSecondary.innerHTML = secondary;
}
