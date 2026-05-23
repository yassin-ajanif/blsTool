(async function () {

  // ========================================================================================
  //                              GLOBAL VARIABLES
  // ========================================================================================

  // Extension data
  let client = null;
  let settings = {};

  // Class instances (from changeapplicant.js utility)
  let getRealRandomApplicant;
  let changeApplicant;

  // ========================================================================================
  //                              INITIALIZATION
  // ========================================================================================

  // Fetch data from extension
  try {
    const data = await window.getExtensionData();
    client = data.client || {};
    settings = data.settings || {};
  } catch (error) {
    console.error('Failed to load extension data:', error);
  }

  // ========================================================================================
  //                              HELPER FUNCTIONS
  // ========================================================================================

  // --- Form Event Helpers ---
  function triggerInputEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // setFileId and SaveFileIdClientApplicant functions are now provided by savephoto.js utility

  // --- OTP UI Helpers ---
  async function showOTPLoadingAnimation(button) {
    button.disabled = true;
    let dots = 0;
    const interval = setInterval(() => button.textContent = 'Getting OTP' + '.'.repeat(dots = (dots + 1) % 4), 500);
    await new Promise(resolve => setTimeout(resolve, 5000));
    clearInterval(interval);
    button.textContent = 'Retrieving...';
  }

  function showOTPSuccess(button) {
    button.textContent = 'OTP ✓';
    setTimeout(() => (button.textContent = 'Get OTP', button.disabled = false), 3000);
  }

  function createOTPButton(emailCodeInput) {
    const btn = document.createElement('button');
    Object.assign(btn, { id: 'trump-get-otp-btn', textContent: 'Get OTP', type: 'button' });
    btn.style.cssText = 'margin-left:10px;padding:5px 15px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px';
    btn.onmouseover = () => btn.style.background = '#45a049';
    btn.onmouseout = () => btn.style.background = '#4CAF50';
    btn.onclick = async (e) => {
      e.preventDefault();
      await showOTPLoadingAnimation(btn);
      try {
        emailCodeInput.value = await getOTPFromEmail();
        triggerInputEvents(emailCodeInput);
        showOTPSuccess(btn);
      } catch (error) {
        alert('Failed to retrieve OTP: ' + error.message);
        btn.textContent = 'Get OTP';
        btn.disabled = false;
      }
    };
    emailCodeInput.parentNode.insertBefore(btn, emailCodeInput.nextSibling);
    return btn;
  }

  // ========================================================================================
  //                              IMAGE HANDLING FUNCTIONS
  // ========================================================================================

  // Convert base64 to File and attach to input element
  function base64ToFile(base64, inputId, filename) {
    const [, data] = base64.split(',');
    const mime = base64.match(/:(.*?);/)[1];
    const file = new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], filename, { type: mime });
    const input = document.getElementById(inputId);
    if (input) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }


  // ========================================================================================
  //                              MODAL HANDLING FUNCTIONS
  // ========================================================================================

  function hideSpecificModals() {
    // Hide modals and ensure scrolling with CSS
    const style = document.createElement('style');
    style.textContent = `
      #termsmodal, #photoUploadModal, .modal-backdrop {
        display: none !important;
      }
      /* Force body to always be scrollable */
      body.modal-open {
        overflow: auto !important;
        padding-right: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ========================================================================================
  //                              OTP FUNCTIONS
  // ========================================================================================

  // Function to get OTP from email
  async function getOTPFromEmail() {
    if (!client.app_password?.trim()) throw new Error('App password not configured');

    return new Promise((resolve, reject) => {
      const messageId = `otp_request_${Date.now()}_${Math.random()}`;
      const handler = (e) => {
        if (e.source !== window) return;
        const msg = e.data;
        if (msg.type === 'FROM_EXTENSION_TO_PAGE' && msg.action === 'otpResponse' && msg.messageId === messageId) {
          window.removeEventListener('message', handler);
          msg.success && msg.otp ? resolve(msg.otp) : reject(new Error(msg.error || 'Failed to retrieve OTP'));
        }
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'FROM_PAGE_TO_CONTENT_SCRIPT', action: 'requestOTP', messageId, email: client.email, app_password: client.app_password }, '*');
      setTimeout(() => (window.removeEventListener('message', handler), reject(new Error('OTP request timed out'))), 30000);
    });
  }

  // ========================================================================================
  //                              PAGE FILLING FUNCTIONS
  // ========================================================================================

  // Function to fill applicant page with client data
  async function fillapplicantpage() {
    console.log('Filling applicant page data...');

    // Set client photo - prioritize fileId over base64 photo
    if (client.fileId) {
      // Use fileId if available
      setFileId(client.fileId);
    } else if (client.photo) {
      // Fall back to base64 photo if no fileId
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '.');
      const filename = `WhatsApp Image ${dateStr} at ${timeStr}.jpeg`;
      base64ToFile(client.photo, 'uploadfile-1', filename);
    }


    // Set travel date to 5 months ahead
    const travelDateInput = document.getElementById('TravelDate');
    if (travelDateInput) {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 5);
      travelDateInput.value = futureDate.toISOString().split('T')[0];

      const calendarIcon = travelDateInput.parentElement.querySelector('span.k-icon.k-i-calendar');
      if (calendarIcon) {
        calendarIcon.click();
        calendarIcon.click();
      }
    }


    // Fill OTP field with id EmailCode
    const emailCodeInput = document.getElementById('EmailCode');
    if (emailCodeInput) {
      const otpButton = document.getElementById('trump-get-otp-btn') || createOTPButton(emailCodeInput);

      if (client.app_password?.trim()) {
        try {
          await showOTPLoadingAnimation(otpButton);
          emailCodeInput.value = await getOTPFromEmail();
          triggerInputEvents(emailCodeInput);
          showOTPSuccess(otpButton);
        } catch (error) {
          console.error('Error filling OTP:', error);
        }
      }
    }
  }

  // ========================================================================================
  //                              CLASS INITIALIZATION FUNCTIONS
  // ========================================================================================

  // Initialize classes directly since they're always available
  async function initializeClasses() {
    try {
      getRealRandomApplicant = new window.GetRealRandomApplicant();
      await getRealRandomApplicant.init();

      changeApplicant = new window.ChangeApplicant(getRealRandomApplicant);
      await changeApplicant.init();

      console.log('Classes initialized successfully');
    } catch (error) {
      console.error('Error initializing classes:', error);
    }
  }



  // ========================================================================================
  //                              MAIN INITIALIZATION
  // ========================================================================================

  const init = async () => {
    // Hide modals immediately
    hideSpecificModals();

    // Run initialization tasks
    try {

      await Promise.all([
        SaveFileIdClientApplicant(),
        initializeClasses()
      ]);

      await fillapplicantpage();

    } catch (error) {
      console.error('Initialization error:', error);
    }
  };

  // Start when DOM is ready

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();

})(); // End of IIFE