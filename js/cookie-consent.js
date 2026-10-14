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
      title: 'Slapukai',
      necessary: 'Svetainės veikimas',
      active: 'Visada įjungta',
      necessaryText: 'Padeda pateikti rezervaciją ir išsaugo jūsų slapukų pasirinkimą.',
      necessaryInfo: 'Apie svetainės veikimo slapukus',
      optional: 'Patogumo funkcijos',
      optionalNote: 'Pasirenkama',
      optionalText: 'Įsimena jūsų pasirinktą kalbą.',
      optionalInfo: 'Apie patogumo funkcijas',
      reject: 'Atmesti nebūtinus',
      accept: 'Priimti',
      settings: 'Slapukų nustatymai',
      privacy: 'Privatumas',
      error: 'Pasirinkimo išsaugoti nepavyko. Pasirenkamoji saugykla išjungta.'
    },
    en: {
      title: 'Cookies',
      necessary: 'Site operation',
      active: 'Always on',
      necessaryText: 'Your consent choice and booking submission.',
      necessaryInfo: 'About site operation cookies',
      optional: 'Quality of life',
      optionalNote: 'Optional',
      optionalText: 'Remembering your selected language.',
      optionalInfo: 'About quality of life features',
      reject: 'Reject optional',
      accept: 'Accept',
      settings: 'Cookie settings',
      privacy: 'Privacy',
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
    banner.querySelector('[data-consent-optional]').checked = Boolean(record && record.preferences);
    banner.querySelectorAll('[data-consent-info]').forEach(function (button) {
      button.setAttribute('aria-label', copy[button.dataset.consentInfo]);
    });
    banner.querySelector('[data-consent-error]').hidden = !saveFailed;
    document.querySelectorAll('[data-cookie-settings]').forEach(function (button) {
      button.textContent = copy.settings;
      button.setAttribute('aria-controls', 'cookie-consent');
      button.setAttribute('aria-expanded', String(!banner.hidden));
    });
  }

  function closeBanner() {
    var hasFocus = banner.contains(document.activeElement);
    banner.hidden = true;
    closeInfo();
    updateLabels();
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
    closeInfo();
    updateLabels();
    banner.querySelector('[data-consent-reject]').focus({ preventScroll: true });
  }

  function choose(preferences, dismiss) {
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
      return;
    }
    if (preferences) {
      rememberLanguage(window.checkautoI18n ? window.checkautoI18n.getLanguage() : document.documentElement.lang);
    } else {
      clearLanguage();
    }
    window.dispatchEvent(new CustomEvent('checkauto:consentchange', { detail: { preferences: preferences } }));
    if (dismiss !== false) closeBanner();
    else updateLabels();
  }

  function closeInfo(except) {
    if (!banner) return;
    banner.querySelectorAll('.cookie-info').forEach(function (info) {
      if (info === except) return;
      info.dataset.pinned = 'false';
      info.querySelector('[data-consent-info]').setAttribute('aria-expanded', 'false');
      info.querySelector('[role="tooltip"]').hidden = true;
    });
  }

  function initInfo() {
    banner.querySelectorAll('.cookie-info').forEach(function (info) {
      var button = info.querySelector('[data-consent-info]');
      var tooltip = info.querySelector('[role="tooltip"]');
      function show() {
        closeInfo(info);
        button.setAttribute('aria-expanded', 'true');
        tooltip.hidden = false;
      }
      function hide() {
        info.dataset.pinned = 'false';
        button.setAttribute('aria-expanded', 'false');
        tooltip.hidden = true;
      }
      info.addEventListener('mouseenter', show);
      info.addEventListener('mouseleave', function () {
        if (info.dataset.pinned !== 'true' && !info.contains(document.activeElement)) hide();
      });
      button.addEventListener('focus', show);
      info.addEventListener('focusout', function (event) {
        if (!info.contains(event.relatedTarget) && !info.matches(':hover')) hide();
      });
      button.addEventListener('click', function () {
        if (info.dataset.pinned === 'true') hide();
        else { info.dataset.pinned = 'true'; show(); }
      });
      info.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { hide(); event.stopPropagation(); }
      });
    });
  }

  function init() {
    banner = document.createElement('section');
    banner.id = 'cookie-consent';
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-labelledby', 'cookie-consent-title');
    banner.innerHTML = '<div class="cookie-banner-heading"><h2 id="cookie-consent-title" data-consent-copy="title"></h2>' +
      '<a href="/privatumo-politika/#cookies" data-consent-copy="privacy"></a></div>' +
      '<div class="cookie-category"><label class="cookie-category-label" for="cookie-necessary">' +
      '<span id="cookie-necessary-label" data-consent-copy="necessary"></span>' +
      '<span class="cookie-category-note" id="cookie-necessary-note" data-consent-copy="active"></span></label>' +
      '<span class="cookie-info"><button type="button" class="cookie-info-button" data-consent-info="necessaryInfo" aria-expanded="false" aria-controls="cookie-necessary-info">' +
      '<span aria-hidden="true">i</span></button><span class="cookie-info-popover" id="cookie-necessary-info" role="tooltip" data-consent-copy="necessaryText" hidden></span></span>' +
      '<label class="cookie-switch"><input id="cookie-necessary" type="checkbox" role="switch" checked disabled aria-labelledby="cookie-necessary-label" aria-describedby="cookie-necessary-note cookie-necessary-info">' +
      '<span class="cookie-switch-track" aria-hidden="true"></span></label></div>' +
      '<div class="cookie-category"><label class="cookie-category-label" for="cookie-optional">' +
      '<span id="cookie-optional-label" data-consent-copy="optional"></span>' +
      '<span class="cookie-category-note" id="cookie-optional-note" data-consent-copy="optionalNote"></span></label>' +
      '<span class="cookie-info"><button type="button" class="cookie-info-button" data-consent-info="optionalInfo" aria-expanded="false" aria-controls="cookie-optional-info">' +
      '<span aria-hidden="true">i</span></button><span class="cookie-info-popover" id="cookie-optional-info" role="tooltip" data-consent-copy="optionalText" hidden></span></span>' +
      '<label class="cookie-switch"><input id="cookie-optional" type="checkbox" role="switch" data-consent-optional aria-labelledby="cookie-optional-label" aria-describedby="cookie-optional-note cookie-optional-info">' +
      '<span class="cookie-switch-track" aria-hidden="true"></span></label></div>' +
      '<div class="cookie-banner-actions"><button type="button" data-consent-reject data-consent-copy="reject"></button>' +
      '<button type="button" data-consent-accept data-consent-copy="accept"></button></div>' +
      '<p class="cookie-banner-error" role="status" data-consent-error data-consent-copy="error" hidden></p>';
    banner.hidden = Boolean(refreshRecord());
    document.body.insertBefore(banner, document.body.firstChild);
    initInfo();
    banner.querySelector('[data-consent-optional]').addEventListener('change', function (event) { choose(event.target.checked, false); });
    banner.querySelector('[data-consent-reject]').addEventListener('click', function () { choose(false); });
    banner.querySelector('[data-consent-accept]').addEventListener('click', function () { choose(true); });
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-cookie-settings]');
      if (trigger) openSettings(trigger);
      if (!event.target.closest('.cookie-info')) closeInfo();
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
      else { banner.hidden = false; updateLabels(); }
    });
    window.addEventListener('pageshow', function () {
      if (!refreshRecord()) banner.hidden = false;
      updateLabels();
    });
    updateLabels();
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
