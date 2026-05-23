document.addEventListener('DOMContentLoaded', async function () {

    let settings;
    let livenessPage;
    let client;

    try {
        const data = await window.getExtensionData();
        client = data.client;
        settings = data.settings;
        livenessPage = settings?.submitPages?.livenessPage;
    } catch (error) {
        console.error('Failed to load extension data:', error);
    }

    // Constants
    const BUTTON_IDS = {
        LIVENESS: 'extractLivenessBtn',
        LOCAL: 'livenesslocal',
        SUBMIT: 'submitLivenessBtn',
        TO_PAYMENT: 'toPaymentBtn',
        IFRAME: 'livenessIframe'
    };

    // Listen for messages from extension via postMessage
    window.addEventListener('message', (e) => {
        if (e.source !== window || e.data.type !== 'FROM_EXTENSION_TO_PAGE') return;

        if (e.data.action === 'REQUEST_STATUS_UPDATE' &&
            e.data.data?.type === 'LivenessError_InvalidRequestParam') {
            // Update submit button text when liveness error occurs
            const submitBtn = document.getElementById(BUTTON_IDS.SUBMIT);
            if (submitBtn) {
                submitBtn.textContent = '3awd Click';
                
            }
        }
    });

    const buttonStates = {
        primary: { className: 'btn btn-primary', text: 'Distance', disabled: false },
        loading: { className: 'btn btn-primary', text: 'Loading...', disabled: true },
        success: { className: 'btn btn-success', text: 'Copied ✓', disabled: false },
        warning: { className: 'btn btn-warning', text: 'Selfie .', disabled: true },
        danger: { className: 'btn btn-danger', text: 'Error', disabled: false },
        processing: { className: 'btn btn-warning', text: 'Selfie .', disabled: true },
        info: { className: 'btn btn-info', text: 'Local', disabled: false }
    };

    function setButtonState(button, state, customText = null) {
        const config = buttonStates[state];
        if (!config) return;
        button.className = config.className;
        button.textContent = customText || config.text;
        button.disabled = config.disabled;
    }

    function createButton(id, text, className, style = {}) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = className;
        button.textContent = text;
        Object.assign(button.style, style);
        return button;
    }

    function resetButtonStates() {
        // Re-enable both buttons on error
        const livenessBtn = document.getElementById(BUTTON_IDS.LIVENESS);
        const localBtn = document.getElementById(BUTTON_IDS.LOCAL);
        if (livenessBtn) livenessBtn.disabled = false;
        if (localBtn) localBtn.disabled = false;
    }

    const form = document.querySelector('form');
    const baseUrl = window.location.origin;
    const ENTRY_ENDPOINT = "https://myselfie.trumpservices.org/entry";
    const POLL_ENDPOINT = "https://myselfie.trumpservices.org/poll";
    const ENCRYPTION_KEY = "X9mK3nP7qR2sT5vW8yA1bC4dE6fG0hJ";

    // Store the current liveness ID - simpler approach with just one variable
    let currentLivenessId = null;

    function xorEncrypt(text, key) {
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(result); // Base64 encode the XOR result
    }

    function makeXHRRequest(method, url, data, callback) {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        if (data && typeof data === 'object' && !(data instanceof FormData)) {
            xhr.setRequestHeader('Content-Type', 'application/json');
            data = JSON.stringify(data);
        }
        xhr.onreadystatechange = () => xhr.readyState === 4 && callback(xhr);
        xhr.send(data);
    }

    function updateEntry(entryData, callback) {
        makeXHRRequest('POST', ENTRY_ENDPOINT, entryData, xhr => {
            callback(xhr.status === 200);
        });
    }

    function showSubmitButton() {
        // Hide both liveness buttons
        [BUTTON_IDS.LIVENESS, BUTTON_IDS.LOCAL].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.style.display = 'none';
        });

        // Get or create submit button
        let submitBtn = document.getElementById(BUTTON_IDS.SUBMIT);
        if (!submitBtn) {
            submitBtn = createButton(BUTTON_IDS.SUBMIT, 'Submit Liveness', 'btn btn-primary',
                { marginLeft: '10px', display: 'inline-block' });
            const originalSubmit = document.querySelector('button[type="submit"], input[type="submit"]');
            if (originalSubmit) {
                originalSubmit.parentNode.insertBefore(submitBtn, originalSubmit.nextSibling);
            }
        } else {
            submitBtn.style.display = 'inline-block';
        }

        // Add click handler - simplified version
        let clickCount = 0;
        submitBtn.onclick = function () {
            if (currentLivenessId) {
                // Change button text to show request in progress with click count
                clickCount++;
                submitBtn.textContent = clickCount > 1 ? `Request (${clickCount})...` : 'Request ...';

                // Add LivenessId to form if not present
                let input = form.querySelector('#LivenessId');
                if (!input) {
                    input = document.createElement('input');
                    input.type = 'hidden';
                    input.id = 'LivenessId';
                    input.name = 'LivenessId';
                    form.appendChild(input);
                }
                input.value = currentLivenessId;

                // Add loc (client location) to form if not present
                let locationInput = form.querySelector('#loc');
                if (!locationInput) {
                    locationInput = document.createElement('input');
                    locationInput.type = 'hidden';
                    locationInput.id = 'loc';
                    locationInput.name = 'loc';
                    form.appendChild(locationInput);
                }
                if (client && client.location) {
                    locationInput.value = client.location;
                }

                // Submit the form and let intercept handle redirects
                const testForm = new FormData(form);

                // Submit form with manual redirect
                fetch(`${baseUrl}/MAR/appointment/LivenessResponse`, { method: 'POST', body: testForm, redirect: 'manual', credentials: 'include' });
                
            } else {
                alert ("No livnessId received")
            }
        };
    }



    function startProgressPolling(button, ip) {
        makeXHRRequest('GET', `${POLL_ENDPOINT}/${ip}`, null, xhr => {
            if (xhr.status !== 200) return setButtonState(button, 'danger', 'Error');
            const data = JSON.parse(xhr.responseText);

            if (data.progress === 'started') {
                setButtonState(button, 'warning');
                let dotCount = 1;
                const dotsInterval = setInterval(() => {
                    button.textContent = 'Selfie ' + '.'.repeat(dotCount = dotCount >= 3 ? 1 : dotCount + 1);
                }, 1000);

                makeXHRRequest('GET', `${POLL_ENDPOINT}/${ip}`, null, xhr2 => {
                    clearInterval(dotsInterval);
                    if (xhr2.status !== 200) return setButtonState(button, 'danger', 'Error');
                    const done = JSON.parse(xhr2.responseText);

                    if (done.progress === 'done' && done.liveness_id) {
                        // Store liveness ID and show submit button
                        currentLivenessId = done.liveness_id;
                        showSubmitButton();

                        // Auto-trigger submission after a short delay
                        const submitBtn = document.getElementById(BUTTON_IDS.SUBMIT);
                        if (submitBtn && !submitBtn.disabled && livenessPage) {
                            submitBtn.click()
                        }

                    } else {
                        setButtonState(button, 'danger', 'Error: No ID');
                    }
                });
            }
        });
    }

    class HandleLivenessLocal {
        constructor(form, baseUrl) {
            this.form = form;
            this.baseUrl = baseUrl;
            this.button = null;
            this.dotsInterval = null;
        }

        createButton(submitButton) {
            this.button = createButton(BUTTON_IDS.LOCAL, 'Local', 'btn btn-info', { marginLeft: '10px' });
            this.button.addEventListener('click', (event) => this.handleButtonClick(event));
            return this.button;
        }

        setButtonState(state, customText = null) {
            setButtonState(this.button, state, customText);
        }

        startDotsAnimation() {
            let dotCount = 1;
            this.dotsInterval = setInterval(() => {
                this.button.textContent = 'Selfie ' + '.'.repeat(dotCount);
                dotCount = dotCount >= 3 ? 1 : dotCount + 1;
            }, 1000);
        }

        stopDotsAnimation() {
            if (this.dotsInterval) {
                clearInterval(this.dotsInterval);
                this.dotsInterval = null;
            }
        }

        injectOzLivenessScript(userId, transactionId) {
            // Create iframe for isolated execution
            const iframe = document.createElement('iframe');
            iframe.src = `${this.baseUrl}/MAR/appointment/livenessrequest`;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.style.position = 'fixed';
            iframe.style.top = '0';
            iframe.style.left = '0';
            iframe.style.zIndex = '9999';
            iframe.id = BUTTON_IDS.IFRAME;

            iframe.onload = () => {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

                    // First inject the OZ liveness script
                    const ozScript = iframeDoc.createElement('script');
                    ozScript.src = 'https://web-sdk.prod.cdn.spain.ozforensics.com/blsinternational/plugin_liveness.php';
                    ozScript.async = true;

                    // Wait for the OZ script to load, then inject initialization script
                    ozScript.onload = () => {
                        // Inject initialization script directly
                        const initScript = iframeDoc.createElement('script');
                        initScript.textContent = `
                        if (typeof OzLiveness !== 'undefined') {
                            OzLiveness.open({
                                lang: 'en',
                                meta: {
                                    'user_id': '${userId}',
                                    'transaction_id': '${transactionId}'
                                },
                                overlay_options: false,
                                action: ['video_selfie_blank'],
                                result_mode: 'safe',
                                on_complete: function (result) {
                                    // Post message to parent window instead of dispatching event
                                    window.parent.postMessage({
                                        type: 'livenessLocalComplete',
                                        livenessId: result.event_session_id
                                    }, '*');
                                }
                            });
                        }
                        `;
                        iframeDoc.head.appendChild(initScript);
                    };

                    iframeDoc.body.appendChild(ozScript);
                } catch (error) {
                    console.error('Error accessing iframe content:', error);
                    // Clean up on error
                    document.body.removeChild(iframe);
                    this.setButtonState('danger', 'Iframe Error');
                }
            };

            document.body.appendChild(iframe);
        }

        setupResponseListener() {
            window.addEventListener('message', (event) => {
                // Check if this is our liveness complete message
                if (event.data && event.data.type === 'livenessLocalComplete') {
                    this.stopDotsAnimation();
                    const livenessId = event.data.livenessId;

                    // Store liveness ID and show submit button
                    currentLivenessId = livenessId;
                    showSubmitButton();

                    // Auto-trigger submission after a short delay

                    const submitBtn = document.getElementById(BUTTON_IDS.SUBMIT);
                    if (submitBtn && !submitBtn.disabled && livenessPage) {
                        submitBtn.click()
                    }


                    // Clean up iframe
                    const iframe = document.getElementById(BUTTON_IDS.IFRAME);
                    if (iframe) {
                        document.body.removeChild(iframe);
                    }
                }
            });
        }

        handleButtonClick(event) {
            // Disable the Liveness button when Local is clicked
            const livenessBtn = document.getElementById(BUTTON_IDS.LIVENESS);
            if (livenessBtn) {
                livenessBtn.disabled = true;
            }

            this.setButtonState('loading');

            makeXHRRequest('POST', `${this.baseUrl}/MAR/appointment/livenessrequest`, new FormData(this.form), xhr => {
                if (xhr.status === 200) {
                    const userIdMatch = xhr.responseText.match(/'user_id':\s*'([^']+)'/);
                    const transactionIdMatch = xhr.responseText.match(/'transaction_id':\s*'([^']+)'/);

                    if (userIdMatch && transactionIdMatch) {
                        const userId = userIdMatch[1];
                        const transactionId = transactionIdMatch[1];

                        // Setup listener for response before injecting script
                        this.setupResponseListener();

                        // Start dots animation and inject script
                        this.setButtonState('processing');
                        this.startDotsAnimation();
                        this.injectOzLivenessScript(userId, transactionId);
                    } else {
                        alert('error');
                        this.setButtonState('info');
                        resetButtonStates();
                    }
                } else {
                    alert('Request failed with status: ' + xhr.status);
                    this.setButtonState('info');
                    resetButtonStates();
                }
            });
        }
    }

    function handleButtonClick(event) {
        const button = event.target;

        // Disable the Local button when Liveness is clicked
        const localBtn = document.getElementById(BUTTON_IDS.LOCAL);
        if (localBtn) {
            localBtn.disabled = true;
        }

        setButtonState(button, 'loading');

        makeXHRRequest('POST', `${baseUrl}/MAR/appointment/livenessrequest`, new FormData(form), xhr => {
            if (xhr.status === 200) {
                const userIdMatch = xhr.responseText.match(/'user_id':\s*'([^']+)'/);
                const transactionIdMatch = xhr.responseText.match(/'transaction_id':\s*'([^']+)'/);

                if (userIdMatch && transactionIdMatch) {
                    makeXHRRequest('GET', 'https://api.ipify.org?format=json', null, ipXhr => {
                        if (ipXhr.status !== 200) {
                            setButtonState(button, 'danger');
                            resetButtonStates();
                            return;
                        }
                        const { ip } = JSON.parse(ipXhr.responseText);

                        const payload = userIdMatch[1] + '|:|' + transactionIdMatch[1] + '|:|' + ip + '|:|' + navigator.userAgent;
                        const encodedPayload = xorEncrypt(payload, ENCRYPTION_KEY);
                        const finalUrl = `${baseUrl}/MAR/Account/Login?code=${encodeURIComponent(encodedPayload)}`;

                        updateEntry({ progress: 'pending', ClientData: encodedPayload, ip, liveness_id: '' }, success => {
                            if (success) {
                                navigator.clipboard.writeText(finalUrl);
                                setButtonState(button, 'success');

                                button.removeEventListener('click', handleButtonClick);
                                button.addEventListener('click', () => {
                                    navigator.clipboard.writeText(finalUrl);
                                    button.textContent = 'Copied ✓';
                                    setTimeout(() => button.textContent = 'Copy Again', 1000);
                                });

                                startProgressPolling(button, ip);
                            } else {
                                setButtonState(button, 'danger', 'Entry failed');
                                resetButtonStates();
                            }
                        });
                    });
                } else {
                    setButtonState(button, 'warning', 'No Data Found');
                    resetButtonStates();
                }
            } else {
                setButtonState(button, 'danger');
                setTimeout(() => setButtonState(button, 'primary'), 2000);
                resetButtonStates();
            }
        });
    }

    const submitButton = document.querySelector('button[type="submit"], input[type="submit"]');
    if (submitButton) {
        const button = createButton(BUTTON_IDS.LIVENESS, 'a Distance', 'btn btn-primary', { marginLeft: '10px' });
        setButtonState(button, 'primary');
        submitButton.parentNode.insertBefore(button, submitButton.nextSibling);
        button.addEventListener('click', handleButtonClick);

        // Create "To Payment" button (hidden initially)
        const toPaymentBtn = createButton(BUTTON_IDS.TO_PAYMENT, 'To Payment', 'btn btn-info',
            { marginLeft: '10px', display: 'none' });
        submitButton.parentNode.insertBefore(toPaymentBtn, button.nextSibling);

        // Create "Local" button using HandleLivenessLocal class
        const livenessLocalHandler = new HandleLivenessLocal(form, baseUrl);
        const localButton = livenessLocalHandler.createButton(submitButton);
        submitButton.parentNode.insertBefore(localButton, toPaymentBtn.nextSibling);
    }
});