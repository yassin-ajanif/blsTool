
(async function () {
  // Prevent multiple executions
  if (window.__BLS_PORTUGAL_VISATYPE_PAGE_LOADED__) {
    console.log('Portugal VisaType page script already loaded, skipping...');
    return;
  }
  window.__BLS_PORTUGAL_VISATYPE_PAGE_LOADED__ = true;

  /**
   * VisaType page script - Automatically fills the visa application form with client data
   */


  const KEY = {
    VISATYPE_DEADLINE: 'bls_visatype_deadline',
    LAST_DATA: 'bls_last_data'
  };


  const interval = setInterval(() => {
    const input = document.getElementById('Data');
    if (!input || !input.value) return;

    clearInterval(interval);

    const current = input.value;
    const last = localStorage.getItem(KEY.LAST_DATA);
    const deadline = localStorage.getItem(KEY.VISATYPE_DEADLINE);

    if (!deadline || last !== current) {
      localStorage.setItem(KEY.LAST_DATA, current);
      localStorage.removeItem(KEY.VISATYPE_DEADLINE);
      fetchVisatypeDeadline(current);
    }
  }, 200);

  async function fetchVisatypeDeadline(flow) {
    try {
      const url = location.origin + '/mar/account/login?err=' + encodeURIComponent(flow);
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return;

      const html = await res.text();
      const match = html.match(/<div\s+class="alert\s+alert-danger">\s*([^<]+)\s*<\/div>/i);
      if (!match) return;

      const parts = match[1].split('|').map(p => p.trim());
      if (parts.length < 4) return;

      const serverDateTime = parts[3]; // YYYY-MM-DD HH:MM:SS.mmm
      const iso = serverDateTime.replace(' ', 'T');

      let deadline = Date.parse(iso);
      if (isNaN(deadline)) return;

      // 🇵🇹 Portugal fix
      if (location.origin === 'https://morocco.blsportugal.com') {
        deadline += 60 * 60 * 1000;
      }

      localStorage.setItem(KEY.VISATYPE_DEADLINE, deadline);
      console.log('Visatype deadline set to', new Date(deadline).toISOString());
    } catch (_) { }
  }

  // Initialize data variables
  let client = null;
  let settings = {};

  // Fetch data from extension using the new method
  try {
    const data = await window.getExtensionData();
    client = data.client || { name: 'Default Client' };
    settings = data.settings || {};
    console.log('Portugal VisaType page script initialized for client:', client.name);
  } catch (error) {
    console.error('Failed to load extension data:', error);
    client = { name: 'Default Client' };
    settings = {};
  }


  // Submit the form - Updated to extract tokens before checking submission settings
  function submitForm($) {
    return new Promise((resolve) => {
      console.log('Extracting form tokens...');

      // Extract verification token and data
      const tokenInput = document.querySelector('input[name="__RequestVerificationToken"]');
      const dataInput = document.querySelector('#Data');
      const token = tokenInput ? tokenInput.value : '';

      // Get data from input element or URL query parameter
      let data = '';
      if (dataInput) {
        data = dataInput.value;
      } else {
        // Try to extract data from URL query parameter
        const urlSearch = window.location.search;
        const dataMatch = urlSearch.match(/[?&]data=([^&]*)/);
        if (dataMatch && dataMatch[1]) {
          data = dataMatch[1];
        }
      }

      const encodedData = encodeURIComponent(data);

      // Store in localStorage first (since we can't access chrome.storage directly)
      try {
        window.localStorage.setItem('blsRequestVerificationToken', token);
        window.localStorage.setItem('blsDataParam', encodedData);
        console.log("Tokens extracted and stored in localStorage:", token, encodedData);

        // Ensure the encodedData is properly sent by breaking it into separate properties
        // This helps avoid issues with large data objects in custom events
        const dataString = encodedData.toString();

        // Dispatch a custom event that the content script (injector.js) can listen for
        // Make sure the property name matches what injector.js expects (dataParam instead of encodedData)
        const tokenEvent = new CustomEvent('blsTokensExtracted', {
          detail: {
            token: token,
            dataParam: dataString  // Use 'dataParam' here to match injector.js expectations
          }
        });

        // Log what we're sending in the event
        console.log("Sending in custom event - token:", token);
        console.log("Sending in custom event - dataParam:", dataString);

        document.dispatchEvent(tokenEvent);

        // As a backup, also dispatch the tokens individually in case there's an issue with the combined object
        document.dispatchEvent(new CustomEvent('blsTokenExtracted', { detail: token }));
        document.dispatchEvent(new CustomEvent('blsDataExtracted', { detail: dataString }));
      } catch (error) {
        console.error('Error saving tokens to localStorage:', error);
      }

      // Now check if form submission is enabled
      console.log('Checking if form submission is enabled...');

      // Check if automatic submission is enabled for visa type page
      if (settings && settings.submitPages && settings.submitPages.visaTypePage) {
        console.log('Automatic submission is enabled, submitting the form...');

        // Find and click the submit button
        const submitButton = $('#btnSubmit');

        if (submitButton.length) {
          const delay = settings.submitPages.visaTypePageMs || 0;

          if (delay > 0) {
            // Check if countdown utility is available
            if (typeof window.startCountdown === 'function') {
              console.log(`Starting countdown ${delay}ms before submitting...`);
              window.startCountdown(delay, 'btnSubmit');
              resolve();
            } else {
              console.error('Countdown utility not loaded, skipping auto-submit');
              // Do not submit if countdown utility is missing
              resolve();
            }
          } else {
            submitButton.click();
            console.log('Form submitted successfully');
            resolve();
          }
        } else {
          console.warn('Submit button not found');
          resolve();
        }
      } else {
        console.log('Automatic submission is disabled for visa type page. Form is filled but not submitted.');
        resolve();
      }
    });
  }

  // Wait for jQuery and page to be fully loaded
  function waitForDependencies() {
    if (typeof jQuery === 'undefined') {
      console.log('Waiting for jQuery...');
      setTimeout(waitForDependencies, 5);
      return;
    }

    jQuery(document).ready(function ($) {
      console.log('jQuery ready, waiting for page to fully load...');

      // Set up modal observer to immediately close any modals that appear
      setupModalObserver($);

      // Wait for the initial form structure to be ready
      const checkForm = setInterval(() => {
        if ($('form[action*="/Appointment/VisaType"]').length > 0) {
          clearInterval(checkForm);
          console.log('Form detected, waiting for data initialization...');

          // Wait for the global data variables to be initialized
          waitForGlobalData($);
        }
      }, 3);
    });
  }

  // Setup observer to immediately close any modals that appear
  function setupModalObserver($) {
    const modalIds = [
      '#existingVisatype',
      '#Casa1Visatype',
      '#Casa2Visatype',
      '#Casa3Visatype',
      '#PremiumTypeModel',
      '#familyDisclaimer'
    ];

    setInterval(() => {
      modalIds.forEach(modalId => {
        const modal = $(modalId);
        if (modal.length && modal.is(':visible')) {
          closeModal($, modal, modalId);
        }
      });

      // Also close any .modal.show
      if ($('.modal.show').length > 0) {
        $('.modal.show').each(function () {
          closeModal($, $(this), '#' + $(this).attr('id'));
        });
      }
    }, 50);
  }

  function closeModal($, modal, modalId) {
    console.log(`Detected modal: ${modalId}, immediately closing it...`);

    try {
      $(modalId).modal('hide');
      $('#familyDisclaimer').modal('hide');
      $('#PremiumTypeModel').modal('hide');
      $('#existingVisatype').modal('hide');
      $('#Casa1Visatype').modal('hide');
      $('#Casa2Visatype').modal('hide');
      $('#Casa3Visatype').modal('hide');

      $('.modal-backdrop').remove();
      $('body').removeClass('modal-open').css('padding-right', '');
    } catch (e) {
      console.warn('Error closing modal:', e);
    }
  }

  function waitForGlobalData($) {
    const checkGlobalData = setInterval(() => {
      const hasData =
        window.categoryData &&
        window.locationData &&
        window.visaIdData &&
        window.visasubIdData;

      if (hasData) {
        clearInterval(checkGlobalData);
        console.log('Global data detected, initializing form filler...');

        setTimeout(() => {
          fillVisaTypeForm($);
        }, 0);
      }
    }, 5);
  }

  function findVisibleFormElements($) {
    const result = {
      category: null,
      location: null,
      visaType: null,
      visaSubType: null,
      appointmentFor: null,
      numMembers: null
    };

    function isVisible(elem) {
      return $(elem).is(':visible') && $(elem).css('display') !== 'none';
    }

    $('label.form-label:visible').each(function () {
      const label = $(this);
      const labelText = label.text().trim();
      const inputId = label.attr('for');
      const input = $('#' + inputId);

      if (labelText.includes('Category') && !result.category) {
        result.category = input;
      } else if (labelText.includes('Location') && !result.location) {
        result.location = input;
      } else if (labelText.includes('Visa Type') && !labelText.includes('Sub') && !result.visaType) {
        result.visaType = input;
      } else if (labelText.includes('Visa Sub Type') && !result.visaSubType) {
        result.visaSubType = input;
      } else if (labelText.includes('Number Of Members') && !result.numMembers) {
        result.numMembers = input;
      }
    });

    $('label:contains("Appointment For"):visible').each(function () {
      const container = $(this).parent();
      if (isVisible(container) && !result.appointmentFor) {
        result.appointmentFor = container;
      }
    });

    console.log('Found visible form elements:', {
      category: result.category ? result.category.attr('id') : null,
      location: result.location ? result.location.attr('id') : null,
      visaType: result.visaType ? result.visaType.attr('id') : null,
      visaSubType: result.visaSubType ? result.visaSubType.attr('id') : null,
      appointmentFor: result.appointmentFor ? 'found' : null,
      numMembers: result.numMembers ? result.numMembers.attr('id') : null
    });

    return result;
  }

  function fillVisaTypeForm($) {
    try {
      console.log('Starting to fill form with client data:', {
        category: client.category,
        location: client.location,
        visaType: client.visaType,
        visaSubtype: client.visaSubtype,
        applicantsCount: client.applicantsCount || 1
      });

      const formElements = findVisibleFormElements($);

      triggerCategoryDataLoad($, formElements)
        .then(() => selectCategory($, formElements))
        .then(() => waitForLocationData($, formElements))
        .then(() => selectLocation($, formElements))
        .then(() => waitForVisaTypeData($, formElements))
        .then(() => selectVisaType($, formElements))
        .then(() => waitForVisaSubTypeData($, formElements))
        .then(() => selectVisaSubType($, formElements))
        .then(() => setAppointmentType($, formElements))
        .then(() => submitForm($))
        .then(() => {
          console.log('Form filling completed successfully');
        })
        .catch((error) => {
          console.error('Error filling form:', error);
        });

    } catch (error) {
      console.error('Error in fillVisaTypeForm:', error);
    }
  }

  function triggerCategoryDataLoad($, formElements) {
    return new Promise((resolve) => {
      console.log('Triggering category data load...');

      if (!formElements.category) {
        console.warn('Category dropdown not found');
        return resolve();
      }

      const kendoDropdown = formElements.category.data('kendoDropDownList');
      if (!kendoDropdown) {
        console.warn('Category KendoDropDown not initialized');
        return resolve();
      }

      kendoDropdown.open();
      setTimeout(() => {
        kendoDropdown.close();
        console.log('Category data should be loaded now');
        resolve();
      }, 1);
    });
  }

  function selectCategory($, formElements) {
    return new Promise((resolve) => {
      console.log('Selecting category...');

      if (!client.category || !formElements.category) {
        console.warn('Category data or dropdown not available');
        return resolve();
      }

      const kendoDropdown = formElements.category.data('kendoDropDownList');
      if (!kendoDropdown) {
        console.warn('Category KendoDropDown not initialized');
        return resolve();
      }

      const dataItems = kendoDropdown.dataSource.data();
      let foundItem = findMatchingItem(dataItems, client.category);

      if (foundItem) {
        console.log(`Found matching category: ${foundItem.Name} (${foundItem.Id})`);
        kendoDropdown.value(foundItem.Id);
        kendoDropdown.trigger('change');
        setTimeout(resolve, 1);
      } else {
        console.warn(`No matching category found for: ${client.category}`);
        console.log('Available categories:', dataItems.map(item => ({ Id: item.Id, Name: item.Name })));
        resolve();
      }
    });
  }

  function waitForLocationData($, formElements) {
    return new Promise((resolve) => {
      console.log('Waiting for location data to load...');

      if (!formElements.location) {
        console.warn('Location dropdown not found');
        return resolve();
      }

      const kendoDropdown = formElements.location.data('kendoDropDownList');
      if (!kendoDropdown) {
        console.warn('Location KendoDropDown not initialized');
        return resolve();
      }

      setTimeout(() => {
        kendoDropdown.open();
        setTimeout(() => {
          kendoDropdown.close();
          console.log('Location data should be loaded now');
          resolve();
        }, 1);
      }, 5);
    });
  }

  function selectLocation($, formElements) {
    return new Promise((resolve) => {
      console.log('Selecting location...');

      if (!client.location || !formElements.location) {
        console.warn('Location data or dropdown not available');
        return resolve();
      }

      const kendoDropdown = formElements.location.data('kendoDropDownList');
      if (!kendoDropdown) {
        console.warn('Location KendoDropDown not initialized');
        return resolve();
      }

      const dataItems = kendoDropdown.dataSource.data();
      let foundItem = findMatchingItem(dataItems, client.location);

      if (foundItem) {
        console.log(`Found matching location: ${foundItem.Name} (${foundItem.Id})`);
        kendoDropdown.value(foundItem.Id);
        kendoDropdown.trigger('change');
        setTimeout(resolve, 1);
      } else {
        console.warn(`No matching location found for: ${client.location}`);
        console.log('Available locations:', dataItems.map(item => ({ Id: item.Id, Name: item.Name })));
        resolve();
      }
    });
  }

  function waitForVisaTypeData($, formElements) {
    return new Promise((resolve) => {
      console.log('Waiting for visa type data to load...');

      if (!formElements.visaType) {
        console.warn('Visa Type dropdown not found');
        return resolve();
      }

      const kendoDropdown = formElements.visaType.data('kendoDropDownList');
      if (!kendoDropdown) {
        console.warn('Visa Type KendoDropDown not initialized');
        return resolve();
      }

      setTimeout(() => {
        kendoDropdown.open();
        setTimeout(() => {
          kendoDropdown.close();
          console.log('Visa Type data should be loaded now');
          resolve();
        }, 1);
      }, 1);
    });
  }

  function selectVisaType($, formElements) {
    return new Promise((resolve) => {
      console.log('Selecting visa type...');

      if (!client.visaType || !formElements.visaType) {
        console.warn('Visa Type data or dropdown not available');
        return resolve();
      }

      const kendoDropdown = formElements.visaType.data('kendoDropDownList');
      if (!kendoDropdown) {
        console.warn('Visa Type KendoDropDown not initialized');
        return resolve();
      }

      const dataItems = kendoDropdown.dataSource.data();
      let foundItem = findMatchingItem(dataItems, client.visaType);

      if (foundItem) {
        console.log(`Found matching visa type: ${foundItem.Name} (${foundItem.Id})`);
        kendoDropdown.value(foundItem.Id);
        kendoDropdown.trigger('change');
        setTimeout(resolve, 1);
      } else {
        console.warn(`No matching visa type found for: ${client.visaType}`);
        console.log('Available visa types:', dataItems.map(item => ({ Id: item.Id, Name: item.Name })));
        resolve();
      }
    });
  }

  function waitForVisaSubTypeData($, formElements) {
    return new Promise((resolve) => {
      console.log('Waiting for visa sub type data to load...');

      if (!formElements.visaSubType) {
        console.warn('Visa Sub Type dropdown not found');
        return resolve();
      }

      const kendoDropdown = formElements.visaSubType.data('kendoDropDownList');
      if (!kendoDropdown) {
        console.warn('Visa Sub Type KendoDropDown not initialized');
        return resolve();
      }

      setTimeout(() => {
        kendoDropdown.open();
        setTimeout(() => {
          kendoDropdown.close();
          console.log('Visa Sub Type data should be loaded now');
          resolve();
        }, 1);
      }, 1);
    });
  }

  function selectVisaSubType($, formElements) {
    return new Promise((resolve) => {
      console.log('Selecting visa sub type...');

      if (!client.visaSubtype || !formElements.visaSubType) {
        console.warn('Visa Sub Type data or dropdown not available');
        return resolve();
      }

      const kendoDropdown = formElements.visaSubType.data('kendoDropDownList');
      if (!kendoDropdown) {
        console.warn('Visa Sub Type KendoDropDown not initialized');
        return resolve();
      }

      const dataItems = kendoDropdown.dataSource.data();
      let foundItem = findMatchingItem(dataItems, client.visaSubtype);

      if (foundItem) {
        console.log(`Found matching visa sub type: ${foundItem.Name} (${foundItem.Id})`);
        kendoDropdown.value(foundItem.Id);
        kendoDropdown.trigger('change');
        setTimeout(resolve, 1);
      } else {
        console.warn(`No matching visa sub type found for: ${client.visaSubtype}`);
        console.log('Available visa sub types:', dataItems.map(item => ({ Id: item.Id, Name: item.Name })));
        resolve();
      }
    });
  }

  // Helper to match item by ID or name
  function findMatchingItem(dataItems, value) {
    let foundItem = dataItems.find(item =>
      item.Id && item.Id.toString() === value.toString()
    );

    if (!foundItem) {
      foundItem = dataItems.find(item =>
        item.Name && item.Name === value
      );
    }

    if (!foundItem) {
      foundItem = dataItems.find(item =>
        item.Name && item.Name.toLowerCase() === value.toLowerCase()
      );
    }

    if (!foundItem && typeof value === 'string') {
      foundItem = dataItems.find(item =>
        item.Name && item.Name.toLowerCase().includes(value.toLowerCase())
      );
    }

    return foundItem;
  }

  function setAppointmentType($, formElements) {
    return new Promise((resolve) => {
      console.log('Setting appointment type...');

      if (!formElements.appointmentFor) {
        console.warn('Appointment for section not found');
        return resolve();
      }

      const applicantsCount = client.applicantsCount || 1;
      const isFamily = applicantsCount > 1;
      const radioType = isFamily ? 'family' : 'self';

      const container = formElements.appointmentFor;
      const radioSelector = `input[id^="${radioType}"]:visible`;
      const radioButton = container.find(radioSelector);

      if (radioButton.length) {
        console.log(`Setting appointment type to: ${isFamily ? 'Family' : 'Individual'}`);
        radioButton.prop('checked', true);
        radioButton.trigger('click');

        if (isFamily) {
          const membersContainer = $('div[id^="members"]:visible');
          if (membersContainer.length) {
            const membersDropdownId = membersContainer.find('input').attr('id');
            const membersDropdown = $('#' + membersDropdownId);

            if (membersDropdown.length) {
              const kendoDropdown = membersDropdown.data('kendoDropDownList');
              if (kendoDropdown) {
                console.log(`Setting number of members to: ${applicantsCount}`);
                kendoDropdown.open();
                kendoDropdown.close();

                const dataItems = kendoDropdown.dataSource.data();
                const foundItem = dataItems.find(item =>
                  item.Value == applicantsCount ||
                  item.Name == applicantsCount ||
                  (item.Name && item.Name.includes(applicantsCount))
                );

                if (foundItem) {
                  kendoDropdown.value(foundItem.Value);
                  kendoDropdown.trigger('change');
                } else {
                  console.warn(`Could not find matching members count for: ${applicantsCount}`);
                }
              } else {
                console.warn('Members KendoDropDown not initialized');
              }
            } else {
              console.warn('Members dropdown not found');
            }
          } else {
            console.warn('Members container not found');
          }
        }

        resolve();
      } else {
        console.warn(`Radio button for ${radioType} not found`);
        resolve();
      }
    });
  }


  // Also listen for legacy events for backward compatibility
  window.addEventListener('message', function (event) {
    if (event.data.type === 'FROM_EXTENSION_TO_PAGE') {
      if (event.data.action === 'clientUpdated' && event.data.client) {
        client = event.data.client;
        console.log('Client updated via legacy method:', client);
      }
    }
  });


  // Function to wait until the page is fully loaded
  function waitForPageLoad() {
    if (document.readyState === 'complete') {
      console.log('Page fully loaded, proceeding with form handling');
      // Start the entire process
      waitForDependencies();
    } else {
      console.log('Waiting for page to fully load...');
      document.addEventListener('readystatechange', function () {
        if (document.readyState === 'complete') {
          console.log('Page has finished loading, proceeding with form handling');
          // Start the entire process
          waitForDependencies();
        }
      });
    }
  }

  // ─── Disable all Bootstrap modals ─────────────────────────────────────
  function blockModals() {
    if (typeof $ !== 'undefined' && typeof jQuery !== 'undefined') {
      const orig = $.fn.modal;
      $.fn.modal = function (action) {
        if (typeof action === 'string' && /^(show|toggle)$/i.test(action)) return this;
        if (typeof action === 'object' && action.show) return this;
        return orig.apply(this, arguments);
      };
      $(document).on('show.bs.modal', '.modal', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
      });
      $('<style>.modal-backdrop, .modal{display:none!important;}</style>').appendTo('head');
    } else {
      // Fallback: add CSS to block modals
      const style = document.createElement('style');
      style.textContent = '.modal-backdrop, .modal{display:none!important;}';
      document.head.appendChild(style);
    }

    // Ensure scrolling is always enabled by removing modal-related restrictions
    ensureScrollingEnabled();
  }

  function ensureScrollingEnabled() {
    // Safety check: ensure document.body exists
    if (!document.body) {
      return;
    }

    // Remove modal-related classes that prevent scrolling
    document.body.classList.remove('modal-open');

    // Remove any inline styles that might prevent scrolling
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';

    // Remove any modal backdrops that might be interfering
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => backdrop.remove());

    // Ensure html and body can scroll
    if (document.documentElement) {
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    }

    document.body.style.height = '';

    // Force browser to recalculate layout
    document.body.offsetHeight;
  }

  // Block modals immediately and retry if jQuery wasn't available
  blockModals();
  setTimeout(blockModals, 1000);

  waitForPageLoad();

})(); // End of IIFE

