// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// DOMAIN CONFIGURATION VARIABLES
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const DOMAIN_1 = "www.blsspainmorocco.net";
const DOMAIN_2 = "morocco.blsportugal.com";
const ALL_DOMAINS = [DOMAIN_1, DOMAIN_2];

// Helper function to generate URL patterns for all domains
function generateUrlPatterns(path) {
  return ALL_DOMAINS.map(domain => `*://${domain}${path}`);
}

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// UNIFIED REDIRECT RULES
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// All redirect rules in one place with unified structure
const redirectRules = [
  // Scripts
  { path: "/assets/vendor/jquery/dist/jquery.min.js", localPath: "loaded/scripts/jquery.min.js", type: "script" },
  { path: "/assets/vendor/jquery-validation/dist/jquery.validate.min.js", localPath: "loaded/scripts/jquery.validate.min.js", type: "script" },
  { path: "/assets/vendor/bootstrap/dist/js/bootstrap.bundle.min.js?v=*", localPath: "loaded/scripts/bootstrap.bundle.min.js", type: "script" },
  { path: "/assets/vendor/jquery-validation-unobtrusive/jquery.validate.unobtrusive.min.js*", localPath: "loaded/scripts/jquery.validate.unobtrusive.min.js", type: "script" },
  { path: "/assets/vendor/tiny-slider/tiny-slider.js?v=*", localPath: "loaded/scripts/tiny-slider.js", type: "script" },
  { path: "/assets/vendor/purecounterjs/dist/purecounter_vanilla.js?v=*", localPath: "loaded/scripts/purecounter_vanilla.js", type: "script" },
  { path: "/assets/vendor/glightbox/js/glightbox.js*", localPath: "loaded/scripts/glightbox.js", type: "script" },
  { path: "/js/site.js*", localPath: "loaded/scripts/site.js", type: "script" },
  { path: "/assets/vendor/kendo/js/kendo.all.min.js*", localPath: "loaded/scripts/kendo.all.min.js", type: "script" },
  { path: "/assets/vendor/virtualkeyboard/js/jquery-ui-custom.min.js*", localPath: "loaded/scripts/jquery-ui-custom.min.js", type: "script" },
  { path: "/assets/vendor/jarallax/jarallax-video.min.js*", localPath: "loaded/scripts/jarallax-video.min.js", type: "script" },
  { path: "/assets/vendor/jarallax/jarallax.min.js*", localPath: "loaded/scripts/jarallax.min.js", type: "script" },
  { path: "/assets/vendor/jquery-ajax-unobtrusive/jquery-ajax-unobtrusive.js*", localPath: "loaded/scripts/jquery-ajax-unobtrusive.js", type: "script" },
  { path: "/assets/js/functions.js*", localPath: "loaded/scripts/functions.js", type: "script" },
  { path: "/assets/vendor/flatpickr/js/flatpickr.min.js*", localPath: "loaded/scripts/flatpickr.min.js", type: "script" },
  { path: "/assets/vendor/choices/js/choices.min.js*", localPath: "loaded/scripts/choices.min.js", type: "script" },
  { path: "/assets/vendor/virtualkeyboard/js/jquery.keyboard.js*", localPath: "loaded/scripts/jquery.keyboard.js", type: "script" },
  { path: "/assets/vendor/virtualkeyboard/js/jquery.keyboard.extension-scramble.js*", localPath: "loaded/scripts/jquery.keyboard.extension-scramble.js", type: "script" },
  { path: "/assets/vendor/moment/moment.js*", localPath: "loaded/scripts/moment.js", type: "script" },
  //{ path: "/assets/js/client.min.js*", localPath: "loaded/scripts/client.min.js", type: "script" },
  { path: "/assets/js/client.min.js*", localPath: "loaded/scripts/empty.js", type: "script" },


  // Stylesheets
  { path: "/css/site.css*", localPath: "loaded/styles/site.css", type: "stylesheet" },
  { path: "/assets/css/style.css*", localPath: "loaded/styles/style.css", type: "stylesheet" },
  { path: "/assets/vendor/font-awesome/css/all.min.css*", localPath: "loaded/styles/all.min.css", type: "stylesheet" },
  { path: "/assets/vendor/bootstrap-icons/bootstrap-icons.css*", localPath: "loaded/styles/bootstrap-icons.css", type: "stylesheet" },
  { path: "/assets/vendor/bootstrap/dist/css/bootstrap.min.css*", localPath: "loaded/styles/bootstrap.min.css", type: "stylesheet" },
  { path: "/assets/vendor/kendo/css/kendo.common.min.css*", localPath: "loaded/styles/kendo.common.min.css", type: "stylesheet" },
  { path: "/assets/vendor/virtualkeyboard/css/keyboard.css*", localPath: "loaded/styles/keyboard.css", type: "stylesheet" },
  { path: "/assets/vendor/kendo/css/kendo.silver.min.css*", localPath: "loaded/styles/kendo.silver.min.css", type: "stylesheet" },
  { path: "/assets/vendor/tiny-slider/tiny-slider.css*", localPath: "loaded/styles/tiny-slider.css", type: "stylesheet" },
  { path: "/assets/css/color.css*", localPath: "loaded/styles/color.css", type: "stylesheet" },
  { path: "/assets/vendor/choices/css/choices.min.css*", localPath: "loaded/styles/choices.min.css", type: "stylesheet" },
  { path: "/assets/vendor/flatpickr/css/flatpickr.min.css*", localPath: "loaded/styles/flatpickr.min.css", type: "stylesheet" },
  { path: "/assets/vendor/glightbox/css/glightbox.css*", localPath: "loaded/styles/glightbox.css", type: "stylesheet" },

  // Images - Dynamic redirects
  { path: "/assets/images/gallery/*", localPath: "loaded/images/gallery/", type: "image", dynamic: true },
  { path: "/assets/images/home/*", localPath: "loaded/images/home/", type: "image", dynamic: true },
  { path: "/assets/images/flags/*", localPath: "loaded/images/flags/", type: "image", dynamic: true },

  // Images - Static redirects
  { path: "/assets/images/logo.png*", localPath: "loaded/images/logo.png", type: "image" },
  { path: "/assets/images/avatar/01.jpg*", localPath: "loaded/images/avatar/01.jpg", type: "image" },

  // Blocked resources
  { path: "/assets/images/favicon.png*", block: true, type: "image" },
  { path: "/assets/videos/SpainInMoroccoEnglish-2.mp4*", block: true, type: "media" },
  { path: "/MAR/home/Spain%20in%20Morocco-English.ogg*", block: true, type: "media" },
  { path: "/MAR/webfonts/*", localPath: "loaded/webfonts/fa-regular-400.woff2", type: "font" },
];

// Special rules that don't follow the domain pattern
const specialRules = [
  {
    urlPattern: "*://fonts.googleapis.com/css2*family=DM+Sans:wght@400;500;700&family=Poppins:wght@400;500;700&display=swap",
    block: true,
    type: "stylesheet"
  },
];

// // AWS WAF patterns - conditionally redirect based on page
// const awsWafPatterns = [
//   "*://*.awswaf.com/*",
//   "*://*.token.awswaf.com/*",
//   "*://*.eu-central-1.token.awswaf.com/*",
//   "*://*/5f2749aa43d4/*",
//   "*://*/telemetry/*"
// ];

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// UNIFIED HANDLER FUNCTION
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function createRedirectHandler(rule) {
  return function (details) {
    if (rule.block) {
      console.log(`Blocking ${rule.type}:`, details.url);
      return { cancel: true };
    }

    if (rule.dynamic) {
      // Extract filename for dynamic redirects
      const url = new URL(details.url);
      const filename = url.pathname.split('/').pop();
      const redirectPath = rule.localPath + filename;
      const redirectUrl = chrome.runtime.getURL(redirectPath);

      console.log(`Dynamic redirect: ${url.pathname} -> ${redirectPath}`);
      return { redirectUrl: redirectUrl };
    }

    // Static redirect
    const redirectUrl = chrome.runtime.getURL(rule.localPath);
    //console.log(`Redirecting: ${details.url} -> ${rule.localPath}`);
    return { redirectUrl: redirectUrl };
  };
}

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// APPLY ALL RULES
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// Apply unified redirect rules
redirectRules.forEach(rule => {
  const urlPatterns = generateUrlPatterns(rule.path);
  const types = [rule.type];

  urlPatterns.forEach(pattern => {
    chrome.webRequest.onBeforeRequest.addListener(
      createRedirectHandler(rule),
      { urls: [pattern], types: types },
      ["blocking"]
    );
  });
});

// Apply special rules
specialRules.forEach(rule => {
  chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
      if (rule.block) {
        console.log(`Blocking special ${rule.type}:`, details.url);
        return { cancel: true };
      }
      const redirectUrl = chrome.runtime.getURL(rule.localPath);
      return { redirectUrl: redirectUrl };
    },
    { urls: [rule.urlPattern], types: [rule.type] },
    ["blocking"]
  );
});

// Track current page URL for AWS filtering
let currentPageUrls = {};

// Listen for page navigation to track current URLs
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.type === "main_frame" && details.tabId >= 0) {
      currentPageUrls[details.tabId] = details.url;
    }
  },
  { urls: ["*://www.blsspainmorocco.net/*", "*://morocco.blsportugal.com/*"] },
  []
);

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener(function (tabId) {
  delete currentPageUrls[tabId];
});

//Apply AWS WAF redirects - Block on slotselection pages, allow elsewhere
// awsWafPatterns.forEach(pattern => {
//   chrome.webRequest.onBeforeRequest.addListener(
//     function(details) {
//       // Check the current page URL for this tab
//       const currentUrl = currentPageUrls[details.tabId] || details.documentUrl || details.initiator || '';
//       const isSlotSelectionPage = currentUrl.toLowerCase().includes('/mar/appointment/slotselection');

//       if (isSlotSelectionPage) {
//         // Block/Redirect AWS resources on slotselection pages
//         const redirectUrl = chrome.runtime.getURL("loaded/scripts/empty.js");
//         console.log("Blocking AWS WAF on slotselection page:", details.url);
//         return { redirectUrl: redirectUrl };
//       } else {
//         // Allow AWS resources on all other pages
//         console.log("Allowing AWS resource (non-slotselection page):", details.url);
//         return {}; // Allow the request to proceed
//       }
//     },
//     { urls: [pattern], types: ["script", "xmlhttprequest", "other"] },
//     ["blocking"]
//   );
// });

// ======= old logic for reference =======

// awsWafPatterns.forEach(pattern => {
//   chrome.webRequest.onBeforeRequest.addListener(
//     function(details) {
//       // Check the current page URL for this tab
//       const currentUrl = currentPageUrls[details.tabId] || details.documentUrl || details.initiator || '';
//       const isSlotSelectionPage = currentUrl.toLowerCase().includes('/mar/appointment/slotselection');

//       if (isSlotSelectionPage) {
//         // Redirect AWS resources on slotselection pages to empty.js
//         const redirectUrl = chrome.runtime.getURL("loaded/scripts/empty.js");
//         console.log("Redirecting AWS WAF to empty.js (slotselection page):", details.url);
//         return { redirectUrl: redirectUrl };
//       } else {
//         // Redirect AWS resources on all other pages to challenge.js
//         const redirectUrl = chrome.runtime.getURL("loaded/scripts/challenge.js");
//         console.log("Redirecting AWS WAF to challenge.js (non-slotselection page):", details.url);
//         return { redirectUrl: redirectUrl };
//       }
//     },
//     { urls: [pattern], types: ["script", "xmlhttprequest", "other"] },
//     ["blocking"]
//   );
// });


// -------------------------------
// INITIALIZATION FUNCTION
// -------------------------------
function initializeExtensionModel() {
  console.log('Initializing multi-domain extension model...');
  console.log('Configured domains:', ALL_DOMAINS);

  // Initialize settings if loadSettings function exists
  if (typeof loadSettings === 'function') {
    return loadSettings()
      .then(() => {
        console.log('Extension background script initialized successfully');
        return true;
      })
      .catch(error => {
        console.error('Error initializing extension:', error);
        return false;
      });
  } else {
    console.log('Extension model loaded without settings initialization');
    return Promise.resolve(true);
  }
}

// -------------------------------
// EXPORT FOR MODULE USAGE
// -------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DOMAIN_1,
    DOMAIN_2,
    ALL_DOMAINS,
    generateUrlPatterns,
    redirectRules,
    initializeExtensionModel
  };
}

// Make globally available for direct script inclusion
if (typeof window !== 'undefined') {
  window.ExtensionModel = {
    DOMAIN_1,
    DOMAIN_2,
    ALL_DOMAINS,
    generateUrlPatterns,
    redirectRules,
    initializeExtensionModel
  };
}