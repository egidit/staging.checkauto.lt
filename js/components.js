(function () {
  'use strict';

  var primaryLinks = [
    { href: '/', i18n: 'nav.home', text: 'Pradžia' },
    { href: '/paslaugos/', i18n: 'nav.services', text: 'Paslaugos' },
    { href: '/galerija/', i18n: 'nav.gallery', text: 'Galerija' },
    { href: '/apie/', i18n: 'nav.about', text: 'Apie' }
  ];
  var bookingLink = {
    href: '/kontaktai/',
    i18n: 'nav.contact',
    text: 'Užsakyti',
    cta: true
  };
  var footerProductLinks = [primaryLinks[1], primaryLinks[2], primaryLinks[3], bookingLink, {
    href: '/duk/', i18n: 'nav.faq', text: 'D.U.K.'
  }];
  var legalLinks = [
    { href: '/privatumo-politika/', i18n: 'nav.privacy', text: 'Privatumo politika' },
    { href: '/taisykles-ir-salygos/', i18n: 'nav.terms', text: 'Taisyklės ir sąlygos' }
  ];

  var path = location.pathname.replace(/index\.html$/, '');
  if (path !== '/' && path.charAt(path.length - 1) !== '/') path += '/';

  function isActive(href) {
    return href === '/' ? path === '/' : path.indexOf(href) === 0;
  }

  function linkHTML(link, className) {
    var classes = [];
    if (className) classes.push(className);
    if (link.cta) classes.push('nav-cta');
    var classAttribute = classes.length ? ' class="' + classes.join(' ') + '"' : '';
    var current = isActive(link.href) ? ' aria-current="page"' : '';
    return '<a href="' + link.href + '"' + classAttribute + current +
      ' data-i18n="' + link.i18n + '">' + link.text + '</a>';
  }

  function languageDropdownHTML(id) {
    var menuId = id + '-menu';
    return '<div class="lang-dropdown" data-active-lang="lt">' +
      '<button id="' + id + '" class="lang-dropdown-toggle" type="button" ' +
        'aria-expanded="false" aria-haspopup="listbox" aria-controls="' + menuId + '" ' +
        'aria-label="Pasirinkti kalbą" data-i18n-aria="a11y.language_select" data-language-toggle>' +
        '<span class="flag-icon flag-lt" aria-hidden="true"></span>' +
        '<span class="flag-icon flag-us" aria-hidden="true"></span>' +
        '<svg class="lang-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<ul id="' + menuId + '" class="lang-dropdown-menu" role="listbox" aria-labelledby="' + id + '" data-language-menu>' +
        '<li role="option" aria-selected="true" tabindex="-1" data-lang="lt" class="active">' +
          '<span class="flag-icon flag-lt" aria-hidden="true"></span><span>Lietuvių</span>' +
        '</li>' +
        '<li role="option" aria-selected="false" tabindex="-1" data-lang="en">' +
          '<span class="flag-icon flag-us" aria-hidden="true"></span><span>English</span>' +
        '</li>' +
      '</ul>' +
    '</div>';
  }

  var desktopItems = primaryLinks.concat([bookingLink]).map(function (link) {
    return '<li>' + linkHTML(link) + '</li>';
  }).join('');
  var mobileItems = primaryLinks.concat([bookingLink]).map(function (link) {
    return linkHTML(link);
  }).join('');

  var headerHTML =
    '<header class="site-header" role="banner">' +
      '<a class="skip-link" href="#main-content" data-i18n="nav.skip">Pereiti prie pagrindinio turinio</a>' +
      '<div class="container header-inner">' +
        '<a href="/" class="logo" aria-label="checkauto.lt pradžia" data-i18n-aria="a11y.home">' +
          'check<span>auto</span>.lt' +
        '</a>' +
        '<nav class="nav-desktop" aria-label="Pagrindinė navigacija" data-i18n-aria="a11y.main_navigation">' +
          '<ul>' + desktopItems + '</ul>' +
          languageDropdownHTML('language-toggle-desktop') +
        '</nav>' +
        '<button class="nav-toggle" type="button" aria-label="Atidaryti meniu" ' +
          'data-i18n-aria="a11y.open_menu" aria-expanded="false" aria-controls="mobile-nav">' +
          '<span class="nav-toggle-line"></span>' +
          '<span class="nav-toggle-line"></span>' +
        '</button>' +
      '</div>' +
      '<nav class="nav-mobile" id="mobile-nav" aria-label="Mobilusis meniu" ' +
        'data-i18n-aria="a11y.mobile_navigation" aria-hidden="true" hidden inert>' +
        mobileItems +
        languageDropdownHTML('language-toggle-mobile') +
      '</nav>' +
    '</header>';

  var footerLinks = footerProductLinks.concat(legalLinks).map(function (link) {
    var current = isActive(link.href) ? ' aria-current="page"' : '';
    return '<a href="' + link.href + '"' + current + ' data-i18n="' + link.i18n + '">' + link.text + '</a>';
  }).join('');

  var footerHTML =
    '<footer class="site-footer" role="contentinfo">' +
      '<div class="container footer-inner">' +
        '<a href="/" class="footer-logo" aria-label="checkauto.lt pradžia" data-i18n-aria="a11y.home">' +
          'check<span>auto</span>.lt' +
        '</a>' +
        '<nav class="footer-links" aria-label="Poraštės navigacija" data-i18n-aria="a11y.footer_navigation">' +
          footerLinks +
        '</nav>' +
        '<p class="footer-copy" data-i18n="footer.copy">© 2026 checkauto.lt. Visos teisės saugomos.</p>' +
      '</div>' +
    '</footer>';

  var headerEl = document.getElementById('site-header');
  if (headerEl) headerEl.outerHTML = headerHTML;

  var mainEl = document.querySelector('main');
  if (mainEl && !mainEl.id) {
    mainEl.id = 'main-content';
    mainEl.setAttribute('tabindex', '-1');
  }

  var footerEl = document.getElementById('site-footer');
  if (footerEl) footerEl.outerHTML = footerHTML;
})();
