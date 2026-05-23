/**
 * Options page script
 */

// Debug listener for background messages
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'debug') console.log('[DEBUG]', msg.msg);
});

document.addEventListener('DOMContentLoaded', () => {

    // Initialize managers
    const clientManager = new ClientManager();

    // Listen for storage changes to auto-update clients when fetched from server
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.clients) {
            console.log('🔄 Clients updated in storage, refreshing list...');

            // Check if we're currently on the clients section
            const activeSection = document.querySelector('.nav-item.active');
            if (activeSection && activeSection.getAttribute('data-section') === 'clients') {
                // Only reload if we're not in the form view
                const formContainer = document.getElementById('client-form-container');
                if (!formContainer || formContainer.classList.contains('hidden')) {
                    loadClientsList();
                }
            }
        }
    });

    // DOM elements
    const navItems = document.querySelectorAll('.nav-item');

    // Simple mobile detection
    const isMobile = window.innerWidth <= 768;

    // Section navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionName = item.getAttribute('data-section');
            showSection(sectionName);
        });
    });

    // Load content for the active section on initial load
    const activeNavItem = document.querySelector('.nav-item.active');
    if (activeNavItem) {
        loadSectionContent(activeNavItem.getAttribute('data-section'));
    }


    // Helper function to set status message
    function setStatus(message, isError = false) {
        const statusMessage = document.getElementById('status-message');
        if (!statusMessage) return;

        statusMessage.textContent = message;
        statusMessage.style.color = isError ? 'var(--danger-color)' : 'var(--text-light)';

        // Clear status after 1 second
        setTimeout(() => {
            statusMessage.textContent = '';
        }, 1000);
    }


    // Helper function to show a specific section
    function showSection(sectionName) {
        // Update nav items
        navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-section') === sectionName);
        });

        // Update content sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.toggle('active', section.id === `${sectionName}-section`);
        });

        loadSectionContent(sectionName);
    }


    // Helper function to load content for a specific section
    async function loadSectionContent(sectionName) {
        try {
            switch (sectionName) {
                case 'clients':
                    await loadClientsSection();
                    break;
                case 'applicants':
                    await loadApplicantsSection();
                    break;
                case 'settings':
                    await loadSettingsSection();
                    break;
            }
        } catch (error) {
            setStatus(`Error loading ${sectionName} section: ${error.message}`, true);
        }
    }




    // ===================
    // Clients Section
    // ===================

    // Client filter
    const clientFilter = document.getElementById('client-filter');

    clientFilter.addEventListener('change', () => {
        loadClientsList();
    });

    // Country filter button
    const countryFilterBtn = document.getElementById('country-filter-btn');
    let currentCountryFilter = null; // Default to null (no filter)

    // Load saved country filter state
    chrome.storage.local.get(['countryFilter'], (result) => {
        if (result.countryFilter) {
            currentCountryFilter = result.countryFilter;
            updateCountryFilterButton();
            loadClientsList();
        }
    });

    // Function to update button appearance based on current filter
    function updateCountryFilterButton() {
        if (currentCountryFilter === 'Spain') {
            countryFilterBtn.textContent = '🇪🇸';
            countryFilterBtn.title = 'Showing Spain clients';
            countryFilterBtn.classList.remove('material-icons-outlined', 'portugal-active');
            countryFilterBtn.classList.add('spain-active');
        } else if (currentCountryFilter === 'Portugal') {
            countryFilterBtn.textContent = '🇵🇹';
            countryFilterBtn.title = 'Showing Portugal clients';
            countryFilterBtn.classList.remove('material-icons-outlined', 'spain-active');
            countryFilterBtn.classList.add('portugal-active');
        } else {
            countryFilterBtn.textContent = 'public';
            countryFilterBtn.title = 'Filter by country';
            countryFilterBtn.classList.add('material-icons-outlined');
            countryFilterBtn.classList.remove('spain-active', 'portugal-active');
        }
    }

    countryFilterBtn.addEventListener('click', () => {
        // Cycle through Country -> Spain -> Portugal -> Country
        if (currentCountryFilter === null) {
            currentCountryFilter = 'Spain';
        } else if (currentCountryFilter === 'Spain') {
            currentCountryFilter = 'Portugal';
        } else {
            currentCountryFilter = null;
        }

        // Update button appearance
        updateCountryFilterButton();

        // Save to Chrome storage
        chrome.storage.local.set({ countryFilter: currentCountryFilter });

        // Reload list
        loadClientsList();
    });

    // Add client button
    document.getElementById('add-client-btn').addEventListener('click', () => {
        showClientForm();
    });

    // Import clients button
    document.getElementById('import-clients-btn').addEventListener('click', () => {
        importClients();
    });

    // Export clients button
    document.getElementById('export-clients-btn').addEventListener('click', () => {
        exportClients();
    });

    // Cancel client form button
    document.getElementById('cancel-client-btn').addEventListener('click', () => {
        hideClientForm();
    });

    // Client form submission
    document.getElementById('client-form').addEventListener('submit', (event) => {
        event.preventDefault();
        saveClient();
    });

    // Load clients section
    async function loadClientsSection() {
        // Hide the edit form if it's visible and show clients list
        const formContainer = document.getElementById('client-form-container');
        const clientsContainer = document.getElementById('clients-container');

        if (formContainer && !formContainer.classList.contains('hidden')) {
            // Form is visible, hide it
            formContainer.classList.add('hidden');
        }

        if (clientsContainer && clientsContainer.classList.contains('hidden')) {
            // Clients list is hidden, show it
            clientsContainer.classList.remove('hidden');
        }

        loadClientsList();

    }
    // Set up initial placeholder with icon - no image file needed
    function setupPlaceholderImages() {
        // Only proceed if the elements exist
        const photoPreview = document.getElementById('photo-preview');

        // Set placeholder for main photo if it exists
        if (photoPreview) {
            const photoPlaceholder = photoPreview.querySelector('.photo-placeholder');
            if (photoPlaceholder) {
                photoPlaceholder.innerHTML = `<span class="material-icons-outlined" style="font-size: 48px; color: #adb5bd;">person</span>`;
            }
        }
    }


    // Process image: resize first (for large images), then clean and optimize
    async function processImage(base64String, maxSizeKB = 200) {
        try {
            console.log('🔧 Processing image...');

            return new Promise((resolve, reject) => {
                const img = new Image();

                img.onload = function () {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    let width = img.width;
                    let height = img.height;

                    // Step 1: Resize first if image is very large (reduces processing time significantly)
                    const maxDimension = 3000; // Reasonable max for photos
                    if (width > maxDimension || height > maxDimension) {
                        console.log(`📐 Large image (${width}x${height}), resizing first...`);
                        const scale = maxDimension / Math.max(width, height);
                        width = Math.floor(width * scale);
                        height = Math.floor(height * scale);
                    }

                    // Set canvas to resized dimensions
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    // Step 2: Encode with quality adjustment to meet size target
                    let quality = 0.92;
                    let processedBase64 = canvas.toDataURL('image/jpeg', quality);
                    let currentSizeKB = (processedBase64.length * 0.75) / 1024;

                    console.log(`📊 After resize: ${currentSizeKB.toFixed(2)}KB (${width}x${height})`);

                    // Step 3: Reduce quality if still too large
                    while (currentSizeKB > maxSizeKB && quality > 0.5) {
                        quality -= 0.05;
                        processedBase64 = canvas.toDataURL('image/jpeg', quality);
                        currentSizeKB = (processedBase64.length * 0.75) / 1024;
                    }

                    // Step 4: Reduce dimensions further if quality reduction wasn't enough
                    if (currentSizeKB > maxSizeKB) {
                        let scale = 0.9;
                        while (currentSizeKB > maxSizeKB && scale > 0.3) {
                            width = Math.floor(img.width * scale);
                            height = Math.floor(img.height * scale);
                            canvas.width = width;
                            canvas.height = height;
                            ctx.drawImage(img, 0, 0, width, height);
                            processedBase64 = canvas.toDataURL('image/jpeg', quality);
                            currentSizeKB = (processedBase64.length * 0.75) / 1024;
                            scale -= 0.1;
                        }
                    }

                    console.log(`✅ Final: ${currentSizeKB.toFixed(2)}KB (quality: ${quality.toFixed(2)}, ${width}x${height})`);

                    resolve(processedBase64);
                };

                img.onerror = () => {
                    console.error('Failed to load image for processing');
                    reject(new Error('Failed to load image'));
                };

                img.src = base64String;
            });
        } catch (error) {
            console.error('Error processing image:', error);
            throw error;
        }
    }

    function setupPhotoUploads() {
        // Now setup the placeholder icons in the DOM
        setupPlaceholderImages();

        // Make the previews clickable to trigger file inputs
        setupPhotoPreviewClick('photo-preview', 'client-photo');

        // Setup main photo upload
        setupPhotoUpload('client-photo', 'photo-preview', 'client-image-data');
    }

    // Make preview areas clickable to trigger file input - with null check
    function setupPhotoPreviewClick(previewId, inputId) {
        const photoPreview = document.getElementById(previewId);
        const photoInput = document.getElementById(inputId);

        if (photoPreview && photoInput) {
            photoPreview.addEventListener('click', function () {
                photoInput.click();
            });
        }
    }



    function setupPhotoUpload(inputId, previewId, imageDataInputId) {
        const photoInput = document.getElementById(inputId);
        const photoPreview = document.getElementById(previewId);

        // Exit if elements don't exist
        if (!photoInput || !photoPreview) {
            return;
        }

        // Save original placeholder content
        const originalPlaceholder = photoPreview.innerHTML;

        photoInput.addEventListener('change', async function (event) {
            if (event.target.files && event.target.files[0]) {
                const file = event.target.files[0];

                // Show loading indicator
                photoPreview.innerHTML = `
                    <div class="photo-loading">
                        <div class="spinner"></div>
                        <span>Processing image...</span>
                    </div>
                `;

                try {
                    // Convert file to data URL
                    const imageDataUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = e => resolve(e.target.result);
                        reader.readAsDataURL(file);
                    });

                    // Check file size
                    const fileSizeKB = file.size / 1024;
                    let imageToUpload = imageDataUrl;

                    // Resize if larger than 200KB
                    if (fileSizeKB > 200) {
                        console.log(`Resizing image from ${fileSizeKB.toFixed(2)}KB to under 200KB`);
                        photoPreview.innerHTML = `
                            <div class="photo-loading">
                                <div class="spinner"></div>
                                <span>Resizing image (${fileSizeKB.toFixed(2)}KB)...</span>
                            </div>
                        `;
                        imageToUpload = await clientManager.resizeImage(imageDataUrl, 200 * 1024);
                    }

                    // Update preview to show uploading
                    photoPreview.innerHTML = `
                        <div class="photo-loading">
                            <div class="spinner"></div>
                            <span>Uploading to server...</span>
                        </div>
                    `;

                    // Upload image to server
                    const uploadResponse = await uploadImageToServer(imageToUpload);

                    if (uploadResponse.success) {
                        // Get form element - check if it exists first
                        const form = document.getElementById('client-form');
                        if (!form) {
                            throw new Error('Client form not found');
                        }

                        // Note: fileId is no longer generated or stored

                        // Show preview of image with placeholder in background
                        photoPreview.innerHTML = `
                            <div class="photo-placeholder">
                                <span class="material-icons-outlined" style="font-size: 48px; color: #adb5bd;">person</span>
                            </div>
                            <img src="${imageToUpload}" alt="Client Image" class="uploaded-img">
                        `;

                        // Store the image data for later use
                        if (!document.getElementById(imageDataInputId)) {
                            const imageDataInput = document.createElement('input');
                            imageDataInput.type = 'hidden';
                            imageDataInput.id = imageDataInputId;
                            form.appendChild(imageDataInput);
                        }

                        // Store the base64 image data returned from uploadImageToServer
                        document.getElementById(imageDataInputId).value = uploadResponse.imageData || imageToUpload;

                        setStatus('Image uploaded successfully', false);
                    } else {
                        throw new Error('Server returned error');
                    }
                } catch (error) {
                    // Restore original placeholder
                    photoPreview.innerHTML = originalPlaceholder;

                    // Add error message
                    const errorElement = document.createElement('div');
                    errorElement.className = 'photo-error';
                    errorElement.innerHTML = `<span>⚠️ Upload failed: ${error.message}</span>`;
                    photoPreview.appendChild(errorElement);

                    setStatus(`Image upload failed: ${error.message}`, true);

                    // Clear the file input
                    photoInput.value = '';

                    // Remove error message after 3 seconds
                    setTimeout(() => {
                        const errorElement = photoPreview.querySelector('.photo-error');
                        if (errorElement) {
                            errorElement.remove();
                        }
                    }, 3000);
                }
            }
        });
    }

    async function uploadImageToServer(imageData) {
        try {
            // Check if the image is already a data URL
            if (!imageData.startsWith('data:')) {
                throw new Error('Invalid image data format');
            }

            // Return success with the imageData (no fileId, no upload)
            return {
                success: true,
                imageData: imageData
            };
        } catch (error) {
            throw error;
        }
    }
    function clearPhotoPreview(previewId) {
        const photoPreview = document.getElementById(previewId);

        // Exit if element doesn't exist
        if (!photoPreview) {
            return;
        }

        // Always use the icon placeholder
        photoPreview.innerHTML = `
            <div class="photo-placeholder">
                <span class="material-icons-outlined" style="font-size: 48px; color: #adb5bd;">person</span>
            </div>
        `;
    }

    // Updated function to show an image in a preview - with null checks
    function showImageInPreview(previewId, imageUrl, altText) {
        const photoPreview = document.getElementById(previewId);

        // Exit if element doesn't exist
        if (!photoPreview) {
            return;
        }

        // Create icon placeholder
        const placeholder = `
            <div class="photo-placeholder">
                <span class="material-icons-outlined" style="font-size: 48px; color: #adb5bd;">person</span>
            </div>
        `;

        // Add image on top of placeholder
        photoPreview.innerHTML = placeholder + `<img src="${imageUrl}" alt="${altText}" class="uploaded-img">`;
    }


    // Updated edit client function
    async function editClient(clientId) {
        try {
            const client = await clientManager.getClient(clientId);

            if (!client) {
                throw new Error(`Client with ID ${clientId} not found`);
            }

            // Hide clients list
            document.getElementById('clients-container').classList.add('hidden');

            // Show form
            const formContainer = document.getElementById('client-form-container');
            formContainer.classList.remove('hidden');

            // Update form title
            document.getElementById('client-form-title').textContent = 'Edit Client';

            // Fill form with client data
            document.getElementById('client-id').value = client.id;

            // Set country first (since this will cascade to other dropdowns)
            document.getElementById('client-country').value = client.country || 'Spain';

            // Setup country dropdown to populate location options
            setupCountryDropdown();

            // Then populate the rest of the form
            document.getElementById('client-name').value = client.name;
            document.getElementById('client-email').value = client.email || '';
            document.getElementById('client-password').value = client.password;
            document.getElementById('client-app-password').value = client.app_password || '';
            document.getElementById('client-applicants-count').value = client.applicantsCount;
            document.getElementById('client-category').value = client.category;

            // Set location after country has updated the dropdown options
            document.getElementById('client-location').value = client.location;

            // Setup visa type dropdown based on country and location
            setupVisaTypeDropdown();
            document.getElementById('client-visa-type').value = client.visaType;

            // Setup visa subtype dropdown based on country, location, and visa type
            setupVisaSubtypeDropdown();
            document.getElementById('client-visa-subtype').value = client.visaSubtype;

            // Reset all photo previews first
            clearPhotoPreview('photo-preview');

            // Create or update hidden field for image data
            if (client.photo) {
                if (!document.getElementById('client-image-data')) {
                    const imageDataInput = document.createElement('input');
                    imageDataInput.type = 'hidden';
                    imageDataInput.id = 'client-image-data';
                    document.getElementById('client-form').appendChild(imageDataInput);
                }
                document.getElementById('client-image-data').value = client.photo;

                // Show photo in preview
                showImageInPreview('photo-preview', client.photo, 'Client Photo');
            }

            // Note: Selfie handling code removed as UI elements no longer exist

            // Setup photo upload events
            setupPhotoUploads();

        } catch (error) {
            setStatus(`Error editing client: ${error.message}`, true);
        }
    }
    async function saveClient() {
        try {
            const clientId = document.getElementById('client-id').value;

            // Get form data
            const clientData = {
                country: document.getElementById('client-country').value,
                name: document.getElementById('client-name').value,
                email: document.getElementById('client-email').value,
                password: document.getElementById('client-password').value,
                app_password: document.getElementById('client-app-password').value.replace(/\s/g, ''), // Remove all spaces
                applicantsCount: parseInt(document.getElementById('client-applicants-count').value, 10),
                category: document.getElementById('client-category').value,
                location: document.getElementById('client-location').value,
                visaType: document.getElementById('client-visa-type').value,
                visaSubtype: document.getElementById('client-visa-subtype').value
            };

            // Get image data from hidden field if it exists
            // Main photo
            const imageDataInput = document.getElementById('client-image-data');

            if (imageDataInput && imageDataInput.value) {
                clientData.photo = imageDataInput.value;
            }

            // Note: Selfie handling code removed as UI elements no longer exist

            if (clientId) {
                // Update existing client
                clientData.id = clientId;

                // Keep existing photo for updates if no new image was uploaded
                const existingClient = await clientManager.getClient(clientId);
                if (existingClient) {
                    // For main photo
                    if (!clientData.photo) {
                        clientData.photo = existingClient.photo;
                    }

                    // Preserve backward compatibility with existing selfie data
                    clientData.selfie1 = existingClient.selfie1;
                    clientData.selfie2 = existingClient.selfie2;
                }

                await clientManager.updateClient(new Client(clientData));
                setStatus(`Client "${clientData.name}" updated successfully`);
            } else {
                // Add new client
                await clientManager.addClient(clientData);
                setStatus(`Client "${clientData.name}" added successfully`);
            }

            // Hide form and refresh list
            hideClientForm();

        } catch (error) {
            setStatus(`Error saving client: ${error.message}`, true);
        }
    }


    function showClientForm() {
        // Hide clients list
        const clientsContainer = document.getElementById('clients-container');
        if (clientsContainer) {
            clientsContainer.classList.add('hidden');
        }

        // Show and reset form
        const formContainer = document.getElementById('client-form-container');
        if (formContainer) {
            formContainer.classList.remove('hidden');
        }

        // Reset form
        const formTitle = document.getElementById('client-form-title');
        const form = document.getElementById('client-form');
        const clientIdInput = document.getElementById('client-id');

        if (formTitle) formTitle.textContent = 'Add New Client';
        if (form) form.reset();
        if (clientIdInput) clientIdInput.value = '';

        // Remove any existing hidden fields - with null checks
        const imageDataInput = document.getElementById('client-image-data');
        if (imageDataInput && imageDataInput.parentNode) {
            imageDataInput.parentNode.removeChild(imageDataInput);
        }

        // Reset photo previews with placeholders
        clearPhotoPreview('photo-preview');

        // Set default values - with null checks
        const applicantsCountInput = document.getElementById('client-applicants-count');
        const countryInput = document.getElementById('client-country');

        if (applicantsCountInput) applicantsCountInput.value = 1;
        if (countryInput) countryInput.value = 'Spain';  // Default to Spain

        // Setup country dropdown
        setupCountryDropdown();

        // Setup dependent dropdowns
        setupVisaTypeDropdown();
        setupVisaSubtypeDropdown();

        // Setup photo uploads
        setupPhotoUploads();
    }

    // Initialize on document ready
    // Removed DOMContentLoaded listener for placeholder images - no longer needed


    // Add this function right after the showClientForm function (around line 876)
    // Hide client form and show clients list
    function hideClientForm() {
        document.getElementById('client-form-container').classList.add('hidden');
        document.getElementById('clients-container').classList.remove('hidden');
        // Reload clients list to ensure it displays properly
        loadClientsList();
    }
    // Load clients list with Portugal styling
    async function loadClientsList() {
        const container = document.getElementById('clients-container');
        if (!container) {
            console.error('clients-container element not found');
            return;
        }
        // Show loading animation with spinner
        container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading clients...</p></div>';

        try {
            // Load clients and selectedClientId
            let clients = await clientManager.loadClients();
            const selectedResult = await storage.get('selectedClientId');
            const selectedClientId = selectedResult.selectedClientId || null;

            // Get unique cities and populate filter
            const cities = [...new Set(clients.map(client => client.location))].sort();
            const filterSelect = document.getElementById('client-filter');
            const currentValue = filterSelect.value;

            // Clear existing options except "City"
            filterSelect.innerHTML = '<option value="all">City</option>';

            // Add city options
            cities.forEach(city => {
                const option = document.createElement('option');
                option.value = city;
                // Display "Casa" instead of "Casablanca" for shorter display
                option.textContent = city === 'Casablanca' ? 'Casa' : city;
                filterSelect.appendChild(option);
            });

            // Restore previous selection if it still exists
            if (currentValue !== 'all' && cities.includes(currentValue)) {
                filterSelect.value = currentValue;
            }

            // Apply country filter first (only if not null)
            if (typeof currentCountryFilter !== 'undefined' && currentCountryFilter !== null) {
                clients = clients.filter(client => client.country === currentCountryFilter);
            }

            // Apply city filter
            const filterValue = filterSelect.value;
            if (filterValue !== 'all') {
                clients = clients.filter(client => client.location === filterValue);
            }

            // Sort clients by creation date (oldest first)
            clients.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            // Update client count
            const clientCountElement = document.getElementById('clients-count');
            if (clientCountElement) {
                clientCountElement.textContent = clients.length;
            }

            if (clients.length === 0) {
                container.innerHTML = '<div class="loading">No clients found</div>';
                return;
            }

            container.innerHTML = '';
            clients.forEach(client => {
                const template = document.getElementById('client-item-template');
                const clone = document.importNode(template.content, true);

                const clientItem = clone.querySelector('.client-item');
                clientItem.setAttribute('data-id', client.id);

                // Set selected class if this client is the selected one
                if (client.id === selectedClientId) {
                    clientItem.classList.add('selected');
                }

                // Add country-specific class (default to Spain if not specified)
                if (client.country === 'Portugal') {
                    clientItem.classList.add('portugal-client');
                } else {
                    // Default to Spain (includes when country is 'Spain' or undefined)
                    clientItem.classList.add('spain-client');
                }

                // Make the entire item clickable for selection
                clientItem.addEventListener('click', (event) => {
                    // Skip if clicking on a button
                    if (event.target.tagName === 'BUTTON') {
                        return;
                    }

                    selectClient(client.id);
                });

                const photoElement = clone.querySelector('.client-photo');
                if (client.photo) {
                    photoElement.style.backgroundImage = `url(${client.photo})`;
                } else {
                    photoElement.classList.add('no-photo');
                    photoElement.textContent = client.name.charAt(0).toUpperCase();
                }

                // Basic info
                const nameElement = clone.querySelector('.client-name');
                if (nameElement) {
                    nameElement.textContent = client.name;
                }

                // Applicants count
                const applicantsCountElement = clone.querySelector('.client-applicants-count');
                if (applicantsCountElement) {
                    applicantsCountElement.textContent = client.applicantsCount;
                }

                // Country flag after brackets
                const flagElement = clone.querySelector('.client-country-flag');
                if (flagElement) {
                    const flag = client.country === 'Portugal' ? '🇵🇹' : '🇪🇸';
                    flagElement.textContent = ` ${flag}`;
                    flagElement.style.marginLeft = '6px';
                }

                // Additional details
                const emailElement = clone.querySelector('.client-email');
                if (emailElement) {
                    emailElement.textContent = client.email || 'N/A';
                }

                const locationElement = clone.querySelector('.client-location');
                if (locationElement) {
                    locationElement.textContent = client.location;
                }

                const categoryElement = clone.querySelector('.client-category');
                if (categoryElement) {
                    categoryElement.textContent = client.category;
                }

                const visaSubtypeElement = clone.querySelector('.client-visa-subtype');
                if (visaSubtypeElement) {
                    visaSubtypeElement.textContent = client.visaSubtype || 'No subtype';
                }

                // Clone button
                const cloneButton = clone.querySelector('.clone-client');
                cloneButton.addEventListener('click', () => {
                    cloneClient(client.id);
                });

                // Edit button
                const editButton = clone.querySelector('.edit-client');
                editButton.addEventListener('click', () => {
                    editClient(client.id);
                });

                // Delete button
                const deleteButton = clone.querySelector('.delete-client');
                deleteButton.addEventListener('click', () => {
                    deleteClient(client.id, client.name);
                });

                container.appendChild(clone);
            });
        } catch (error) {
            container.innerHTML = `<div class="loading">Error loading clients: ${error.message}</div>`;
        }
    }

    // Setup cascading dropdowns for country, location, visa type, and visa subtype
    function setupCountryDropdown() {
        const countryDropdown = document.getElementById('client-country');
        const locationDropdown = document.getElementById('client-location');

        // Clear previous options for location
        locationDropdown.innerHTML = '<option value="">-- Select Location --</option>';

        const selectedCountry = countryDropdown.value;

        if (selectedCountry) {
            const locations = clientManager.getLocationsByCountry(selectedCountry);

            // Add location options
            locations.forEach(location => {
                const option = document.createElement('option');
                option.value = location;
                option.textContent = location;
                locationDropdown.appendChild(option);
            });
        }

        // Setup country change event if not already set
        if (!countryDropdown.dataset.eventSet) {
            countryDropdown.addEventListener('change', () => {
                setupCountryDropdown();
                setupVisaTypeDropdown();
                setupVisaSubtypeDropdown();
            });
            countryDropdown.dataset.eventSet = 'true';
        }
    }

    // Setup visa type dropdown based on country and location
    function setupVisaTypeDropdown() {
        const countryDropdown = document.getElementById('client-country');
        const locationDropdown = document.getElementById('client-location');
        const visaTypeDropdown = document.getElementById('client-visa-type');

        // Clear previous options
        visaTypeDropdown.innerHTML = '<option value="">-- Select Visa Type --</option>';

        const selectedCountry = countryDropdown.value;
        const selectedLocation = locationDropdown.value;

        if (selectedCountry && selectedLocation) {
            const visaTypes = clientManager.getVisaTypesByCountryAndLocation(selectedCountry, selectedLocation);

            // Add visa type options
            visaTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                visaTypeDropdown.appendChild(option);
            });
        }

        // Setup location change event if not already set
        if (!locationDropdown.dataset.eventSet) {
            locationDropdown.addEventListener('change', () => {
                setupVisaTypeDropdown();
                setupVisaSubtypeDropdown();
            });
            locationDropdown.dataset.eventSet = 'true';
        }

        // Setup visa type change event if not already set
        if (!visaTypeDropdown.dataset.eventSet) {
            visaTypeDropdown.addEventListener('change', () => {
                setupVisaSubtypeDropdown();
            });
            visaTypeDropdown.dataset.eventSet = 'true';
        }
    }

    // Setup visa subtype dropdown based on country, location, and visa type
    function setupVisaSubtypeDropdown() {
        const countryDropdown = document.getElementById('client-country');
        const locationDropdown = document.getElementById('client-location');
        const visaTypeDropdown = document.getElementById('client-visa-type');
        const visaSubtypeDropdown = document.getElementById('client-visa-subtype');

        // Clear previous options
        visaSubtypeDropdown.innerHTML = '<option value="">-- Select Visa Subtype --</option>';

        const selectedCountry = countryDropdown.value;
        const selectedLocation = locationDropdown.value;
        const selectedVisaType = visaTypeDropdown.value;

        if (selectedCountry && selectedLocation && selectedVisaType) {
            const visaSubtypes = clientManager.getVisaSubtypesByCountryLocationAndType(
                selectedCountry,
                selectedLocation,
                selectedVisaType
            );

            // Add visa subtype options
            visaSubtypes.forEach(subtype => {
                const option = document.createElement('option');
                option.value = subtype;
                option.textContent = subtype || 'None';
                visaSubtypeDropdown.appendChild(option);
            });

            // If only one option, select it automatically
            if (visaSubtypes.length === 1) {
                visaSubtypeDropdown.value = visaSubtypes[0];
            }
        }
    }

    async function selectClient(clientId) {
        try {
            await clientManager.selectClient(clientId);
            loadClientsList();
        } catch (error) {
            setStatus(`Error selecting client: ${error.message}`, true);
        }
    }

    // Clone client
    async function cloneClient(clientId) {
        try {
            const sourceClient = await clientManager.getClient(clientId);

            if (!sourceClient) {
                throw new Error(`Client with ID ${clientId} not found`);
            }

            // Create a copy of the client data
            const clientData = sourceClient.toJSON();

            // Remove the id to generate a new one
            delete clientData.id;

            // Find existing clones to determine the next number
            const clients = await clientManager.loadClients();
            const originalName = sourceClient.name;
            const cloneRegex = new RegExp(`^${originalName} \\(\\d+\\)$`);

            // Find the highest number of existing clones
            let highestNumber = 0;
            clients.forEach(client => {
                const match = client.name.match(cloneRegex);
                if (match) {
                    const number = parseInt(client.name.match(/\((\d+)\)$/)[1], 10);
                    highestNumber = Math.max(highestNumber, number);
                }
            });

            // Set a new name with the next number
            clientData.name = `${originalName} (${highestNumber + 1})`;

            // Create and save the new client
            await clientManager.addClient(clientData);

            setStatus(`Client "${originalName}" cloned successfully`);
            loadClientsList();

        } catch (error) {
            setStatus(`Error cloning client: ${error.message}`, true);
        }
    }

    async function deleteClient(clientId, clientName) {
        if (confirm(`Are you sure you want to delete client "${clientName}"?`)) {
            try {
                await clientManager.deleteClient(clientId);
                setStatus(`Client "${clientName}" deleted successfully`);
                loadClientsList();
            } catch (error) {
                setStatus(`Error deleting client: ${error.message}`, true);
            }
        }
    }


    function importClients() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', async (event) => {
            if (!event.target.files.length) return;

            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    setStatus('Processing imported data...');

                    // Parse the JSON
                    const jsonData = JSON.parse(e.target.result);
                    let clientsData;

                    // Check if it's the new export format with metadata
                    if (jsonData.metadata && jsonData.clients && Array.isArray(jsonData.clients)) {
                        clientsData = jsonData.clients;
                    } else if (Array.isArray(jsonData)) {
                        // Legacy format - just an array
                        clientsData = jsonData;
                    } else {
                        throw new Error('Invalid data format. Expected an array of clients or export object.');
                    }

                    if (clientsData.length === 0) {
                        throw new Error('No clients found in the file.');
                    }

                    // Clean up all client data for bulk import
                    const cleanedClientsData = clientsData.map(clientData => ({
                        id: clientData.id,
                        name: clientData.name,
                        email: clientData.email,
                        password: clientData.password,
                        app_password: clientData.app_password || '',
                        photo: clientData.photo,
                        selfie1: clientData.selfie1 || null,
                        selfie2: clientData.selfie2 || null,
                        applicantsCount: clientData.applicantsCount,
                        country: clientData.country,
                        category: clientData.category,
                        location: clientData.location,
                        visaType: clientData.visaType,
                        visaSubtype: clientData.visaSubtype,
                        createdAt: clientData.createdAt,
                        updatedAt: clientData.updatedAt
                    }));

                    setStatus(`Importing ${cleanedClientsData.length} clients...`);

                    // Send all clients in a single bulk request
                    const result = await clientManager.bulkImportClients(cleanedClientsData);

                    if (result.success) {
                        const totalProcessed = (result.imported || 0) + (result.updated || 0);
                        setStatus(`Bulk import completed: ${totalProcessed} clients processed`);
                        loadClientsList();
                    } else {
                        throw new Error(result.error || 'Bulk import failed');
                    }

                } catch (error) {
                    setStatus(`Error importing clients: ${error.message}`, true);
                }
            };

            reader.readAsText(file);
        });

        input.click();
    }

    // Alternative: Update your export to create simple array format
    function exportClients() {
        return new Promise(async (resolve, reject) => {
            try {
                const clients = await clientManager.loadClients();

                if (clients.length === 0) {
                    setStatus('No clients to export', true);
                    return reject(new Error('No clients to export'));
                }

                // Convert clients to JSON format (simple array)
                const clientsData = clients.map(client => client.toJSON());
                const jsonData = JSON.stringify(clientsData, null, 2);

                // Create download
                const blob = new Blob([jsonData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = `clients-${new Date().toISOString().split('T')[0]}.json`;
                a.click();

                URL.revokeObjectURL(url);

                setStatus(`Exported ${clients.length} clients successfully`);
                resolve();

            } catch (error) {
                setStatus(`Error exporting clients: ${error.message}`, true);
                reject(error);
            }
        });
    }


    // ===================
    // Applicants Section
    // ===================

    // Add applicant button removed - applicants are now added via myappointments page

    // Import applicants button
    document.getElementById('import-applicants-btn').addEventListener('click', () => {
        importApplicants();
    });

    // Export applicants button
    document.getElementById('export-applicants-btn').addEventListener('click', () => {
        exportApplicants();
    });

    // Applicant filter
    const applicantFilter = document.getElementById('applicant-filter');

    if (applicantFilter) {
        applicantFilter.addEventListener('change', () => {
            loadApplicantsList();
        });
    }

    // Load applicants section
    async function loadApplicantsSection() {
        loadApplicantsList();
    }


    // Load applicants list from storage
    async function loadApplicantsList() {
        const container = document.getElementById('applicants-container');
        if (!container) {
            console.error('applicants-container element not found');
            return;
        }

        try {
            // Load visa_applicants from storage using callback
            const result = await storage.get('visa_applicants');
            const applicants = result.visa_applicants || [];

            if (applicants.length === 0) {
                container.innerHTML = '<div class="loading">No applicants found</div>';
                // Update count badge
                const countBadge = document.getElementById('applicants-count');
                if (countBadge) countBadge.textContent = '0';
                return;
            }

            // Update city filter options
            const cityFilter = document.getElementById('applicant-filter');
            if (cityFilter) {
                const cities = new Set();
                applicants.forEach(applicant => {
                    const city = applicant.HomeAddressCity || applicant.InvitingCity;
                    if (city) cities.add(city);
                });

                const currentValue = cityFilter.value;
                cityFilter.innerHTML = '<option value="all">All</option>' +
                    Array.from(cities).sort().map(city =>
                        `<option value="${city}">${city === 'Casablanca' ? 'Casa' : city}</option>`
                    ).join('');
                cityFilter.value = currentValue;
            }

            // Get city filter
            const selectedCity = document.getElementById('applicant-filter')?.value || 'all';

            // Filter applicants based on city
            const filteredApplicants = applicants.filter(applicant => {
                const city = applicant.HomeAddressCity || applicant.InvitingCity || '';
                return selectedCity === 'all' || city === selectedCity;
            });

            // Render applicants
            if (filteredApplicants.length === 0) {
                container.innerHTML = '<div class="loading">No applicants match the selected filter.</div>';
                return;
            }

            // Update count badge
            const countBadge = document.getElementById('applicants-count');
            if (countBadge) {
                countBadge.textContent = filteredApplicants.length;
            }

            container.innerHTML = filteredApplicants.map(applicant => `
                <div class="applicant-item" data-id="${applicant.Id || ''}" data-passport="${applicant.PassportNo || ''}">
                    <div class="applicant-photo-container">
                        ${applicant.photo && applicant.fileId ?
                    `<img src="${applicant.photo}" alt="Applicant Photo" class="applicant-photo" onerror="this.parentElement.innerHTML='<div class=\\'applicant-photo-placeholder\\'><span class=\\'material-icons-outlined\\'>person</span></div>'">` :
                    `<div class="applicant-photo-placeholder">
                                <span class="material-icons-outlined">person</span>
                            </div>`
                }
                    </div>
                    <div class="applicant-info">
                        <span class="applicant-name">${applicant.FirstName || ''} ${applicant.LastName || ''}</span>
                        <span class="applicant-passport">${applicant.PassportNo || 'N/A'}</span>
                    </div>
                    <button class="btn-icon btn-delete material-icons-outlined" data-id="${applicant.Id || ''}" data-passport="${applicant.PassportNo || ''}" title="Delete">close</button>
                </div>
            `).join('');

            // Add delete button event listeners
            container.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const applicantId = btn.dataset.id;
                    const passportNo = btn.dataset.passport;

                    if (confirm(`Delete applicant with passport ${passportNo}?`)) {
                        await deleteApplicant(applicantId, passportNo);
                    }
                });
            });

        } catch (error) {
            container.innerHTML = `<div class="loading">Error loading applicants: ${error.message}</div>`;
        }
    }

    // Removed uploadApplicantPhoto function - photos are now managed only through server fileId

    // Delete applicant
    async function deleteApplicant(applicantId, passportNo) {
        try {
            const result = await storage.get('visa_applicants');
            let applicants = result.visa_applicants || [];

            // Filter out the applicant by PassportNo (more reliable than Id)
            applicants = applicants.filter(a => a.PassportNo !== passportNo);

            await storage.set({ visa_applicants: applicants });

            setStatus('Applicant deleted successfully');
            await loadApplicantsList();
        } catch (error) {
            setStatus(`Error deleting applicant: ${error.message}`, true);
        }
    }

    // Import applicants
    function importApplicants() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', async (event) => {
            if (!event.target.files.length) return;

            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    setStatus('Processing imported data...');

                    const jsonData = JSON.parse(e.target.result);

                    // Validate that it's an array
                    if (!Array.isArray(jsonData)) {
                        throw new Error('Invalid data format. Expected an array of applicants.');
                    }

                    if (jsonData.length === 0) {
                        throw new Error('No applicants found in the file.');
                    }

                    // Get existing applicants
                    const result = await storage.get('visa_applicants');
                    let existingApplicants = result.visa_applicants || [];

                    // Merge imported applicants (use PassportNo as unique identifier)
                    let addedCount = 0;
                    let updatedCount = 0;

                    jsonData.forEach(importedApplicant => {
                        // Skip applicants without PassportNo
                        if (!importedApplicant.PassportNo) {
                            console.warn('Skipping applicant without PassportNo:', importedApplicant);
                            return;
                        }

                        // Find by PassportNo (more reliable than Id which can be duplicated)
                        const existingIndex = existingApplicants.findIndex(a =>
                            a.PassportNo && importedApplicant.PassportNo &&
                            a.PassportNo === importedApplicant.PassportNo
                        );

                        if (existingIndex >= 0) {
                            // Update existing
                            existingApplicants[existingIndex] = importedApplicant;
                            updatedCount++;
                        } else {
                            // Add new
                            existingApplicants.push(importedApplicant);
                            addedCount++;
                        }
                    });

                    // Save back to storage
                    await storage.set({ visa_applicants: existingApplicants });

                    setStatus(`Imported ${addedCount} new, updated ${updatedCount} applicants`, false);
                    await loadApplicantsList();

                } catch (error) {
                    setStatus(`Error importing applicants: ${error.message}`, true);
                }
            };

            reader.readAsText(file);
        });

        input.click();
    }

    // Export applicants
    async function exportApplicants() {
        try {
            // Load visa_applicants from storage
            const result = await storage.get('visa_applicants');
            const applicants = result.visa_applicants || [];

            if (applicants.length === 0) {
                setStatus('No applicants to export', true);
                return;
            }

            // Convert to JSON
            const jsonData = JSON.stringify(applicants, null, 2);

            // Create download
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `applicants-${new Date().toISOString().split('T')[0]}.json`;
            a.click();

            URL.revokeObjectURL(url);

            setStatus(`Exported ${applicants.length} applicants successfully`, false);

        } catch (error) {
            setStatus(`Error exporting applicants: ${error.message}`, true);
        }
    }


    document.getElementById('settings-form').addEventListener('submit', (event) => {
        event.preventDefault();
        saveSettings();
    });

    // Clear data button
    document.getElementById('clear-data-btn').addEventListener('click', () => {
        clearAllData();
    });

    // Load settings section
    async function loadSettingsSection() {
        loadSettings();
        setupCaptchaServiceUI();
    }

    // Set up captcha service UI
    function setupCaptchaServiceUI() {
        // Toggle between captcha services
        document.getElementById('captcha-service').addEventListener('change', updateCaptchaServiceUI);

        // Checkboxes removed - service is enabled based on dropdown selection

        // Initial UI update
        updateCaptchaServiceUI();
    }


    // Update captcha service UI based on selected service
    function updateCaptchaServiceUI() {
        const selectedService = document.getElementById('captcha-service').value;

        // Show/hide appropriate service settings
        const truecaptchaSettings = document.getElementById('truecaptcha-settings');

        if (truecaptchaSettings) {
            truecaptchaSettings.classList.toggle('hidden', selectedService !== 'truecaptcha');
        }
        const nocaptchaaiSettings = document.getElementById('nocaptchaai-settings');
        if (nocaptchaaiSettings) {
            nocaptchaaiSettings.classList.toggle('hidden', selectedService !== 'nocaptchaai');
        }
    }
    async function loadSettings() {
        try {
            // Get extension settings and endpoints
            const result = await storage.get(['settings', 'endpoints']);
            const settings = result.settings || {};
            const endpoints = result.endpoints || {};


            // Set form values for redirects
            // Page redirect is always enabled with default 500ms
            document.getElementById('page-redirect-ms').value =
                settings.redirects?.pageRedirectMs !== undefined ? settings.redirects.pageRedirectMs : 500;

            // Set refresh error settings (enabled by default with 1000ms)
            document.getElementById('refresh-error').checked =
                settings.refreshError?.enabled !== undefined ? settings.refreshError.enabled : true;
            document.getElementById('refresh-error-ms').value =
                settings.refreshError?.refreshErrorMs !== undefined ? settings.refreshError.refreshErrorMs : 1000;

            // Set form values for submit pages (no defaults)
            if (settings.submitPages) {
                document.getElementById('submit-login-page').checked =
                    settings.submitPages.loginPage || false;
                document.getElementById('submit-login-page-ms').value =
                    settings.submitPages.loginPageMs || '';
                document.getElementById('submit-login-captcha-page').checked =
                    settings.submitPages.loginCaptchaPage || false;
                document.getElementById('submit-login-captcha-page-ms').value =
                    settings.submitPages.loginCaptchaPageMs || '';
                document.getElementById('submit-appointment-captcha-page').checked =
                    settings.submitPages.appointmentCaptchaPage || false;
                document.getElementById('submit-appointment-captcha-page-ms').value =
                    settings.submitPages.appointmentCaptchaPageMs || '';
                document.getElementById('submit-visa-type-page').checked =
                    settings.submitPages.visaTypePage || false;
                document.getElementById('submit-visa-type-page-ms').value =
                    settings.submitPages.visaTypePageMs || '';
                document.getElementById('submit-liveness-page').checked =
                    settings.submitPages.livenessPage || false;
                document.getElementById('submit-slot-selection-page').checked =
                    settings.submitPages.slotSelectionPage || false;
                document.getElementById('submit-slot-selection-page-ms').value =
                    settings.submitPages.slotSelectionPageMs || '';
                document.getElementById('submit-payment-page').checked =
                    settings.submitPages.paymentPage || false;
                document.getElementById('submit-payment-page-ms').value =
                    settings.submitPages.paymentPageMs || '';
            }

            // Set form values for captcha service
            if (settings.captchaService) {
                document.getElementById('captcha-service').value =
                    settings.captchaService.activeService || '';
            }

            // Store endpoints for later use
            window.extensionEndpoints = endpoints;

            // Auto-sync captcha endpoints from endpoints to settings
            try {
                let needsUpdate = false;

                // Auto-sync servercaptcha endpoint
                if (endpoints.captcha && (!settings.captchaService?.servercaptcha?.apiKey ||
                    settings.captchaService.servercaptcha.endpoint !== endpoints.captcha)) {

                    // Ensure settings structure exists
                    if (!settings.captchaService) {
                        settings.captchaService = {};
                    }
                    if (!settings.captchaService.servercaptcha) {
                        settings.captchaService.servercaptcha = { enabled: false };
                    }

                    // Sync endpoint to settings
                    settings.captchaService.servercaptcha.endpoint = endpoints.captcha;
                    needsUpdate = true;
                    console.log('✅ Auto-synced captcha endpoint from storage.endpoints to settings:', endpoints.captcha);
                }

                // Auto-sync nocaptchaai API key (only if settings is empty)
                if (endpoints.nocaptchaai && !settings.captchaService?.nocaptchaai?.apiKey) {

                    // Ensure settings structure exists
                    if (!settings.captchaService) {
                        settings.captchaService = {};
                    }
                    if (!settings.captchaService.nocaptchaai) {
                        settings.captchaService.nocaptchaai = { enabled: false };
                    }

                    // Sync endpoint to settings
                    settings.captchaService.nocaptchaai.apiKey = endpoints.nocaptchaai;
                    needsUpdate = true;
                    console.log('✅ Auto-synced nocaptchaai API key from storage.endpoints to settings:', endpoints.nocaptchaai);
                }

                // Save updated settings if needed
                if (needsUpdate) {
                    await storage.set({ settings });
                }
            } catch (error) {
                console.error('Error auto-syncing endpoints:', error);
                // Don't throw - just log and continue
            }

            // NoCaptchaAI settings
            if (settings.captchaService?.nocaptchaai) {
                document.getElementById('nocaptchaai-api-key').value =
                    settings.captchaService.nocaptchaai.apiKey || '';
            }

            // TrueCaptcha settings
            if (settings.captchaService?.truecaptcha) {
                document.getElementById('truecaptcha-user-id').value =
                    settings.captchaService.truecaptcha.userId || '';
                document.getElementById('truecaptcha-api-key').value =
                    settings.captchaService.truecaptcha.apiKey || '';
            }

            // Update UI based on selected captcha service
            updateCaptchaServiceUI();


        } catch (error) {
            setStatus(`Error loading settings: ${error.message}`, true);
        }
    }

    // Save settings
    async function saveSettings() {
        try {

            // Get redirect settings
            const pageRedirectMs = parseInt(document.getElementById('page-redirect-ms').value) || 500;

            // Get refresh error settings
            const refreshErrorEnabled = document.getElementById('refresh-error').checked;
            const refreshErrorMs = parseInt(document.getElementById('refresh-error-ms').value) || 1000;

            // Get submit page settings with delays
            const submitLoginPage = document.getElementById('submit-login-page').checked;
            const submitLoginPageMs = parseInt(document.getElementById('submit-login-page-ms').value) || 0;
            const submitLoginCaptchaPage = document.getElementById('submit-login-captcha-page').checked;
            const submitLoginCaptchaPageMs = parseInt(document.getElementById('submit-login-captcha-page-ms').value) || 0;
            const submitAppointmentCaptchaPage = document.getElementById('submit-appointment-captcha-page').checked;
            const submitAppointmentCaptchaPageMs = parseInt(document.getElementById('submit-appointment-captcha-page-ms').value) || 0;
            const submitVisaTypePage = document.getElementById('submit-visa-type-page').checked;
            const submitVisaTypePageMs = parseInt(document.getElementById('submit-visa-type-page-ms').value) || 0;
            const submitLivenessPage = document.getElementById('submit-liveness-page').checked;
            const submitSlotSelectionPage = document.getElementById('submit-slot-selection-page').checked;
            const submitSlotSelectionPageMs = parseInt(document.getElementById('submit-slot-selection-page-ms').value) || 0;
            const submitPaymentPage = document.getElementById('submit-payment-page').checked;
            const submitPaymentPageMs = parseInt(document.getElementById('submit-payment-page-ms').value) || 0;
            // Get captcha service settings
            const captchaService = document.getElementById('captcha-service').value;
            const truecaptchaUserId = document.getElementById('truecaptcha-user-id').value;
            const truecaptchaApiKey = document.getElementById('truecaptcha-api-key').value;

            // Get existing settings to preserve emptyPage
            const { settings: existingSettings } = await storage.get('settings');

            // Build settings object (simplified - no endpoint needed)
            const settings = {
                redirects: {
                    pageRedirectMs: pageRedirectMs
                },
                refreshError: {
                    enabled: refreshErrorEnabled,
                    refreshErrorMs: refreshErrorMs
                },
                submitPages: {
                    loginPage: submitLoginPage,
                    loginPageMs: submitLoginPageMs,
                    loginCaptchaPage: submitLoginCaptchaPage,
                    loginCaptchaPageMs: submitLoginCaptchaPageMs,
                    appointmentCaptchaPage: submitAppointmentCaptchaPage,
                    appointmentCaptchaPageMs: submitAppointmentCaptchaPageMs,
                    visaTypePage: submitVisaTypePage,
                    visaTypePageMs: submitVisaTypePageMs,
                    livenessPage: submitLivenessPage,
                    livenessPageMs: 0,
                    slotSelectionPage: submitSlotSelectionPage,
                    slotSelectionPageMs: submitSlotSelectionPageMs,
                    paymentPage: submitPaymentPage,
                    paymentPageMs: submitPaymentPageMs
                },
                // Preserve existing emptyPage settings (managed by EmptyPageHandler itself)
                emptyPage: existingSettings?.emptyPage || {},
                captchaService: {
                    activeService: captchaService,
                    nocaptchaai: {
                        enabled: captchaService === 'nocaptchaai',
                        apiKey: document.getElementById('nocaptchaai-api-key').value
                    },
                    servercaptcha: {
                        enabled: captchaService === 'servercaptcha',
                        endpoint: window.extensionEndpoints?.captcha || ''
                    },
                    truecaptcha: {
                        enabled: captchaService === 'truecaptcha',
                        userId: truecaptchaUserId,
                        apiKey: truecaptchaApiKey
                    }
                }
            };

            // Save settings
            await storage.set({ settings });

            // Send updated settings to background script
            await sendMessageToBackground({
                action: 'updateSettings',
                settings
            });



            setStatus('Settings saved successfully');

        } catch (error) {
            setStatus(`Error saving settings: ${error.message}`, true);
        }
    }


    // Clear all data
    async function clearAllData() {
        if (!confirm('Are you sure you want to clear all extension data? This action cannot be undone.')) {
            return;
        }

        if (!confirm('ALL DATA WILL BE LOST! Are you really sure?')) {
            return;
        }

        try {
            // Clear storage
            await storage.clear();


            setStatus('All data cleared successfully');

            // Reload all sections
            loadSectionContent('clients');
            loadSectionContent('pages');

        } catch (error) {
            setStatus(`Error clearing data: ${error.message}`, true);
        }
    }


    // ===================
    // Settings Section
    // ===================


    // Send message to background script
    async function sendMessageToBackground(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
    }

    // Debounce function for search
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

});


// Initialize System Configuration Validator immediately when the script loads
(async () => {
    try {
        // Load version from manifest
        const { version } = chrome.runtime.getManifest();
        const versionEl = document.getElementById('version');
        if (versionEl) versionEl.textContent = `v${version}`;
        document.title = `TRUMP v${version}`;

        // Load saved username from auth storage
        storage.get(['auth']).then((result) => {
            if (result.auth && result.auth.User) {
                const usernameElement = document.getElementById('username');
                if (usernameElement) {
                    usernameElement.textContent = result.auth.User.toUpperCase();
                }
            }
        });

        // (To enable verification, see the verification module at the end of background.js)
        storage.get(['auth']).then((result) => {
            if (result.auth && result.auth.User) {
                const usernameElement = document.getElementById('username');
                if (usernameElement) {
                    usernameElement.textContent = result.auth.User.toUpperCase();
                }
            }
        });

        // Add logout button functionality
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (!confirm('Are you sure you want to logout?')) {
                    return;
                }

                // Show loading state
                logoutBtn.disabled = true;
                logoutBtn.innerHTML = '<span class="material-icons-outlined">hourglass_empty</span>';

                // Send message to background script to handle logout
                chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
                    if (response && response.success) {
                        // Close the options window
                        window.close();
                    } else {
                        // Reset button state on error
                        alert('Logout failed. Please try again.');
                        logoutBtn.disabled = false;
                        logoutBtn.innerHTML = '<span class="material-icons-outlined">logout</span>';
                    }
                });
            });
        }

        // Listen for storage changes to update username after verification
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.auth && changes.auth.newValue) {
                const auth = changes.auth.newValue;
                if (auth.User) {
                    const usernameElement = document.getElementById('username');
                    if (usernameElement) {
                        usernameElement.textContent = auth.User.toUpperCase();
                    }
                }
            }
        });

    } catch (error) {
        // Close window on any error
        window.close();
    }
})();