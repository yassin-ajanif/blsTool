/**
 * RedirectOrRefresh.js
 * This script automatically detects error conditions on the page and redirects or refreshes as needed.
 * Modified to use dynamic base URL instead of hardcoded URLs.
 */

// Get page redirect delay from settings
async function getPageRedirectDelay() {
  try {
    // Try to get the delay from extension data
    if (window.getExtensionData) {
      const data = await window.getExtensionData();
      const settings = data?.settings || {};
      return settings?.redirects?.pageRedirectMs ?? 500;
    }
  } catch (error) {
    console.log('Could not fetch page redirect delay, using default:', error);
  }
  return 500; // Default to 500ms if settings not available
}

// Get refresh error settings
async function getRefreshErrorSettings() {
  try {
    if (window.getExtensionData) {
      const data = await window.getExtensionData();
      const settings = data?.settings || {};
      return {
        enabled: settings?.refreshError?.enabled ?? true,
        refreshErrorMs: settings?.refreshError?.refreshErrorMs ?? 1000
      };
    }
  } catch (error) {
    console.log('Could not fetch refresh error settings, using defaults:', error);
  }
  return { enabled: true, refreshErrorMs: 1000 };
}

// Track if we already sent wipeCookies for this page
var cookiesWiped = false;

// Function to check for server-side errors only
async function checkServerSideErrors() {
  try {
    const h1Text = document.querySelector('h1')?.textContent.trim() || '';

    // Check specifically for "Too Many" error first
    if (h1Text.includes('Too Many') || h1Text.includes('Temporarily Restricted')) {
      if (!cookiesWiped) {
        console.log('Detected "Too Many" error. Sending message to wipe cookies...');
        window.postMessage({
          type: 'FROM_PAGE_TO_CONTENT_SCRIPT',
          action: 'wipeCookies'
        }, '*');
        cookiesWiped = true;
        console.log('Cookie wipe message sent - will not send again');
      }
      return true;
    }

    // Check for other server-side errors
    if (
      h1Text.includes('502') ||
      h1Text.includes('503') ||
      h1Text.includes('504') ||
      h1Text.includes('Temporarily Unavailable') ||
      h1Text.includes('Gateway Time-out') ||
      h1Text.includes('Error occurred')
    ) {
      const refreshSettings = await getRefreshErrorSettings();

      if (refreshSettings.enabled) {
        console.log(`Detected server-side error in <h1>. Reloading page after ${refreshSettings.refreshErrorMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, refreshSettings.refreshErrorMs));
        window.location.reload();
      } else {
        console.log('Detected server-side error in <h1>, but refresh is disabled in settings.');
      }

      return true;
    }
  } catch (error) {
    console.error('Error in checkServerSideErrors:', error);
  }
  return false;
}

// Function to handle page redirects based on URL patterns
async function handlePageRedirects() {
  try {
    // Extract base URL (everything up to and including the domain)
    const currentUrl = window.location.href;
    const urlParts = currentUrl.split('/');
    const baseUrl = urlParts[0] + '//' + urlParts[2];

    // URL patterns that should trigger redirect
    const lowerUrl = currentUrl.toLowerCase();
    const substringsToCheck = [
      "mar/home/index",
      "mar/newcaptcha/logincaptchasubmit",
      "mar/newcaptcha/loginsubmit",
      "mar/account/loginsubmit",
      "mar/account/changepassword",
    ];

    const shouldRedirect = substringsToCheck.some(substring => lowerUrl.includes(substring));
    //const enableSlotSelectionCode = localStorage.getItem('enableslotselectioncode');

    if (shouldRedirect) {
      const targetUrl = baseUrl + "/MAR/appointment/newappointment";
      const delay = await getPageRedirectDelay();
      console.log(`Redirecting to ${targetUrl} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      window.location.href = targetUrl;
      return true; // Redirect happened
    }
  } catch (error) {
    console.error('Error in handlePageRedirects:', error);
  }
  return false; // No redirect
}

// Run once on page load
document.addEventListener('DOMContentLoaded', async function () {
  console.log('RedirectOrRefresh.js: Running on DOMContentLoaded');

  // Check for server-side errors first
  if (!await checkServerSideErrors()) {
    // If no server error, check for redirects
    await handlePageRedirects();
  }
});

// Periodically check ONLY for server-side errors
console.log('RedirectOrRefresh.js: Setting up periodic server error checks');
setInterval(() => checkServerSideErrors(), 500);

// Let the injector know we've initialized
console.log('RedirectOrRefresh.js: Initialized successfully');