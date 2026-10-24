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

  /* Scope: each numbered hotspot opens a popover about that part of the inspection.
     A mouse opens it on hover; a click or tap keeps it open until a press and its release
     both land outside it, so a press that starts inside or a scroll never closes it. */
  var scope = document.querySelector('[data-scope]');
  if (scope) {
    var stage = scope.querySelector('.home-scope-stage');
    var header = document.querySelector('.site-header');
    var openSpot = null;
    var pinned = false;
    var closeTimer = 0;
    var pressStartedOutside = false;
    var usingKeyboard = false;
    var lastPointer = '';
    var layoutWidth = document.documentElement.clientWidth;
    var TIP_GAP = 12;
    var TIP_EDGE = 8;
    var SPOT_SELECTOR = 'button[data-spot]';
    var INSIDE_SELECTOR = 'button[data-spot], .home-scope-tip';

    var tipFor = function (button) {
      return document.getElementById(button.getAttribute('aria-controls'));
    };

    var isInside = function (element) {
      return Boolean(element && element.closest && element.closest(INSIDE_SELECTOR));
    };

    /* The mobile booking bar and the cookie banner sit fixed over the bottom of the screen. */
    var coveredFromBelow = function () {
      var bottom = window.innerHeight;
      document.querySelectorAll('[data-sticky-cta].is-visible, .cookie-banner:not([hidden])').forEach(function (element) {
        if (getComputedStyle(element).position !== 'fixed') return;
        var top = element.getBoundingClientRect().top;
        if (top > 0) bottom = Math.min(bottom, top);
      });
      return bottom;
    };

    var overlaps = function (a, b) {
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    };

    /* Try each side of the hotspot and keep the one that fits the screen best. */
    var placeTip = function (button, tip) {
      var stageBox = stage.getBoundingClientRect();
      var spotBox = button.getBoundingClientRect();
      var width = tip.offsetWidth;
      var height = tip.offsetHeight;
      var viewWidth = document.documentElement.clientWidth;
      var topEdge = Math.max(header ? header.getBoundingClientRect().bottom : 0, 0) + TIP_EDGE;
      var bottomEdge = coveredFromBelow() - TIP_EDGE;
      var centerX = spotBox.left + spotBox.width / 2;
      var centerY = spotBox.top + spotBox.height / 2;
      var centredLeft = Math.min(Math.max(centerX - width / 2, TIP_EDGE), viewWidth - TIP_EDGE - width);
      var others = Array.prototype.slice.call(scope.querySelectorAll(SPOT_SELECTOR)).filter(function (other) {
        return other !== button;
      }).map(function (other) {
        return other.getBoundingClientRect();
      });

      var best = null;
      [
        { side: 'right', left: spotBox.right + TIP_GAP, top: centerY - height / 2 },
        { side: 'left', left: spotBox.left - TIP_GAP - width, top: centerY - height / 2 },
        { side: 'bottom', left: centredLeft, top: spotBox.bottom + TIP_GAP },
        { side: 'top', left: centredLeft, top: spotBox.top - TIP_GAP - height }
      ].forEach(function (option, order) {
        var box = { left: option.left, top: option.top, right: option.left + width, bottom: option.top + height };
        if (box.left < TIP_EDGE || box.right > viewWidth - TIP_EDGE) return;
        /* Prefer the side that shows the most of the popover, then the one covering the fewest dots. */
        var hidden = Math.max(0, topEdge - box.top) + Math.max(0, box.bottom - bottomEdge);
        var covered = others.filter(function (other) { return overlaps(box, other); }).length;
        var score = hidden * 2 + covered * 10 + order;
        if (!best || score < best.score) best = { side: option.side, left: option.left, top: option.top, score: score };
      });

      if (!best) best = { side: 'bottom', left: Math.max(centredLeft, TIP_EDGE), top: spotBox.bottom + TIP_GAP };
      tip.dataset.side = best.side;
      tip.style.left = (best.left - stageBox.left) + 'px';
      tip.style.top = (best.top - stageBox.top) + 'px';
      tip.style.setProperty('--arrow', (best.side === 'left' || best.side === 'right' ? centerY - best.top : centerX - best.left) + 'px');
    };

    var closeTip = function () {
      window.clearTimeout(closeTimer);
      if (!openSpot) return;
      var tip = tipFor(openSpot);
      tip.classList.remove('is-open');
      tip.hidden = true;
      openSpot.setAttribute('aria-expanded', 'false');
      openSpot = null;
      pinned = false;
    };

    var openTip = function (button, pin) {
      window.clearTimeout(closeTimer);
      if (openSpot === button) {
        pinned = pinned || pin;
        return;
      }
      closeTip();
      var tip = tipFor(button);
      openSpot = button;
      pinned = pin;
      tip.hidden = false;
      placeTip(button, tip);
      button.setAttribute('aria-expanded', 'true');
      scope.classList.add('is-explored');
      void tip.offsetWidth;
      tip.classList.add('is-open');
    };

    var closeSoon = function () {
      if (pinned) return;
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(closeTip, 150);
    };

    scope.addEventListener('pointerover', function (event) {
      if (event.pointerType !== 'mouse') return;
      var button = event.target.closest(SPOT_SELECTOR);
      if (button) {
        /* A popover pinned with a click stays until another dot is clicked. */
        if (!(pinned && openSpot && openSpot !== button)) openTip(button, false);
      } else if (event.target.closest('.home-scope-tip')) {
        window.clearTimeout(closeTimer);
      }
    });

    scope.addEventListener('pointerout', function (event) {
      if (event.pointerType !== 'mouse' || !openSpot) return;
      var from = event.target.closest(INSIDE_SELECTOR);
      var to = event.relatedTarget && event.relatedTarget.closest ? event.relatedTarget.closest(INSIDE_SELECTOR) : null;
      if (from && from !== to) closeSoon();
    });

    scope.addEventListener('click', function (event) {
      var button = event.target.closest(SPOT_SELECTOR);
      if (!button) return;
      /* On touch only a press and release outside closes it, so tapping the open dot again keeps it. */
      if (openSpot === button && pinned) {
        if (lastPointer !== 'touch') closeTip();
      } else {
        openTip(button, true);
      }
    });

    /* Touch keeps the pointer captured on the element first pressed, so read the release point instead. */
    document.addEventListener('pointerdown', function (event) {
      usingKeyboard = false;
      lastPointer = event.pointerType;
      pressStartedOutside = Boolean(openSpot) && !isInside(event.target);
    });
    document.addEventListener('pointerup', function (event) {
      var released = document.elementFromPoint(event.clientX, event.clientY);
      if (pressStartedOutside && openSpot && !isInside(released)) closeTip();
      pressStartedOutside = false;
    });
    document.addEventListener('pointercancel', function () {
      pressStartedOutside = false;
    });

    document.addEventListener('keydown', function (event) {
      usingKeyboard = true;
      lastPointer = '';
      if (event.key !== 'Escape' || !openSpot) return;
      var button = openSpot;
      var hadFocus = document.activeElement === button || tipFor(button).contains(document.activeElement);
      closeTip();
      if (hadFocus) button.focus();
    });

    /* Tabbing to anything else, another dot included, closes the popover.
       A press moves focus too (even onto <main>), but presses are handled above. */
    scope.addEventListener('focusout', function (event) {
      var next = event.relatedTarget;
      if (usingKeyboard && openSpot && next && next !== openSpot && !tipFor(openSpot).contains(next)) closeTip();
    });

    var repositionTip = function () {
      if (openSpot) placeTip(openSpot, tipFor(openSpot));
    };
    /* Phones resize the viewport height while scrolling (address bar); only a new width moves the popover. */
    window.addEventListener('resize', function () {
      var width = document.documentElement.clientWidth;
      if (width === layoutWidth) return;
      layoutWidth = width;
      repositionTip();
    });
    window.addEventListener('checkauto:languagechange', repositionTip);
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
