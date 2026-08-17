/**
 * DOM helpers for content scripts (isolated world — page jQuery is not visible).
 */
(function () {
  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    // Match jQuery :visible (do not treat opacity:0 as hidden — BLS uses that)
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function visibleInputs(selector) {
    return [...document.querySelectorAll(selector)].filter(isVisible);
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clickEl(el) {
    if (!el) return;
    el.click();
  }

  window.fanikaDom = { isVisible, visibleInputs, setNativeValue, clickEl };
})();
