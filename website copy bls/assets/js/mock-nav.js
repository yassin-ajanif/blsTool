/**
 * Local mock navigation for the BLS UI clone.
 * No real backend — only advances through the 4 local pages.
 */
(function () {
  'use strict';

  window.BLS_MOCK = {
    login: '/MAR/account/login/',
    captcha: '/MAR/NewCaptcha/LogInCaptcha/',
    visa: '/MAR/appointment/newappointment/',
    calendar: '/MAR/appointment/slotselection/',
    submitted: '/MAR/appointment/submitted/'
  };

  function go(path) {
    window.location.href = path;
  }

  // Prevent forms from posting to missing BLS endpoints
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('form').forEach(function (form) {
      form.setAttribute('action', '#');
      form.setAttribute('method', 'get');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
      });
    });
  });

  window.OnSubmitVerify = function () {
    try {
      var emailInput = document.querySelector('main input[type="text"]:not([type="hidden"]), form input.form-control[type="text"]');
      var email = emailInput ? emailInput.value : '';
      if (email) sessionStorage.setItem('bls_mock_email', email);
    } catch (e) { /* ignore */ }
    go(window.BLS_MOCK.captcha);
    return false;
  };

  window.onSubmit = function () {
    // Allow captcha UI selection, but do not require correctness
    go(window.BLS_MOCK.visa);
    return false;
  };

  window.OnSubmitVisaType = function () {
    go(window.BLS_MOCK.calendar);
    return false;
  };

  window.OnSubmitSlotSelection = function () {
    go(window.BLS_MOCK.submitted);
    return false;
  };

  window.onDateSearch = function () {
    alert('Date search is mocked locally — no BLS API.');
    return false;
  };

  // Soft stubs so missing BLS helpers do not throw
  if (typeof window.ShowLoader !== 'function') {
    window.ShowLoader = function () { return false; };
  }
  if (typeof window.HideLoader !== 'function') {
    window.HideLoader = function () { return false; };
  }
  if (typeof window.ShowError !== 'function') {
    window.ShowError = function (msg) { alert(msg || 'Error'); };
  }
  if (typeof window.OnLanguageChange !== 'function') {
    window.OnLanguageChange = function () { return false; };
  }
  if (typeof window.OnLogout !== 'function') {
    window.OnLogout = function () {
      go(window.BLS_MOCK.login);
      return false;
    };
  }
  if (typeof window.OnPhotoError !== 'function') {
    window.OnPhotoError = function (img) {
      if (img) img.src = '/assets/images/logo.svg';
    };
  }
  if (typeof window.GetMainWindow !== 'function') {
    window.GetMainWindow = function () {
      return {
        iframeOpenUrl: '',
        OpenWindow: function () {},
        CloseWindow: function () {}
      };
    };
  }

  // Stub removed remote reCAPTCHA so leftover page code does not throw
  window.grecaptcha = window.grecaptcha || {
    enterprise: {
      ready: function (cb) { if (typeof cb === 'function') cb(); },
      execute: function () { return Promise.resolve('mock-recaptcha-token'); }
    }
  };
})();
