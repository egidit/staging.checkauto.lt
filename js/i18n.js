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

  /** Cache for loaded translation chunks */
  const translationCache = {};

  /** Cache for merged per-page translations */
  const translations = {};

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

  function normalizeTranslation(value) {
    return Array.isArray(value) ? value.join('') : value;
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
      originalAriaLabels[key] = el.getAttribute('aria-label') || '';
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
        el.setAttribute('aria-label', originalAriaLabels[key]);
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

    // Aria labels
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      const value = resolve(data, key);
      if (value !== null) el.setAttribute('aria-label', value);
    });
  }

  /**
   * Update the visual state of language dropdown.
   */
  function updateSwitcherUI(lang) {
    document.querySelectorAll('.lang-dropdown').forEach(dropdown => {
      dropdown.setAttribute('data-active-lang', lang);
      dropdown.querySelectorAll('.lang-dropdown-menu li').forEach(li => {
        li.classList.toggle('active', li.getAttribute('data-lang') === lang);
      });
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
    return fetch('/lang/' + lang + '/' + name + '.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        translationCache[cacheKey] = data;
        return data;
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
  function setLanguage(lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) return;

    if (lang === DEFAULT_LANG) {
      restoreOriginalTexts();
      updateSwitcherUI(lang);
      localStorage.setItem('checkauto-lang', lang);
      document.documentElement.setAttribute('lang', lang);
      document.documentElement.classList.remove('i18n-loading');
      window.dispatchEvent(new CustomEvent('checkauto:languagechange', { detail: { lang: lang } }));
      return;
    }

    loadTranslations(lang).then(function (data) {
      applyTranslations(data);
      updateSwitcherUI(lang);
      localStorage.setItem('checkauto-lang', lang);
      document.documentElement.setAttribute('lang', lang);
      document.documentElement.classList.remove('i18n-loading');
      window.dispatchEvent(new CustomEvent('checkauto:languagechange', { detail: { lang: lang } }));
    });
  }

  /**
   * Initialize the i18n system.
   */
  function init() {
    // Capture Lithuanian text from the DOM before any translations are applied
    captureOriginalTexts();

    const savedLang = localStorage.getItem('checkauto-lang') || DEFAULT_LANG;
    document.documentElement.setAttribute('lang', savedLang);
    setLanguage(savedLang);

    // Bind language dropdown
    document.querySelectorAll('.lang-dropdown').forEach(dropdown => {
      const toggle = dropdown.querySelector('.lang-dropdown-toggle');
      const menu = dropdown.querySelector('.lang-dropdown-menu');

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close other dropdowns
        document.querySelectorAll('.lang-dropdown.open').forEach(d => {
          if (d !== dropdown) {
            d.classList.remove('open');
            d.querySelector('.lang-dropdown-toggle').setAttribute('aria-expanded', 'false');
          }
        });
        dropdown.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(dropdown.classList.contains('open')));
      });

      menu.querySelectorAll('li[data-lang]').forEach(li => {
        li.addEventListener('click', () => {
          const lang = li.getAttribute('data-lang');
          if (lang) setLanguage(lang);
          dropdown.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.lang-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.querySelector('.lang-dropdown-toggle').setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.checkautoI18n = { setLanguage };
})();
