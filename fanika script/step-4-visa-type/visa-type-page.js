/**
 * Step 4 — Visa type (runs in PAGE world so Kendo/jQuery work).
 */
(async function () {
  if (window.__fanikaVisaTypePageInstalled) return;
  window.__fanikaVisaTypePageInstalled = true;

  const path = (location.pathname || '').toLowerCase();
  const isVisa =
    path.includes('/appointment/visatype') ||
    (path.includes('/appointment/newappointment') &&
      !document.querySelector('.box-label') &&
      !document.querySelector('#captcha-main-div'));
  if (!isVisa) return;

  let client = null;
  let settings = {};

  try {
    const data = await window.getFanikaData();
    client = data.client || {};
    settings = data.settings || {};
    console.log('[fanika/visa-type] client:', client?.name);
    if (typeof window.fanikaOverlay === 'function') {
      window.fanikaOverlay('Filling visa type…', 'wipe');
    }
  } catch (err) {
    console.error('[fanika/visa-type] load data failed', err);
    return;
  }

  if (!client?.location) {
    console.warn('[fanika/visa-type] No client visa data');
    if (typeof window.fanikaOverlay === 'function') {
      window.fanikaOverlay('No visa fields on client — save in Options', 'error');
    }
    return;
  }

  function getIdByName(arr, name) {
    const it = (arr || []).find(
      (x) => x.Name?.toLowerCase().trim() === String(name || '').toLowerCase().trim()
    );
    return it ? it.Id : null;
  }

  function getFieldSelector(labelText) {
    if (typeof jQuery === 'undefined') return null;
    const lbl = jQuery('label.form-label:visible')
      .filter((i, el) => jQuery(el).text().replace(/\*/g, '').trim() === labelText)
      .first();
    if (!lbl.length) return null;
    const f = lbl.attr('for');
    if (f) return `#${f}`;
    const rid = (lbl.attr('id') || '').replace(/_label$/, '');
    return rid ? `#${rid}` : null;
  }

  function setKendo(sel, val) {
    if (typeof jQuery === 'undefined' || !sel || val == null) return false;
    const $el = jQuery(sel);
    if (!$el.length) return false;
    const w = $el.data('kendoDropDownList') || (window.kendo && kendo.widgetInstance($el));
    if (!w) return false;
    w.value(val);
    w.trigger('change');
    return true;
  }

  function clickRadio(labelText) {
    if (typeof jQuery === 'undefined') return false;
    const lbl = jQuery('label:visible')
      .filter((i, el) => jQuery(el).text().replace(/\*/g, '').trim() === labelText)
      .first();
    if (!lbl.length) return false;
    const rid = lbl.attr('for');
    if (!rid) return false;
    const $r = jQuery('#' + rid);
    if (!$r.prop('checked')) $r.click();
    return true;
  }

  function submitForm() {
    if (!settings?.submitPages?.visaTypePage) {
      console.log('[fanika/visa-type] auto-submit off');
      return;
    }
    const submitButton = document.getElementById('btnSubmit');
    if (!submitButton) return;
    const delay = settings.submitPages.visaTypePageMs || 0;
    if (delay > 0 && typeof window.startCountdown === 'function') {
      window.startCountdown(delay, 'btnSubmit');
    } else {
      submitButton.click();
    }
  }

  function fillForm() {
    const fieldState = { ok1: false, ok2: false, ok3: false, ok4: false, ok5: false };
    let attemptCount = 0;
    const maxAttempts = 200;
    let lastWaitLog = 0;

    const fillInterval = setInterval(() => {
      attemptCount++;
      if (attemptCount >= maxAttempts) {
        clearInterval(fillInterval);
        console.warn('[fanika/visa-type] max fill attempts', fieldState, {
          hasJQuery: typeof jQuery !== 'undefined',
          hasLocationData: Boolean(window.locationData),
          client: client?.name,
          location: client?.location
        });
        if (typeof window.fanikaOverlay === 'function') {
          window.fanikaOverlay('Visa type fill timed out — check Options client', 'error');
        }
        return;
      }

      if (typeof jQuery === 'undefined' || !window.locationData) {
        if (attemptCount - lastWaitLog >= 20) {
          lastWaitLog = attemptCount;
          console.log('[fanika/visa-type] waiting for jQuery/locationData…', attemptCount);
        }
        return;
      }

      const locationId = getIdByName(window.locationData, client.location);
      let categoryId = null;
      if (locationId && window.categoryData && client.category) {
        const filtered = window.categoryData.filter((cat) => cat.LegalEntityId === locationId);
        const matching = filtered.find(
          (cat) =>
            cat.Name?.toLowerCase() === client.category.toLowerCase() ||
            cat.Code?.toLowerCase() === client.category.toLowerCase()
        );
        categoryId = matching ? matching.Id : null;
      }

      const idMap = {
        location: locationId,
        visaType: getIdByName(window.visaIdData, client.visaType),
        visaSubType: getIdByName(window.visasubIdData, client.visaSubtype),
        category: categoryId,
        members: getIdByName(window.applicantsNoData, `${client.applicantsCount || 1} Members`)
      };

      if (!fieldState.ok1) fieldState.ok1 = setKendo(getFieldSelector('Location'), idMap.location);
      if (!fieldState.ok2) fieldState.ok2 = setKendo(getFieldSelector('Visa Type'), idMap.visaType);

      if (!fieldState.ok3 && fieldState.ok2) {
        const selector = getFieldSelector('Visa Sub Type');
        if (selector) {
          const $el = jQuery(selector);
          const widget = $el.data('kendoDropDownList');
          if (widget) {
            widget.dataSource.read();
            const dataSource = widget.dataSource.data();
            const item = dataSource.find(
              (x) => x.Name?.toLowerCase().trim() === client.visaSubtype?.toLowerCase().trim()
            );
            if (item) fieldState.ok3 = setKendo(selector, item.Id);
            else {
              window.visasubIdData = dataSource;
              const newId = getIdByName(window.visasubIdData, client.visaSubtype);
              if (newId) fieldState.ok3 = setKendo(selector, newId);
            }
          }
        }
      }

      if (!fieldState.ok4) {
        const catSel = getFieldSelector('Category');
        if (!catSel && fieldState.ok1 && fieldState.ok2 && fieldState.ok3) {
          fieldState.ok4 = true;
        } else {
          fieldState.ok4 = setKendo(catSel, idMap.category);
        }
      }

      if (!fieldState.ok5) {
        const n = client.applicantsCount || 1;
        if (n > 1) {
          if (clickRadio('Family')) {
            fieldState.ok5 = setKendo(getFieldSelector('Number Of Members'), idMap.members);
          }
        } else {
          fieldState.ok5 = clickRadio('Individual');
        }
      }

      if (fieldState.ok1 && fieldState.ok2 && fieldState.ok3 && fieldState.ok4 && fieldState.ok5) {
        clearInterval(fillInterval);
        if (typeof window.fanikaDebug === 'function') {
          window.fanikaDebug('visaType.filled', {
            client: client.name,
            location: client.location
          });
        }
        if (typeof window.fanikaOverlay === 'function') {
          window.fanikaOverlay('Visa type filled', 'ok');
        }
        submitForm();
      }
    }, 50);
  }

  function init() {
    fillForm();
  }

  if (document.readyState === 'complete') init();
  else {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'complete') init();
    });
  }
})();
