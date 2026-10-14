(function () {
  'use strict';

  var KEY = 'checkauto-cookie-consent';
  var LANGUAGE_KEY = 'checkauto-lang';
  var VERSION = 'cookies-2026-10-14';
  var LIFETIME = 180 * 24 * 60 * 60 * 1000;
  var record = null;
  var banner;
  var returnFocus;
  var saveFailed = false;
  var forcedOff = false;
  var labels = {
    lt: {
      title: 'Slapukų pasirinkimai',
      necessary: 'Būtinieji',
      active: 'Visada aktyvūs',
      necessaryText: 'Sutikimo pasirinkimui ir rezervacijos pateikimui.',
      optional: 'Pasirenkamieji',
      optionalText: 'Pasirinktos kalbos įsiminimas.',
      pending: 'Tik su sutikimu',
      allowed: 'Leidžiami',
      rejected: 'Atmesti',
      reject: 'Atmesti pasirenkamuosius',
      accept: 'Priimti pasirenkamuosius',
      settings: 'Slapukų nustatymai',
      privacy: 'Privatumo politika',
      error: 'Pasirinkimo išsaugoti nepavyko. Pasirenkamoji saugykla išjungta.'
    },
    en: {
      title: 'Cookie choices',
      necessary: 'Strictly necessary',
      active: 'Always active',
      necessaryText: 'Your consent choice and booking submission.',
      optional: 'Optional',
      optionalText: 'Remembering your selected language.',
      pending: 'Only with consent',
      allowed: 'Allowed',
      rejected: 'Rejected',
      reject: 'Reject optional',
      accept: 'Accept optional',
      settings: 'Cookie settings',
      privacy: 'Privacy Policy',
      error: 'Your choice could not be saved. Optional storage stays off.'
    }
  };

  function clearLanguage() {
    try { localStorage.removeItem(LANGUAGE_KEY); } catch (_) {}
  }

  function readRecord() {
    var raw;
    var value;
    try { raw = localStorage.getItem(KEY); } catch (_) { return record; }
    try { value = JSON.parse(raw); } catch (_) { value = null; }
    var now = Date.now();
    if (value && value.version === VERSION && typeof value.preferences === 'boolean' &&
        Number.isFinite(value.savedAt) && Number.isFinite(value.expiresAt) &&
        value.savedAt <= now && value.expiresAt > now &&
        value.expiresAt === value.savedAt + LIFETIME) return value;
    if (raw) { try { localStorage.removeItem(KEY); } catch (_) {} }
    return null;
  }

  function refreshRecord() {
    record = forcedOff ? null : readRecord();
    if (!record || !record.preferences) clearLanguage();
    return record;
  }

  function preferencesAllowed() {
    return Boolean(refreshRecord() && record.preferences);
  }

  function getLanguage() {
    if (!preferencesAllowed()) return 'lt';
    try { return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'lt'; }
    catch (_) { return 'lt'; }
  }

  function rememberLanguage(language) {
    if (!preferencesAllowed()) return;
    if (language !== 'lt' && language !== 'en') return;
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch (_) {}
  }

  function text() {
    return labels[document.documentElement.lang === 'en' ? 'en' : 'lt'];
  }

  function updateLabels() {
    if (!banner) return;
    var copy = text();
    banner.querySelectorAll('[data-consent-copy]').forEach(function (element) {
      element.textContent = copy[element.dataset.consentCopy];
    });
    banner.querySelector('[data-consent-status]').textContent =
      !record ? copy.pending : record.preferences ? copy.allowed : copy.rejected;
    banner.querySelector('[data-consent-error]').hidden = !saveFailed;
    document.querySelectorAll('[data-cookie-settings]').forEach(function (button) {
      button.textContent = copy.settings;
      button.setAttribute('aria-controls', 'cookie-consent');
      button.setAttribute('aria-expanded', String(!banner.hidden));
    });
  }

  function measureBanner() {
    document.body.classList.toggle('has-cookie-banner', Boolean(banner && !banner.hidden));
    document.documentElement.style.setProperty('--cookie-banner-space',
      banner && !banner.hidden ? Math.ceil(banner.getBoundingClientRect().height + 24) + 'px' : '0px');
  }

  function closeBanner() {
    var hasFocus = banner.contains(document.activeElement);
    banner.hidden = true;
    updateLabels();
    measureBanner();
    if (hasFocus) {
      var target = returnFocus && returnFocus.isConnected ? returnFocus : document.querySelector('main');
      if (target) {
        if (target.tagName !== 'BUTTON') target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
  }

  function openSettings(trigger) {
    if (!banner) return;
    refreshRecord();
    saveFailed = false;
    returnFocus = trigger || document.activeElement;
    banner.hidden = false;
    updateLabels();
    measureBanner();
    banner.querySelector('[data-consent-reject]').focus({ preventScroll: true });
  }

  function choose(preferences) {
    var now = Date.now();
    var next = { version: VERSION, preferences: preferences, savedAt: now, expiresAt: now + LIFETIME };
    // If the necessary consent record cannot be saved, fail closed for optional storage.
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      forcedOff = false;
      record = next;
      saveFailed = false;
    } catch (_) {
      forcedOff = true;
      record = null;
      saveFailed = true;
      try { localStorage.removeItem(KEY); } catch (_) {}
      clearLanguage();
      updateLabels();
      measureBanner();
      return;
    }
    if (preferences) {
      rememberLanguage(window.checkautoI18n ? window.checkautoI18n.getLanguage() : document.documentElement.lang);
    } else {
      clearLanguage();
    }
    window.dispatchEvent(new CustomEvent('checkauto:consentchange', { detail: { preferences: preferences } }));
    closeBanner();
  }

  function init() {
    banner = document.createElement('section');
    banner.id = 'cookie-consent';
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-labelledby', 'cookie-consent-title');
    banner.innerHTML = '<div class="cookie-banner-heading"><h2 id="cookie-consent-title" data-consent-copy="title"></h2>' +
      '<a href="/privatumo-politika/#cookies" data-consent-copy="privacy"></a></div>' +
      '<div class="cookie-category"><p><strong data-consent-copy="necessary"></strong>' +
      '<span data-consent-copy="active"></span></p><p data-consent-copy="necessaryText"></p></div>' +
      '<div class="cookie-category"><p><strong data-consent-copy="optional"></strong>' +
      '<span data-consent-status></span></p><p data-consent-copy="optionalText"></p></div>' +
      '<div class="cookie-banner-actions"><button type="button" data-consent-reject data-consent-copy="reject"></button>' +
      '<button type="button" data-consent-accept data-consent-copy="accept"></button></div>' +
      '<p class="cookie-banner-error" role="status" data-consent-error data-consent-copy="error" hidden></p>';
    banner.hidden = Boolean(refreshRecord());
    document.body.insertBefore(banner, document.body.firstChild);
    banner.querySelector('[data-consent-reject]').addEventListener('click', function () { choose(false); });
    banner.querySelector('[data-consent-accept]').addEventListener('click', function () { choose(true); });
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-cookie-settings]');
      if (trigger) openSettings(trigger);
    });
    banner.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && record) closeBanner();
    });
    window.addEventListener('checkauto:languagechange', updateLabels);
    window.addEventListener('storage', function (event) {
      if (event.key !== KEY && event.key !== null) return;
      refreshRecord();
      saveFailed = false;
      if (record) closeBanner();
      else { banner.hidden = false; updateLabels(); measureBanner(); }
    });
    window.addEventListener('pageshow', function () {
      if (!refreshRecord()) banner.hidden = false;
      updateLabels();
      measureBanner();
    });
    if (typeof ResizeObserver === 'function') new ResizeObserver(measureBanner).observe(banner);
    window.addEventListener('resize', measureBanner);
    updateLabels();
    measureBanner();
  }

  // Runs in the head, before every early language read and before page scripts.
  refreshRecord();
  window.checkautoConsent = {
    preferencesAllowed: preferencesAllowed,
    getLanguage: getLanguage,
    rememberLanguage: rememberLanguage,
    openSettings: openSettings
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
