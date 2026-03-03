// ============================================================
//  BACKGROUND SERVICE WORKER
// ============================================================

// We use action.onClicked (instead of setPanelBehavior) so we can
// capture the exact tab ID at the moment the user clicks the icon.
// This tab ID is required later for chrome.tabCapture.getMediaStreamId.

let activeTabId = null;

chrome.action.onClicked.addListener((tab) => {
    activeTabId = tab.id;
    // Open the side panel for this window
    chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // --- Audio: get stream ID for the stored YouTube tab ---
    if (message.type === 'GET_TAB_STREAM_ID') {
        if (!activeTabId) {
            sendResponse({
                error: 'Cierra el panel y vuelve a hacer clic en el ícono de la extensión estando en el video de YouTube.'
            });
            return true;
        }
        chrome.tabCapture.getMediaStreamId({ targetTabId: activeTabId }, (streamId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ streamId });
            }
        });
        return true; // async
    }

});
