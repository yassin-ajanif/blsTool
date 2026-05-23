/***********************************************************
 * Captcha solving utilities
 ***********************************************************/

// CaptchaSolver namespace
const CaptchaSolver = {
    /**
     * Initialize jQuery and captcha solving
     * @param {Function} onJQueryReady - Optional callback to execute when jQuery is ready
     * @param {Number} delay - Delay before solving captcha after jQuery is ready
     */
    initialize: function (onJQueryReady, delay = 10) {
      if (typeof jQuery === 'undefined') {
        // jQuery is not loaded yet, load it
        console.log('Loading jQuery...');
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.onload = function () {
          console.log('jQuery loaded successfully');
          if (typeof onJQueryReady === 'function') {
            onJQueryReady();
          }
          CaptchaSolver.initSolver(delay);
        };
        document.head.appendChild(script);
      } else {
        // jQuery already exists, initialize directly
        console.log('jQuery already available');
        if (typeof onJQueryReady === 'function') {
          onJQueryReady();
        }
        CaptchaSolver.initSolver(delay);
      }
    },
  
    /**
     * Initialize the captcha solver
     * @param {Number} delay - Delay before solving captcha
     */
    initSolver: function (delay = 10) {
      console.log('Initializing captcha solver...');
  
      jQuery(document).ready(function ($) {
        // Wait for the captcha to fully load
        setTimeout(() => {
          console.log('Attempting to solve captcha...');
          CaptchaSolver.solve();
        }, delay);
      });
    },
  
    /**
     * Main captcha solving function
     * @param {Object} options - Configuration options
     * @param {Function} onSuccess - Callback after successful solving
     */
    solve: async function (options = {}, onSuccess = null) {
      // Get client and settings using new data fetching method
      let client = {};
      let settings = {
        captchaService: {
          activeService: "nocaptchaai",
          nocaptchaai: {
            enabled: true,
            apiKey: ""
          },
          truecaptcha: {
            enabled: false,
            userId: "",
            apiKey: ""
          },
          servercaptcha: {
            enabled: false,
            endpoint: ""
          }
        }
      };
      
      try {
        // Try to fetch data from extension
        if (window.getExtensionData) {
          const data = await window.getExtensionData();
          client = data.client || {};
          settings = data.settings || settings;
          console.log('Captcha solver loaded settings:', settings.captchaService);
        }
      } catch (error) {
        console.warn('Failed to fetch extension data, using defaults:', error);
      }
  
      // Get captcha service configuration from settings
      const captchaSettings = settings.captchaService || {};
      const activeService = captchaSettings.activeService || 'nocaptchaai';
  
      // Check if the selected service is enabled
      const serviceSettings = captchaSettings[activeService] || {};
      if (!serviceSettings.enabled) {
        console.warn(`Selected captcha service ${activeService} is not enabled in settings.`);
        return;
      }
  
      // ----------------------------------------------------
      // 1. Get captcha credentials from settings
      // ----------------------------------------------------
      const solvingService = activeService; // 'nocaptchaai' or 'truecaptcha'
      const apiKey = serviceSettings.apiKey || '';
      const userId = captchaSettings.truecaptcha?.userId || ''; // only needed for TrueCaptcha
  
      // ----------------------------------------------------
      // 2. Basic checks
      // ----------------------------------------------------
      if (!solvingService) {
        console.warn('No "service" specified in settings.');
        return;
      }
  
      // Only NoCaptchaAI and TrueCaptcha require an API key
      const needsKey = ['nocaptchaai', 'truecaptcha'].includes(solvingService.toLowerCase());
      if (needsKey && !apiKey) {
        console.warn('No "apikey" specified in settings.');
        return;
      }
  
      // if (!apiKey) {
      //   console.warn('No "apikey" specified in settings.');
      //   return;
      // }
      if (solvingService.toLowerCase() === 'truecaptcha' && !userId) {
        console.warn('Using "truecaptcha" requires a "userid".');
        return;
      }
  
      // ----------------------------------------------------
      // 3. Wait for captcha to be fully loaded
      // ----------------------------------------------------
      const waitForCaptcha = (callback, maxAttempts = 40) => {
        let attempts = 0;
        let captchaImagesCache = null;
        let lastCheckLength = 0;
        
        const checkInterval = setInterval(() => {
          attempts++;
          
          // Fast check: First just check count without jQuery overhead
          const imgElements = document.getElementsByClassName('captcha-img');
          
          // If count hasn't reached 50 yet, skip expensive checks
          if (imgElements.length < 50) {
            if (attempts >= maxAttempts) {
              clearInterval(checkInterval);
              console.log('Captcha elements not found after max attempts');
              return;
            }
            return; // Skip to next interval
          }
          
          // Only do jQuery selection when count changes or first time
          if (imgElements.length !== lastCheckLength || !captchaImagesCache) {
            captchaImagesCache = jQuery('.captcha-img');
            lastCheckLength = imgElements.length;
          }
          
          // Quick check for box label
          if (!document.querySelector('.box-label:not([style*="display: none"])')) {
            return; // Skip if no visible box label
          }
          
          // Optimized image loading check - sample instead of checking all
          let sampleSize = 10; // Check only 10 random images
          let checkedImages = 0;
          let loadedImages = 0;
          
          // Use native loop for better performance
          for (let i = 0; i < imgElements.length && checkedImages < sampleSize; i += 5) {
            const img = imgElements[i];
            checkedImages++;
            if (img.complete && img.naturalHeight > 0) {
              loadedImages++;
            }
          }
          
          // If sample shows all loaded, do final verification
          if (loadedImages === checkedImages) {
            clearInterval(checkInterval);
            console.log('Captcha fully loaded, proceeding...');
            callback();
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn('Max attempts reached while waiting for images to load');
            callback(); // Proceed anyway
          }
        }, 50); // Check every 50ms for faster response
      };

      // Wait for captcha to be ready before proceeding
      waitForCaptcha(() => {
        // ----------------------------------------------------
        // 4. Gather the target number from the page
        // ----------------------------------------------------
        const target = jQuery('.box-label')
          .sort((a, b) => getComputedStyle(b).zIndex - getComputedStyle(a).zIndex)
          .first()
          .text()
          .replace(/\D+/, '');
  
        // ----------------------------------------------------
        // 5. Gather the captcha images in correct order
        // ----------------------------------------------------
        const grid = (
          jQuery(':has(> .captcha-img):visible')
            .get()
            .reduce((acc, cur) => {
              (acc[Math.floor(cur.offsetTop)] ??= []).push(cur);
              return acc;
            }, [])
            .flatMap(sortedByTop => {
              const sortedByZ = sortedByTop.sort(
                (a, b) => getComputedStyle(b).zIndex - getComputedStyle(a).zIndex
              );
              // top 3 per row
              const top3 = sortedByZ.slice(0, 3);
              return top3.sort((a, b) => a.offsetLeft - b.offsetLeft);
            })
            .map(e => e.firstElementChild)
        );
  
        console.log('Captcha grid =>', grid.map((img) => img.src));
  
        // Default success handler if none provided
        const successHandler = onSuccess || function () {
          // Default behavior is to click the verification button
          jQuery('#btnVerify').trigger('click');
          console.log('Captcha solved and form submitted');
        };
  
        // ----------------------------------------------------
        // Pick which solver to use
        // ----------------------------------------------------
        const serviceName = solvingService.toLowerCase();
        if (serviceName === 'truecaptcha') {
          CaptchaSolver.solveWithTrueCaptcha(grid, target, userId, apiKey, successHandler);
        } else if (serviceName === 'nocaptchaai') {
          CaptchaSolver.solveWithNoCaptchaAI(grid, target, apiKey, successHandler);

        }
        else if (serviceName === 'servercaptcha') {
          if (!serviceSettings.endpoint) {
            console.error('❌ ERROR: No endpoint configured for servercaptcha!');
            return;
          }

          CaptchaSolver.solveWithServerCaptcha(grid, target, serviceSettings.endpoint, successHandler);
        } else {
          console.warn('Unknown captcha service:', solvingService);
        }
      });
    },
  
    /**
     * Utility to map grid images to {0: src, 1: src, ...}
     * @param {Array} grid - The grid of captcha images
     * @return {Object} - Object mapping indices to image sources
     */
    extractCaptchaGridData: function (grid) {
      return Object.fromEntries(grid.map((img) => img.src).entries());
    },
  
    /**
     * Generic error handler
     * @param {String} type - Error type
     * @param {Object} data - Error data
     */
    onError: function (type, data) {
      console.error('Captcha error:', type, data);
      jQuery('.validation-summary-valid').html('<b>Failed to solve captcha.</b>');
    },
  
    /**
     * Solve captcha using NoCaptchaAI service
     * @param {Array} grid - Grid of captcha images
     * @param {String} target - Target number to find
     * @param {String} apiKey - API key for the service
     * @param {Function} onSuccess - Success callback
     */
    solveWithNoCaptchaAI: function (grid, target, apiKey, onSuccess) {
      const imagesData = this.extractCaptchaGridData(grid);
      const $ = jQuery;
  
      $.post({
        url: 'https://pro.nocaptchaai.com/solve',
        headers: { apiKey },
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
          method: 'ocr',
          id: 'morocco',  // optional ID to track usage
          images: imagesData,
        }),
        timeout: 30000,
        beforeSend() {
          this._loading = $(`
              <div class="d-flex align-items-center justify-content-center lead text-warning">
                <span class="spinner-grow"></span>
                &nbsp;Solving captcha ...
              </div>
            `).prependTo('.main-div-container');
        },
        complete(xhr, state) {
          this._loading?.remove();
          if (state === 'success') {
            // Expect shape: { status: 'solved', solution: { '0': '5', '1': '5', ... } }
            const result = xhr.responseJSON;
            if (result.status === 'solved') {
              Object.entries(result.solution).forEach(([index, val]) => {
                if (val === target) {
                  grid[index].click();
                }
              });
  
              // Call success handler
              if (typeof onSuccess === 'function') {
                onSuccess();
              }
            } else {
              CaptchaSolver.onError('captchaerror', result);
            }
          } else {
            CaptchaSolver.onError(state, xhr);
          }
        },
      });
    },
    /**
  * Solve captcha using a custom OCR server
  * @param {Array} grid - Grid of captcha images
  * @param {String} target - Target number to find
  * @param {String} apiKey - API key (if any) for your server
  * @param {String} endpoint - Full URL of your OCR batch endpoint
  * @param {Function} onSuccess - Success callback
  */
    solveWithServerCaptcha: function (grid, target, endpoint, onSuccess) {
      const imagesData = this.extractCaptchaGridData(grid);
      const $ = jQuery;

      $.post({
        url: endpoint,
        contentType: 'application/json',
        dataType: 'text',
        xhrFields: { withCredentials: false },
        crossDomain: true,
        data: JSON.stringify({ images: imagesData }),
        timeout: 30000,
        beforeSend() {
          this._loading = $('<div class="d-flex align-items-center justify-content-center lead text-warning"><span class="spinner-grow"></span>&nbsp;Captcha Trump...</div>')
            .prependTo('.main-div-container');
        },
        complete(xhr, state) {
          this._loading?.remove();

          if (state === 'success') {
            // Try to parse response as JSON
            let parsedResponse;
            try {
              parsedResponse = JSON.parse(xhr.responseText);
            } catch (e) {
              // Response is not JSON, likely HTML error page
              console.error('Server returned non-JSON response. Endpoint:', endpoint, 'Status:', xhr.status);
              CaptchaSolver.onError('Server returned HTML instead of JSON', { status: xhr.status });
              return;
            }

            // Process JSON response
            const sol = parsedResponse?.solutions || parsedResponse?.solution;
            if (sol) {
              Object.entries(sol).forEach(([idx, val]) => {
                if (val === target) grid[idx].click();
              });
              onSuccess?.();
            } else {
              CaptchaSolver.onError('No solutions in response', parsedResponse);
            }
          } else {
            CaptchaSolver.onError(state, { status: xhr.status, responseText: xhr.responseText });
          }
        },
      });
    },
  
    /**
     * Solve captcha using TrueCaptcha service
     * @param {Array} grid - Grid of captcha images
     * @param {String} target - Target number to find
     * @param {String} userId - User ID for the service
     * @param {String} apiKey - API key for the service
     * @param {Function} onSuccess - Success callback
     * @param {Number} retryCount - Number of retries on failure
     */
    solveWithTrueCaptcha: function (grid, target, userId, apiKey, onSuccess, retryCount = 3) {
      const gridData = Object.fromEntries(grid.map((img, index) => [index, img.src]));
      const $ = jQuery;
  
      // "Solving..." indicator
      const loader = $(`
          <div class="d-flex align-items-center justify-content-center lead text-warning">
            <span class="spinner-grow"></span>
            &nbsp;Solving captcha with TrueCaptcha...
          </div>
        `).prependTo('.main-div-container');
  
      // Helper to call the TrueCaptcha endpoint
      function get_captcha(base64Image, callback) {
        // Strip out 'data:image/...' prefix if present
        const cleanBase64 = base64Image.startsWith('data:image/')
          ? base64Image.slice(base64Image.indexOf('base64,') + 7)
          : base64Image;
  
        const params = {
          userid: userId,
          apikey: apiKey,
          data: cleanBase64
        };
  
        fetch('https://api.apitruecaptcha.org/one/gettext', {
          method: 'POST',
          body: JSON.stringify(params),
          headers: { 'Content-Type': 'application/json' }
        })
          .then(response => response.json())
          .then(data => callback(data))
          .catch(error => {
            console.error('Error processing captcha image:', error);
            callback(null); // Pass null to allow retries or handle errors
          });
      }
  
      // Process each image in parallel
      const promises = Object.keys(gridData).map(index =>
        new Promise(resolve => {
          get_captcha(gridData[index], data => {
            resolve({ index, data });
          });
        })
      );
  
      Promise.all(promises)
        .then(results => {
          loader.remove();
          // Check for images where data.result === target
          const correctIndexes = results
            .filter(({ data }) => data && data.success && data.result === target)
            .map(({ index }) => index);
  
          if (correctIndexes.length > 0) {
            correctIndexes.forEach(index => grid[index].click());
  
            // Call success handler
            if (typeof onSuccess === 'function') {
              onSuccess();
            }
          } else if (retryCount > 0) {
            console.warn('Retrying TrueCaptcha...');
            CaptchaSolver.solveWithTrueCaptcha(grid, target, userId, apiKey, onSuccess, retryCount - 1);
          } else {
            CaptchaSolver.onError('Failed after multiple TrueCaptcha attempts', results);
          }
        })
        .catch(error => {
          loader.remove();
          console.error('Error solving TrueCaptcha:', error);
          CaptchaSolver.onError('captchaerror', error);
        });
    }
  };