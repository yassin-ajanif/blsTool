/**
 * DisplayChangedApplicant.js
 * Displays changed applicants that match the current client's email
 */

(async function() {

  // Wait for page to be fully loaded
  async function waitForPageLoad() {
    return new Promise(resolve => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve);
      }
    });
  }

  // Main function to display changed applicants
  async function displayChangedApplicants() {
    try {
      // Wait for page to load
      await waitForPageLoad();

      // Get extension data
      const data = await window.getExtensionData();

      if (!data) {
        return;
      }

      // Get client email
      const clientEmail = data.client?.email;
      if (!clientEmail) {
        return;
      }


      // Get visa applicants
      const visaApplicants = data.visa_applicants || [];
      if (visaApplicants.length === 0) {
        return;
      }

      // Filter applicants that have matching clientEmail
      const matchingApplicants = visaApplicants.filter(applicant =>
        applicant.clientEmail &&
        applicant.clientEmail.toLowerCase() === clientEmail.toLowerCase() &&
        applicant.changed === true
      );

      if (matchingApplicants.length === 0) {
        return;
      }


      // Extract passport numbers from matching applicants
      const passportNumbers = matchingApplicants
        .map(applicant => applicant.PassportNo)
        .filter(passport => passport); // Filter out empty/null values

      if (passportNumbers.length === 0) {
        return;
      }

      // Create the display text
      const passportList = passportNumbers.join(', ');
      const displayText = `Passport Tdebel : ${passportList}`;

      // Find h5 elements on the page
      const h5Elements = document.querySelectorAll('h5');

      if (h5Elements.length === 0) {
        return;
      }

      // Replace text in the first h5 element
      const targetH5 = h5Elements[0];

      // Check if we already replaced this text to avoid duplicates
      if (!targetH5.textContent.includes('Passport Tdebel')) {
        // Store original text if needed for later
        targetH5.setAttribute('data-original-text', targetH5.textContent);

        // Replace the h5 text content
        targetH5.textContent = displayText;
        targetH5.style.color = '#dc3545'; // Red color
        targetH5.style.fontWeight = 'bold';

      }


    } catch (error) {
    }
  }

  // Run the display function
  await displayChangedApplicants();


})();