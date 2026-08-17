/**
 * TrueCaptcha solver — vanilla DOM (content-script isolated world, no page jQuery).
 */
const CaptchaSolver = {
  solve: async function (options = {}, onSuccess = null) {
    let settings = {};
    try {
      if (window.getFanikaData) {
        const data = await window.getFanikaData();
        settings = data.settings || {};
      }
    } catch (error) {
      console.warn('[fanika/captcha] settings load failed', error);
    }

    const tc = settings?.captchaService?.truecaptcha || {};
    const apiKey = tc.apiKey || '';
    const userId = tc.userId || '';
    if (!apiKey || !userId) {
      console.warn('[fanika/captcha] Missing USER_ID / API_KEY from .env');
      return;
    }

    const waitForCaptcha = (callback, maxAttempts = 40) => {
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        const imgElements = document.getElementsByClassName('captcha-img');
        const fallbackImgs = document.querySelectorAll('#captcha-main-div img, .main-div-container img');
        const count = imgElements.length || fallbackImgs.length;
        const hasLabel = [...document.querySelectorAll('.box-label')].some((el) => {
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden';
        });
        const enough = count >= 50;
        const some = count >= 6 && hasLabel;

        if (!enough && attempts < maxAttempts) return;

        if (!enough && !some) {
          clearInterval(checkInterval);
          console.log('[fanika/captcha] images not found');
          return;
        }

        const pool = imgElements.length ? imgElements : fallbackImgs;
        let checked = 0;
        let loaded = 0;
        for (let i = 0; i < pool.length && checked < 10; i += 5) {
          checked++;
          if (pool[i].complete && pool[i].naturalHeight > 0) loaded++;
        }

        if (loaded === checked || attempts >= maxAttempts) {
          clearInterval(checkInterval);
          callback();
        }
      }, 50);
    };

    waitForCaptcha(() => {
      const labels = [...document.querySelectorAll('.box-label')].sort(
        (a, b) => Number(getComputedStyle(b).zIndex) - Number(getComputedStyle(a).zIndex)
      );
      const target = (labels[0]?.textContent || '').replace(/\D+/, '');

      const imgNodes = [...document.querySelectorAll('.captcha-img')];
      const fallbackNodes = [...document.querySelectorAll('#captcha-main-div img, .main-div-container img')];
      const parents = (imgNodes.length ? imgNodes : fallbackNodes)
        .map((img) => img.parentElement)
        .filter((el) => {
          if (!el) return false;
          return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        });

      const byRow = {};
      parents.forEach((el) => {
        const key = Math.floor(el.offsetTop);
        (byRow[key] ??= []).push(el);
      });

      const grid = Object.keys(byRow)
        .sort((a, b) => Number(a) - Number(b))
        .flatMap((key) => {
          const sortedByZ = byRow[key].sort(
            (a, b) => Number(getComputedStyle(b).zIndex) - Number(getComputedStyle(a).zIndex)
          );
          return sortedByZ.slice(0, 3).sort((a, b) => a.offsetLeft - b.offsetLeft);
        })
        .map((e) => e.firstElementChild)
        .filter(Boolean);

      console.log('[fanika/captcha] grid', grid.length, 'target', target);

      const successHandler =
        onSuccess ||
        function () {
          document.getElementById('btnVerify')?.click() ||
          document.getElementById('btnSubmit')?.click();
        };

      CaptchaSolver.solveWithTrueCaptcha(grid, target, userId, apiKey, successHandler);
    });
  },

  extractCaptchaGridData: function (grid) {
    return Object.fromEntries(grid.map((img) => img.src).entries());
  },

  onError: function (type, data) {
    console.error('[fanika/captcha]', type, data);
    const box = document.querySelector('.validation-summary-valid');
    if (box) box.innerHTML = '<b>Failed to solve captcha.</b>';
  },

  solveWithTrueCaptcha: function (grid, target, userId, apiKey, onSuccess, retryCount = 3) {
    const gridData = Object.fromEntries(grid.map((img, index) => [index, img.src]));
    const host = document.querySelector('.main-div-container');
    const loader = document.createElement('div');
    loader.className = 'd-flex align-items-center justify-content-center lead text-warning';
    loader.textContent = 'Solving captcha with TrueCaptcha…';
    host?.prepend(loader);

    function getCaptcha(base64Image, callback) {
      const cleanBase64 = base64Image.startsWith('data:image/')
        ? base64Image.slice(base64Image.indexOf('base64,') + 7)
        : base64Image;
      fetch('https://api.apitruecaptcha.org/one/gettext', {
        method: 'POST',
        body: JSON.stringify({ userid: userId, apikey: apiKey, data: cleanBase64 }),
        headers: { 'Content-Type': 'application/json' }
      })
        .then((r) => r.json())
        .then((data) => callback(data))
        .catch((err) => {
          console.error('[fanika/captcha] TrueCaptcha error', err);
          callback(null);
        });
    }

    Promise.all(
      Object.keys(gridData).map(
        (index) =>
          new Promise((resolve) => {
            getCaptcha(gridData[index], (data) => resolve({ index, data }));
          })
      )
    )
      .then((results) => {
        loader.remove();
        const correct = results
          .filter(({ data }) => data && data.success && data.result === target)
          .map(({ index }) => index);

        if (correct.length > 0) {
          correct.forEach((index) => grid[index]?.click());
          if (typeof onSuccess === 'function') onSuccess();
        } else if (retryCount > 0) {
          console.warn('[fanika/captcha] retry TrueCaptcha');
          CaptchaSolver.solveWithTrueCaptcha(grid, target, userId, apiKey, onSuccess, retryCount - 1);
        } else {
          CaptchaSolver.onError('Failed after multiple TrueCaptcha attempts', results);
        }
      })
      .catch((error) => {
        loader.remove();
        CaptchaSolver.onError('captchaerror', error);
      });
  }
};
