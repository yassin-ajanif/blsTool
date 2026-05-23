
function startCountdown(delayMs, elementId, callback) {
  // If elementId is a function, treat it as callback (for when elementId is optional)
  if (typeof elementId === 'function') {
    callback = elementId;
    elementId = null;
  }

  let $element = null;
  let originalText = '';

  // Only try to get element if elementId is provided
  if (elementId) {
    if (typeof $ === 'undefined') {
      console.log('jQuery is not defined, running countdown without UI');
    } else {
      // Get element by ID (support both with and without #)
      const selector = elementId.startsWith('#') ? elementId : '#' + elementId;
      $element = $(selector);

      if ($element.length === 0) {
        console.log(`Element ${selector} not found, running countdown without UI`);
        $element = null;
      } else {
        // Store original text
        originalText = $element.text() || 'Submit';
      }
    }
  }

  let remainingMs = delayMs;

  // Update element text with countdown (if element exists)
  const countdownInterval = setInterval(() => {
    if (remainingMs <= 0) {
      clearInterval(countdownInterval);

      if ($element) {
        $element.text(originalText);
        // Trigger click when countdown completes (if no callback provided)
        if (!callback) {
          $element.click();
        }
      }

      // Execute callback if provided
      if (callback && typeof callback === 'function') {
        callback();
      }
      return;
    }

    // Update UI if element exists
    if ($element) {
      const seconds = (remainingMs / 1000).toFixed(1);
      $element.text(`${originalText} (${seconds}s)`);
    } else {
      // Log countdown progress if no element (optional)
      if (remainingMs % 1000 === 0) {
        console.log(`Countdown: ${remainingMs / 1000}s remaining...`);
      }
    }

    remainingMs -= 100;
  }, 100);

  return countdownInterval;
}

// Export to global scope
window.startCountdown = startCountdown;

console.log('Countdown utility loaded');