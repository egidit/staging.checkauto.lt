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

  function translate(key, fallback) {
    return window.checkautoI18n ? window.checkautoI18n.translate(key, fallback) : fallback;
  }

  function currentLanguage() {
    return window.checkautoI18n ? window.checkautoI18n.getLanguage() : 'lt';
  }

  /* Odometer drums: one rolling strip of digits per figure, used by the hero card and the tally. */
  function buildOdometer(element, text) {
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
  }

  function parkAtZero(element) {
    var strips = element.querySelectorAll('.home-odo-strip');
    strips.forEach(function (strip) {
      strip.style.transition = 'none';
      strip.style.setProperty('--digit', 0);
    });
    void element.offsetWidth;
    strips.forEach(function (strip) { strip.style.transition = ''; });
  }

  function setOdometer(element, value, startFromZero) {
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
  }

  /* Lithuanian needs three noun forms (1 patikra, 2 patikros, 16 patikrų); English needs two. */
  function pluralForm(count) {
    var form = new Intl.PluralRules(locale()).select(count);
    return form === 'one' || form === 'few' ? form : 'other';
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
  var useGalleryCases = function () {};

  if (evidence) {
    var buttonGroup = evidence.querySelector('.home-evidence-buttons');
    var switchGroup = evidence.querySelector('.home-evidence-switch');
    var caseButtons = Array.prototype.slice.call(buttonGroup.querySelectorAll('[data-case]'));
    var caseDetails = Array.prototype.slice.call(evidence.querySelectorAll('[data-evidence-case]'));
    var galleryCases = null;
    var introPending = false;
    var visitorPicked = false;
    var shownOdo = evidence.querySelector('[data-odo="shown"]');
    var actualOdo = evidence.querySelector('[data-odo="actual"]');

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

    /* Car names, verdicts and spoken labels of the gallery cases in the current language. */
    var renderCaseCopy = function () {
      if (!galleryCases) return;
      galleryCases.forEach(function (entry, index) {
        var content = entry.item[currentLanguage()] || entry.item.lt;
        caseDetails[index].querySelector('.home-evidence-car').textContent = content.title;
        caseDetails[index].querySelector('.home-evidence-verdict').textContent = content.verdict;
        caseButtons[index].setAttribute('aria-label', translate('home.evidence.case_aria', '{car}: nuslėpta {km} km')
          .replace('{car}', content.title)
          .replace('{km}', formatNumber(entry.hidden)));
      });
    };

    /* Replace the cases written in the HTML with the largest rollbacks from the gallery data. */
    useGalleryCases = function (cases) {
      if (!cases.length) return;
      /* Start on the largest rollback unless the visitor already picked a case that is still listed. */
      var selected = activeButton().dataset.case;
      var keepSelection = visitorPicked && cases.some(function (entry) { return String(entry.item.id) === selected; });

      galleryCases = cases;
      caseDetails.forEach(function (detail) { detail.remove(); });
      buttonGroup.textContent = '';

      caseDetails = cases.map(function (entry) {
        var detail = document.createElement('div');
        var car = document.createElement('p');
        var verdict = document.createElement('p');
        detail.className = 'home-evidence-case';
        detail.dataset.evidenceCase = entry.item.id;
        car.className = 'home-evidence-car';
        verdict.className = 'home-evidence-verdict' + (entry.item.recommended ? ' home-evidence-verdict--recommended' : '');
        detail.appendChild(car);
        detail.appendChild(verdict);
        evidence.insertBefore(detail, switchGroup);
        return detail;
      });

      caseButtons = cases.map(function (entry, index) {
        var button = document.createElement('button');
        button.type = 'button';
        button.dataset.case = entry.item.id;
        button.dataset.shown = entry.shown;
        button.dataset.actual = entry.actual;
        button.setAttribute('aria-pressed', String(keepSelection ? String(entry.item.id) === selected : index === 0));
        buttonGroup.appendChild(button);
        return button;
      });

      renderCaseCopy();
      renderButtonLabels();
      renderCase(activeButton(), false);
      if (introPending) {
        parkAtZero(shownOdo);
        parkAtZero(actualOdo);
      }
    };

    buttonGroup.addEventListener('click', function (event) {
      var button = event.target.closest('[data-case]');
      if (!button || button.getAttribute('aria-pressed') === 'true') return;
      visitorPicked = true;
      renderCase(button, true);
    });

    renderButtonLabels();
    renderCase(activeButton(), false);

    if ('IntersectionObserver' in window && !reduceMotion.matches) {
      introPending = true;
      evidence.classList.add('is-rolling');
      parkAtZero(shownOdo);
      parkAtZero(actualOdo);
      var introObserver = new IntersectionObserver(function (entries) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        introObserver.disconnect();
        introPending = false;
        renderCase(activeButton(), true);
      }, { threshold: 0.4 });
      introObserver.observe(evidence);
    }

    window.addEventListener('checkauto:languagechange', function () {
      renderCaseCopy();
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

  /* Gallery figures: counts and odometer rollbacks computed from the published cases.
     The numbers written in the HTML are the fallback until /data/gallery.json loads. */
  var GALLERY_DATA_URL = '/data/gallery.json';
  var GALLERY_COPY = {
    totalLabel: {
      figure: 'total',
      key: 'home.tally.total_label',
      lt: { one: 'paskelbta patikra', few: 'paskelbtos patikros', other: 'paskelbtų patikrų' }
    },
    notRecommendedLabel: {
      figure: 'notRecommended',
      key: 'home.tally.not_recommended_label',
      lt: { one: 'kartą patarėme nepirkti', few: 'kartus patarėme nepirkti', other: 'kartų patarėme nepirkti' }
    },
    rollbacksLabel: {
      figure: 'rollbacks',
      key: 'home.tally.rollback_label',
      lt: { one: 'kartą radome atsuktą ridą', few: 'kartus radome atsuktą ridą', other: 'kartų radome atsuktą ridą' }
    },
    casesLink: {
      figure: 'total',
      key: 'home.cases.more',
      lt: { one: '{count} atvejis galerijoje', few: 'Visi {count} atvejai galerijoje', other: 'Visi {count} atvejų galerijoje' }
    }
  };

  var figureElements = Array.prototype.slice.call(document.querySelectorAll('[data-gallery-figure]'));
  var copyElements = Array.prototype.slice.call(document.querySelectorAll('[data-gallery-copy]'));
  var figures = {};
  figureElements.forEach(function (element) {
    figures[element.dataset.galleryFigure] = Number(element.textContent.replace(/\D/g, ''));
  });

  /* The tally odometer rolls up from zero the first time it scrolls into view. */
  var tallyOdometers = figureElements.filter(function (element) {
    return element.classList.contains('home-odo');
  });
  var tallyIntroPending = false;
  if (tallyOdometers.length && 'IntersectionObserver' in window && !reduceMotion.matches) {
    tallyIntroPending = true;
    var tallyObserver = new IntersectionObserver(function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
      tallyObserver.disconnect();
      tallyIntroPending = false;
      tallyOdometers.forEach(function (element) {
        setOdometer(element, figures[element.dataset.galleryFigure], true);
      });
    }, { threshold: 0.6 });
    tallyOdometers.forEach(function (element) { tallyObserver.observe(element); });
  }

  /* Odometer readings are whole kilometres; tolerate "202 000" typed as text. */
  function readKilometres(value) {
    if (value === null || value === undefined || value === '') return null;
    var number = typeof value === 'number' ? value : Number(String(value).replace(/\D/g, ''));
    return number > 0 ? Math.round(number) : null;
  }

  function galleryFigures(items) {
    var rollbacks = items.filter(function (item) {
      return item.category === 'mileage' || Boolean(item.odometer);
    });
    /* Only cases with both readings show how much was hidden; a missing dashboard reading is left out. */
    var measured = rollbacks.map(function (item) {
      var odometer = item.odometer || {};
      var shown = readKilometres(odometer.shown);
      var actual = readKilometres(odometer.actual);
      return { item: item, shown: shown, actual: actual, hidden: shown && actual ? actual - shown : 0 };
    }).filter(function (entry) {
      return entry.hidden > 0;
    }).sort(function (a, b) {
      return b.hidden - a.hidden || a.item.id - b.item.id;
    });

    return {
      total: items.length,
      notRecommended: items.filter(function (item) { return item.recommended === false; }).length,
      rollbacks: rollbacks.length,
      maxHidden: measured.length ? measured[0].hidden : figures.maxHidden,
      cases: measured.slice(0, 3)
    };
  }

  function renderGalleryFigures() {
    figureElements.forEach(function (element) {
      var value = figures[element.dataset.galleryFigure];
      if (!element.classList.contains('home-odo')) {
        element.textContent = formatNumber(value);
        return;
      }
      setOdometer(element, value, false);
      if (tallyIntroPending) parkAtZero(element);
    });
    copyElements.forEach(function (element) {
      var copy = GALLERY_COPY[element.dataset.galleryCopy];
      var count = figures[copy.figure];
      var template;
      if (typeof copy.lt === 'string') {
        template = translate(copy.key, copy.lt);
      } else {
        var form = pluralForm(count);
        template = translate(copy.key + '_' + form, copy.lt[form]);
      }
      element.textContent = template.replace('{count}', formatNumber(count));
    });
  }

  if (figureElements.length || copyElements.length || evidence) {
    renderGalleryFigures();
    window.addEventListener('checkauto:languagechange', renderGalleryFigures);
    fetch(GALLERY_DATA_URL, { cache: 'no-cache', credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('Gallery request failed: ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.items) || !data.items.length) return;
        var result = galleryFigures(data.items);
        figures = {
          total: result.total,
          notRecommended: result.notRecommended,
          rollbacks: result.rollbacks,
          maxHidden: result.maxHidden
        };
        renderGalleryFigures();
        useGalleryCases(result.cases);
      })
      .catch(function () {
        /* Keep the figures written in the HTML. */
      });
  }
})();
