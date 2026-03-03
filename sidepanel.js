// ============================================================
//  EXTRACTOR DE GUION — Side Panel v4
//  Fix: CC append logic with ccExtensionScript initialized from storage
//  New: Verificador de Declaraciones (GPT-4o fact-checker)
// ============================================================

const ICON_PLAY = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const ICON_PAUSE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

// ── DOM ──────────────────────────────────────────────────────
const settingsToggleBtn = document.getElementById('settings-toggle-btn');
const settingsPanel = document.getElementById('settings-panel');
const apiKeyInput = document.getElementById('api-key-input');
const perplexityKeyInput = document.getElementById('gemini-key-input');
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
const autoContextBtn = document.getElementById('auto-context-btn');
const claimsStatus = document.getElementById('claims-status');
const claimsList = document.getElementById('claims-list');

const toast = document.getElementById('toast');
const descBanner = document.getElementById('desc-banner');
const descCloseBtn = document.getElementById('desc-close-btn');

// ── Description banner ───────────────────────────────────────
if (localStorage.getItem('descBannerClosed')) descBanner.classList.add('hidden');
descCloseBtn.addEventListener('click', () => {
    descBanner.classList.add('hidden');
    localStorage.setItem('descBannerClosed', '1');
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




// ── Auto-fill context from YouTube page ─────────────────────
autoContextBtn.addEventListener('click', async () => {
    autoContextBtn.disabled = true;
    autoContextBtn.textContent = '⏳';

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

        verifContext.value = parts.join('\n');
        showToast('Contexto actualizado con la info del video ✓');

    } catch (err) {
        showToast('Error: ' + err.message);
    } finally {
        autoContextBtn.disabled = false;
        autoContextBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg> Auto-llenar`;
    }
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

// ── Init ─────────────────────────────────────────────────────
ccToggleBtn.innerHTML = ICON_PLAY;
audioToggleBtn.innerHTML = ICON_PLAY;

chrome.storage.local.get(
    ['openaiApiKey', 'geminiKey', 'transcriptLang', 'chunkSeconds', 'ccScript'],
    (data) => {
        if (data.openaiApiKey) apiKeyInput.value = data.openaiApiKey;
        if (data.geminiKey) perplexityKeyInput.value = data.geminiKey;
        if (data.transcriptLang) languageSelect.value = data.transcriptLang;
        if (data.ccScript) {
            ccScriptArea.value = data.ccScript;
            ccExtensionScript = data.ccScript;
        }
        const s = parseInt(data.chunkSeconds, 10);
        if (s >= 3 && s <= 20) { chunkSecondsInput.value = s; chunkMs = s * 1000; }
    }
);

// ── Settings ─────────────────────────────────────────────────
settingsToggleBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));

saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const pkey = perplexityKeyInput.value.trim();
    const lang = languageSelect.value;
    const sec = clampChunk();
    chrome.storage.local.set({ openaiApiKey: key, geminiKey: pkey, transcriptLang: lang, chunkSeconds: sec });
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

function clampChunk() {
    let v = parseInt(chunkSecondsInput.value, 10);
    if (isNaN(v) || v < 3) v = 3;
    if (v > 20) v = 20;
    chunkSecondsInput.value = v;
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
    correctWithGPT(ccScriptArea.value.trim(), ccCorrectedArea, ccCorrectStatus, ccCorrectBtn));

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
        showToast('Guarda tu API Key de OpenAI en ⚙ Configuración');
        settingsPanel.classList.remove('hidden');
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
    showToast('Texto limpiado');
});

audioCorrectBtn.addEventListener('click', () =>
    correctWithGPT(audioScriptArea.value.trim(), audioCorrectedArea, audioCorrectStatus, audioCorrectBtn));

// ══════════════════════════════════════════════════════════════
//  GPT CORRECTION (shared)
// ══════════════════════════════════════════════════════════════

async function correctWithGPT(rawText, targetArea, statusEl, btnEl) {
    if (!rawText) { showToast('No hay texto para corregir'); return; }
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) { showToast('Necesitas una API Key en ⚙'); settingsPanel.classList.remove('hidden'); return; }

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
    if (!apiKey) { showToast('Necesitas una API Key en ⚙'); settingsPanel.classList.remove('hidden'); return; }

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
                        content: `Extrae declaraciones verificables del texto. Una declaración verificable es una afirmación concreta sobre hechos, datos, cifras o eventos.
NO incluyas opiniones, intenciones, preguntas ni afirmaciones vagas.
${verifContext.value.trim() ? `Contexto del documento: ${verifContext.value.trim()}\n` : ''}Responde ÚNICAMENTE con un objeto JSON: {"claims": ["declaración 1", "declaración 2", ...]}
Máximo 10 declaraciones por llamada.`
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
            claimsStatus.textContent = 'No se encontraron declaraciones nuevas en el texto.';
            lastScannedPos[sourceId] = fullText.length;  // advance anyway
            return;
        }

        // Append to existing and advance position
        claims = claims.concat(newClaims);
        lastScannedPos[sourceId] = fullText.length;

        claimsStatus.textContent = `${claims.length} declaración${claims.length > 1 ? 'es' : ''} en total (+${newClaims.length} nuevas). Edita y verifica.`;
        renderClaims();

    } catch (err) {
        claimsStatus.textContent = 'Error: ' + err.message;
    } finally {
        extractClaimsBtn.disabled = false;
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
        ? `${claims.length} declaración${claims.length > 1 ? 'es' : ''}. Edita y verifica.`
        : 'No hay más declaraciones.';
}

function buildClaimCard(claim, i) {
    const VERDICTS = {
        'VERDADERO': { cls: 'verdict-true', label: '✓ Verdadera' },
        'MAYORMENTE_VERDADERO': { cls: 'verdict-mostly-true', label: '◐ Mayormente cierta' },
        'MAYORMENTE_FALSO': { cls: 'verdict-mostly-false', label: '◑ Mayormente falsa' },
        'FALSO': { cls: 'verdict-false', label: '✕ Falsa' },
        'NO_DETERMINADO': { cls: 'verdict-unknown-result', label: '? No determinada' },
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
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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

    const perplexityKey = perplexityKeyInput.value.trim();
    const openaiKey = apiKeyInput.value.trim();

    if (!perplexityKey && !openaiKey) {
        showToast('Necesitas al menos una API Key en ⚙');
        settingsPanel.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = '...';

    try {
        if (perplexityKey) {
            await verifyWithGemini(index, claimText, perplexityKey);
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
        `Eres un verificador de hechos experto. Usa Google Search para encontrar información actualizada.
Responde EXCLUSIVAMENTE con este JSON (sin bloques de código ni texto extra):
{"veredicto":"VERDADERO|MAYORMENTE_VERDADERO|MAYORMENTE_FALSO|FALSO|NO_DETERMINADO","razonamiento":"2-3 oraciones con fuentes concretas.","busqueda":"query para Google"}
REGLA: Usa NO_DETERMINADO SOLO si es absolutamente imposible determinar la veracidad. Prefiere MAYORMENTE_VERDADERO o MAYORMENTE_FALSO antes que NO_DETERMINADO.`;

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
                    content: `Eres un verificador de hechos. Analiza la declaración con tu base de conocimiento.
Responde EXCLUSIVAMENTE con este objeto JSON:
{"veredicto":"VERDADERO|MAYORMENTE_VERDADERO|MAYORMENTE_FALSO|FALSO|NO_DETERMINADO","razonamiento":"2-3 oraciones con evidencia.","busqueda":"query para Google"}
REGLA: Usa NO_DETERMINADO SOLO si es absolutamente imposible. Prefiere MAYORMENTE_VERDADERO o MAYORMENTE_FALSO. Si la declaración es sobre eventos muy recientes, indica el límite de tus datos.`
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
