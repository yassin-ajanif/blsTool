

// Start observing when DOM is ready
if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

/**
 * Observes DOM for dynamically added iframes
 */
const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
            // Check if the added node is an iframe
            if (node.tagName === 'IFRAME') {
                node.addEventListener('load', () => handleIframeLoad(node));
            }

            // Check if the added node contains iframes
            if (node.getElementsByTagName) {
                const iframes = node.getElementsByTagName('iframe');
                Array.from(iframes).forEach(function (iframe) {
                    iframe.addEventListener('load', () => handleIframeLoad(iframe));
                });
            }
        });
    });
});

/**
 * Handles iframe detection and form button injection
 */
function handleIframeLoad(iframe) {
    try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const iframeWin = iframe.contentWindow;
        const injector = new FormSaveButtonInjector();
        injector.addButtonsToDocument(iframeDoc, iframeWin);
        injector.observeDocument(iframeDoc, iframeWin);
    } catch (e) {
    }
}

/**
 * Injects save buttons next to form submit buttons
 */
class FormSaveButtonInjector {
    constructor() {
        this.init();
    }

    serializeForm(form) {
        const formData = new FormData(form);
        const json = {};
        for (let [key, value] of formData.entries()) {
            json[key] = json[key] ? (Array.isArray(json[key]) ? [...json[key], value] : [json[key], value]) : value;
        }
        return json;
    }

    async saveData(data, win = window) {
        // Get existing data from chrome.storage.local via getExtensionData
        const existingData = await (win.getExtensionData || window.getExtensionData)();
        let apps = existingData.visa_applicants || [];

        // Remove duplicate based on PassportNo
        if (data.PassportNo) {
            apps = apps.filter(a => !a.PassportNo || a.PassportNo.trim().toUpperCase() !== data.PassportNo.trim().toUpperCase());
        }

        // Add new data
        apps.push(data);

        // Save back to chrome.storage.local using setExtensionData
        await (win.setExtensionData || window.setExtensionData)('visa_applicants', apps);
    }

    generateRandomPassport() {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const randomLetter = () => letters[Math.floor(Math.random() * letters.length)];
        const randomDigit = () => Math.floor(Math.random() * 10);
        return randomLetter() + randomLetter() + randomDigit() + randomDigit() + '000' + randomDigit() + randomDigit();
    }

    generateRandomName() {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const randomLetter = () => letters[Math.floor(Math.random() * letters.length)];
        return randomLetter() + randomLetter() + randomLetter() + randomLetter();
    }

    createButton(doc, submit, win = window) {
        if (submit.nextElementSibling?.classList.contains('save-btn')) return;

        // Check if this is an "Edit Member" form by looking for h5 or h6 with that text
        const form = submit.closest('form');
        if (!form) return;

        // Look for h5 or h6 elements with "Edit Member" text
        const headings = [...form.querySelectorAll('h5, h6'), ...doc.querySelectorAll('h5, h6')];
        const hasEditMember = headings.some(heading =>
            heading.textContent && heading.textContent.includes('Edit Member')
        );

        // Only inject button if "Edit Member" is found
        if (!hasEditMember) {
            return;
        }

        const btn = doc.createElement('button');
        btn.textContent = 'Save';
        btn.type = 'button';
        btn.className = 'btn btn-info save-btn';

        btn.onclick = async e => {
            e.preventDefault();
            e.stopPropagation();

            const form = submit.closest('form');
            if (!form) return (win.alert || alert)('No form found');

            const data = this.serializeForm(form);
            const url = 'https://' + win.location.hostname + '/MAR/AppointmentData/ManageApplicant';

            btn.textContent = 'Saving...';
            btn.className = 'btn btn-warning save-btn';
            btn.disabled = true;

            // First request with original data
            const xhr = new (win.XMLHttpRequest || XMLHttpRequest)();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

            xhr.onload = async () => {
                if (xhr.status === 200) {
                    await this.handleFirstRequestSuccess(xhr, data, url, btn, win);
                } else {
                    this.handleError(btn, 'Error ✗');
                }
            };

            xhr.onerror = () => this.handleError(btn, 'Network Error ✗');

            xhr.send(Object.keys(data).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k])).join('&'));
        };

        submit.parentNode.insertBefore(btn, submit.nextSibling);
    }

    async handleFirstRequestSuccess(xhr, data, url, btn, win) {
        try {
            const res = JSON.parse(xhr.responseText);

            if (res.success === false && res.error) {
                (win.alert || alert)(res.error);
                this.handleError(btn, 'Error ✗');
                return;
            }
        } catch {
            // Non-JSON response, treat as success
        }

        // Save original data and proceed with update
        await this.saveData(data, win);
        btn.textContent = 'Preparing...';
        btn.className = 'btn btn-info save-btn';

        // Send update request with random data
        const updateData = Object.assign({}, data, {
            PassportNo: this.generateRandomPassport(),
            FirstName: this.generateRandomName(),
            LastName: this.generateRandomName()
        });

        this.sendUpdateRequest(updateData, url, btn, win);
    }

    sendUpdateRequest(updateData, url, btn, win) {
        const xhr2 = new (win.XMLHttpRequest || XMLHttpRequest)();
        xhr2.open('POST', url, true);
        xhr2.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr2.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        xhr2.onload = () => {
            if (xhr2.status === 200) {
                try {
                    const res2 = JSON.parse(xhr2.responseText);
                    if (res2.success === true || (!res2.success && !res2.error)) {
                        this.handleSuccess(btn);
                        // Update form fields with randomized values
                        this.updateFormFields(btn, updateData, win);
                    } else {
                        if (res2.error) (win.alert || alert)('Update failed: ' + res2.error);
                        this.handlePartialSave(btn);
                    }
                } catch {
                    // Non-JSON response, consider success
                    this.handleSuccess(btn);
                    // Update form fields with randomized values
                    this.updateFormFields(btn, updateData, win);
                }
            } else {
                this.handlePartialSave(btn);
            }
        };

        xhr2.onerror = () => this.handlePartialSave(btn);

        xhr2.send(Object.keys(updateData).map(k =>
            encodeURIComponent(k) + '=' + encodeURIComponent(updateData[k])
        ).join('&'));
    }

    handleSuccess(btn) {
        btn.textContent = 'Saved ✓';
        btn.className = 'btn btn-success save-btn';
        this.resetButton(btn);
    }

    handlePartialSave(btn) {
        btn.textContent = 'Partial Save';
        btn.className = 'btn btn-warning save-btn';
        this.resetButton(btn);
    }

    handleError(btn, message) {
        btn.textContent = message;
        btn.className = 'btn btn-danger save-btn';
        this.resetButton(btn);
    }

    resetButton(btn) {
        setTimeout(() => {
            btn.textContent = 'Save';
            btn.className = 'btn btn-info save-btn';
            btn.disabled = false;
        }, 3000);
    }

    updateFormFields(btn, updateData, win) {
        // Find the form containing the button
        const form = btn.closest('form');
        if (!form) return;

        // Get the document context (could be iframe or main document)
        const doc = form.ownerDocument || document;

        // Update PassportNo field
        const passportField = form.querySelector('#PassportNo') || doc.getElementById('PassportNo');
        if (passportField && updateData.PassportNo) {
            passportField.value = updateData.PassportNo;
        }

        // Update FirstName field
        const firstNameField = form.querySelector('#FirstName') || doc.getElementById('FirstName');
        if (firstNameField && updateData.FirstName) {
            firstNameField.value = updateData.FirstName;
        }

        // Update LastName field
        const lastNameField = form.querySelector('#LastName') || doc.getElementById('LastName');
        if (lastNameField && updateData.LastName) {
            lastNameField.value = updateData.LastName;
        }
    }

    addButtonsToDocument(doc, win = window) {
        doc.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(s =>
            this.createButton(doc, s, win)
        );
    }

    observeDocument(doc, win = window) {
        new MutationObserver(() => {
            doc.querySelectorAll('button[type="submit"]:not([data-save]), input[type="submit"]:not([data-save])').forEach(s => {
                s.setAttribute('data-save', '1');
                this.createButton(doc, s, win);
            });
        }).observe(doc.body, { childList: true, subtree: true });
    }

    init() {
        this.addButtonsToDocument(document);
        this.observeDocument(document);
    }
}
