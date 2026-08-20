/**
 * Step 4 — Visa type (runs in PAGE world so Kendo/jQuery work).
 */
(async function () {
  if (window.__fanikaVisaTypePageInstalled) return;
  window.__fanikaVisaTypePageInstalled = true;

  function dbg(event, data) {
    console.log('[fanika/visa-type]', event, data || '');
    if (typeof window.fanikaDebug === 'function') {
      window.fanikaDebug(event, data);
    }
  }

  const path = (location.pathname || '').toLowerCase();
  const isVisa = path.includes('/appointment/visatype');

  dbg('visaType.page.boot', { path, isVisa, url: location.href });

  if (!isVisa) {
    dbg('visaType.page.skip', { reason: 'not a visa-type page', path });
    return;
  }

  let client = null;
  let settings = {};

  try {
    dbg('visaType.data.request', {});
    const data = await window.getFanikaData();
    client = data.client || {};
    settings = data.settings || {};
    dbg('visaType.data.loaded', {
      client: client?.name || null,
      selectedClientId: data.selectedClientId || null,
      location: client?.location || null,
      visaType: client?.visaType || null,
      visaSubtype: client?.visaSubtype || null,
      category: client?.category || null,
      applicantsCount: client?.applicantsCount ?? 1
    });
    if (typeof window.fanikaOverlay === 'function') {
      window.fanikaOverlay('Filling visa type…', 'wipe');
    }
  } catch (err) {
    dbg('visaType.data.fail', { error: err.message });
    if (typeof window.fanikaOverlay === 'function') {
      window.fanikaOverlay('Visa type: load client failed — ' + err.message, 'error');
    }
    return;
  }

  if (!client?.location) {
    dbg('visaType.data.missing', {
      reason: 'client.location empty',
      client: client?.name || null,
      hint: 'Save Location / Visa type / Subtype / Category in Options'
    });
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

  function diagnoseKendo(sel, val) {
    if (typeof jQuery === 'undefined') return 'no jQuery';
    if (!sel) return 'no selector (label not found)';
    if (val == null) return 'no id for value';
    const $el = jQuery(sel);
    if (!$el.length) return 'element missing: ' + sel;
    const w = $el.data('kendoDropDownList') || (window.kendo && kendo.widgetInstance($el));
    if (!w) return 'no kendoDropDownList on ' + sel;
    return null;
  }

  function setKendo(sel, val) {
    if (diagnoseKendo(sel, val)) return false;
    const $el = jQuery(sel);
    const w = $el.data('kendoDropDownList') || (window.kendo && kendo.widgetInstance($el));
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

  function pageSnapshot() {
    return {
      hasJQuery: typeof jQuery !== 'undefined',
      hasKendo: typeof kendo !== 'undefined',
      hasLocationData: Boolean(window.locationData),
      hasVisaIdData: Boolean(window.visaIdData),
      hasVisasubIdData: Boolean(window.visasubIdData),
      hasCategoryData: Boolean(window.categoryData),
      locationNames: (window.locationData || []).slice(0, 8).map((x) => x.Name),
      readyState: document.readyState
    };
  }

  function findVisibleConfirmationModal() {
    const ids = ['PremiumTypeModel', 'MobileBioTypeModel', 'familyDisclaimer'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (
        el.classList.contains('show') ||
        el.getAttribute('aria-hidden') === 'false' ||
        (typeof jQuery !== 'undefined' && jQuery(el).is(':visible'))
      ) {
        return el;
      }
    }
    return null;
  }

  function clickModalAccept(modal) {
    if (!modal) return false;
    const buttons = modal.querySelectorAll('.modal-footer button');
    for (const btn of buttons) {
      if (/^accept$/i.test((btn.textContent || '').trim())) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  /** Visa type only — Accept Premium / Family / Mobile Bio dialogs, then Submit. */
  function handleConfirmationsThenSubmit() {
    let ticks = 0;
    let clearTicks = 0;
    const maxTicks = 60;

    function tick() {
      ticks++;
      const modal = findVisibleConfirmationModal();
      if (modal) {
        clearTicks = 0;
        const title = modal.querySelector('.modal-title')?.textContent?.trim() || modal.id;
        dbg('visaType.modal.visible', { id: modal.id, title, tick: ticks });
        if (clickModalAccept(modal)) {
          dbg('visaType.modal.accept', { id: modal.id, title });
          if (typeof window.fanikaOverlay === 'function') {
            window.fanikaOverlay('Accepted: ' + title, 'ok');
          }
          setTimeout(tick, 400);
          return;
        }
        dbg('visaType.modal.acceptFail', { id: modal.id, title });
        return;
      }

      clearTicks++;
      if (clearTicks >= 3 || ticks >= maxTicks) {
        dbg('visaType.modal.done', { ticks, clearTicks });
        submitFormNow();
        return;
      }
      setTimeout(tick, 100);
    }

    tick();
  }

  function submitFormNow() {
    if (!settings?.submitPages?.visaTypePage) {
      dbg('visaType.submit.skip', { reason: 'auto-submit disabled in settings' });
      return;
    }
    const submitButton = document.getElementById('btnSubmit');
    if (!submitButton) {
      dbg('visaType.submit.fail', { reason: 'btnSubmit not found' });
      return;
    }
    if (findVisibleConfirmationModal()) {
      dbg('visaType.submit.blocked', { reason: 'confirmation modal still open' });
      handleConfirmationsThenSubmit();
      return;
    }
    const delay = settings.submitPages.visaTypePageMs || 0;
    dbg('visaType.submit.start', { delayMs: delay });
    if (delay > 0 && typeof window.startCountdown === 'function') {
      window.startCountdown(delay, 'btnSubmit');
    } else {
      submitButton.click();
    }
  }

  function submitForm() {
    handleConfirmationsThenSubmit();
  }

  function fillForm() {
    dbg('visaType.fill.start', pageSnapshot());

    const fieldState = { ok1: false, ok2: false, ok3: false, ok4: false, ok5: false };
    const fieldLabels = {
      ok1: 'Location',
      ok2: 'Visa Type',
      ok3: 'Visa Sub Type',
      ok4: 'Category',
      ok5: 'Appointment For / Members'
    };
    let attemptCount = 0;
    const maxAttempts = 200;
    let lastWaitLog = 0;
    let lastProgressLog = '';
    let lastStateKey = '';

    const fillInterval = setInterval(() => {
      attemptCount++;
      if (attemptCount >= maxAttempts) {
        clearInterval(fillInterval);
        const locSel = getFieldSelector('Location');
        const visaSel = getFieldSelector('Visa Type');
        const subSel = getFieldSelector('Visa Sub Type');
        const catSel = getFieldSelector('Category');
        const locationId = getIdByName(window.locationData, client.location);
        const timeoutDetail = {
          fieldState,
          attempts: attemptCount,
          client: client.name,
          wanted: {
            location: client.location,
            visaType: client.visaType,
            visaSubtype: client.visaSubtype,
            category: client.category
          },
          resolvedIds: {
            location: locationId,
            visaType: getIdByName(window.visaIdData, client.visaType),
            visaSubtype: getIdByName(window.visasubIdData, client.visaSubtype)
          },
          selectors: { location: locSel, visaType: visaSel, visaSubType: subSel, category: catSel },
          kendoIssues: {
            location: diagnoseKendo(locSel, locationId),
            visaType: diagnoseKendo(visaSel, getIdByName(window.visaIdData, client.visaType)),
            visaSubType: diagnoseKendo(subSel, getIdByName(window.visasubIdData, client.visaSubtype))
          },
          page: pageSnapshot()
        };
        dbg('visaType.fill.timeout', timeoutDetail);
        if (typeof window.fanikaOverlay === 'function') {
          const stuck = Object.entries(fieldState)
            .filter(([, v]) => !v)
            .map(([k]) => fieldLabels[k])
            .join(', ');
          window.fanikaOverlay('Visa fill timeout — stuck: ' + stuck, 'error');
        }
        return;
      }

      if (typeof jQuery === 'undefined' || !window.locationData) {
        if (attemptCount - lastWaitLog >= 20) {
          lastWaitLog = attemptCount;
          dbg('visaType.fill.wait', {
            attempt: attemptCount,
            hasJQuery: typeof jQuery !== 'undefined',
            hasLocationData: Boolean(window.locationData),
            readyState: document.readyState
          });
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

      if (!locationId && attemptCount % 20 === 0) {
        dbg('visaType.id.missing', {
          field: 'location',
          wanted: client.location,
          available: (window.locationData || []).map((x) => x.Name)
        });
      }

      const prevStateKey = lastStateKey;
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
              else if (attemptCount % 20 === 0) {
                dbg('visaType.id.missing', {
                  field: 'visaSubtype',
                  wanted: client.visaSubtype,
                  available: dataSource.map((x) => x.Name)
                });
              }
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

      lastStateKey = JSON.stringify(fieldState);
      if (lastStateKey !== prevStateKey) {
        dbg('visaType.fill.progress', {
          attempt: attemptCount,
          fieldState,
          idMap,
          selectors: {
            location: getFieldSelector('Location'),
            visaType: getFieldSelector('Visa Type'),
            visaSubType: getFieldSelector('Visa Sub Type'),
            category: getFieldSelector('Category')
          }
        });
      } else if (attemptCount % 40 === 0 && lastProgressLog !== lastStateKey) {
        lastProgressLog = lastStateKey;
        const stuck = Object.entries(fieldState)
          .filter(([, ok]) => !ok)
          .map(([k]) => {
            const label = fieldLabels[k];
            const sel =
              k === 'ok1'
                ? getFieldSelector('Location')
                : k === 'ok2'
                  ? getFieldSelector('Visa Type')
                  : k === 'ok3'
                    ? getFieldSelector('Visa Sub Type')
                    : k === 'ok4'
                      ? getFieldSelector('Category')
                      : null;
            const idKey =
              k === 'ok1'
                ? 'location'
                : k === 'ok2'
                  ? 'visaType'
                  : k === 'ok3'
                    ? 'visaSubType'
                    : k === 'ok4'
                      ? 'category'
                      : 'members';
            return {
              field: label,
              issue: sel ? diagnoseKendo(sel, idMap[idKey]) : 'selector not found',
              id: idMap[idKey]
            };
          });
        dbg('visaType.fill.stuck', { attempt: attemptCount, stuck, fieldState });
      }

      if (fieldState.ok1 && fieldState.ok2 && fieldState.ok3 && fieldState.ok4 && fieldState.ok5) {
        clearInterval(fillInterval);
        dbg('visaType.filled', {
          client: client.name,
          location: client.location,
          visaType: client.visaType,
          attempts: attemptCount
        });
        if (typeof window.fanikaOverlay === 'function') {
          window.fanikaOverlay('Visa type filled', 'ok');
        }
        submitForm();
      }
    }, 50);
  }

  function init() {
    dbg('visaType.init', { readyState: document.readyState, snapshot: pageSnapshot() });
    fillForm();
  }

  if (document.readyState === 'complete') init();
  else {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'complete') init();
    });
  }
})();
