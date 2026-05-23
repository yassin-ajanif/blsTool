/**
 * Payment page script - Handles automatic payment page initialization with countdown
 * Uses the countdown utility for timing before initializing payment
 */

(async function () {
    // ==================== State Variables ====================
    let settings = {};

    // ==================== Initialization ====================
    try {
        const data = await window.getExtensionData();
        settings = data.settings || {};
        console.log('Payment page data loaded:', {
            hasSettings: !!settings,
            paymentPageEnabled: settings?.submitPages?.paymentPage,
            paymentPageDelay: settings?.submitPages?.paymentPageMs
        });
    } catch (error) {
        console.error('Failed to load extension data:', error);
        settings = {};
    }

    // ==================== Helper Functions ====================

    /**
     * Initialize payment page functionality (original logic)
     * This is called after the countdown completes
     */
    function initPaymentPage() {
        console.log('Initializing payment page...');

        // Show payment section
        $('#payment-section').show();

        // Hide all elements with id starting with "vas_"
        $('[id^="vas_"]').hide();

        // Call OnPaymentConfirm if it exists
        if (typeof window.OnPaymentConfirm === 'function') {
            window.OnPaymentConfirm();
        }

        console.log('Payment page initialized successfully');
    }

    /**
     * Start countdown before initializing payment page
     */
    function startPaymentCountdown() {
        // Check if payment page auto-processing is enabled
        if (!settings.submitPages || !settings.submitPages.paymentPage) {
            console.log('Payment page auto-processing is disabled, initializing immediately');
            initPaymentPage();
            return;
        }

        const delayMs = settings.submitPages.paymentPageMs || 0;

        if (delayMs === 0) {
            console.log('No delay configured, initializing payment page immediately');
            initPaymentPage();
            return;
        }

        // Check if countdown utility is available
        if (typeof window.startCountdown === 'function') {
            console.log(`Starting countdown ${delayMs}ms before initializing payment page...`);

            // Use countdown without element ID (no button to display countdown on)
            // Pass initPaymentPage as callback to execute when countdown completes
            window.startCountdown(delayMs, initPaymentPage);
        } else {
            console.error('Countdown utility not loaded, using setTimeout fallback');
            // Fallback to simple setTimeout
            setTimeout(initPaymentPage, delayMs);
        }
    }

    /**
     * Wait for page to be ready and start process
     */
    function waitForPageReady() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startPaymentCountdown);
        } else {
            // DOM is already loaded
            console.log('Payment page loaded - DOM already ready');
            startPaymentCountdown();
        }
    }

    // ==================== Start Execution ====================
    waitForPageReady();

})(); // End of IIFE