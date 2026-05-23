/**
 * Infos.js - Display client name, category and session countdown after first h5 element
 */

// Expose function globally so emptyPageHandler can call it
window.initializeInfoDisplay = async function () {
    try {
        // Check if getExtensionData is available
        if (!window.getExtensionData) {
            console.log('[Infos] getExtensionData not available');
            return;
        }

        // Get extension data
        const data = await window.getExtensionData();

        // Check if client data exists
        if (!data || !data.client) {
            console.log('[Infos] No client data available');
            return;
        }

        const client = data.client;
        const clientName = (client.name || 'Not Selected').toUpperCase();
        const clientCategory = (client.category || 'N/A').toUpperCase();

        // Get time sync data
        const timeSyncData = data.timeSyncData;
        const timeOffset = timeSyncData ? timeSyncData.offset : false;

        // Store current offset globally for other scripts to use
        window.currentTimeOffset = timeOffset;

        // Start interval to check for h5 element
        const h5Interval = setInterval(() => {
            const firstH5 = document.querySelector('h5');

            if (firstH5) {
                // Clear interval immediately when h5 is found
                clearInterval(h5Interval);
                console.log('[Infos] h5 element found, attaching info');

                // Continue with the rest of the initialization
                initializeInfoOnH5(firstH5, clientName, clientCategory, timeOffset);
            }
        }, 100);

        return;
    } catch (error) {
        console.error('[Infos] Error in initialization:', error);
    }
};

// Separate function to handle info display once h5 is found
function initializeInfoOnH5(firstH5, clientName, clientCategory, timeOffset) {
    try {
        let infoEl = document.getElementById('info-display');
        if (infoEl) return;

        infoEl = document.createElement('span');
        infoEl.id = 'info-display';
        infoEl.className = 'd-block mt-2 text-primary font-monospace small text-center';
        infoEl.innerHTML = `${clientName}|${clientCategory}|<span id="ses-text" class="text-info">[SES: --:--]</span>`;
        firstH5.appendChild(infoEl);

        const sesText = document.getElementById('ses-text');
        let lastTime = '';
        setInterval(() => {
            const deadline = parseInt(localStorage.getItem('bls_visatype_deadline'));
            const remaining = deadline ? deadline - Date.now() : null;
            const time = remaining === null ? '--:--' : remaining <= 0 ? 'EXP' : `${Math.floor(remaining/60000).toString().padStart(2,'0')}:${Math.floor((remaining%60000)/1000).toString().padStart(2,'0')}`;
            if (time !== lastTime) { sesText.textContent = `[SES:${time}]`; lastTime = time; }
        }, 1000);
    } catch (error) {
        console.error('[Infos] Error displaying client info:', error);
    }
}

// Auto-initialize on all pages
(async function() {

    // Always initialize (will be called again by emptyPageHandler if needed)
    window.initializeInfoDisplay();
})(); 