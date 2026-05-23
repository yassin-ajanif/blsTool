// ========================================================================================
//                        SAVE PHOTO UTILITY
// ========================================================================================
// This utility provides functions for saving fileId from server photos to clients and applicants

(function() {
  'use strict';

  // --- File ID Helper ---
  function setFileId(fileId) {
    // Look for the element with id: uploadfile-1-preview and change its src attribute
    const previewElement = document.getElementById('uploadfile-1-preview');
    if (previewElement) {
      previewElement.setAttribute('src', `/MAR/query/getfile?fileid=${fileId}`);
      console.log('Updated preview image source with fileId:', fileId);
    } else {
      // Image preview element not found
      console.log('uploadfile-1-preview element not found');
    }

    // Look for the hidden input with id ApplicantPhotoId and set its value
    const photoIdInput = document.getElementById('ApplicantPhotoId');
    if (photoIdInput) {
      photoIdInput.value = fileId;
      console.log('Updated ApplicantPhotoId value with fileId:', fileId);
    } else {
      console.log('ApplicantPhotoId input not found');
    }
  }

  // --- Save FileId for Client/Applicant ---
  async function SaveFileIdClientApplicant() {
    // Find the uploadfile-1 element
    const uploadFileElement = document.getElementById('uploadfile-1');
    if (!uploadFileElement) {
      console.log('uploadfile-1 element not found, cannot inject selector');
      return;
    }

    // Get the parent element
    const parentElement = uploadFileElement.parentElement;
    if (!parentElement) {
      console.log('Parent element not found');
      return;
    }

    // Check if already injected
    if (document.getElementById('photo-save-container')) {
      console.log('Photo save controls already injected');
      return;
    }

    // Create container div with vertical layout
    const containerDiv = document.createElement('div');
    containerDiv.id = 'photo-save-container';
    containerDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 10px;
      margin-bottom: 10px;
    `;

    // Create dropdown
    const dropdown = document.createElement('select');
    dropdown.id = 'client-applicant-dropdown';
    dropdown.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    `;

    // Add placeholder option
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'Select';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    dropdown.appendChild(placeholderOption);

    // Get all data from extension storage including all clients
    try {
      const data = await window.getExtensionData();

      // Add all clients
      if (data.allClients && data.allClients.length > 0) {
        const clientGroup = document.createElement('optgroup');
        clientGroup.label = 'Clients';
        data.allClients.forEach(client => {
          const option = document.createElement('option');
          option.value = `client_${client.id}`;
          option.textContent = client.name || 'Unnamed Client';
          clientGroup.appendChild(option);
        });
        dropdown.appendChild(clientGroup);
      }

      // Add applicants group
      if (data.visa_applicants && data.visa_applicants.length > 0) {
        const applicantGroup = document.createElement('optgroup');
        applicantGroup.label = 'Applicants';
        data.visa_applicants.forEach(applicant => {
          const option = document.createElement('option');
          option.value = `applicant_${applicant.PassportNo}`;
          const name = `${applicant.FirstName || ''} ${applicant.LastName || ''}`.trim() || 'Unnamed Applicant';
          option.textContent = name;
          applicantGroup.appendChild(option);
        });
        dropdown.appendChild(applicantGroup);
      }
    } catch (error) {
      console.error('Failed to load clients and applicants:', error);
    }

    // Create button
    const button = document.createElement('button');
    button.id = 'save-photo-button';
    button.textContent = 'Save Photo';
    button.type = 'button';
    button.style.cssText = `
      width: 100%;
      padding: 8px 16px;
      background-color: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    `;

    // Add hover effect
    button.onmouseover = () => {
      button.style.backgroundColor = '#218838';
    };
    button.onmouseout = () => {
      button.style.backgroundColor = '#28a745';
    };

    // Add click handler
    button.onclick = async () => {
      const selectedValue = dropdown.value;
      if (!selectedValue) {
        alert('Please select a client or applicant');
        return;
      }

      // Get the image element and extract fileId from src
      const imgElement = document.getElementById('uploadfile-1-preview');
      if (!imgElement) {
        alert('No image preview found');
        return;
      }

      const src = imgElement.getAttribute('src');
      if (!src) {
        alert('No image source found');
        return;
      }

      // Extract fileId from src (e.g., /MAR/query/getfile?fileid=675dd9a5-e3d1-42bd-8c7f-963ea17848c9)
      const fileIdMatch = src.match(/fileid=([a-f0-9-]+)/i);
      if (!fileIdMatch || !fileIdMatch[1]) {
        alert('Could not extract file ID from image');
        return;
      }

      const fileId = fileIdMatch[1];
      console.log('Extracted fileId:', fileId);

      // Build the photo URL from the fileId
      const baseUrl = window.location.origin;
      const photoUrl = `${baseUrl}/MAR/query/getfile?fileid=${fileId}`;
      console.log('Generated photo URL:', photoUrl);

      try {
        // Determine if it's a client or applicant
        const [type, id] = selectedValue.split('_');

        if (type === 'client') {
          // Save to client
          const data = await window.getExtensionData();
          const clients = data.allClients || [];

          // Find and update the specific client (compare as strings to handle both number and string IDs)
          const updatedClients = clients.map(client => {
            if (String(client.id) === String(id)) {
              return {
                ...client,
                fileId: fileId,
                photo: photoUrl  // Save the photo URL
              };
            }
            return client;
          });

          // Save updated clients array
          await window.setExtensionData('clients', updatedClients);

          button.textContent = 'Saved ✓';
          button.style.backgroundColor = '#218838';
          console.log(`Saved fileId ${fileId} and photo URL to client ${id}`);

        } else if (type === 'applicant') {
          // Save to applicant
          const data = await window.getExtensionData();
          const applicants = data.visa_applicants || [];

          // Find and update the specific applicant by passport
          const updatedApplicants = applicants.map(applicant => {
            if (applicant.PassportNo === id) {
              return {
                ...applicant,
                fileId: fileId,
                photo: photoUrl  // Save the photo URL
              };
            }
            return applicant;
          });

          // Save updated applicants array
          await window.setExtensionData('visa_applicants', updatedApplicants);

          button.textContent = 'Saved ✓';
          button.style.backgroundColor = '#218838';
          console.log(`Saved fileId ${fileId} and photo URL to applicant with passport ${id}`);
        }

        // Reset button after 2 seconds
        setTimeout(() => {
          button.textContent = 'Save Photo';
          button.style.backgroundColor = '#28a745';
        }, 2000);

      } catch (error) {
        console.error('Error saving fileId:', error);
        alert('Failed to save photo: ' + error.message);
      }
    };

    // Append elements to container (each on new line due to flex-direction: column)
    containerDiv.appendChild(dropdown);
    containerDiv.appendChild(button);

    // Insert the container after the parent element
    parentElement.insertAdjacentElement('afterend', containerDiv);
    console.log('Photo save controls injected successfully');
  }

  // Make functions globally available
  window.setFileId = setFileId;
  window.SaveFileIdClientApplicant = SaveFileIdClientApplicant;

  console.log('SavePhoto utility loaded successfully');
})();