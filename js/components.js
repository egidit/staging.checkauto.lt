(function () {
  'use strict';

  var navLinks = [
    { href: '/', i18n: 'nav.home', text: 'Pradžia' },
    { href: '/paslaugos/', i18n: 'nav.services', text: 'Paslaugos' },
    { href: '/galerija/', i18n: 'nav.gallery', text: 'Galerija' },
    { href: '/kainos/', i18n: 'nav.prices', text: 'Kainos' },
    { href: '/apie/', i18n: 'nav.about', text: 'Apie' },
    { href: '/kontaktai/', i18n: 'nav.contact', text: 'Užsisakyti' }
  ];

  var footerLinks = [
    { href: '/paslaugos/', i18n: 'nav.services', text: 'Paslaugos' },
    { href: '/galerija/', i18n: 'nav.gallery', text: 'Galerija' },
    { href: '/kainos/', i18n: 'nav.prices', text: 'Kainos' },
    { href: '/apie/', i18n: 'nav.about', text: 'Apie' },
    { href: '/kontaktai/', i18n: 'nav.contact', text: 'Užsisakyti' },
    { href: '/duk/', i18n: 'nav.faq', text: 'D.U.K.' },
    { href: '/privatumo-politika/', i18n: 'nav.privacy', text: 'Privatumo politika' },
    { href: '/taisykles-ir-salygos/', i18n: 'nav.terms', text: 'Taisyklės ir sąlygos' }
  ];

  // Normalize pathname: strip trailing index.html, ensure trailing slash
  var path = location.pathname.replace(/index\.html$/, '');
  if (path !== '/' && path.charAt(path.length - 1) !== '/') {
    path += '/';
  }

  function isActive(href) {
    if (href === '/') return path === '/';
    return path.indexOf(href) === 0;
  }

  var langDropdownHTML =
    '<div class="lang-dropdown" data-active-lang="lt" aria-label="Kalbos pasirinkimas">' +
      '<button class="lang-dropdown-toggle" aria-expanded="false" aria-haspopup="listbox" aria-label="Pasirinkti kalbą">' +
        '<span class="flag-icon flag-lt"></span>' +
        '<span class="flag-icon flag-us"></span>' +
        '<svg class="lang-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<ul class="lang-dropdown-menu" role="listbox">' +
        '<li role="option" data-lang="lt" class="active">' +
          '<span class="flag-icon flag-lt"></span>' +
          '<span>Lietuvių</span>' +
        '</li>' +
        '<li role="option" data-lang="en">' +
          '<span class="flag-icon flag-us"></span>' +
          '<span>English</span>' +
        '</li>' +
      '</ul>' +
    '</div>';

  // Build desktop nav links
  var desktopNavItems = '';
  for (var i = 0; i < navLinks.length; i++) {
    var link = navLinks[i];
    var ariaCurrent = isActive(link.href) ? ' aria-current="page"' : '';
    desktopNavItems += '<li><a href="' + link.href + '"' + ariaCurrent + ' data-i18n="' + link.i18n + '">' + link.text + '</a></li>';
  }

  // Build mobile nav links
  var mobileNavItems = '';
  for (var j = 0; j < navLinks.length; j++) {
    var mLink = navLinks[j];
    var mAriaCurrent = isActive(mLink.href) ? ' aria-current="page"' : '';
    mobileNavItems += '<a href="' + mLink.href + '"' + mAriaCurrent + ' data-i18n="' + mLink.i18n + '">' + mLink.text + '</a>';
  }

  var headerHTML =
    '<header class="site-header" role="banner">' +
      '<div class="container header-inner">' +
        '<a href="/" class="logo" aria-label="checkauto.lt pradžia">' +
          'check<span>auto</span>.lt' +
        '</a>' +
        '<nav class="nav-desktop" aria-label="Pagrindinė navigacija">' +
          '<ul>' + desktopNavItems + '</ul>' +
          langDropdownHTML +
        '</nav>' +
        '<button class="nav-toggle" aria-label="Atidaryti meniu" aria-expanded="false" aria-controls="mobile-nav">' +
          '<span class="nav-toggle-line"></span>' +
          '<span class="nav-toggle-line"></span>' +
        '</button>' +
      '</div>' +
      '<nav class="nav-mobile" id="mobile-nav" aria-label="Mobilusis meniu">' +
        mobileNavItems +
        langDropdownHTML +
      '</nav>' +
    '</header>';

  // Build footer links
  var footerLinksHTML = '';
  for (var k = 0; k < footerLinks.length; k++) {
    var fLink = footerLinks[k];
    footerLinksHTML += '<a href="' + fLink.href + '" data-i18n="' + fLink.i18n + '">' + fLink.text + '</a>';
  }

  var footerHTML =
    '<footer class="site-footer" role="contentinfo">' +
      '<div class="container footer-inner">' +
        '<div class="footer-logo">check<span>auto</span>.lt</div>' +
        '<nav class="footer-links" aria-label="Poraštės navigacija">' +
          footerLinksHTML +
        '</nav>' +
        '<p class="footer-copy" data-i18n="footer.copy">© 2026 checkauto.lt. Visos teisės saugomos.</p>' +
      '</div>' +
    '</footer>';

  // Inject header
  var headerEl = document.getElementById('site-header');
  if (headerEl) {
    headerEl.outerHTML = headerHTML;
  }

  // Inject footer
  var footerEl = document.getElementById('site-footer');
  if (footerEl) {
    footerEl.outerHTML = footerHTML;
  }
})();
