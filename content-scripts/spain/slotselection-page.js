// Main script (simplified like EmptyPageHandler)

// ===============================================================================
//                          INITIALIZATION
// ===============================================================================

// Wrap in IIFE to avoid global scope pollution and re-declaration errors
(async function () {

    document.documentElement.style.zoom = '77%';

    const global = window;
    let isSubmitting = false;
    let activeRequests = 0;

    // Time sync functions using global data
    const timeSyncFunctions = {
        getSyncedTime() {
            // Always use offset from Infos.js - NO FALLBACK
            if (typeof window.currentTimeOffset === 'undefined' || window.currentTimeOffset === false) {
                throw new Error('No time sync available');
            }

            const timeOffset = window.currentTimeOffset;
            const timestamp = Date.now() + timeOffset;

            return {
                timestamp: timestamp,
                date: new Date(timestamp),
                offset: timeOffset,
                precision: {
                    milliseconds: Math.floor(timestamp % 1000),
                    microseconds: Math.floor((timestamp % 1) * 1000)
                }
            };
        },

        calculateDelayForTargetTime(targetSecond, targetMillisecond = 0) {
            const syncedTime = this.getSyncedTime();
            const now = syncedTime.date;

            // Calculate current position in minute with millisecond precision
            const currentMs = now.getSeconds() * 1000 + now.getMilliseconds();
            const targetMs = targetSecond * 1000 + targetMillisecond;

            let delay = targetMs - currentMs;
            if (delay <= 0) {
                delay += 60000; // Next minute
            }

            // Fine-tune delay based on microsecond precision if available
            const microAdjustment = (syncedTime.precision.microseconds / 1000);
            delay -= microAdjustment;

            return Math.max(0, delay);
        }
    };

    // Flag to prevent multiple initializations
    window.blsFormHandlerInitialized = false;
    window.fastSlotBotInitialized = false;

    // Global state for auto-submit functionality
    let autoSubmitState = {
        isActive: false,
        currentCount: 0,
        timerId: null,
        mode: 'burst',
        hasSubmitted: false  // Track if we've already submitted
    };

    // Create instance of EmptyPageHandler (will be created when needed)
    let emptyPageHandler = null;

    // Initialize data variables
    let client = null;
    let settings = {};
    let globalTimeSyncData = null; // Store time sync data globally

    // Store manually selected slot IDs globally when multisubmit is enabled
    window.window.manuallySelectedSlots = [];

    // Fetch data from extension using the new method
    try {
        const data = await window.getExtensionData();
        client = data.client;
        settings = data.settings || {};

        // Store time sync data globally for use by timeSyncFunctions
        if (data.timeSyncData) {
            globalTimeSyncData = data.timeSyncData;
            console.log('Time sync loaded:', data.timeSyncData.offset.toFixed(3) + 'ms');
        }

        console.log('Slot selection page data loaded:', { client: client.name, hasSettings: !!settings });
    } catch (error) {
        console.error('Failed to load extension data:', error);
        client = { name: 'Default Client' };
        settings = {};
    }


    // Defer initialization to ensure all classes are defined
    function initializePage() {

        if (document.readyState === 'complete') {
            setTimeout(checkEmptyPage, 0);
        } else {
            document.addEventListener('readystatechange', () => {
                if (document.readyState === 'complete') {
                    setTimeout(checkEmptyPage, 0);
                }
            });
        }
    }

    // Create loader immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.createGlobalCustomLoader);
    } else {
        window.createGlobalCustomLoader();
    }

    // ===============================================================================
    //                          PAGE TYPE DETECTION AND ROUTING
    // ===============================================================================

    function checkEmptyPage() {
        if (!document.querySelector('header') && !document.querySelector('footer')) {
            // Empty page - use EmptyPageHandler singleton
            if (!emptyPageHandler && window.getEmptyPageHandler) {
                emptyPageHandler = window.getEmptyPageHandler();
                emptyPageHandler.init();
            }
        } else {
            // non empty page - reconnect if not submit type
            window.getExtensionData?.().then(d => {
                const gs = d?.websocketGroup;
                if (gs?.subscribe && gs.subscribe !== 'submit') {
                    window.postMessage({ type: 'GROUPSUBMIT_REQUEST', source: 'slotselection', subscribe: 'submit' }, '*');
                }
                initGroupSubmitDiv();
            }).catch(() => { });

            // Non-empty page
            if (window.fastSlotBotInstance) {
                return;
            }

            new FastSlotBot().start();
            replaceSubmitButton();
            enableAllSlots();
            initAutoSubmitControls();
        }
    }

    // ===============================================================================
    //                          NON-EMPTY PAGE FUNCTIONS
    // ===============================================================================

    class FastSlotBot {
        constructor() {
            this.hasRetried = false;

            if (window.fastSlotBotInitialized) {
                return window.fastSlotBotInstance;
            }

            window.fastSlotBotInitialized = true;
            window.fastSlotBotInstance = this;
        }

        start() {
            this.hidePreloader();
            this.setupEventHandlers();
            this.optimizeUI();
            this.selectSlot();
        }

        hidePreloader() {
            $('.preloader').hide();
        }

        setupEventHandlers() {
            const that = this;
            global.OnAppointmentdateChange = function () {
                return that.fastGetSlots();
            };
        }

        optimizeUI() {
            setTimeout(() => {
                const mainDiv = $('#div-main');
                const firstChild = mainDiv.children().first();
                const lastChild = mainDiv.children().last();
                const formContainer = mainDiv.children(':has(form)');

                firstChild.addClass('d-none');
                lastChild.addClass('d-none');
                formContainer.addClass('mx-auto').css('max-width', '800px');

                // Start auto-submit countdown if enabled
                this.startAutoSubmitCountdown();
            }, 50);
        }

        startAutoSubmitCountdown() {
            // Start countdown immediately on page load if enabled
            if (settings.submitPages && settings.submitPages.slotSelectionPage) {
                // Get delay from settings
                let delayMs = settings.submitPages.slotSelectionPageMs || 0;

                // Check if countdown utility is available
                if (typeof window.startCountdown === 'function') {
                    console.log(`Starting countdown ${delayMs}ms before auto-submitting form...`);

                    // Use the countdown utility on the Trump button
                    // The countdown will update the button text and click it when done
                    window.startCountdown(delayMs, 'btnTrump');

                    // Mark that we've started the auto-submit process
                    autoSubmitState.hasSubmitted = true;
                } else {
                    console.error('Countdown utility not loaded, skipping auto-submit');
                    // Do not submit if countdown utility is missing
                }
            }
        }

        selectSlot() {
            const that = this;

            $(document).ready(function () {
                setTimeout(() => {
                    if (global.availDates && global.availDates.ad) {
                        const allowedDates = global.availDates.ad.filter(it => it.AppointmentDateType === 0);

                        if (allowedDates.length > 0) {
                            const randomIndex = Math.floor(Math.random() * allowedDates.length);
                            const selectedDate = allowedDates[randomIndex];

                            if (selectedDate) {
                                const datePicker = $('.k-datepicker:visible .k-input').data('kendoDatePicker');

                                if (datePicker) {
                                    datePicker.value(selectedDate.DateText);
                                    datePicker.trigger('change');
                                } else {
                                    setTimeout(() => {
                                        const retryDatePicker = $('.k-datepicker:visible .k-input').data('kendoDatePicker');
                                        if (retryDatePicker) {
                                            retryDatePicker.value(selectedDate.DateText);
                                            retryDatePicker.trigger('change');
                                        }
                                    }, 5);
                                }
                            }
                        }
                    }
                }, 2);
            });
        }

        fastGetSlots() {
            const apptDate = $('.k-datepicker:visible .k-input').val();
            const slotDropDown = $('.k-dropdown:visible > .form-control').data('kendoDropDownList');

            // Clear manually selected slots when date changes (new slots will be loaded)
            if (window.manuallySelectedSlots && window.manuallySelectedSlots.length > 0) {
                console.log('Date changed, clearing manually selected slots');
                window.manuallySelectedSlots = [];

                // Update the counter display
                const multiBtn = document.getElementById('multiSubmitBtn');
                if (multiBtn) {
                    multiBtn.textContent = 'M[0]';
                }
            }

            if (!apptDate) {
                if (slotDropDown) {
                    slotDropDown.value(undefined);
                    slotDropDown.setDataSource([]);
                }
                return false;
            }

            const tokenInput = $('input[name="__RequestVerificationToken"]');
            const token = tokenInput.length ? tokenInput.val() : null;

            if (!token) {
                global.ShowError('Security token missing - please refresh the page');
                return false;
            }

            const baseUrl = '/MAR/Appointment/GetAvailableSlotsByDate';

            window.showCustomLoader('Loading slots...');

            const urlParams = new URLSearchParams(location.search);
            const dataParam = urlParams.get('data');

            const finalUrl = `${baseUrl}?data=${encodeURIComponent(dataParam)}&appointmentDate=${apptDate}&loc=${client.location.toUpperCase()}`;

            const ajaxRequest = $.ajax({
                type: 'POST',
                url: finalUrl,
                dataType: 'json',
                cache: false,
                headers: {
                    'RequestVerificationToken': token,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                success: (data) => {
                    if (data.success) {
                        global.slotDataSource = data.data;
                        this.fastSelectSlot(data.data);
                    } else {
                        global.ShowError(data.err);
                        if (data.ru && global.confirm(`You will be redirected to: ${data.ru}`)) {
                            global.location.replace(data.ru);
                        }
                    }
                },
                error: (xhr, status, error) => {
                    if (status === 'abort') {
                        return;
                    }

                    if (xhr.status === 400 || xhr.status === 403) {
                        global.ShowError('Security validation failed - please refresh the page');
                    } else {
                        global.ShowError('Failed to fetch available slots');
                    }

                    this.retryGetSlots();
                },
                complete: () => {
                    window.hideCustomLoader();
                }
            });

            return true;
        }

        retryGetSlots() {
            if (!this.hasRetried) {
                this.hasRetried = true;
                window.hideCustomLoader();
                setTimeout(() => this.fastGetSlots(), 50);
            }
        }

        fastSelectSlot(slots) {
            if (!slots || slots.length === 0) {
                return;
            }

            const availableSlots = slots.filter(s => s.Count > 0);

            if (availableSlots.length === 0) {
                return;
            }

            const sortedSlots = availableSlots.sort((a, b) => b.Count - a.Count);
            const topSlots = sortedSlots.slice(0, 2);
            const randomIndex = Math.floor(Math.random() * topSlots.length);
            const selectedSlot = topSlots[randomIndex];

            if (selectedSlot) {
                const slotDropDown = $('.k-dropdown:visible > .form-control').data('kendoDropDownList');

                if (slotDropDown) {
                    slotDropDown.setDataSource(slots);
                    slotDropDown.value(selectedSlot.Id);
                    slotDropDown.trigger('change');

                    // Add the auto-selected slot to manually selected slots
                    if (!window.manuallySelectedSlots.includes(selectedSlot.Id)) {
                        window.manuallySelectedSlots.push(selectedSlot.Id);
                        console.log('Auto-selected slot added:', selectedSlot.Id);

                        // Update the counter
                        const multiBtn = document.getElementById('multiSubmitBtn');
                        if (multiBtn) {
                            multiBtn.textContent = `M[${window.manuallySelectedSlots.length}]`;
                        }
                    }

                    // Auto-submit is handled by startAutoSubmitCountdown() on page load
                }
            }
        }

    }



    function replaceSubmitButton() {
        const submitButton = document.getElementById('btnSubmit');

        if (submitButton) {
            submitButton.style.display = 'none';

            // Create the regular submit button
            const newButton = document.createElement('button');
            newButton.id = 'btnTrump';
            newButton.type = 'submit';
            newButton.className = submitButton.className;
            newButton.textContent = 'SUBMIT';

            if (submitButton.hasAttribute('form')) {
                newButton.setAttribute('form', submitButton.getAttribute('form'));
            }

            submitButton.parentNode.insertBefore(newButton, submitButton.nextSibling);

        }
    }

    function enableAllSlots() {
        const style = document.createElement('style');
        style.innerHTML = `
        .k-calendar .k-content td{cursor:pointer!important;pointer-events:auto!important}
        .k-calendar .k-content a[data-value]{background:var(--bs-success)!important;margin:1px!important;opacity:1!important;color:#fff!important;height:2.2em!important;width:2.2em!important;cursor:pointer!important;pointer-events:auto!important}
        .k-calendar .k-disabled,.k-calendar .k-state-disabled{opacity:1!important;cursor:pointer!important;pointer-events:auto!important}
        .k-list .k-item.k-state-selected-custom{font-weight:600!important}
        .k-list .k-item.slot-available{background:var(--bs-success)!important;color:#fff!important}
        .k-list .k-item.slot-unavailable{background:var(--bs-danger)!important;color:#fff!important}
        .k-list .k-item{margin:3px 5px!important;padding:5px 10px!important;border-radius:3px!important}
    `;
        document.head.appendChild(style);

        const slotTemplate = document.getElementById('Slottemplate');
        if (slotTemplate) {
            const originalTemplate = slotTemplate.innerHTML;
            if (!originalTemplate.includes('[ #:data.Count # ]')) {
                let modifiedTemplate = originalTemplate.replace(
                    /#:\s*data\.Name\s*#/g,
                    '#: data.Name # [ #:data.Count # ]'
                );

                if (modifiedTemplate === originalTemplate) {
                    modifiedTemplate = modifiedTemplate.replace(
                        /data\.Name/g,
                        'data.Name + " [ " + data.Count + " ]"'
                    );
                }

                slotTemplate.innerHTML = modifiedTemplate;
            }
        }

        setTimeout(() => {
            $('.k-dropdown:visible > .form-control').each(function () {
                const element = $(this);
                const dropdown = element.data('kendoDropDownList');

                if (dropdown) {
                    const currentValue = dropdown.value();
                    dropdown.destroy();

                    const enhancedOnSlotOpen = function () {
                        if (window.slotDataSource) {
                            this.setDataSource(window.slotDataSource);
                        }

                        // Always restore selected state when opening
                        const dropdownWidget = this;
                        setTimeout(() => {
                            const listView = dropdownWidget.popup.element.find('.k-list-scroller');

                            // Apply selected state and availability colors to all items
                            listView.find('.k-item').each(function () {
                                const slotIdx = $(this).attr('data-offset-index');
                                const dataItem = dropdownWidget.dataSource ? dropdownWidget.dataSource.view()[slotIdx] : null;

                                if (dataItem) {
                                    // Apply availability colors if not already applied
                                    if (!$(this).hasClass('slot-available') && !$(this).hasClass('slot-unavailable')) {
                                        if (dataItem.Count > 0) {
                                            $(this).addClass('slot-available');
                                        } else {
                                            $(this).addClass('slot-unavailable');
                                        }
                                    }

                                    // Handle selection state
                                    $(this).removeClass('k-state-selected-custom');

                                    // Add selected state if in selection array
                                    if (window.manuallySelectedSlots && window.manuallySelectedSlots.length > 0 && window.manuallySelectedSlots.includes(dataItem.Id)) {
                                        $(this).addClass('k-state-selected-custom');
                                        // Update HTML to show checkmark
                                        const text = '✓ ' + dataItem.Name + ' [ ' + dataItem.Count + ' ]';
                                        $(this).html(text);
                                    } else {
                                        // Ensure no checkmark for unselected items
                                        const text = dataItem.Name + ' [ ' + dataItem.Count + ' ]';
                                        $(this).html(text);
                                    }
                                }
                            });

                            console.log('Restored selected slots:', window.manuallySelectedSlots);
                        }, 100);

                        // Check if multisubmit is enabled
                        const savedOptions = JSON.parse(localStorage.getItem('autoSubmitOptions') || 'null') || {};
                        const multiSubmitEnabled = savedOptions.multiSubmit || false;

                        if (multiSubmitEnabled) {
                            // Store the original close method
                            const originalClose = this.close.bind(this);

                            // Override the close method to prevent closing on selection
                            this.close = function () {
                                // Only allow closing through the outside click handler
                                // Do nothing here to prevent auto-close
                            };

                            // Store the original close method for restoration later
                            this._originalClose = originalClose;
                            // Setup multi-selection behavior
                            setTimeout(() => {
                                const listView = this.popup.element.find('.k-list-scroller');

                                // Remove existing click handlers to prevent duplicates
                                listView.off('click.multiselect');

                                // Add click handler for multi-selection
                                listView.on('click.multiselect', '.k-item', (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.stopImmediatePropagation();

                                    const item = $(e.currentTarget);
                                    const slotId = item.attr('data-offset-index');
                                    const dataItem = this.dataSource.view()[slotId];

                                    if (dataItem && dataItem.Id) {
                                        const index = window.manuallySelectedSlots.indexOf(dataItem.Id);

                                        if (index > -1) {
                                            // Remove from selection
                                            window.manuallySelectedSlots.splice(index, 1);
                                            item.removeClass('k-state-selected-custom');
                                            // Update HTML to remove indicator
                                            const text = dataItem.Name + ' [ ' + dataItem.Count + ' ]';
                                            item.html(text);
                                            console.log('Deselected slot:', dataItem.Id);
                                        } else {
                                            // Add to selection
                                            window.manuallySelectedSlots.push(dataItem.Id);
                                            item.addClass('k-state-selected-custom');
                                            // Update HTML to add indicator
                                            const text = '✓ ' + dataItem.Name + ' [ ' + dataItem.Count + ' ]';
                                            item.html(text);
                                            console.log('Selected slot:', dataItem.Id);
                                        }

                                        // Keep availability classes - don't remove them

                                        // Update the selected count display
                                        const multiBtn = document.getElementById('multiSubmitBtn');
                                        if (multiBtn) {
                                            multiBtn.textContent = `M[${window.manuallySelectedSlots.length}]`;
                                        }
                                    }

                                    return false; // Prevent dropdown from closing
                                });

                                // Note: Selected state and colors are already applied in the main open handler

                                // Add click-outside handler to close dropdown
                                $(document).off('click.multiselect-outside');
                                $(document).on('click.multiselect-outside', (e) => {
                                    if (!$(e.target).closest('.k-animation-container, .k-dropdown').length) {
                                        // Use the original close method if available
                                        if (this._originalClose) {
                                            this._originalClose();
                                        } else {
                                            this.close();
                                        }
                                        $(document).off('click.multiselect-outside');
                                    }
                                });
                            }, 100);
                        }
                    };

                    const enhancedOnSlotClose = function () {
                        // Clean up event handlers when dropdown closes
                        $(document).off('click.multiselect-outside');

                        // Restore original close method if it was overridden
                        if (this._originalClose) {
                            this.close = this._originalClose;
                            delete this._originalClose;
                        }
                    };

                    // Helper function to get slot display HTML
                    window.getSlotDisplayHtml = function (dataItem) {
                        return dataItem.Name + ' [ ' + dataItem.Count + ' ]';
                    };

                    element.kendoDropDownList({
                        optionLabel: "--Select--",
                        dataTextField: "Name",
                        dataValueField: "Id",
                        filter: "contains",
                        open: enhancedOnSlotOpen,
                        close: enhancedOnSlotClose,
                        select: function (e) {
                            // Check if multisubmit is enabled
                            const savedOptions = JSON.parse(localStorage.getItem('autoSubmitOptions') || 'null') || {};
                            const multiSubmitEnabled = savedOptions.multiSubmit || false;

                            if (multiSubmitEnabled) {
                                // Prevent default selection behavior
                                e.preventDefault();
                                return false;
                            }
                        },
                        template: $("#Slottemplate").html(),
                        footerTemplate: ({ instance }) => $("#slot-footer-template").html(),
                        height: 500
                    });

                    if (currentValue) {
                        element.data('kendoDropDownList').value(currentValue);
                    }
                }
            });
        }, 10);
    }

    // Form submission functions
    function getBaseUrl() {
        return window.location.href.includes('morocco.blsportugal.com')
            ? 'https://morocco.blsportugal.com/MAR'
            : 'https://www.blsspainmorocco.net/MAR';
    }


    function submitAppointmentFormWithRotation(form) {
        // Always check for manually selected slots first (including auto-selected slot)
        if (window.manuallySelectedSlots && window.manuallySelectedSlots.length > 0) {
            console.log(`Submitting ${window.manuallySelectedSlots.length} selected slots`);

            // Submit each manually selected slot
            window.manuallySelectedSlots.forEach((slotId, index) => {
                console.log(`Submitting slot ${index + 1}/${window.manuallySelectedSlots.length}: ${slotId}`);
                submitSingleSlot(form, slotId);
            });

            // DON'T clear the selection - keep them for next submission
            console.log('Keeping selected slots for next submission');

            return true;
        }

        // If no manually selected slots, do normal single submission
        console.log('No selected slots, performing single submission');
        return submitSingleSlot(form);
    }

    function submitSingleSlot(form, slotId = null) {
        const multiSubmitEnabled = getMultiSubmitState();

        if (!multiSubmitEnabled) {
            if (isSubmitting) {
                showNotification("⚠️ Already submitting", 'bg-warning');
                return false;
            }
            isSubmitting = true;
        }

        const finalUrl = `${getBaseUrl()}/Appointment/SlotSelection`;

        try {
            if (!form) {
                if (!multiSubmitEnabled) isSubmitting = false;
                return false;
            }

            try {
                const excludedNames = ['Data', 'ResponseData', 'AppointmentFor', 'SearchDate', '__RequestVerificationToken'];
                const formInputData = {};

                const inputs = form.querySelectorAll('input');
                for (const input of inputs) {
                    const inputName = input.getAttribute('name');
                    if (inputName && !excludedNames.includes(inputName)) {
                        formInputData[inputName] = input.value;
                    }
                }

                // If custom slotId provided, find and update the numeric slot field in payload
                if (slotId !== null) {
                    console.log(`Using custom slot ID: ${slotId}`);

                    // Find the ONE field that contains only digits (the slot ID field)
                    Object.keys(formInputData).forEach(key => {
                        const value = formInputData[key];
                        // Check if this field contains only digits (the slot ID)
                        if (value && /^\d+$/.test(value.toString()) && value !== '') {
                            console.log(`Found slot field "${key}" with value ${value}, updating to ${slotId}`);
                            // Update the formInputData object for ResponseData payload
                            formInputData[key] = slotId.toString();
                        }
                    });
                }

                // Update the ResponseData with the modified form data (including custom slot if provided)
                const responseDataInput = form.querySelector('#ResponseData');
                if (responseDataInput) {
                    responseDataInput.value = JSON.stringify(formInputData);
                    console.log('Final ResponseData:', responseDataInput.value);
                }
            } catch (prepareError) {
                alert(`Error preparing form: ${prepareError.message}`);
                if (!multiSubmitEnabled) isSubmitting = false;
                return false;
            }

            const tokenInput = form.querySelector('input[name="__RequestVerificationToken"]');
            if (!tokenInput) {
                alert('Missing request verification token');
                if (!multiSubmitEnabled) isSubmitting = false;
                return false;
            }

            const token = tokenInput.value;
            if (!token) {
                alert('Empty request verification token');
                if (!multiSubmitEnabled) isSubmitting = false;
                return false;
            }

            // Create FormData from the form
            const formData = new FormData(form);

            // If we have a custom slot ID, update it in the FormData
            if (slotId !== null) {
                // Find and update the numeric field in FormData
                for (let [key, value] of formData.entries()) {
                    if (value && /^\d+$/.test(value.toString()) && value !== '') {
                        console.log(`Updating ${key} in FormData from ${value} to ${slotId}`);
                        formData.set(key, slotId.toString());
                        break;
                    }
                }
            }

            const serializedData = new URLSearchParams(formData).toString();

            if (multiSubmitEnabled) {
                activeRequests++;
            }

            showCustomLoader('Submitting form...');

            fetch(finalUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'RequestVerificationToken': token,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: serializedData,
                redirect: 'manual',
                credentials: 'include',
                cache: 'no-store',
                mode: 'same-origin'
            })
                .then(async response => {
                    if (multiSubmitEnabled) {
                        activeRequests--;

                        if (activeRequests === 0) {
                            hideCustomLoader();
                        } else {
                            showCustomLoader('Submitting form...');
                        }
                    } else {
                        hideCustomLoader();
                        isSubmitting = false;
                    }
                })
                .catch(error => {
                    if (multiSubmitEnabled) {
                        activeRequests--;

                        if (activeRequests === 0) {
                            hideCustomLoader();
                        } else {
                            showCustomLoader('Submitting form...');
                        }
                    } else {
                        hideCustomLoader();
                        isSubmitting = false;
                    }
                });

            return true;
        } catch (error) {
            if (multiSubmitEnabled && activeRequests > 0) {
                activeRequests--;
            }
            if (!multiSubmitEnabled) {
                isSubmitting = false;
            }

            if (!multiSubmitEnabled || activeRequests === 0) {
                hideCustomLoader();
            }

            return false;
        }
    }

    function showNotification(message, bgClass = 'bg-dark') {
        document.getElementById('linkRotationNotification')?.remove();
        const notification = document.createElement('div');
        notification.id = 'linkRotationNotification';
        notification.className = `position-fixed ${bgClass} text-white px-3 py-2 rounded shadow small font-monospace`;
        notification.style.cssText = 'top:90px;right:20px;z-index:10000';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    // Form handler initialization
    if (!window.blsFormHandlerInitialized) {
        window.blsFormHandlerInitialized = true;

        const processedForms = new Set();

        function submitAppointmentForm(form) {
            return submitAppointmentFormWithRotation(form);
        }

        function attachFormHandlers() {
            const forms = document.querySelectorAll('form');

            forms.forEach(form => {
                const formId = Array.from(document.forms).indexOf(form);

                if (processedForms.has(formId)) {
                    return;
                }

                processedForms.add(formId);

                form.addEventListener('submit', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    submitAppointmentForm(form);
                    return false;
                }, true);

                const submitButtons = form.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])');
                submitButtons.forEach(button => {
                    button.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        submitAppointmentForm(form);
                        return false;
                    }, true);
                });
            });
        }

        function initForms() {
            attachFormHandlers();
            setTimeout(attachFormHandlers, 1000);
            setTimeout(attachFormHandlers, 3000);
            window.addEventListener('load', attachFormHandlers);
            document.addEventListener('DOMContentLoaded', attachFormHandlers);
        }

        initForms();
    }

    // ===============================================================================
    //                          AUTO-SUBMIT CONTROLS
    // ===============================================================================


    function initAutoSubmitControls() {
        if (document.getElementById('autoSubmitControls')) {
            return;
        }

        const mainTag = document.querySelector('main');
        if (!mainTag) {
            return;
        }

        const savedOptions = JSON.parse(localStorage.getItem('autoSubmitOptions') || 'null') || {
            nRequests: 1,
            delayMs: 5000,
            mode: 'burst',
            targetSecond: 20,
            targetMillisecond: 0,
            multiSubmit: true
        };

        // Always start with inactive state - user must manually start
        const savedState = {
            isActive: false,
            currentCount: 0,
            mode: savedOptions.mode || 'burst'
        };

        autoSubmitState.mode = savedState.mode || savedOptions.mode || 'burst';

        // Get available dates
        const dates = global.availDates?.ad?.filter(date =>
            date.AppointmentDateType === 0 || date.AppointmentDateType === 1
        ) || [];

        // Generate toolbar HTML (using Bootstrap classes + unified sizing)
        const burstActive = autoSubmitState.mode === 'burst';
        const schedActive = autoSubmitState.mode === 'scheduled';
        const multiSubmitActive = savedOptions.multiSubmit !== undefined ? savedOptions.multiSubmit : true;
        const fieldStyle = 'width:60px;height:50px;font-size:14px;padding:8px 0';
        const btnStyle = 'width:60px;height:50px;font-size:12px';

        const toolbarHTML = `
        <div id="autoSubmitControls" class="d-flex flex-wrap align-items-center justify-content-center gap-2 bg-white border rounded p-2 font-monospace" style="font-size:12px">
            <div class="d-flex flex-wrap align-items-center justify-content-center gap-1">
                <button id="gsToggleBtn" class="btn ${localStorage.getItem('gsEnabled') === '1' ? 'btn-success' : 'btn-danger'} fw-semibold mb-0" style="${btnStyle}">GS</button>
                <input type="number" id="autoSubmitRequests" min="1" max="100" value="${savedOptions.nRequests}" class="form-control-sm text-center fw-medium border" style="${fieldStyle}">
                <button id="modeToggleBtn" class="btn btn-primary fw-normal mb-0" style="${btnStyle};font-size:16px">${burstActive ? '<i class="fa-solid fa-bolt"></i>' : '<i class="fa-solid fa-clock"></i>'}</button>
                <button id="multiSubmitBtn" class="btn fw-semibold mb-0 ${multiSubmitActive ? 'btn-info' : 'btn-light'}" style="${btnStyle}">M[0]</button>

                <div id="burstModeControls" class="${burstActive ? 'd-flex' : 'd-none'} align-items-center gap-1">
                    <input type="number" id="autoSubmitDelayMs" min="0" max="60000" value="${savedOptions.delayMs}" class="form-control-sm text-center fw-medium border" style="width:70px;height:50px;font-size:14px;padding:8px 0">
                </div>

                <div id="scheduledModeControls" class="${schedActive ? 'd-flex' : 'd-none'} align-items-center gap-1">
                    <input type="number" id="autoSubmitTargetSecond" min="0" max="59" value="${savedOptions.targetSecond}" class="form-control-sm text-center fw-medium border" style="${fieldStyle}">
                    <input type="number" id="autoSubmitTargetMillisecond" min="0" max="999" value="${savedOptions.targetMillisecond}" class="form-control-sm text-center fw-medium border" style="${fieldStyle}">
                </div>

                <div class="bg-secondary mx-1" style="width:1px;height:30px"></div>
            </div>

            <div class="d-flex align-items-center justify-content-center">
                <button id="autoSubmitToggle" class="btn fw-semibold mb-0 ${savedState.isActive ? 'btn-danger' : 'btn-success'}" style="width:70px;height:50px;font-size:12px">${savedState.isActive ? 'STOP' : 'START'}</button>
            </div>

            <div id="dateButtonsSection" class="d-flex align-items-center justify-content-center gap-1 flex-wrap">
                ${dates.slice(0, 10).map(d => {
            const avail = d.AppointmentDateType === 0;
            return `<button class="toolbar-date-btn btn fw-semibold mb-0 ${avail ? 'btn-success' : 'btn-danger opacity-75'}" data-date="${d.DateText}" style="${btnStyle}" title="${d.DateText}">${new Date(d.DateText).getDate()}</button>`;
        }).join('')}
                ${dates.length > 10 ? `<span class="text-muted fw-medium px-1">+${dates.length - 10}</span>` : ''}
            </div>
        </div>
    `;

        mainTag.insertAdjacentHTML('afterbegin', toolbarHTML);

        autoSubmitState.isActive = savedState.isActive;
        autoSubmitState.currentCount = savedState.currentCount;

        setupToolbarEventHandlers();

        // Don't automatically start on page load - user must click start
        // if (savedState.isActive) {
        //     startAutoSubmitProcess();
        // }
    }

    function setupToolbarEventHandlers() {
        const requestsInput = document.getElementById('autoSubmitRequests');
        const delayMsInput = document.getElementById('autoSubmitDelayMs');
        const targetSecondInput = document.getElementById('autoSubmitTargetSecond');
        const targetMillisecondInput = document.getElementById('autoSubmitTargetMillisecond');
        const toggleButton = document.getElementById('autoSubmitToggle');
        const modeToggleBtn = document.getElementById('modeToggleBtn');
        const multiSubmitBtn = document.getElementById('multiSubmitBtn');
        const gsToggleBtn = document.getElementById('gsToggleBtn');
        const dateMobileSelect = document.getElementById('dateMobileSelect');

        // Input handlers
        [requestsInput, delayMsInput, targetSecondInput, targetMillisecondInput].forEach(input => {
            if (input) {
                input.addEventListener('change', saveAutoSubmitOptions);
                input.addEventListener('input', saveAutoSubmitOptions);
            }
        });

        // Toggle button
        toggleButton.addEventListener('click', toggleAutoSubmit);

        // Mode toggle button
        modeToggleBtn.addEventListener('click', () => setToolbarMode(autoSubmitState.mode === 'burst' ? 'scheduled' : 'burst'));

        // Multi-submit button
        multiSubmitBtn.addEventListener('click', toggleMultiSubmit);

        // GS toggle button
        window.gsEnabled = localStorage.getItem('gsEnabled') === '1';
        gsToggleBtn.addEventListener('click', () => {
            const isActive = gsToggleBtn.classList.contains('btn-success');
            gsToggleBtn.className = `btn fw-semibold mb-0 ${isActive ? 'btn-danger' : 'btn-success'}`;
            gsToggleBtn.style.cssText = 'width:60px;height:50px;font-size:12px';
            localStorage.setItem('gsEnabled', isActive ? '0' : '1');
            window.gsEnabled = !isActive;
        });

        // Desktop date buttons
        document.querySelectorAll('.toolbar-date-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                const dateText = this.getAttribute('data-date');

                console.log('Toolbar date button clicked:', dateText);
                console.log('Current manually selected slots before clear:', window.manuallySelectedSlots);

                // Always clear manually selected slots when date button is clicked
                window.manuallySelectedSlots = [];

                // Update the counter display
                const multiBtn = document.getElementById('multiSubmitBtn');
                if (multiBtn) {
                    multiBtn.textContent = 'M[0]';
                }

                console.log('Manually selected slots after clear:', window.manuallySelectedSlots);

                setDateAndTriggerUpdate(dateText);

                // Visual feedback
                document.querySelectorAll('.toolbar-date-btn').forEach(b => {
                    b.classList.toggle('opacity-75', !b.classList.contains('btn-success'));
                });
                this.classList.add('opacity-50');
                setTimeout(() => {
                    this.classList.toggle('opacity-75', !this.classList.contains('btn-success'));
                    this.classList.remove('opacity-50');
                }, 200);
            });
        });

        // Mobile date dropdown
        if (dateMobileSelect) {
            dateMobileSelect.addEventListener('change', function () {
                const dateText = this.value;
                if (dateText) {
                    setDateAndTriggerUpdate(dateText);
                }
            });
        }
    }



    function setToolbarMode(mode) {
        const modeToggleBtn = document.getElementById('modeToggleBtn');
        const burstControls = document.getElementById('burstModeControls');
        const scheduledControls = document.getElementById('scheduledModeControls');

        if (autoSubmitState.isActive) stopAutoSubmit();
        if (autoSubmitState.timerId) { clearTimeout(autoSubmitState.timerId); autoSubmitState.timerId = null; }

        autoSubmitState.mode = mode;
        modeToggleBtn.innerHTML = mode === 'burst' ? '<i class="fa-solid fa-bolt"></i>' : '<i class="fa-solid fa-clock"></i>';
        burstControls.classList.replace(mode === 'burst' ? 'd-none' : 'd-flex', mode === 'burst' ? 'd-flex' : 'd-none');
        scheduledControls.classList.replace(mode === 'burst' ? 'd-flex' : 'd-none', mode === 'burst' ? 'd-none' : 'd-flex');

        saveAutoSubmitOptions();
    }

    function toggleMultiSubmit() {
        const multiSubmitBtn = document.getElementById('multiSubmitBtn');
        const multiSubmitControls = document.getElementById('multiSubmitControls');
        const savedOptions = JSON.parse(localStorage.getItem('autoSubmitOptions') || 'null') || {};

        // Toggle the state
        const newState = !savedOptions.multiSubmit;
        savedOptions.multiSubmit = newState;

        // Clear manually selected slots when toggling (both on and off)
        window.manuallySelectedSlots = [];

        // Reset the counter display
        const multiBtn = document.getElementById('multiSubmitBtn');
        if (multiBtn) {
            multiBtn.textContent = 'M[0]';
        }

        // Update button appearance and controls visibility
        if (newState) {
            multiSubmitBtn.classList.replace('btn-light', 'btn-info');
            multiSubmitControls.classList.replace('d-none', 'd-flex');
            console.log('Multi-submit enabled, slots cleared');
        } else {
            multiSubmitBtn.classList.replace('btn-info', 'btn-light');
            multiSubmitControls.classList.replace('d-flex', 'd-none');
            console.log('Multi-submit disabled, slots cleared');
        }

        // Save to localStorage
        localStorage.setItem('autoSubmitOptions', JSON.stringify(savedOptions));
    }

    function saveAutoSubmitOptions() {
        const savedOptions = JSON.parse(localStorage.getItem('autoSubmitOptions') || 'null') || {};

        const options = {
            nRequests: parseInt(document.getElementById('autoSubmitRequests').value) || 1,
            delayMs: parseInt(document.getElementById('autoSubmitDelayMs').value) || 5000,
            targetSecond: parseInt(document.getElementById('autoSubmitTargetSecond').value) || 20,
            targetMillisecond: parseInt(document.getElementById('autoSubmitTargetMillisecond').value) || 0,
            mode: autoSubmitState.mode,
            multiSubmit: savedOptions.multiSubmit !== undefined ? savedOptions.multiSubmit : true
        };

        localStorage.setItem('autoSubmitOptions', JSON.stringify(options));
    }

    function saveAutoSubmitState() {
        const state = {
            isActive: autoSubmitState.isActive,
            currentCount: autoSubmitState.currentCount,
            mode: autoSubmitState.mode
        };

        localStorage.setItem('autoSubmitState', JSON.stringify(state));
    }

    function toggleAutoSubmit() {
        if (autoSubmitState.isActive) {
            stopAutoSubmit();
        } else {
            startAutoSubmit();
        }
    }

    function startAutoSubmit() {
        const requestsInput = document.getElementById('autoSubmitRequests');
        const delayMsInput = document.getElementById('autoSubmitDelayMs');
        const targetSecondInput = document.getElementById('autoSubmitTargetSecond');
        const targetMillisecondInput = document.getElementById('autoSubmitTargetMillisecond');
        const toggleButton = document.getElementById('autoSubmitToggle');
        //const statusDiv = document.getElementById('autoSubmitStatus');

        if (autoSubmitState.timerId) {
            clearTimeout(autoSubmitState.timerId);
            autoSubmitState.timerId = null;
        }

        const nRequests = parseInt(requestsInput.value);
        const delayMs = parseInt(delayMsInput.value);
        const targetSecond = parseInt(targetSecondInput.value);
        const targetMillisecond = parseInt(targetMillisecondInput.value);

        if (!nRequests || nRequests < 1) {
            alert('Please enter a valid number of requests (1 or more)');
            return;
        }

        if (autoSubmitState.mode === 'burst' && delayMs < 0) {
            alert('Delay value cannot be negative');
            return;
        }

        if (autoSubmitState.mode === 'scheduled') {
            if (targetSecond < 0 || targetSecond > 59) {
                alert('Target second must be between 0 and 59');
                return;
            }
            if (targetMillisecond < 0 || targetMillisecond > 999) {
                alert('Target millisecond must be between 0 and 999');
                return;
            }
        }

        if (!autoSubmitState.isActive) {
            autoSubmitState.currentCount = 0;
        }

        autoSubmitState.isActive = true;

        toggleButton.textContent = 'STOP';
        toggleButton.classList.replace('btn-success', 'btn-danger');
        //statusDiv.textContent = `${autoSubmitState.currentCount} sent`;

        saveAutoSubmitState();

        setTimeout(() => {
            startAutoSubmitProcess();
        }, 100);
    }

    function stopAutoSubmit() {
        const toggleButton = document.getElementById('autoSubmitToggle');
        //const statusDiv = document.getElementById('autoSubmitStatus');

        if (autoSubmitState.timerId) {
            clearTimeout(autoSubmitState.timerId);
            autoSubmitState.timerId = null;
        }

        autoSubmitState.isActive = false;
        autoSubmitState.currentCount = 0; // Reset count when stopping

        toggleButton.textContent = 'START';
        toggleButton.classList.replace('btn-danger', 'btn-success');
        //statusDiv.textContent = `Stopped: ${autoSubmitState.currentCount}`;

        // Don't save state when stopping - just remove it to ensure clean state
        localStorage.removeItem('autoSubmitState');
    }

    function startAutoSubmitProcess() {
        if (!autoSubmitState.isActive) return;

        if (autoSubmitState.mode === 'burst') {
            startBurstModeProcess();
        } else {
            startScheduledModeProcess();
        }
    }

    function startBurstModeProcess() {
        if (!autoSubmitState.isActive) return;

        const nRequests = parseInt(document.getElementById('autoSubmitRequests').value);
        const delayMs = parseInt(document.getElementById('autoSubmitDelayMs').value) || 0;

        if (autoSubmitState.currentCount >= nRequests) {
            stopAutoSubmit();
            return;
        }

        const form = document.querySelector('form');
        if (!form) { stopAutoSubmit(); return; }

        const doSubmit = () => {
            if (!autoSubmitState.isActive) return;
            autoSubmitState.currentCount++;
            window.gsEnabled ? document.getElementById('GroupSubmitTrigger')?.click() : submitAppointmentFormWithRotation(form);
            autoSubmitState.currentCount >= nRequests ? stopAutoSubmit() : startBurstModeProcess();
        };

        delayMs > 0 ? (autoSubmitState.timerId = setTimeout(doSubmit, delayMs)) : doSubmit();
    }

    function startScheduledModeProcess() {
        if (!autoSubmitState.isActive) return;

        const nRequests = parseInt(document.getElementById('autoSubmitRequests').value);
        const targetSecond = parseInt(document.getElementById('autoSubmitTargetSecond').value);
        const targetMillisecond = parseInt(document.getElementById('autoSubmitTargetMillisecond').value) || 0;
        //const statusDiv = document.getElementById('autoSubmitStatus');

        function scheduleNextSubmission() {
            if (!autoSubmitState.isActive) return;

            // Get pre-fetched server time instantly
            const syncInfo = timeSyncFunctions.getSyncedTime();
            const delay = timeSyncFunctions.calculateDelayForTargetTime(targetSecond, targetMillisecond);

            // Debug alert
            console.log(`Auto-Submit: ServerTime=${syncInfo.date.toLocaleTimeString()}, Target=${targetSecond}s, Delay=${delay}ms`);


            autoSubmitState.timerId = setTimeout(() => {
                if (!autoSubmitState.isActive) return;

                // Debug: Check actual submission time
                const actualTime = new Date();
                //alert(`SUBMITTING NOW!\n\nTime: ${actualTime.toLocaleTimeString()}.${actualTime.getMilliseconds()}ms\nTarget was: ${targetSecond}s ${targetMillisecond}ms`);
                console.log(`SUBMITTING NOW!\n\nTime: ${actualTime.toLocaleTimeString()}.${actualTime.getMilliseconds()}ms\nTarget was: ${targetSecond}s ${targetMillisecond}ms`);

                const form = document.querySelector('form');
                if (!form) {
                    stopAutoSubmit();
                    return;
                }

                for (let i = 0; i < nRequests; i++) {
                    setTimeout(() => {
                        if (autoSubmitState.isActive) {
                            if (window.gsEnabled) {
                                document.getElementById('GroupSubmitTrigger')?.click();
                            } else {
                                submitAppointmentFormWithRotation(form);
                            }
                            autoSubmitState.currentCount++;
                        }
                    }, i * 10);
                }

                setTimeout(() => {
                    if (autoSubmitState.isActive) {
                        scheduleNextSubmission();
                    }
                }, 100);

            }, delay);
        }

        scheduleNextSubmission();
    }

    function startAutoSubmitProgrammatically(options = {}) {
        const controlsDiv = document.getElementById('autoSubmitControls');
        if (!controlsDiv) {
            return false;
        }

        if (autoSubmitState.isActive) {
            stopAutoSubmit();
        }

        const savedOptions = JSON.parse(localStorage.getItem('autoSubmitOptions') || 'null') || {
            nRequests: 1,
            delayMs: 5000,
            targetSecond: 20,
            targetMillisecond: 0,
            mode: 'burst'
        };

        const finalOptions = {
            nRequests: options.nRequests !== undefined ? options.nRequests : savedOptions.nRequests,
            delayMs: options.delayMs !== undefined ? options.delayMs : savedOptions.delayMs,
            targetSecond: options.targetSecond !== undefined ? options.targetSecond : savedOptions.targetSecond,
            targetMillisecond: options.targetMillisecond !== undefined ? options.targetMillisecond : savedOptions.targetMillisecond,
            mode: options.mode !== undefined ? options.mode : savedOptions.mode
        };

        if (finalOptions.mode && finalOptions.mode !== autoSubmitState.mode) {
            autoSubmitState.mode = finalOptions.mode;
            const modeToggleBtn = document.getElementById('modeToggleBtn');
            const burstControls = document.getElementById('burstModeControls');
            const scheduledControls = document.getElementById('scheduledModeControls');
            modeToggleBtn.innerHTML = autoSubmitState.mode === 'burst' ? '<i class="fa-solid fa-bolt"></i>' : '<i class="fa-solid fa-clock"></i>';
            burstControls?.classList.replace(autoSubmitState.mode === 'burst' ? 'd-none' : 'd-flex', autoSubmitState.mode === 'burst' ? 'd-flex' : 'd-none');
            scheduledControls?.classList.replace(autoSubmitState.mode === 'burst' ? 'd-flex' : 'd-none', autoSubmitState.mode === 'burst' ? 'd-none' : 'd-flex');
        }

        const requestsInput = document.getElementById('autoSubmitRequests');
        const delayMsInput = document.getElementById('autoSubmitDelayMs');
        const targetSecondInput = document.getElementById('autoSubmitTargetSecond');
        const targetMillisecondInput = document.getElementById('autoSubmitTargetMillisecond');

        if (requestsInput) requestsInput.value = finalOptions.nRequests;
        if (delayMsInput) delayMsInput.value = finalOptions.delayMs;
        if (targetSecondInput) targetSecondInput.value = finalOptions.targetSecond;
        if (targetMillisecondInput) targetMillisecondInput.value = finalOptions.targetMillisecond;

        saveAutoSubmitOptions();

        try {
            startAutoSubmit();
            return true;
        } catch (error) {
            return false;
        }
    }

    // ===============================================================================
    //                          DATE BUTTONS
    // ===============================================================================

    function setDateAndTriggerUpdate(dateText, isUnavailable) {
        try {
            const inputElement = $('.k-datepicker:visible .k-input');
            if (inputElement.length) {
                inputElement.val(dateText);
                inputElement.trigger('blur');
                inputElement.trigger('change');

                if (window.OnAppointmentdateChange) {
                    window.OnAppointmentdateChange();
                }

                return true;
            }

            return false;

        } catch (error) {
            return false;
        }
    }

    // ===============================================================================
    //                          UTILITY FUNCTIONS
    // ===============================================================================

    function getMultiSubmitState() {
        return true; // Always enabled
    }

    window.startAutoSubmitProgrammatically = startAutoSubmitProgrammatically;

    // ===============================================================================
    //                          START INITIALIZATION
    // ===============================================================================


    // Schedule GroupSubmit countdown
    function scheduleGroupSubmit(remaining) {
        console.log('[GroupSubmit] remaining:', remaining);
        const btn = document.getElementById('btnTrump');
        if (!btn) return;
        const originalText = btn.textContent;
        btn.textContent = '[GS]';
        window.startCountdown?.(remaining > 0 ? remaining : 0, 'btnTrump', () => { btn.textContent = originalText; btn.click(); });
    }

    // Create GroupSubmit controls
    function initGroupSubmitDiv() {
        const interval = setInterval(() => {
            const form = document.querySelector('form');
            if (!form || document.getElementById('GroupSubmitDiv')) return;
            clearInterval(interval);
            const div = document.createElement('div');
            div.id = 'GroupSubmitDiv';
            div.className = 'd-flex gap-2 mt-2 font-monospace w-100 py-1';
            div.innerHTML = `<input type="number" id="groupSubmitDelay" value="${localStorage.getItem('groupSubmitDelay') || '1'}" min="0" class="form-control-sm w-50 border border-secondary" style="height:50px;font-size:14px"><button id="GroupSubmitTrigger" class="btn btn-danger w-50 mb-0" style="height:50px;font-size:12px" disabled>DISCONNECTED</button>`;
            form.parentNode.insertBefore(div, form.nextSibling);
            const delayInput = document.getElementById('groupSubmitDelay');
            delayInput.oninput = () => localStorage.setItem('groupSubmitDelay', delayInput.value);
            document.getElementById('GroupSubmitTrigger').onclick = () => {
                window.postMessage({ type: 'GROUPSUBMIT_TRIGGER', triggerDelay: delayInput.value, submitType: 'groupsubmit', timestamp: Date.now() + (window.currentTimeOffset || 0) }, '*');
            };
            const gsBtn = document.getElementById('btn-groupsubmit');
            if (gsBtn) gsBtn.onclick = () => window.postMessage({ type: 'GROUPSUBMIT_REQUEST', source: 'slotselection', subscribe: 'submit' }, '*');
            updateGroupSubmitTrigger();
        }, 100);
    }

    function updateGroupSubmitTrigger() {
        const triggerBtn = document.getElementById('GroupSubmitTrigger');
        const gsBtn = document.getElementById('btn-groupsubmit');
        const connected = gsBtn?.classList.contains('bg-success');
        if (triggerBtn) {
            triggerBtn.textContent = connected ? 'GROUP SUBMIT' : 'DISCONNECTED';
            triggerBtn.className = `btn ${connected ? 'btn-success' : 'btn-danger'} w-50 mb-0`;
            triggerBtn.disabled = !connected;
        }
    }

    // Listen for GroupSubmit status and targetTime
    window.addEventListener('message', function (event) {
        if (event.data?.type === 'GROUPSUBMIT_STATUS') {
            updateGroupSubmitTrigger();
            if (event.data.targetTime) {
                console.log('[GroupSubmit] targetTime received:', event.data.targetTime);
                if (!window.currentTimeOffset) {
                    alert('khas sa3a bach tkhadem group submit');
                    return;
                }
                const syncedNow = Date.now() + window.currentTimeOffset;
                const remaining = event.data.targetTime - syncedNow;
                scheduleGroupSubmit(remaining);
            }
        }

        // Legacy client update
        if (event.data.type === 'FROM_EXTENSION_TO_PAGE' && event.data.action === 'clientUpdated' && event.data.client) {
            client = event.data.client;
            console.log('Client updated via legacy method:', client);
        }
    });


    // Initialize the page after all classes and functions are defined
    initializePage();
    // Init GroupSubmit from storage

})(); // End of IIFE

