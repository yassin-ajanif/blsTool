function startCountdown(delayMs, elementId, callback) {
  if (typeof elementId === 'function') {
    callback = elementId;
    elementId = null;
  }

  let element = null;
  let originalText = '';

  if (elementId) {
    const id = elementId.startsWith('#') ? elementId.slice(1) : elementId;
    element = document.getElementById(id);
    if (element) originalText = element.textContent || 'Submit';
  }

  let remainingMs = delayMs;
  const countdownInterval = setInterval(() => {
    if (remainingMs <= 0) {
      clearInterval(countdownInterval);
      if (element) element.textContent = originalText;
      if (callback) callback();
      else if (element) element.click();
      return;
    }
    if (element) {
      element.textContent = `${originalText} (${(remainingMs / 1000).toFixed(1)}s)`;
    }
    remainingMs -= 100;
  }, 100);

  return countdownInterval;
}

window.startCountdown = startCountdown;
