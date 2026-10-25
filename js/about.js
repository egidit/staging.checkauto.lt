(function () {
  'use strict';

  /* Verdict counts computed from the published gallery cases.
     The numbers written in the HTML are the fallback until /data/gallery.json loads. */
  var GALLERY_DATA_URL = '/data/gallery.json';
  var COPY = {
    total: {
      key: 'about.proof.total_label',
      lt: { one: 'paskelbta patikra', few: 'paskelbtos patikros', other: 'paskelbtų patikrų' }
    },
    notRecommended: {
      key: 'about.proof.not_recommended_label',
      lt: { one: 'kartą patarėme nepirkti', few: 'kartus patarėme nepirkti', other: 'kartų patarėme nepirkti' }
    },
    recommended: {
      key: 'about.proof.recommended_label',
      lt: { one: 'kartą patarėme pirkti', few: 'kartus patarėme pirkti', other: 'kartų patarėme pirkti' }
    }
  };

  var figureElements = Array.prototype.slice.call(document.querySelectorAll('[data-about-figure]'));
  var copyElements = Array.prototype.slice.call(document.querySelectorAll('[data-about-copy]'));
  if (!figureElements.length) return;

  var figures = {};
  figureElements.forEach(function (element) {
    figures[element.dataset.aboutFigure] = Number(element.textContent.replace(/\D/g, ''));
  });

  function locale() {
    return document.documentElement.getAttribute('lang') === 'en' ? 'en-GB' : 'lt-LT';
  }

  function translate(key, fallback) {
    return window.checkautoI18n ? window.checkautoI18n.translate(key, fallback) : fallback;
  }

  /* Lithuanian needs three noun forms (1 kartą, 2 kartus, 15 kartų); English needs two. */
  function pluralForm(count) {
    var form = new Intl.PluralRules(locale()).select(count);
    return form === 'one' || form === 'few' ? form : 'other';
  }

  function render() {
    figureElements.forEach(function (element) {
      element.textContent = new Intl.NumberFormat(locale()).format(figures[element.dataset.aboutFigure]);
    });
    copyElements.forEach(function (element) {
      var name = element.dataset.aboutCopy;
      var form = pluralForm(figures[name]);
      element.textContent = translate(COPY[name].key + '_' + form, COPY[name].lt[form]);
    });
  }

  render();
  window.addEventListener('checkauto:languagechange', render);
  fetch(GALLERY_DATA_URL, { cache: 'no-cache', credentials: 'same-origin' })
    .then(function (response) {
      if (!response.ok) throw new Error('Gallery request failed: ' + response.status);
      return response.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.items) || !data.items.length) return;
      figures = {
        total: data.items.length,
        notRecommended: data.items.filter(function (item) { return item.recommended === false; }).length,
        recommended: data.items.filter(function (item) { return item.recommended === true; }).length
      };
      render();
    })
    .catch(function () {});
})();
