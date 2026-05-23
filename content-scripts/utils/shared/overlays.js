// Final overlay1.js - Topbar with Slot Selection


const customStyles = document.createElement('style');
customStyles.innerHTML = `
    .bg-purple { background-color: #8e44ad !important; }
    #topbar, #btns-div .btn { font-size: 12px; min-height: 38px; }
    #topbar .btn:hover, #topbar .btn:active, #topbar .btn:focus { border: none !important; box-shadow: none !important; outline: none !important; }
    #btn-logintime, #btn-logintime:hover { background-color: #0dcaf0 !important; }
    #btn-category, #btn-category:hover { background-color: #0b5ed7 !important; }
    #btn-hideloader, #btn-hideloader:hover { background-color: #e67300 !important; }
    #btn-groupsubmit.bg-danger, #btn-groupsubmit.bg-danger:hover { background-color: rgb(var(--bs-danger-rgb)) !important; }
    #btn-groupsubmit.bg-success, #btn-groupsubmit.bg-success:hover { background-color: rgb(var(--bs-success-rgb)) !important; }
`;
document.head.appendChild(customStyles);

// Ensure all.min.css is loaded for font icons
if (!document.querySelector('link[href*="all.min.css"]')) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/assets/vendor/font-awesome/css/all.min.css'; document.head.appendChild(link);
}

// Global variable to store current response data for full details
let currentResponseData = null;




// Create container only when DOM is interactive (resources still loading)
createTopbar();


// Init GroupSubmit status from storage
window.getExtensionData?.().then(d => {
    const gs = d?.websocketGroup;
    if (gs) updateGroupSubmitStatus(true, gs.order);
}).catch(() => { });


// Load calendar/otp on slotselection/applicant page
const path = location.pathname.toLowerCase();
if (path.includes('/slotselection') || path.includes('/applicantselection')) {
    document.addEventListener('DOMContentLoaded', () => getExtensionData?.().then(d => {
        const b = document.getElementById('btn-slotselectiontime');
        const v = path.includes('/slotselection') ? d?.calendarReachedAt : d?.otpReachedAt;
        const l = path.includes('/slotselection') ? 'CLDR' : 'OTP';
        if (b && v) { b.textContent = `${l}: ${v}`; b.classList.remove('d-none'); }

    }).catch(() => { }));
}


// Function to update GroupSubmit connection status
window.updateGroupSubmitStatus = function (connected, order) {
    const btn = document.getElementById('btn-groupsubmit');
    if (btn) {
        btn.className = `btn ${connected ? 'bg-success' : 'bg-danger'} text-white text-nowrap border-0 fw-normal lh-base`;
        btn.innerHTML = `<i class="fa-solid fa-wifi" style="font-size:14px"></i>${order ? ` [${order}]` : ''}`;
    }
};

window.createGlobalCustomLoader = function () {
    if (document.getElementById('requestLoader')) {
        const messageSpan = loader.querySelector('span');
        if (messageSpan) {
            messageSpan.textContent = "Wait ...";
        }
        loader.classList.remove('d-none');
        loader.classList.add('d-flex');
    }

    const loaderHTML = `
        <div id="requestLoader" class="position-fixed top-0 start-0 w-100 h-100 d-none justify-content-center align-items-center bg-dark bg-opacity-75" style="z-index:10002;">
            <div class="d-flex flex-column align-items-center bg-dark p-4 rounded">
                <div class="spinner-border text-light mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span class="text-white mb-3">Loading...</span>
                <button id="cancelRequestBtn" class="btn btn-danger fw-bold">HIDE LOADER</button>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', loaderHTML);

    const cancelBtn = document.getElementById('cancelRequestBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', window.hideCustomLoader);
    }
};

window.showCustomLoader = function (message = 'Loading...') {
    if (!document.getElementById('requestLoader')) {
        createGlobalCustomLoader();
    }

    const loader = document.getElementById('requestLoader');
    if (loader) {
        const messageSpan = loader.querySelector('span');
        if (messageSpan) {
            messageSpan.textContent = message;
        }
        loader.classList.remove('d-none');
        loader.classList.add('d-flex');
    }
};

window.hideCustomLoader = function () {
    const loader = document.getElementById('requestLoader');
    if (loader) {
        loader.classList.add('d-none');
        loader.classList.remove('d-flex');
    }
};


// Create the topbar with all elements
function createTopbar() {
    // Check if container already exists
    if (document.getElementById('topbar')) {
        return document.getElementById('topbar');
    }


    // Create the main container using Bootstrap classes (static, scrolls with page)
    const container = document.createElement('div');
    container.id = 'topbar';
    container.className = 'd-flex flex-column align-items-center w-100 pb-3 gap-2 font-monospace';

    // Create the buttons container
    const btnsDiv = document.createElement('div');
    btnsDiv.id = 'btns-div';
    btnsDiv.className = 'd-flex align-items-center justify-content-center flex-wrap gap-2';

    // No custom responsive styles needed - using Bootstrap responsive utilities

    // Helper function to create buttons with Bootstrap classes
    const createButton = (id, text, bootstrapColorClass = 'btn-primary', additionalClasses = '') => {
        const div = document.createElement('button');
        div.id = id;
        div.className = `btn ${bootstrapColorClass} text-nowrap border-0 fw-normal ${additionalClasses}`;
        div.textContent = text;
        return div;
    };

    // Create all buttons using Bootstrap classes
    const loginTime = localStorage.getItem('logintime') || 'Not set';
    const loginDiv = createButton('btn-logintime', `${loginTime}`, 'btn-info');

    const slotSelectionDiv = createButton('btn-slotselectiontime', 'CLDR: --:--:--', 'btn-secondary', 'd-none');

    // Add click functionality to login div
    loginDiv.addEventListener('click', function () {
        const updatedLoginTime = localStorage.getItem('logintime') || 'Not set';
        this.textContent = `${updatedLoginTime}`;
    });

    // Add click functionality to slot selection div
    slotSelectionDiv.addEventListener('click', function () {
        window.getExtensionData?.().then(data => {
            if (data?.calendarReachedAt) this.textContent = `CLDR: ${data.calendarReachedAt}`;
        }).catch(() => { });
    });



    // Create the response display
    const responseDisplay = document.createElement('div');
    responseDisplay.id = 'responseDisplay';
    responseDisplay.className = 'd-flex align-items-center justify-content-center w-100 bg-secondary text-white text-center rounded-0';
    responseDisplay.role = 'button';
    responseDisplay.style.cssText = 'cursor:pointer;padding:10px 0;';
    responseDisplay.textContent = 'Response: Waiting for requests...';
    responseDisplay.addEventListener('click', showFullDetails);

    // Create HideLoader button using Bootstrap classes
    const hideLoaderBtn = createButton('btn-hideloader', 'Loader', 'btn-warning text-white');

    // Add click functionality to HideLoader button
    hideLoaderBtn.addEventListener('click', function () {
        // Call the global HideLoader function
        if (typeof HideLoader === 'function') {
            HideLoader();
        } else if (typeof window.HideLoader === 'function') {
            window.HideLoader();
        } else {
            // Fallback: directly hide the global-overlay element
            const globalOverlay = document.getElementById('global-overlay');
            if (globalOverlay) {
                globalOverlay.style.display = 'none';
            }
        }
    });

    // Create Category selector button (Normal/Premium/PrimeTime)
    const categories = ['Normal', 'Premium', 'PrimeTime'];
    let currentCategoryIndex = 0;

    // Create button - start with Normal but will update when data loads
    const categoryBtn = createButton('btn-category', 'Normal', 'btn-info text-white');

    // Load category from extension data
    const loadCategoryFromExtension = async () => {
        try {
            const data = await window.getExtensionData();
            if (data && data.client && data.client.category) {
                const clientCategory = data.client.category;
                const displayCategory = clientCategory === 'Prime Time' ? 'PrimeTime' : clientCategory;
                categoryBtn.textContent = displayCategory;
                const index = categories.indexOf(displayCategory);
                if (index !== -1) {
                    currentCategoryIndex = index;
                }
            }
        } catch (error) {
            console.error('[Category] Failed to load:', error);
        }
    };

    // Call the function after a small delay to ensure injector is ready

    loadCategoryFromExtension();
    // 100ms delay to ensure window.getExtensionData is available

    // Add click functionality to Category button
    categoryBtn.addEventListener('click', async function () {
        currentCategoryIndex = (currentCategoryIndex + 1) % categories.length;
        const displayCategory = categories[currentCategoryIndex];
        this.textContent = displayCategory;

        // Convert PrimeTime to "Prime Time" for storage
        const storageCategory = displayCategory === 'PrimeTime' ? 'Prime Time' : displayCategory;

        // Send the new category to the extension using setExtensionData
        if (typeof window.setExtensionData === 'function') {
            try {
                await window.setExtensionData('selectedClientCategory', storageCategory);
                console.log(`Sent category update: ${storageCategory}`);
            } catch (error) {
                console.error('Failed to send category update:', error);
            }
        }
    });

    // Create Session button that opens login in iframe modal (using purple color)
    const sessionBtn = createButton('btn-session', 'SES', 'bg-purple text-white');

    // Add click functionality to Session button - opens iframe modal
    sessionBtn.addEventListener('click', function () {
        // Check if modal already exists
        if (document.getElementById('session-modal')) return;

        // Create modal overlay with Bootstrap classes
        const modal = document.createElement('div');
        modal.id = 'session-modal';
        modal.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark bg-opacity-75';
        modal.style.zIndex = '10002';

        // Create iframe container with Bootstrap classes
        const container = document.createElement('div');
        container.className = 'position-relative bg-white rounded w-75 h-75';

        // Create close button with Bootstrap classes
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.className = 'btn btn-primary rounded position-absolute top-0 end-0 translate-middle px-3 py-1';
        closeBtn.setAttribute('aria-label', 'Close');

        // Create iframe with Bootstrap classes
        const iframe = document.createElement('iframe');
        iframe.src = window.location.origin + '/MAR/Account/Login';
        iframe.className = 'w-100 h-100 border-0 rounded';

        // Assemble and show
        container.appendChild(closeBtn);
        container.appendChild(iframe);
        modal.appendChild(container);
        document.body.appendChild(modal);

        // Close on background click
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        closeBtn.onclick = () => modal.remove();
    });

    // Create GroupSubmit status button with wifi icon
    const groupSubmitBtn = document.createElement('button');
    groupSubmitBtn.id = 'btn-groupsubmit';
    groupSubmitBtn.className = 'btn bg-danger text-white text-nowrap border-0 fw-normal lh-base';
    groupSubmitBtn.innerHTML = '<i class="fa-solid fa-wifi" style="font-size:14px"></i>';

    // Click handler moved to emptyPageHandler.js and slotselection-page.js
    // groupSubmitBtn.addEventListener('click', () => {
    //     console.log('[Overlays] GroupSubmit button clicked');
    //     groupSubmitBtn.innerHTML = '..';
    //     window.postMessage({ type: 'GROUPSUBMIT_REQUEST', source: 'overlays' }, '*');
    // });

    // Create Timesync button
    const timesyncBtn = createButton('btn-timesync', '[--:--:--:---]', 'btn-warning text-dark');
    (function tick() {
        if (window.currentTimeOffset !== undefined) {
            const t = new Date(Date.now() + window.currentTimeOffset);
            timesyncBtn.textContent = `[${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}:${t.getMilliseconds().toString().padStart(3, '0')}]`;
        }
        requestAnimationFrame(tick);
    })();
    timesyncBtn.onclick = () => window.postMessage({ type: 'REQUEST_TIME_SYNC', source: 'overlays' }, '*');
    window.addEventListener('message', (e) => {
        if (e.data?.type === 'TIME_SYNC_UPDATE' && e.data.success) window.currentTimeOffset = e.data.offset;
    });

    // Add all buttons to btns-div
    btnsDiv.appendChild(loginDiv);
    btnsDiv.appendChild(slotSelectionDiv);
    btnsDiv.appendChild(hideLoaderBtn);
    btnsDiv.appendChild(sessionBtn);
    btnsDiv.appendChild(groupSubmitBtn);
    btnsDiv.appendChild(categoryBtn);
    btnsDiv.appendChild(timesyncBtn);

    // 202 warmup button
    const btn202 = createButton('btn-202', '202', 'btn-dark text-white');
    btn202.onclick = async () => {
        btn202.textContent = '...';
        const ok = await quickWarmup();
        btn202.textContent = ok ? '✓' : '✗';
        setTimeout(() => { btn202.textContent = '202'; }, 1500);
    };
    btnsDiv.appendChild(btn202);

    // Add responseDisplay and btns-div to container
    container.appendChild(responseDisplay);
    container.appendChild(btnsDiv);

    // Inject container at start of html (no body wait needed)
    document.documentElement.prepend(container);

    return container;
}


// Extract path from URL (remove hostname)
function extractPath(url) {
    if (!url) return '';
    try {
        const urlObj = new URL(url);
        // Return pathname + search + hash (everything after the hostname)
        return urlObj.pathname + urlObj.search + urlObj.hash;
    } catch (e) {
        // If URL parsing fails, return the original URL
        return url;
    }
}

// Truncate URL to specified length
function truncateUrl(url, maxLength = 25) {
    if (!url) return '';
    return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
}

// Show full details in alert when response div is clicked
function showFullDetails() {
    if (!currentResponseData) {
        alert('No response data available');
        return;
    }

    const data = currentResponseData;
    let fullDetails = '';

    if (data.type === 'redirect') {
        fullDetails = `REDIRECT DETAILS:
Method: ${data.method}
Status: ${data.statusCode}
From: ${data.url}
To: ${data.redirectUrl}
Timestamp: ${new Date(data.timestamp).toLocaleString()}`;
    } else if (data.type === 'error') {
        if (data.error === 'net::ERR_ABORTED' && data.url.toLowerCase().includes('slotselection')) {
            fullDetails = `BLOCKED REDIRECT DETAILS:
Method: ${data.method}
URL: ${data.url}
Error: ${data.error}
Timestamp: ${new Date(data.timestamp).toLocaleString()}`;
        } else {
            fullDetails = `ERROR DETAILS:
Method: ${data.method}
URL: ${data.url}
Error: ${data.error}
Timestamp: ${new Date(data.timestamp).toLocaleString()}`;
        }
    } else {
        fullDetails = `REQUEST DETAILS:
Method: ${data.method}
Status: ${data.statusCode}
URL: ${data.url}
Timestamp: ${new Date(data.timestamp).toLocaleString()}`;
    }

    alert(fullDetails);
}

// Update the response display with new data
function updateResponseDisplay(data) {
    const responseDiv = document.getElementById('responseDisplay');
    if (!responseDiv) return;

    // Store current data for full details
    currentResponseData = data;

    // Determine Bootstrap class based on status code
    const statusCode = data.statusCode || 0;
    let bootstrapClass = 'bg-dark'; // default

    if (statusCode >= 200 && statusCode < 300) {
        // 2xx Success
        bootstrapClass = 'bg-success';
    } else if (statusCode >= 300 && statusCode < 400) {
        // 3xx Redirection
        bootstrapClass = 'bg-warning';
    } else if (statusCode >= 400 && statusCode < 500) {
        // 4xx Client Error
        bootstrapClass = 'bg-danger';
    } else if (statusCode >= 500) {
        // 5xx Server Error
        bootstrapClass = 'bg-purple';
    } else {
        // Network error or other
        bootstrapClass = 'bg-secondary';
    }

    // Extract path from URL, convert to lowercase, and truncate
    const displayUrl = data.url ? truncateUrl(extractPath(data.url).toLowerCase()) : '';
    const displayRedirectUrl = data.redirectUrl ? truncateUrl(extractPath(data.redirectUrl).toLowerCase()) : '';

    // Build response text with new format: STATUS METHOD | URL
    let responseText = '';

    if (data.type === 'redirect') {
        responseText = `${statusCode} ${data.method} | ${displayUrl} → ${displayRedirectUrl}`;
    } else if (data.type === 'error') {
        // Special handling for ERR_ABORTED + slotselection
        if (data.error === 'net::ERR_ABORTED' && data.url.toLowerCase().includes('slotselection')) {
            responseText = `Block redirect | ${displayUrl}`;
            bootstrapClass = 'bg-secondary'; // Grey for blocked redirects
        } else {
            responseText = `ERROR ${data.method} | ${displayUrl} (${data.error})`;
        }
    } else {
        responseText = `${statusCode} ${data.method} | ${displayUrl}`;
    }

    // Update div content and Bootstrap class
    responseDiv.textContent = responseText;
    // Remove all bg- classes and apply the new one
    responseDiv.className = responseDiv.className.replace(/bg-\S+/g, '');
    responseDiv.classList.add(bootstrapClass, 'text-white', 'rounded', 'p-3', 'text-center', 'd-flex', 'align-items-center', 'justify-content-center');

    console.log('Response display updated:', responseText);
}

// *** Listen for messages from content script AND page scripts ***
window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    const message = event.data;

    // Handle GroupSubmit status
    if (message && message.type === 'GROUPSUBMIT_STATUS') {
        updateGroupSubmitStatus(message.connected, message.order);
        return;
    }

    // Check if this is a message from the content script
    if (message && message.type === 'FROM_EXTENSION_TO_PAGE') {

        switch (message.action) {
            case 'REQUEST_STATUS_UPDATE':
                handleRequestStatusUpdate(message.data);
                break;

            case 'settingsUpdated':
                handleSettingsUpdated(message.settings);
                break;

            case 'sessionExpired':
                handleSessionExpired(message.redirectUrl);
                break;

            case 'REQUEST_STATUS_UPDATE':
                handleRequestStatusUpdate(message.data);
                break;

            case 'settingsUpdated':
                handleSettingsUpdated(message.settings);
                break;

            case 'sessionExpired':
                handleSessionExpired(message.redirectUrl);
                break;

            case 'otpResponse':
                // This is handled by the applicantselection-page.js, ignore here
                break;

            default:
                console.log('Unknown message action from content script:', message.action);
        }
    }

});

// Handle request status updates - NOW SHOWS ALL STATUS CODES via response div
function handleRequestStatusUpdate(data) {

    // Filter: Only show for specific URLs and methods
    if (!shouldShowResponse(data)) {
        return;
    }

    // Update response div instead of showing alerts
    updateResponseDisplay(data);
}

// Check if response should be shown (same filtering as before)
function shouldShowResponse(data) {
    // Check if URL is provided
    if (!data.url) {
        console.log('🔇 No URL provided in data');
        return false;
    }

    // Filter out media, fonts, and images by path pattern
    if (/\/(webfonts|images|videos|assets\/images|assets\/videos)\//i.test(data.url)) return false;

    // Check if method is provided and is GET or POST
    if (!data.method) {
        console.log('🔇 No method provided in data');
        return false;
    }

    const method = data.method.toLowerCase();
    if (method !== 'get' && method !== 'post') {
        //console.log(`🔇 Method ${data.method} not GET or POST`);
        return false;
    }

    // Check if URL contains the required patterns
    const urlLower = data.url.toLowerCase();
    const hasBlsPortugal = urlLower.includes('blsportugal.com/mar');
    const hasBlsSpain = urlLower.includes('blsspainmorocco.net/mar');

    if (!hasBlsPortugal && !hasBlsSpain) {
        return false;
    }

    console.log(`✅ Response criteria met - Method: ${data.method}, URL: ${data.url}`);
    return true;
}

// Handle settings updates
function handleSettingsUpdated(settings) {
    console.log('⚙️ Settings updated:', settings);
    // Show a brief response div update for settings
    updateResponseDisplay({
        method: 'SETTINGS',
        statusCode: 200,
        url: 'Extension Settings Updated',
        type: 'completed'
    });
}

// Handle session expired
function handleSessionExpired(redirectUrl) {
    console.log('🔒 Session expired, redirecting to:', redirectUrl);
    updateResponseDisplay({
        method: 'SESSION',
        statusCode: 401,
        url: 'Session Expired - Redirecting to Login',
        type: 'error'
    });
}

// Handle redirect events
function handleRedirect(data) {
    // Additional redirect handling logic can go here
    console.log(`🔄 Redirect: ${data.statusCode} from ${data.url} to ${data.redirectUrl}`);
}

// Define the global function for direct script injection fallback
window.handleRequestUpdate = function (data) {
    console.log('📥 Direct injection - Received request data:', data);
    handleRequestStatusUpdate(data);
};


// Send message back to content script (optional)
function sendMessageToContentScript(action, data) {
    window.postMessage({
        type: 'FROM_PAGE_TO_CONTENT_SCRIPT',
        action: action,
        data: data
    }, '*');
}

// QuickWarmup: retry home/index via iframe on 202 status
async function quickWarmup() {
    try {
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:fixed;bottom:-500px;width:1px;height:1px;opacity:0;pointer-events:none";
        const p = new Promise(resolve => {
            iframe.onload = () => setTimeout(() => { iframe.remove(); resolve(true); }, 1200);
            iframe.onerror = () => { iframe.remove(); resolve(false); };
            setTimeout(() => { iframe.remove(); resolve(false); }, 5000);
        });
        iframe.src = location.origin + "/MAR/home/index?t=" + Date.now();
        document.documentElement.appendChild(iframe);
        const success = await p;
        if (!success) return quickWarmup();
        return true;
    } catch { return quickWarmup(); }
}

// Listen for quickWarmup trigger from background (before POST requests)
window.addEventListener('message', (e) => {
    if (e.data?.type === 'FROM_EXTENSION_TO_PAGE' && e.data.action === 'quickWarmup') quickWarmup();
});

console.log('🚀 Overlays.js loaded with topbar system');
