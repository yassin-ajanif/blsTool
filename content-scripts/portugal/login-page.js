/**
 * Login page script - Fills login credentials and optionally submits the form
 * Uses $ exclusively for DOM operations
 */

(async function () {
  // ==================== State Variables ====================
  let client = null;
  let settings = {};
  //let submitButtonClicked = false;
  let emailFilled = false;

  // ==================== Initialization ====================
  try {
    const data = await window.getExtensionData();
    client = data.client || { name: 'Default Client', email: '', password: '' };
    settings = data.settings || {};
    console.log('Login page data loaded:', {
      clientName: client ? client.name : 'No client',
      hasEmail: !!(client && client.email),
      hasPassword: !!(client && client.password),
      hasSettings: !!settings
    });
  } catch (error) {
    console.error('Failed to load extension data:', error);
    client = { name: 'Default Client', email: '', password: '' };
    settings = {};
  }

  // ==================== Helper Functions ====================

  /**
   * Save login time to localStorage
   */
  function saveLoginTime() {
    try {
      const currentTime = new Date();
      const loginTimeString = currentTime.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      localStorage.setItem('logintime', loginTimeString);
      return loginTimeString;
    } catch (error) {
      console.error('Error saving login time:', error);
      return null;
    }
  }

  /**
   * Fill email field with client email
   */
  function fillEmail() {
    // Check if jQuery is available
    if (typeof $ === 'undefined') {
      console.log('jQuery is not defined, skipping email fill');
      return false;
    }

    // Find visible text input
    const $emailInput = $('input[type="text"]:visible').first();

    if ($emailInput.length > 0 && client && client.email) {
      $emailInput.val(client.email);
      $emailInput.trigger('input').trigger('change');
      console.log('Filled email input with:', client.email);
      //emailFilled = true;
      return true;
    } else if ($emailInput.length > 0) {
      console.log('Email input found but no client email available');
    }

    return false;
  }

  /**
   * Main form handler
   */
  function handleForm() {

    fillEmail();

    // Submit form if enabled in settings
    if (settings.submitPages && settings.submitPages.loginPage) {
      const delay = settings.submitPages.loginPageMs;

      // Check if countdown utility is available
      if (typeof window.startCountdown === 'function') {
        // Save login time before countdown starts
        saveLoginTime();

        window.startCountdown(delay, 'btnVerify');
      } else {
        console.error('Countdown utility not loaded, skipping auto-submit');
        // Do not submit if countdown utility is missing
      }
    }
  }

  /**
   * Wait for page to be fully loaded
   */
  function waitForPageLoad() {

    console.log('Waiting for page to fully load...');
    document.addEventListener('readystatechange', function () {
      if (document.readyState === 'complete') {
        console.log('Page has finished loading, proceeding with form handling');
        handleForm();
      }
    });

  }

  // ==================== Start Execution ====================
  waitForPageLoad();

})(); // End of IIFE