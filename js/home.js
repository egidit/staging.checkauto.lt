(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function locale() {
    return document.documentElement.getAttribute('lang') === 'en' ? 'en-GB' : 'lt-LT';
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(locale()).format(value);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
  }

  function formatPercent(value) {
    return new Intl.NumberFormat(locale(), { style: 'percent', minimumSignificantDigits: 3, maximumSignificantDigits: 3 }).format(value);
  }

  document.querySelectorAll('[data-case-image] img').forEach(function (image) {
    function hideUnavailableImage() {
      image.hidden = true;
      image.dataset.unavailable = 'true';
      image.parentElement.querySelector('.home-case-unavailable').hidden = false;
      var zoom = image.parentElement.querySelector('[data-case-zoom]');
      if (zoom) zoom.remove();
    }

    image.addEventListener('error', hideUnavailableImage);
    if (image.complete && image.naturalWidth === 0) hideUnavailableImage();
  });

  /* Case photos open in the same lightbox as the gallery. */
  document.querySelectorAll('[data-case-image]').forEach(function (media) {
    var image = media.querySelector('img');
    var zoom = media.querySelector('[data-case-zoom]');
    var title = media.parentElement.querySelector('.home-case-car');
    if (!window.checkautoLightbox) {
      zoom.remove();
      return;
    }
    zoom.addEventListener('click', function () {
      window.checkautoLightbox.open(zoom, image, title.textContent.trim());
    });
  });

  /* Evidence card: odometer drums for the real rollback cases in the gallery. */
  var evidence = document.querySelector('[data-evidence]');
  var art = document.querySelector('[data-hero-art]');
  var positionLeader = function () {};

  if (evidence) {
    var caseButtons = Array.prototype.slice.call(evidence.querySelectorAll('[data-case]'));
    var caseDetails = Array.prototype.slice.call(evidence.querySelectorAll('[data-evidence-case]'));
    var shownOdo = evidence.querySelector('[data-odo="shown"]');
    var actualOdo = evidence.querySelector('[data-odo="actual"]');
    var deltaText = evidence.querySelector('[data-odo="delta"]');

    var buildOdometer = function (element, text) {
      var digits = document.createElement('span');
      digits.className = 'home-odo-digits';
      digits.setAttribute('aria-hidden', 'true');

      text.split('').forEach(function (character) {
        if (/\d/.test(character)) {
          var cell = document.createElement('span');
          var strip = document.createElement('span');
          cell.className = 'home-odo-cell';
          strip.className = 'home-odo-strip';
          for (var digit = 0; digit < 10; digit++) {
            var face = document.createElement('span');
            face.textContent = digit;
            strip.appendChild(face);
          }
          cell.appendChild(strip);
          digits.appendChild(cell);
        } else {
          var separator = document.createElement('span');
          separator.className = 'home-odo-sep';
          separator.textContent = character === ',' ? ',' : '';
          digits.appendChild(separator);
        }
      });

      var unit = document.createElement('span');
      unit.className = 'home-odo-unit';
      unit.setAttribute('aria-hidden', 'true');
      unit.textContent = 'km';

      var spoken = document.createElement('span');
      spoken.className = 'visually-hidden';

      element.textContent = '';
      element.appendChild(digits);
      element.appendChild(unit);
      element.appendChild(spoken);
      element.dataset.layout = text.replace(/\d/g, '0');
    };

    var parkAtZero = function (element) {
      var strips = element.querySelectorAll('.home-odo-strip');
      strips.forEach(function (strip) {
        strip.style.transition = 'none';
        strip.style.setProperty('--digit', 0);
      });
      void element.offsetWidth;
      strips.forEach(function (strip) { strip.style.transition = ''; });
    };

    var setOdometer = function (element, value, startFromZero) {
      var text = formatNumber(value);
      if (element.dataset.layout !== text.replace(/\d/g, '0')) buildOdometer(element, text);

      var strips = element.querySelectorAll('.home-odo-strip');
      var digits = text.replace(/\D/g, '');
      if (startFromZero) parkAtZero(element);
      strips.forEach(function (strip, index) {
        strip.style.setProperty('--digit', digits.charAt(index));
        strip.style.setProperty('--delay', (index * 0.06) + 's');
      });
      element.querySelector('.visually-hidden').textContent = text + ' km';
    };

    var activeButton = function () {
      return caseButtons.filter(function (button) {
        return button.getAttribute('aria-pressed') === 'true';
      })[0] || caseButtons[0];
    };

    var renderCase = function (button, animate) {
      var shown = Number(button.dataset.shown);
      var actual = Number(button.dataset.actual);

      caseButtons.forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      caseDetails.forEach(function (detail) {
        detail.hidden = detail.dataset.evidenceCase !== button.dataset.case;
      });

      var rolling = animate && !reduceMotion.matches;
      if (rolling) {
        evidence.classList.add('is-rolling');
        void evidence.offsetWidth;
      }
      setOdometer(shownOdo, shown, rolling);
      setOdometer(actualOdo, actual, rolling);
      deltaText.textContent = '+' + formatNumber(actual - shown) + ' km';
      if (rolling) {
        window.requestAnimationFrame(function () {
          evidence.classList.remove('is-rolling');
        });
      }
      positionLeader();
    };

    var renderButtonLabels = function () {
      caseButtons.forEach(function (button) {
        button.textContent = '+' + formatNumber(Number(button.dataset.actual) - Number(button.dataset.shown));
      });
    };

    caseButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.getAttribute('aria-pressed') !== 'true') renderCase(button, true);
      });
    });

    renderButtonLabels();
    renderCase(activeButton(), false);

    if ('IntersectionObserver' in window && !reduceMotion.matches) {
      evidence.classList.add('is-rolling');
      parkAtZero(shownOdo);
      parkAtZero(actualOdo);
      var introObserver = new IntersectionObserver(function (entries) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        introObserver.disconnect();
        renderCase(activeButton(), true);
      }, { threshold: 0.4 });
      introObserver.observe(evidence);
    }

    window.addEventListener('checkauto:languagechange', function () {
      renderButtonLabels();
      renderCase(activeButton(), false);
    });
  }

  /* Leader line from the illustration's anchor point to the evidence card. */
  if (art && evidence) {
    var leader = art.querySelector('[data-leader]');
    var illustration = art.querySelector('.home-hero-illustration');
    var leaderPath = leader.querySelector('path');
    var leaderDot = leader.querySelector('circle');
    var leaderFrame = 0;

    var drawLeader = function () {
      leaderFrame = 0;
      if (window.innerWidth < 1000) {
        leader.classList.remove('is-ready');
        return;
      }

      var artBox = art.getBoundingClientRect();
      var imageBox = illustration.getBoundingClientRect();
      var cardBox = evidence.getBoundingClientRect();
      if (!imageBox.height) return;

      var x = imageBox.left - artBox.left + imageBox.width * Number(illustration.dataset.anchorX) / 100;
      var y = imageBox.top - artBox.top + imageBox.height * Number(illustration.dataset.anchorY) / 100;
      var cardLeft = cardBox.left - artBox.left;
      var cardRight = cardBox.right - artBox.left;
      var cardTop = cardBox.top - artBox.top;
      var dropX = Math.min(Math.max(x, cardLeft + 14), cardRight - 14);

      leaderPath.setAttribute('d', 'M' + x + ' ' + y + 'H' + dropX + 'V' + cardTop);
      leaderDot.setAttribute('cx', x);
      leaderDot.setAttribute('cy', y);
      leader.classList.add('is-ready');
    };

    positionLeader = function () {
      if (!leaderFrame) leaderFrame = window.requestAnimationFrame(drawLeader);
    };

    illustration.querySelector('img').addEventListener('load', positionLeader);
    window.addEventListener('resize', positionLeader);
    if ('ResizeObserver' in window) new ResizeObserver(positionLeader).observe(art);
    positionLeader();
  }

  /* Price anchor: the inspection as a share of the car's price. */
  var price = document.querySelector('[data-price]');
  if (price) {
    var INSPECTION_PRICE = 100;
    var priceInput = price.querySelector('[data-price-input]');

    var renderPrice = function () {
      var value = Number(priceInput.value);
      var min = Number(priceInput.min);
      var max = Number(priceInput.max);
      price.querySelector('[data-price-value]').textContent = formatMoney(value);
      price.querySelector('[data-price-share]').textContent = formatPercent(INSPECTION_PRICE / value);
      price.querySelector('[data-price-min]').textContent = formatMoney(min);
      price.querySelector('[data-price-max]').textContent = formatMoney(max);
      priceInput.setAttribute('aria-valuetext', formatMoney(value));
      priceInput.style.setProperty('--fill', ((value - min) / (max - min) * 100) + '%');
    };

    priceInput.addEventListener('input', renderPrice);
    window.addEventListener('checkauto:languagechange', renderPrice);
    renderPrice();
  }

  /* Scope: checklist lines and illustration hotspots highlight each other. */
  var scope = document.querySelector('[data-scope]');
  if (scope) {
    var spotTargets = Array.prototype.slice.call(scope.querySelectorAll('[data-spot]'));

    var activateSpot = function (id) {
      spotTargets.forEach(function (target) {
        target.classList.toggle('is-active', target.dataset.spot === id);
      });
    };

    scope.addEventListener('pointerover', function (event) {
      var target = event.target.closest('[data-spot]');
      activateSpot(target ? target.dataset.spot : null);
    });
    scope.addEventListener('pointerleave', function () {
      activateSpot(null);
    });
  }

  /* Mobile booking bar: visible between the hero actions and the final call to action. */
  var sticky = document.querySelector('[data-sticky-cta]');
  var heroActions = document.querySelector('[data-hero-actions]');
  var finalCta = document.querySelector('[data-final-cta]');
  if (sticky && heroActions && finalCta) {
    var stickyFrame = 0;
    var watchedBanner = null;
    var bannerObserver = new MutationObserver(function () { requestSticky(); });

    var cookieBannerOpen = function () {
      var banner = document.querySelector('.cookie-banner');
      return Boolean(banner && !banner.hidden);
    };

    var updateSticky = function () {
      stickyFrame = 0;
      var pastHero = heroActions.getBoundingClientRect().bottom < 0;
      var beforeFinal = finalCta.getBoundingClientRect().top > window.innerHeight;
      var blocked = cookieBannerOpen() || document.body.classList.contains('nav-open');
      sticky.classList.toggle('is-visible', pastHero && beforeFinal && !blocked);
    };

    var requestSticky = function () {
      if (!stickyFrame) stickyFrame = window.requestAnimationFrame(updateSticky);
    };

    var watchBanner = function () {
      var banner = document.querySelector('.cookie-banner');
      if (banner && banner !== watchedBanner) {
        watchedBanner = banner;
        bannerObserver.observe(banner, { attributes: true, attributeFilter: ['hidden'] });
      }
    };

    new MutationObserver(function () {
      watchBanner();
      requestSticky();
    }).observe(document.body, { childList: true, attributes: true, attributeFilter: ['class'] });

    window.addEventListener('scroll', requestSticky, { passive: true });
    window.addEventListener('resize', requestSticky);
    watchBanner();
    requestSticky();
  }
})();
