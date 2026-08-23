/* Shared interactions for the public checkauto.lt site. */
(function () {
  'use strict';

  var COPY_RESET_DELAY = 2200;

  function t(key, fallback) {
    if (window.checkautoI18n && typeof window.checkautoI18n.translate === 'function') {
      return window.checkautoI18n.translate(key, fallback);
    }
    return fallback;
  }

  function setAriaTranslation(element, key, fallback) {
    if (!element) return;
    element.setAttribute('data-i18n-aria', key);
    element.setAttribute('aria-label', t(key, fallback));
  }

  function initMobileNav() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('mobile-nav');
    if (!toggle || !nav) return;

    var desktopMedia = window.matchMedia('(min-width: 768px)');
    var backgroundState = [];

    function isOpen() {
      return document.body.classList.contains('nav-open');
    }

    function syncLabels() {
      setAriaTranslation(
        toggle,
        isOpen() ? 'a11y.close_menu' : 'a11y.open_menu',
        isOpen() ? 'Uždaryti meniu' : 'Atidaryti meniu'
      );
    }

    function setBackgroundInert(shouldBeInert) {
      if (shouldBeInert) {
        if (backgroundState.length) return;
        document.querySelectorAll('main, .site-footer, .site-header .logo, .site-header .nav-desktop').forEach(function (element) {
          backgroundState.push({ element: element, inert: Boolean(element.inert) });
          element.inert = true;
        });
        return;
      }

      backgroundState.forEach(function (state) {
        state.element.inert = state.inert;
      });
      backgroundState = [];
    }

    function getFocusableItems() {
      var selector = 'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return [toggle].concat(Array.prototype.slice.call(nav.querySelectorAll(selector))).filter(function (element) {
        return !element.hidden && !element.closest('[hidden]');
      });
    }

    function openNav() {
      if (desktopMedia.matches || isOpen()) return;
      nav.hidden = false;
      nav.inert = false;
      nav.setAttribute('aria-hidden', 'false');
      document.body.classList.add('nav-open');
      toggle.setAttribute('aria-expanded', 'true');
      setBackgroundInert(true);
      syncLabels();

      window.requestAnimationFrame(function () {
        var first = nav.querySelector('a[href], select:not([disabled]), button:not([disabled])');
        if (first) first.focus();
      });
    }

    function closeNav(restoreFocus) {
      var wasOpen = isOpen();
      document.body.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      nav.setAttribute('aria-hidden', 'true');
      nav.inert = true;
      nav.hidden = true;
      setBackgroundInert(false);
      syncLabels();
      if (restoreFocus && wasOpen) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      if (isOpen()) closeNav(true);
      else openNav();
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a[href]')) closeNav(false);
    });

    document.addEventListener('keydown', function (event) {
      if (!isOpen()) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closeNav(true);
        return;
      }

      if (event.key !== 'Tab') return;
      var items = getFocusableItems();
      if (!items.length) return;
      var currentIndex = items.indexOf(document.activeElement);
      var nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex === -1 || nextIndex >= items.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = items.length - 1;
      if (nextIndex !== currentIndex + (event.shiftKey ? -1 : 1) || currentIndex === -1) {
        event.preventDefault();
        items[nextIndex].focus();
      }
    });

    function closeAtDesktop(event) {
      if (event.matches) closeNav(false);
    }
    if (typeof desktopMedia.addEventListener === 'function') {
      desktopMedia.addEventListener('change', closeAtDesktop);
    } else if (typeof desktopMedia.addListener === 'function') {
      desktopMedia.addListener(closeAtDesktop);
    }

    window.addEventListener('checkauto:languagechange', syncLabels);
    closeNav(false);
  }

  function createClipboardStatus() {
    var status = document.getElementById('clipboard-status');
    if (status) return status;
    status = document.createElement('p');
    status.id = 'clipboard-status';
    status.className = 'visually-hidden';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    document.body.appendChild(status);
    return status;
  }

  function copyWithFallback(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try {
        if (!document.execCommand('copy')) throw new Error('Copy command was rejected');
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        field.remove();
      }
    });
  }

  function initCopyButtons() {
    var buttons = document.querySelectorAll('.copy-btn[data-copy]');
    if (!buttons.length) return;
    var status = createClipboardStatus();

    function restoreButton(button) {
      button.classList.remove('copied', 'copy-failed');
      button.dataset.copyState = 'idle';
      setAriaTranslation(button, 'a11y.copy_email', 'Kopijuoti el. pašto adresą');
    }

    buttons.forEach(function (button) {
      restoreButton(button);
      var resetTimer = 0;

      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        window.clearTimeout(resetTimer);

        copyWithFallback(button.getAttribute('data-copy') || '').then(function () {
          button.classList.remove('copy-failed');
          button.classList.add('copied');
          button.dataset.copyState = 'success';
          var message = t('a11y.email_copied', 'El. pašto adresas nukopijuotas');
          button.setAttribute('aria-label', message);
          status.textContent = message;
        }).catch(function () {
          button.classList.remove('copied');
          button.classList.add('copy-failed');
          button.dataset.copyState = 'error';
          var message = t('a11y.copy_failed', 'Nepavyko nukopijuoti. Pažymėkite el. pašto adresą rankiniu būdu.');
          button.setAttribute('aria-label', message);
          status.textContent = message;
        }).finally(function () {
          resetTimer = window.setTimeout(function () { restoreButton(button); }, COPY_RESET_DELAY);
        });
      });

      button.addEventListener('blur', function () {
        if (button.dataset.copyState !== 'idle') {
          resetTimer = window.setTimeout(function () { restoreButton(button); }, 250);
        }
      });
    });

    window.addEventListener('checkauto:languagechange', function () {
      buttons.forEach(function (button) {
        if (button.dataset.copyState === 'success') {
          button.setAttribute('aria-label', t('a11y.email_copied', 'El. pašto adresas nukopijuotas'));
        } else if (button.dataset.copyState === 'error') {
          button.setAttribute('aria-label', t('a11y.copy_failed', 'Nepavyko nukopijuoti. Pažymėkite el. pašto adresą rankiniu būdu.'));
        } else {
          restoreButton(button);
        }
      });
    });
  }

  function initLegalLinkTargets() {
    document.querySelectorAll('.legal-document a[href]').forEach(function (link) {
      var rawHref = (link.getAttribute('href') || '').trim();
      var url;
      try {
        url = new URL(rawHref, window.location.href);
      } catch (_) {
        return;
      }

      var isExternalHttp = (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.origin !== window.location.origin;
      if (isExternalHttp) {
        link.setAttribute('target', '_blank');
        var rel = (link.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
        if (rel.indexOf('noopener') === -1) rel.push('noopener');
        if (rel.indexOf('noreferrer') === -1) rel.push('noreferrer');
        link.setAttribute('rel', rel.join(' '));
        return;
      }

      if (link.getAttribute('target') === '_blank') link.removeAttribute('target');
      var internalRel = (link.getAttribute('rel') || '').split(/\s+/).filter(function (value) {
        return value && value !== 'noopener' && value !== 'noreferrer';
      });
      if (internalRel.length) link.setAttribute('rel', internalRel.join(' '));
      else link.removeAttribute('rel');
    });
  }

  function initLegalNavigation() {
    var article = document.querySelector('.legal-document');
    if (!article || !article.parentElement) return;

    var container = article.parentElement;
    var details = container.querySelector('[data-legal-toc]');
    var desktopMedia = window.matchMedia('(min-width: 980px)');

    if (!details) {
      details = document.createElement('details');
      details.className = 'legal-toc';
      details.dataset.legalToc = '';

      var summary = document.createElement('summary');
      summary.dataset.legalTocSummary = '';
      details.appendChild(summary);

      var nav = document.createElement('nav');
      nav.dataset.legalTocNav = '';
      details.appendChild(nav);

      container.insertBefore(details, article);
      container.classList.add('has-legal-navigation');

      var syncingOpenState = true;
      details.open = desktopMedia.matches;
      syncingOpenState = false;
      details.addEventListener('toggle', function () {
        if (!syncingOpenState) details.dataset.userToggled = 'true';
      });

      function syncAtBreakpoint(event) {
        if (details.dataset.userToggled === 'true') return;
        syncingOpenState = true;
        details.open = event.matches;
        syncingOpenState = false;
      }

      if (typeof desktopMedia.addEventListener === 'function') {
        desktopMedia.addEventListener('change', syncAtBreakpoint);
      } else if (typeof desktopMedia.addListener === 'function') {
        desktopMedia.addListener(syncAtBreakpoint);
      }
    }

    var summaryEl = details.querySelector('[data-legal-toc-summary]');
    var navEl = details.querySelector('[data-legal-toc-nav]');
    if (!summaryEl || !navEl) return;

    summaryEl.textContent = t('legal.contents', 'Turinys');
    navEl.setAttribute('aria-label', t('legal.contents_label', 'Dokumento skyriai'));
    var list = document.createElement('ol');

    article.querySelectorAll('h2').forEach(function (heading, index) {
      heading.id = 'legal-section-' + (index + 1);
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent;
      link.addEventListener('click', function () {
        if (!desktopMedia.matches) details.open = false;
      });
      item.appendChild(link);
      list.appendChild(item);
    });

    navEl.replaceChildren(list);
  }

  function init() {
    initMobileNav();
    initCopyButtons();
    initLegalLinkTargets();
    initLegalNavigation();
    window.addEventListener('checkauto:languagechange', function () {
      initLegalLinkTargets();
      initLegalNavigation();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
