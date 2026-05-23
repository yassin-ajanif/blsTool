
(async function () {


  /**
   * VisaType page script - Automatically fills the visa application form with client data
   * Updated with improved selection logic and milliseconds-only countdown functionality
   */

  // Get session expiration time

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

  // ─────────────────────────────────────────────────────────────────────

  // Initialize data variables
  let client = null;
  let settings = {};

  // Fetch data from extension using the new method
  try {
    const data = await window.getExtensionData();
    client = data.client || {};
    settings = data.settings || {};
    console.log('VisaType page script initialized for client:', client?.name);
  } catch (error) {
    console.error('Failed to load extension data:', error);
    client = { name: 'Default Client' };
    settings = {};
  }

  // ─── Helpers & ID lookups ────────────────────────────────────────────
  function getIdByName(arr, name) {
    // Simple case-insensitive matching
    const it = (arr || []).find(x =>
      x.Name?.toLowerCase().trim() === name?.toLowerCase().trim()
    );
    return it ? it.Id : null;
  }

  function getFieldSelector(labelText) {
    // Handle case where jQuery might not be loaded yet
    if (typeof $ === 'undefined' || typeof jQuery === 'undefined') {
      return null;
    }

    const lbl = $('label.form-label:visible').filter((i, el) =>
      $(el).text().replace(/\*/g, '').trim() === labelText
    ).first();
    if (!lbl.length) return null;
    const f = lbl.attr('for');
    if (f) return `#${f}`;
    const rid = (lbl.attr('id') || '').replace(/_label$/, '');
    return rid ? `#${rid}` : null;
  }

  function setKendo(sel, val) {
    // Handle case where jQuery might not be loaded yet
    if (typeof $ === 'undefined' || typeof jQuery === 'undefined') {
      return false;
    }

    if (!sel || val == null) return false;
    const $el = $(sel);
    if (!$el.length) return false;
    const w = $el.data("kendoDropDownList") ||
      (window.kendo && kendo.widgetInstance($el));
    if (!w) return false;
    w.value(val);
    w.trigger('change');
    return true;
  }

  function clickRadio(labelText) {
    // Handle case where jQuery might not be loaded yet
    if (typeof $ === 'undefined' || typeof jQuery === 'undefined') {
      return false;
    }

    const lbl = $('label:visible').filter((i, el) =>
      $(el).text().replace(/\*/g, '').trim() === labelText
    ).first();
    if (!lbl.length) return false;
    const rid = lbl.attr('for');
    if (!rid) return false;
    const $r = $('#' + rid);
    if (!$r.prop('checked')) $r.click();
    return true;
  }

  // ─── Submit form with token extraction ───────────────────────────────
  function submitForm() {
    return new Promise((resolve) => {

      // Check if automatic submission is enabled
      if (settings && settings.submitPages && settings.submitPages.visaTypePage) {
        console.log('Automatic submission is enabled, submitting the form...');
        const submitButton = document.getElementById('btnSubmit');
        if (submitButton) {
          const delay = settings.submitPages.visaTypePageMs || 0;
          if (delay > 0) {
            // Check if countdown utility is available
            if (typeof window.startCountdown === 'function') {
              console.log(`Starting countdown ${delay}ms before submitting...`);
              window.startCountdown(delay, 'btnSubmit');
            } else {
              console.error('Countdown utility not loaded, skipping auto-submit');
              // Do not submit if countdown utility is missing
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

  // ─── Main form filling logic ─────────────────────────────────────────
  function fillForm() {
    console.log('Starting form fill immediately...');

    // Track field completion state
    let fieldState = {
      ok1: false,
      ok2: false,
      ok3: false,
      ok4: false,
      ok5: false
    };

    // Track attempts counter
    let attemptCount = 0;
    const maxAttempts = 20;

    // Auto-select form fields - start immediately and check for data availability
    const fillInterval = setInterval(() => {
      // Increment attempt counter
      attemptCount++;

      // Check if max attempts reached
      if (attemptCount >= maxAttempts) {
        clearInterval(fillInterval);
        console.log(`⚠️ Reached maximum attempts (${maxAttempts}). Stopping form fill.`);
        return;
      }
      // Skip if client data not available yet
      if (!client) {
        console.log(`Waiting for client data... (Attempt ${attemptCount}/${maxAttempts})`);
        return;
      }

      // Build ID mappings from client data (refresh each time in case data loads)
      const locationId = getIdByName(window.locationData, client.location);

      // Get the correct category based on location's LegalEntityId
      let categoryId = null;
      if (locationId && window.categoryData && client.category) {
        // Filter categories by LegalEntityId matching the location
        const filteredCategories = window.categoryData.filter(cat => cat.LegalEntityId === locationId);
        // Find the category that matches the client's category name from the filtered list
        const matchingCategory = filteredCategories.find(cat =>
          cat.Name.toLowerCase() === client.category.toLowerCase() ||
          cat.Code.toLowerCase() === client.category.toLowerCase()
        );
        categoryId = matchingCategory ? matchingCategory.Id : null;
      }

      const idMap = {
        location: locationId,
        visaType: getIdByName(window.visaIdData, client.visaType),
        visaSubType: getIdByName(window.visasubIdData, client.visaSubtype),
        category: categoryId,
        members: getIdByName(window.applicantsNoData, `${client.applicantsCount || 1} Members`)
      };

      // Try to fill fields (only if not already filled)
      if (!fieldState.ok1) {
        fieldState.ok1 = setKendo(getFieldSelector('Location'), idMap.location);
      }

      if (!fieldState.ok2) {
        fieldState.ok2 = setKendo(getFieldSelector('Visa Type'), idMap.visaType);
      }

      // Handle visa subtype with dependency on visa type
      if (!fieldState.ok3 && fieldState.ok2) {
        // Debug ok3 - Visa Sub Type
        console.log('=== DEBUG OK3 (Visa Sub Type) ===');
        console.log('Client visaSubtype:', client.visaSubtype);

        const selector = getFieldSelector('Visa Sub Type');
        if (selector) {
          const $el = $(selector);
          const widget = $el.data("kendoDropDownList");
          if (widget) {
            // Refresh the data source to get latest options
            widget.dataSource.read();
            const dataSource = widget.dataSource.data();
            console.log('Dropdown data source:', dataSource);
            console.log('Looking for:', client.visaSubtype);

            // Simple case-insensitive matching
            const item = dataSource.find(x =>
              x.Name?.toLowerCase().trim() === client.visaSubtype?.toLowerCase().trim()
            );

            if (item) {
              console.log('Found matching item:', item);
              fieldState.ok3 = setKendo(selector, item.Id);
            } else {
              console.log('No matching item found in dropdown');
              // Refresh visasubIdData and try again with getIdByName
              window.visasubIdData = dataSource;
              const newId = getIdByName(window.visasubIdData, client.visaSubtype);
              if (newId) {
                fieldState.ok3 = setKendo(selector, newId);
              }
            }
          }
        }
        console.log('ok3 result:', fieldState.ok3);
        console.log('=================================');
      }

      if (!fieldState.ok4) {
        fieldState.ok4 = setKendo(getFieldSelector('Category'), idMap.category);
      }

      if (!fieldState.ok5) {
        const applicantsCount = client.applicantsCount || 1;
        if (applicantsCount > 1) {
          if (clickRadio('Family')) {
            fieldState.ok5 = setKendo(
              getFieldSelector('Number Of Members'),
              idMap.members
            );
          }
        } else {
          fieldState.ok5 = clickRadio('Individual');
        }
      }

      // Log progress
      const progress = Object.values(fieldState).filter(Boolean).length;
      if (progress > 0) {
        console.log(`Form fill progress: ${progress}/5 fields completed`);
      }

      // If all fields are filled, proceed to submission
      console.log('Field states:', fieldState);
      if (fieldState.ok1 && fieldState.ok2 && fieldState.ok3 && fieldState.ok4 && fieldState.ok5) {
        clearInterval(fillInterval);
        //   console.log('✅ All fields selected successfully');

      }
    }, 10);
  }


  // ─── Initialize immediately on page load ─────────────────────────────
  function initialize() {

    // Start form filling immediately
    fillForm();
    submitForm();

    // block modals and ensure scrolling
    blockModals();
    ensureScrollingEnabled();

  }

  document.addEventListener('readystatechange', function () {
    if (document.readyState === 'complete') {
      console.log('Page has finished loading, proceeding with form handling');
      initialize();
    }
  });


})(); // End of IIFE