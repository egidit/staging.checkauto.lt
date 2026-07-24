/* ==========================================================================
   main.js - Core interactions for checkauto.lt

   Handles:
   1. Mobile navigation toggle (hamburger → full-screen overlay)
   2. Copy-to-clipboard button
   3. Sticky header scroll behavior
   4. Scroll hint auto-hide
   5. Legal document link target normalization

   No dependencies. Minimal footprint. Vanilla JS.
   ========================================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
     1. MOBILE NAVIGATION
     --------------------------------------------------------------------------
     Toggle body class .nav-open which controls the overlay visibility
     and hamburger-to-X animation via CSS.
     -------------------------------------------------------------------------- */
  function initMobileNav() {
    const toggle = document.querySelector('.nav-toggle');
    const body = document.body;
    const mobileLinks = document.querySelectorAll('.nav-mobile a');

    if (!toggle) return;

    toggle.addEventListener('click', () => {
      body.classList.toggle('nav-open');
      const isOpen = body.classList.contains('nav-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Uždaryti meniu' : 'Atidaryti meniu');
    });

    // Close nav when a link is clicked
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        body.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Atidaryti meniu');
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && body.classList.contains('nav-open')) {
        body.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* --------------------------------------------------------------------------
     2. COPY EMAIL BUTTON
     --------------------------------------------------------------------------
     Copies email to clipboard and shows a brief checkmark confirmation.
     -------------------------------------------------------------------------- */
  function initCopyButtons() {
    document.querySelectorAll('.copy-btn[data-copy]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(text).then(() => {
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 1500);
        });
      });
    });
  }

  /* --------------------------------------------------------------------------
     3. HEADER SCROLL BEHAVIOR
     --------------------------------------------------------------------------
     Subtle: adds a class when scrolled past a threshold for potential
     styling changes (e.g., shadow, reduced height).
     -------------------------------------------------------------------------- */
  function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const scrollThreshold = 10;

    window.addEventListener('scroll', () => {
      if (window.scrollY > scrollThreshold) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  /* --------------------------------------------------------------------------
     4. SCROLL HINT
     --------------------------------------------------------------------------
     Hides the "žemyn" indicator once the user scrolls a little.
     -------------------------------------------------------------------------- */
  function initScrollHint() {
    const hint = document.querySelector('.scroll-hint');
    if (!hint) return;

    const hideAfter = 60; // px
    let hidden = false;

    window.addEventListener('scroll', () => {
      if (!hidden && window.scrollY > hideAfter) {
        hint.classList.add('hidden');
        hidden = true;
      } else if (hidden && window.scrollY <= hideAfter) {
        hint.classList.remove('hidden');
        hidden = false;
      }
    }, { passive: true });
  }

  /* --------------------------------------------------------------------------
     5. LEGAL DOCUMENT LINK TARGETS
     --------------------------------------------------------------------------
     Links inside Privacy Policy and Terms content open in a separate tab.
     Site navigation, footer links, phone, email, hash, and script links keep
     their native behavior.
     -------------------------------------------------------------------------- */
  function initLegalLinkTargets() {
    document.querySelectorAll('.legal-document a[href]').forEach((link) => {
      const href = (link.getAttribute('href') || '').trim();
      const lowerHref = href.toLowerCase();

      if (
        !href ||
        href.charAt(0) === '#' ||
        lowerHref.indexOf('mailto:') === 0 ||
        lowerHref.indexOf('tel:') === 0 ||
        lowerHref.indexOf('javascript:') === 0
      ) {
        return;
      }

      link.setAttribute('target', '_blank');

      const rel = (link.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
      if (rel.indexOf('noopener') === -1) rel.push('noopener');
      if (rel.indexOf('noreferrer') === -1) rel.push('noreferrer');
      link.setAttribute('rel', rel.join(' '));
    });
  }

  /* --------------------------------------------------------------------------
     INIT
     -------------------------------------------------------------------------- */
  function init() {
    initMobileNav();
    initCopyButtons();
    initHeaderScroll();
    initScrollHint();
    initLegalLinkTargets();
    window.addEventListener('checkauto:languagechange', initLegalLinkTargets);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
