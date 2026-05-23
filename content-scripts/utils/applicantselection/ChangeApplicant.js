/**
 * GetRealRandomApplicant and ChangeApplicant Classes
 * Utility file for managing applicant data extraction and manipulation
 */

// GetRealRandomApplicant Class
class GetRealRandomApplicant {
  constructor() {
    this.visaApplicants = [];
  }

  // Get visa_applicants from extension storage
  async getVisaApplicantsFromExtension() {
    try {
      const data = await window.getExtensionData();
      this.visaApplicants = data.visa_applicants || [];
      return this.visaApplicants;
    } catch (error) {
      this.visaApplicants = [];
      return [];
    }
  }

  // Function to extract applicant data from HTML response
  extractApplicantDataFromHTML(htmlText) {
    const extractedApplicants = [];

    // Create a temporary DOM element to parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    // Find all spans with text "Applicant Name:"
    const applicantSpans = Array.from(doc.querySelectorAll('span')).filter(span =>
      span.textContent.trim() === 'Applicant Name:'
    );

    applicantSpans.forEach(span => {
      // Get the parent container (the div with class row)
      let container = span.closest('.row');

      if (container) {
        // Get applicant name (text after the span)
        const nameDiv = span.parentElement;
        const nameText = nameDiv.textContent.replace('Applicant Name:', '').trim();

        // Find Relationship field to determine if primary applicant
        let isPrimary = false;
        const relationshipSpan = Array.from(container.querySelectorAll('span')).find(s =>
          s.textContent.trim() === 'Relationship:'
        );
        if (relationshipSpan) {
          const relationshipText = relationshipSpan.parentElement.textContent.replace('Relationship:', '').trim();
          isPrimary = relationshipText === 'Primary Applicant';
        }

        // Find the ManageApplicant onclick in the same container
        const manageLink = container.querySelector('a[onclick^="ManageApplicant"]');

        if (manageLink) {
          const onclickText = manageLink.getAttribute('onclick');
          // Extract the three IDs from ManageApplicant('id1','id2','id3')
          const matches = onclickText.match(/ManageApplicant\(['"]([^'"]+)['"],['"]([^'"]+)['"],['"]([^'"]+)['"]\)/);

          if (matches && matches.length === 4) {
            const applicantData = {
              name: nameText,
              applicantId: matches[1],
              visaTypeId: matches[2],
              locationId: matches[3],
              IsPrimaryApplicant: isPrimary,
              isExtracted: true,
              extractedAt: new Date().toISOString()
            };
            extractedApplicants.push(applicantData);
          }
        }
      }
    });

    return extractedApplicants;
  }

  // Function to fetch myappointments page and extract data
  fetchAndExtractApplicants() {
    const baseUrl = window.location.protocol + '//' + window.location.hostname;
    const url = baseUrl + '/MAR/appointmentdata/myappointments';


    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {

          // Extract applicants from the HTML response
          const extractedApplicants = this.extractApplicantDataFromHTML(xhr.responseText);

          if (extractedApplicants.length > 0) {
            // Save to localStorage with 'Random_Applicants' key
            localStorage.setItem('Random_Applicants', JSON.stringify(extractedApplicants));


          } else {
            alert('No applicants found on myappointments page');
          }
        } else {
          //alert('Failed to fetch appointments. Status: ' + xhr.status);
        }
      }
    };

    xhr.onerror = function() {
      alert('Network error occurred while fetching appointments');
    };

    xhr.send();
  }

  // Initialize and run the extraction
  async init() {

    // First get visa_applicants from extension storage
    await this.getVisaApplicantsFromExtension();

    // Then proceed with fetching and extracting new applicants
    this.fetchAndExtractApplicants();

    // Return a promise that resolves when visa_applicants are ready
    return this.visaApplicants;
  }
}

// ChangeApplicant Class
class ChangeApplicant {
  constructor(getRealRandomApplicantInstance) {
    this.userId = null;
    this.clientEmail = null;
    this.requestVerificationToken = null;
    this.getRealRandomApplicant = getRealRandomApplicantInstance;
  }

  // Function to get UserId from DeleteUser page with retry logic
  async getUserId(retryCount = 0, maxRetries = 3) {
    // First, get client email from extension data and store it
    try {
      const data = await window.getExtensionData();
      if (data && data.client && data.client.email) {
        this.clientEmail = data.client.email;
      } else {
        this.clientEmail = null;
      }
    } catch (error) {
      this.clientEmail = null;
    }

    // Then proceed with getting UserId from DeleteUser page
    const xhr = new XMLHttpRequest();
    const url = window.location.protocol + '//' + window.location.hostname + '/MAR/account/DeleteUser';

    xhr.open('GET', url, true);

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          // Parse the response as HTML
          const parser = new DOMParser();
          const doc = parser.parseFromString(xhr.responseText, 'text/html');

          // Find the UserId input element
          const userIdInput = doc.getElementById('UserId');

          if (userIdInput) {
            const userId = userIdInput.value;
            // Save or overwrite UserId in localStorage
            localStorage.setItem('UserId', userId);
            this.userId = userId;
          } else {
            alert('UserId input not found in the response');
          }
        } else if (xhr.status >= 500 && retryCount < maxRetries) {
          // Retry on server errors (500 and above)
          setTimeout(() => {
            this.getUserId(retryCount + 1, maxRetries);
          }, 2000); // Wait 2 seconds before retry
        } else {
          //alert('Failed to fetch DeleteUser page. Status: ' + xhr.status);
        }
      }
    };

    xhr.onerror = () => {
      if (retryCount < maxRetries) {
        // Retry on network error
        setTimeout(() => {
          this.getUserId(retryCount + 1, maxRetries);
        }, 2000); // Wait 2 seconds before retry
      } else {
        alert('Network error occurred while fetching UserId');
      }
    };

    xhr.send();
  }

  // Function to extract RequestVerificationToken from the page
  extractRequestVerificationToken() {
    // Look for hidden input with name __RequestVerificationToken
    const tokenInput = document.querySelector('input[type="hidden"][name="__RequestVerificationToken"]');

    if (tokenInput) {
      const token = tokenInput.value;
      // Save token to localStorage
      localStorage.setItem('__RequestVerificationToken', token);
      this.requestVerificationToken = token;
    } else {
      // Token will be fetched from DeleteUser page
    }
  }

  refreshDropdowns() {
    // Find all existing dropdowns and update their options
    const dropdowns = document.querySelectorAll('[data-vaf-controls] select');

    dropdowns.forEach(dropdown => {
      // Save current selection
      const currentValue = dropdown.value;

      // Load saved applicants into dropdown from GetRealRandomApplicant instance
      const savedApplicants = this.getRealRandomApplicant.visaApplicants || [];

      dropdown.innerHTML = '<option value="">Applicant</option>';
      savedApplicants.forEach((applicant, index) => {
        const fullName = [
          applicant.FirstName || '',
          applicant.LastName || ''
        ].filter(Boolean).join(' ').trim() || `Applicant ${index + 1}`;

        const option = document.createElement('option');
        option.value = index;
        option.textContent = fullName;
        dropdown.appendChild(option);
      });

      // Restore selection if still valid
      if (currentValue && currentValue < savedApplicants.length) {
        dropdown.value = currentValue;
      }
    });

  }

  handleApplicantSelectionPage() {
    // Find all divs with id pattern app-{number}
    const appDivs = document.querySelectorAll('div[id^="app-"]');

    appDivs.forEach(appDiv => {
      // Check if we already added controls to this div
      if (appDiv.querySelector('[data-vaf-controls]')) {
        return;
      }

      // Create container for button and dropdown
      const controlsContainer = document.createElement('div');
      controlsContainer.setAttribute('data-vaf-controls', 'true');
      controlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 10px;
        margin-bottom: 10px;
        width: 100%;
        flex-wrap: wrap;
        position: relative;
        z-index: 1;
      `;

      // Create dropdown for saved applicants
      const dropdown = document.createElement('select');
      dropdown.style.cssText = `
        padding: 6px 12px;
        height: 40px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
        background-color: white;
        min-width: 150px;
      `;

      // Load saved applicants into dropdown from GetRealRandomApplicant instance
      const savedApplicants = this.getRealRandomApplicant.visaApplicants || [];

      dropdown.innerHTML = '<option value="">Applicant</option>';
      savedApplicants.forEach((applicant, index) => {
        const fullName = [
          applicant.FirstName || '',
          applicant.LastName || ''
        ].filter(Boolean).join(' ').trim() || `Applicant ${index + 1}`;

        const option = document.createElement('option');
        option.value = index;
        option.textContent = fullName;
        dropdown.appendChild(option);
      });

      // Create Change button
      const fillButton = document.createElement('button');
      fillButton.type = 'button'; // Explicitly set type to prevent form submission
      fillButton.textContent = 'Change';
      fillButton.setAttribute('data-changed', 'false'); // Track if button has been used
      fillButton.style.cssText = `
        padding: 6px 15px;
        height: 40px;
        background-color: #6c757d;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
      `;

      // Add click handler for Change button
      fillButton.onclick = async (event) => {
        // Prevent any form submission or propagation
        event.preventDefault();
        event.stopPropagation();

        // Extract name from the current div
        // Find div with class starting with pb- and get the span inside it
        const nameDiv = appDiv.querySelector('div[class*="pb-"] span');

        if (!nameDiv) {
          alert('Could not find applicant name in this div');
          return;
        }

        // Get the text content (name) from the span
        const currentName = nameDiv.textContent.trim();

        if (!currentName) {
          alert('No name found in the div');
          return;
        }

        // Get Random_Applicants from localStorage
        const randomApplicants = JSON.parse(localStorage.getItem('Random_Applicants') || '[]');

        // Filter by name to find matching applicant
        const foundApplicant = randomApplicants.find(applicant =>
          applicant.name && applicant.name.trim() === currentName
        );

        if (foundApplicant) {
          // Check if an applicant is selected in the dropdown
          const selectedIndex = dropdown.value;
          if (selectedIndex === '') {
            alert('Please select an applicant from the dropdown first');
            return;
          }

          // Refresh visa applicants from storage to get latest data (including fileId/photo)
          await this.getRealRandomApplicant.getVisaApplicantsFromExtension();

          // Get the selected applicant from GetRealRandomApplicant instance
          const visaApplicants = this.getRealRandomApplicant.visaApplicants || [];

          if (selectedIndex >= 0 && selectedIndex < visaApplicants.length) {
            // Get UserId from localStorage
            const storedUserId = localStorage.getItem('UserId') || '';

            // Get RequestVerificationToken from localStorage
            const storedToken = localStorage.getItem('__RequestVerificationToken') || '';

            // Validate required fields are not empty
            const emptyFields = [];
            if (!foundApplicant.applicantId) emptyFields.push('Id');
            if (!foundApplicant.visaTypeId) emptyFields.push('VisaTypeId');
            if (!foundApplicant.locationId) emptyFields.push('LocationId');
            if (!storedUserId) emptyFields.push('UserId');
            if (!storedToken) emptyFields.push('__RequestVerificationToken');

            if (emptyFields.length > 0) {
              alert(`Cannot update. The following fields are empty: ${emptyFields.join(', ')}`);
              return;
            }

            // Update the selected visa_applicant with Random_Applicants data
            visaApplicants[selectedIndex].Id = foundApplicant.applicantId || '';
            visaApplicants[selectedIndex].VisaTypeId = foundApplicant.visaTypeId || '';
            visaApplicants[selectedIndex].LocationId = foundApplicant.locationId || '';
            visaApplicants[selectedIndex].UserId = storedUserId;
            visaApplicants[selectedIndex]['__RequestVerificationToken'] = storedToken;


            // If IsPrimaryApplicant is true, remove RelationShip field
            if (foundApplicant.IsPrimaryApplicant === true) {
              delete visaApplicants[selectedIndex].RelationShip;
            }

            // Update the GetRealRandomApplicant instance's visaApplicants
            this.getRealRandomApplicant.visaApplicants = visaApplicants;

            // Change button to "Changing"
            fillButton.textContent = 'Changing';
            fillButton.style.backgroundColor = '#6c757d';

            // Serialize the selected visa_applicant and POST to ManageApplicant
            const selectedApplicant = visaApplicants[selectedIndex];

            const url = window.location.protocol + '//' + window.location.hostname + '/MAR/AppointmentData/ManageApplicant';

            // Convert the object to URL-encoded form data (excluding tracking properties)
            const formData = new URLSearchParams();
            for (const key in selectedApplicant) {
              if (selectedApplicant.hasOwnProperty(key)) {
                // Skip tracking properties - they're only for local tracking, not for server
                // Also skip photo and fileId as they're for local storage only
                if (key === 'changed' || key === 'changedAt' || key === 'clientEmail' || key === 'photo' || key === 'fileId') {
                  continue;
                }
                formData.append(key, selectedApplicant[key] || '');
              }
            }

            // Send POST request
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

            xhr.onreadystatechange = async () => {
              if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                  // Parse response to check for success
                  try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success === true || response.Success === true) {
                      // Success
                      fillButton.textContent = 'Changed ✓';
                      fillButton.style.backgroundColor = '#28a745'; // Green
                      fillButton.disabled = false;

                      // Mark the applicant as changed and add client email
                      visaApplicants[selectedIndex].changed = true;
                      visaApplicants[selectedIndex].changedAt = new Date().toISOString();
                      if (this.clientEmail) {
                        visaApplicants[selectedIndex].clientEmail = this.clientEmail;
                      }

                      // Update the GetRealRandomApplicant instance's visaApplicants
                      this.getRealRandomApplicant.visaApplicants = visaApplicants;

                      // Save the updated visa_applicants array to extension storage
                      await window.setExtensionData('visa_applicants', visaApplicants)
                        .catch((error) => {
                          console.error('Failed to save visa_applicants:', error);
                        });

                      // Call setFileId if the applicant has a fileId
                      if (selectedApplicant.fileId && typeof window.setFileId === 'function') {
                        console.log('Setting fileId for changed applicant:', selectedApplicant.fileId);
                        window.setFileId(selectedApplicant.fileId);
                      } else if (selectedApplicant.fileId) {
                        console.log('setFileId function not available, but applicant has fileId:', selectedApplicant.fileId);
                      }

                      // Update Random_Applicants in localStorage with new name
                      const randomApplicants = JSON.parse(localStorage.getItem('Random_Applicants') || '[]');
                      const foundApplicantIndex = randomApplicants.findIndex(applicant =>
                        applicant.name && applicant.name.trim() === currentName
                      );

                      if (foundApplicantIndex !== -1) {
                        // Update the name in Random_Applicants to match the new applicant
                        const newFullName = [
                          selectedApplicant.FirstName || '',
                          selectedApplicant.LastName || ''
                        ].filter(Boolean).join(' ').trim();
                        randomApplicants[foundApplicantIndex].name = newFullName;
                        localStorage.setItem('Random_Applicants', JSON.stringify(randomApplicants));
                      }

                      // Update the current app div with selected applicant's data

                      // Update the name in the div with class starting with pb-
                      const nameSpan = appDiv.querySelector('div[class*="pb-"] span');
                      if (nameSpan) {
                        const fullName = [
                          selectedApplicant.FirstName || '',
                          selectedApplicant.LastName || ''
                        ].filter(Boolean).join(' ').trim();
                        nameSpan.textContent = fullName;
                      }

                      // Update Date of Birth - find the div containing "Date Of Birth:" text
                      const dobDiv = Array.from(appDiv.querySelectorAll('.col-12')).find(div =>
                        div.textContent.includes('Date Of Birth:')
                      );
                      if (dobDiv) {
                        const dobSpan = dobDiv.querySelector('span[class*="pl-"]');
                        if (dobSpan && selectedApplicant.DateOfBirth) {
                          dobSpan.textContent = selectedApplicant.DateOfBirth;
                        }
                      }

                      // Update Passport No - find the div containing "Passport No:" text
                      const passportDiv = Array.from(appDiv.querySelectorAll('.col-12')).find(div =>
                        div.textContent.includes('Passport No:')
                      );
                      if (passportDiv) {
                        const passportSpan = passportDiv.querySelector('span[class*="pl-"]');
                        if (passportSpan && selectedApplicant.PassportNo) {
                          passportSpan.textContent = selectedApplicant.PassportNo;
                        }
                      }

                    } else {
                      // Server returned success:false
                      const errorMsg = response.error || response.Error || response.message || response.Message || 'Failed to update applicant';
                      alert(errorMsg);
                      fillButton.textContent = 'Error';
                      fillButton.disabled = false;
                      fillButton.style.backgroundColor = '#dc3545';
                    }
                  } catch (e) {
                    // Response is not valid JSON
                    fillButton.textContent = 'Error';
                    fillButton.disabled = false;
                    fillButton.style.backgroundColor = '#dc3545';
                  }
                } else {
                  // HTTP error
                  fillButton.textContent = 'Error';
                  fillButton.disabled = false;
                  fillButton.style.backgroundColor = '#dc3545';
                }
              }
            };

            xhr.onerror = () => {
              alert('Network error occurred while submitting applicant data');
              fillButton.textContent = 'Error';
              fillButton.disabled = false;
              fillButton.style.backgroundColor = '#dc3545';
            };
            xhr.send(formData.toString());
          } else {
            alert('Invalid selection from dropdown');
          }
        } else {
          alert(`No extracted applicant found with name: ${currentName}`);
        }
      };

      // Add controls to container
      controlsContainer.appendChild(dropdown);
      controlsContainer.appendChild(fillButton);

      // Append controls to the app div
      appDiv.appendChild(controlsContainer);
    });
  }

  // Initialize the class
  async init() {
    // Get UserId when the page loads
    this.getUserId();

    // Extract the RequestVerificationToken from current page
    this.extractRequestVerificationToken();

    // Wait a bit to ensure visa_applicants are loaded
    setTimeout(() => {
      // Handle applicant selection page
      this.handleApplicantSelectionPage();
      // Refresh dropdowns to show loaded applicants
      this.refreshDropdowns();
    }, 500);
  }
}

// Export classes to global scope for use by other scripts
window.GetRealRandomApplicant = GetRealRandomApplicant;
window.ChangeApplicant = ChangeApplicant;