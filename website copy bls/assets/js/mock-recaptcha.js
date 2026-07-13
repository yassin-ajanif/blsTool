/**
 * Shows a mock reCAPTCHA widget on pages that originally used Google reCAPTCHA Enterprise.
 * Detects hidden token fields: #ReCaptchaToken, #ReCaptchaToken2
 */
(function () {
  'use strict';

  function hasRecaptcha() {
    return !!(document.getElementById('ReCaptchaToken') || document.getElementById('ReCaptchaToken2'));
  }

  function logoSvg() {
    return (
      '<svg class="bls-mock-recaptcha__logo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="32" cy="32" r="30" fill="#1a73e8"/>' +
      '<path fill="#fff" d="M18 33.5l8.2 8.2L46 21.9l-3.1-3.1-16.7 16.7-5.1-5.1z"/>' +
      '</svg>'
    );
  }

  function injectStylesheet() {
    if (document.querySelector('link[href="/assets/css/mock-recaptcha.css"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/mock-recaptcha.css';
    document.head.appendChild(link);
  }

  function buildCheckbox() {
    var wrap = document.createElement('div');
    wrap.className = 'bls-mock-recaptcha';
    wrap.setAttribute('data-bls-mock-recaptcha', 'true');
    wrap.innerHTML =
      '<div class="bls-mock-recaptcha__check" role="checkbox" aria-checked="false" tabindex="0" title="Mock reCAPTCHA"></div>' +
      '<div class="bls-mock-recaptcha__label">I\'m not a robot <span style="color:#888;font-size:11px;">(mock)</span></div>' +
      '<div class="bls-mock-recaptcha__brand">' +
      logoSvg() +
      '<small>reCAPTCHA</small><small>Privacy · Terms</small>' +
      '</div>';

    var check = wrap.querySelector('.bls-mock-recaptcha__check');
    function toggle() {
      var on = check.classList.toggle('is-checked');
      check.setAttribute('aria-checked', on ? 'true' : 'false');
      check.textContent = on ? '✓' : '';
      var token = document.getElementById('ReCaptchaToken') || document.getElementById('ReCaptchaToken2');
      if (token) token.value = on ? 'mock-recaptcha-token' : '';
    }
    check.addEventListener('click', toggle);
    check.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    return wrap;
  }

  function buildCornerBadge(pageLabel) {
    var badge = document.createElement('div');
    badge.className = 'bls-mock-recaptcha__badge';
    badge.innerHTML =
      logoSvg() +
      '<div><strong>reCAPTCHA</strong> mock<br><span style="color:#666">' +
      pageLabel +
      '</span></div>';
    return badge;
  }

  function pageLabel() {
    var path = (location.pathname || '').toLowerCase();
    if (path.indexOf('newappointment') !== -1 || path.indexOf('visatype') !== -1) return 'Visa Type page';
    if (path.indexOf('slotselection') !== -1) return 'Slot Selection page';
    return 'This page uses reCAPTCHA';
  }

  function placeWidget(widget) {
    var btn =
      document.getElementById('btnSubmit') ||
      document.querySelector('button.btn-primary') ||
      document.querySelector('form button[type="submit"], form button[type="button"]');
    if (btn && btn.parentNode) {
      btn.parentNode.insertBefore(widget, btn);
      return;
    }
    var form = document.querySelector('form');
    if (form) form.appendChild(widget);
  }

  function init() {
    if (!hasRecaptcha()) return;
    injectStylesheet();
    if (!document.querySelector('[data-bls-mock-recaptcha]')) {
      placeWidget(buildCheckbox());
    }
    if (!document.querySelector('.bls-mock-recaptcha__badge')) {
      document.body.appendChild(buildCornerBadge(pageLabel()));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
