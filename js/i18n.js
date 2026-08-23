/* ==========================================================================
   i18n.js - Internationalization system for checkauto.lt
   
   Lithuanian (lt) is the default language, hardcoded in HTML.
   English translations are loaded from /lang/en/common.json + per-page JSON.
   Language switcher persists the choice to localStorage.
   
   No dependencies. No build step. Pure vanilla JS.
   ========================================================================== */

(function () {
  'use strict';

  const DEFAULT_LANG = 'lt';
  const SUPPORTED_LANGS = ['lt', 'en'];
  const TRANSLATION_TIMEOUT_MS = 5000;

  /** Cache for loaded translation chunks */
  const translationCache = {};

  /** Cache for merged per-page translations */
  const translations = {};

  let currentLanguage = DEFAULT_LANG;
  let currentTranslationData = null;
  let languageRequest = 0;

  /** Snapshot of original Lithuanian DOM text, captured once on init */
  const originalTexts = {};
  const originalPlaceholders = {};
  const originalAriaLabels = {};
  const originalInnerHTML = {};
  const originalHtmlBlocks = {};

  /**
   * Map URL pathname to the page-specific JSON filename (without extension).
   */
  const PAGE_MAP = {
    '/':            'home',
    '/index.html':  'home',
    '/paslaugos/':  'services',
    '/duk/':        'faq',
    '/apie/':       'about',
    '/kontaktai/':  'contact',
    '/galerija/':   'gallery',
    '/kainos/':     'pricing',
    '/privatumo-politika/': 'privacy',
    '/taisykles-ir-salygos/': 'terms'
  };

  /**
   * Detect the current page key from the URL.
   */
  function detectPage() {
    const path = window.location.pathname.replace(/index\.html$/, '');
    return PAGE_MAP[path] || 'home';
  }

  /**
   * Deep-merge source into target (mutates target).
   */
  function deepMerge(target, source) {
    for (const key in source) {
      if (
        source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
      ) {
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  /**
   * Resolve a dot-notation key against a nested object.
   */
  function resolve(obj, path) {
    return path.split('.').reduce((acc, part) => {
      return acc && acc[part] !== undefined ? acc[part] : null;
    }, obj);
  }

  function getStoredLanguage() {
    try {
      const value = localStorage.getItem('checkauto-lang');
      return SUPPORTED_LANGS.indexOf(value) !== -1 ? value : DEFAULT_LANG;
    } catch (_) {
      return DEFAULT_LANG;
    }
  }

  function storeLanguage(lang) {
    try {
      localStorage.setItem('checkauto-lang', lang);
    } catch (_) {
      // Language switching still works when storage is unavailable.
    }
  }

  function normalizeTranslation(value) {
    return Array.isArray(value) ? value.join('') : value;
  }

  function accessibleTranslationAttribute(element) {
    return element.tagName === 'IMG' ? 'alt' : 'aria-label';
  }

  /**
   * Capture the original Lithuanian text from the DOM so we can restore it
   * when switching back from English without needing lt JSON files.
   */
  function captureOriginalTexts() {
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      originalHtmlBlocks[key] = el.innerHTML;
    });

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.children.length === 0) {
        originalTexts[key] = el.textContent;
      } else {
        originalInnerHTML[key] = el.innerHTML;
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      originalPlaceholders[key] = el.getAttribute('placeholder') || '';
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      const attribute = accessibleTranslationAttribute(el);
      originalAriaLabels[key] = el.getAttribute(attribute) || '';
    });
  }

  /**
   * Restore the original Lithuanian text from the captured snapshot.
   */
  function restoreOriginalTexts() {
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (originalHtmlBlocks[key] !== undefined) {
        el.innerHTML = originalHtmlBlocks[key];
      }
    });

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.children.length === 0 && originalTexts[key] !== undefined) {
        el.textContent = originalTexts[key];
      } else if (originalInnerHTML[key] !== undefined) {
        el.innerHTML = originalInnerHTML[key];
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (originalPlaceholders[key] !== undefined) {
        el.setAttribute('placeholder', originalPlaceholders[key]);
      }
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (originalAriaLabels[key] !== undefined) {
        el.setAttribute(accessibleTranslationAttribute(el), originalAriaLabels[key]);
      }
    });
  }

  /**
   * Apply translations to all elements with [data-i18n] on the page.
   * Skips elements that have child elements (to preserve inner HTML like <span>).
   */
  function applyTranslations(data) {
    if (!data) return;

    // HTML blocks, used for long-form legal documents with inline links.
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      const value = resolve(data, key);
      if (value !== null) {
        el.innerHTML = normalizeTranslation(value);
      }
    });

    // Standard text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const rawValue = resolve(data, key);
      const value = normalizeTranslation(rawValue);
      if (value !== null) {
        // Only set textContent if element has no child elements to preserve
        if (el.children.length === 0) {
          el.textContent = value;
        } else {
          // Preserve child elements - only update text nodes
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
          const textNodes = [];
          let node;
          while (node = walker.nextNode()) {
            if (node.parentElement === el) textNodes.push(node);
          }
          // For elements with mixed content, just update first/last text nodes
          // This handles cases like "Su check<span>auto</span>.lt"
          if (textNodes.length > 0) {
            const parts = value.split('checkauto');
            if (parts.length === 2 && el.querySelector('.logo-accent')) {
              textNodes[0].textContent = parts[0] + 'check';
              if (textNodes.length > 1) textNodes[textNodes.length - 1].textContent = '.lt';
            }
          }
        }
      }
    });

    // Placeholders for inputs/textareas
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const value = resolve(data, key);
      if (value !== null) el.setAttribute('placeholder', value);
    });

    // Accessible labels (image alternatives use alt; controls and regions use aria-label).
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      const value = resolve(data, key);
      if (value !== null) el.setAttribute(accessibleTranslationAttribute(el), value);
    });
  }

  /**
   * Update the visual state of language dropdown.
   */
  function updateSwitcherUI(lang) {
    document.querySelectorAll('.lang-dropdown').forEach(dropdown => {
      dropdown.setAttribute('data-active-lang', lang);
      dropdown.querySelectorAll('[data-lang]').forEach(option => {
        var isActive = option.getAttribute('data-lang') === lang;
        option.classList.toggle('active', isActive);
        option.setAttribute('aria-selected', String(isActive));
        if (dropdown.classList.contains('open')) {
          option.setAttribute('tabindex', isActive ? '0' : '-1');
        }
      });
    });
    document.querySelectorAll('[data-language-select]').forEach(select => {
      select.value = lang;
    });
  }

  /**
   * Fetch a single JSON chunk and cache it.
   */
  function fetchChunk(lang, name) {
    const cacheKey = lang + '/' + name;
    if (translationCache[cacheKey]) {
      return Promise.resolve(translationCache[cacheKey]);
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller
      ? window.setTimeout(function () { controller.abort(); }, TRANSLATION_TIMEOUT_MS)
      : 0;
    return fetch('/lang/' + lang + '/' + name + '.json', controller ? { signal: controller.signal } : undefined)
      .then(function (res) {
        if (!res.ok) throw new Error('Translation request failed: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        translationCache[cacheKey] = data;
        return data;
      }).finally(function () {
        if (timeout) window.clearTimeout(timeout);
      });
  }

  /**
   * Load English translations: common.json + the current page's JSON,
   * merged into a single object.
   */
  function loadTranslations(lang) {
    const page = detectPage();
    const mergeKey = lang + ':' + page;
    if (translations[mergeKey]) {
      return Promise.resolve(translations[mergeKey]);
    }
    return Promise.all([
      fetchChunk(lang, 'common'),
      fetchChunk(lang, page)
    ]).then(function (results) {
      var merged = {};
      deepMerge(merged, results[0]);
      deepMerge(merged, results[1]);
      translations[mergeKey] = merged;
      return merged;
    });
  }

  /**
   * Set the active language, persist to localStorage, and re-render all text.
   * Lithuanian is restored from the original DOM snapshot (no JSON needed).
   * Other languages are fetched from /lang/{lang}/ JSON files.
   */
  function announceLanguageChange(lang, fallback) {
    window.dispatchEvent(new CustomEvent('checkauto:languagechange', {
      detail: { lang: lang, fallback: Boolean(fallback) }
    }));
  }

  function showLithuanianFallback(requestId, error) {
    if (requestId !== languageRequest) return;
    restoreOriginalTexts();
    currentLanguage = DEFAULT_LANG;
    currentTranslationData = null;
    updateSwitcherUI(DEFAULT_LANG);
    document.documentElement.setAttribute('lang', DEFAULT_LANG);
    document.documentElement.classList.remove('i18n-loading');
    announceLanguageChange(DEFAULT_LANG, true);
    if (window.console && typeof window.console.warn === 'function') {
      console.warn('English translations could not be loaded; Lithuanian content remains visible.', error);
    }
  }

  function setLanguage(lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) return Promise.resolve(false);
    const requestId = ++languageRequest;

    if (lang === DEFAULT_LANG) {
      restoreOriginalTexts();
      currentLanguage = lang;
      currentTranslationData = null;
      updateSwitcherUI(lang);
      storeLanguage(lang);
      document.documentElement.setAttribute('lang', lang);
      document.documentElement.classList.remove('i18n-loading');
      announceLanguageChange(lang, false);
      return Promise.resolve(true);
    }

    return loadTranslations(lang).then(function (data) {
      if (requestId !== languageRequest) return false;
      applyTranslations(data);
      currentLanguage = lang;
      currentTranslationData = data;
      updateSwitcherUI(lang);
      storeLanguage(lang);
      document.documentElement.setAttribute('lang', lang);
      document.documentElement.classList.remove('i18n-loading');
      announceLanguageChange(lang, false);
      return true;
    }).catch(function (error) {
      showLithuanianFallback(requestId, error);
      return false;
    });
  }

  function translate(key, fallback) {
    if (currentLanguage !== DEFAULT_LANG && currentTranslationData) {
      const value = normalizeTranslation(resolve(currentTranslationData, key));
      if (typeof value === 'string') return value;
    }
    return fallback === undefined ? '' : fallback;
  }

  /**
   * Initialize the i18n system.
   */
  function init() {
    // Capture Lithuanian text from the DOM before any translations are applied
    captureOriginalTexts();

    const savedLang = getStoredLanguage();
    document.documentElement.setAttribute('lang', savedLang);
    setLanguage(savedLang);

    document.querySelectorAll('[data-language-select]').forEach(select => {
      select.addEventListener('change', function () {
        setLanguage(select.value);
      });
    });

    function closeDropdown(dropdown, restoreFocus) {
      if (!dropdown) return;
      var toggle = dropdown.querySelector('[data-language-toggle]');
      dropdown.classList.remove('open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      dropdown.querySelectorAll('[data-lang]').forEach(function (option) {
        option.setAttribute('tabindex', '-1');
      });
      if (restoreFocus && toggle) toggle.focus();
    }

    function closeOtherDropdowns(current) {
      document.querySelectorAll('.lang-dropdown.open').forEach(function (dropdown) {
        if (dropdown !== current) closeDropdown(dropdown, false);
      });
    }

    document.querySelectorAll('.lang-dropdown').forEach(function (dropdown) {
      var toggle = dropdown.querySelector('[data-language-toggle]');
      var options = Array.prototype.slice.call(dropdown.querySelectorAll('[data-lang]'));
      if (!toggle || !options.length) return;

      function selectedIndex() {
        var activeLang = dropdown.getAttribute('data-active-lang') || DEFAULT_LANG;
        var index = options.findIndex(function (option) {
          return option.getAttribute('data-lang') === activeLang;
        });
        return index < 0 ? 0 : index;
      }

      function focusOption(index) {
        var safeIndex = (index + options.length) % options.length;
        options.forEach(function (option, optionIndex) {
          option.setAttribute('tabindex', optionIndex === safeIndex ? '0' : '-1');
        });
        options[safeIndex].focus();
      }

      function openDropdown(preferredIndex) {
        closeOtherDropdowns(dropdown);
        dropdown.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
        focusOption(typeof preferredIndex === 'number' ? preferredIndex : selectedIndex());
      }

      function chooseOption(option) {
        var lang = option && option.getAttribute('data-lang');
        if (lang) setLanguage(lang);
        closeDropdown(dropdown, true);
      }

      toggle.addEventListener('click', function (event) {
        event.stopPropagation();
        if (dropdown.classList.contains('open')) closeDropdown(dropdown, true);
        else openDropdown(selectedIndex());
      });

      toggle.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          openDropdown(event.key === 'ArrowUp' ? options.length - 1 : selectedIndex());
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeDropdown(dropdown, true);
        }
      });

      options.forEach(function (option, index) {
        option.addEventListener('click', function (event) {
          event.stopPropagation();
          chooseOption(option);
        });

        option.addEventListener('keydown', function (event) {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusOption(index + 1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusOption(index - 1);
          } else if (event.key === 'Home') {
            event.preventDefault();
            focusOption(0);
          } else if (event.key === 'End') {
            event.preventDefault();
            focusOption(options.length - 1);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            chooseOption(option);
          } else if (event.key === 'Escape' || event.key === 'Tab') {
            closeDropdown(dropdown, event.key === 'Escape');
          }
        });
      });
    });

    document.addEventListener('click', function () {
      document.querySelectorAll('.lang-dropdown.open').forEach(function (dropdown) {
        closeDropdown(dropdown, false);
      });
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.checkautoI18n = {
    setLanguage: setLanguage,
    translate: translate,
    getLanguage: function () { return currentLanguage; }
  };
})();
