(function () {
  'use strict';

  var PAGE_SIZE = 6;
  var GALLERY_DATA_URL = '/data/gallery.json?v=20260823-5';
  var grid = document.querySelector('.gallery-grid');
  if (!grid) return;

  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('.gallery-filter'));
  var items = [];
  var hasLoaded = false;
  var activeFilter = 'all';
  var visibleCount = PAGE_SIZE;
  var unavailableImages = Object.create(null);
  var lastTrigger = null;
  var backgroundState = [];
  var previousBodyOverflow = '';

  grid.id = grid.id || 'gallery-grid';

  function getLanguage() {
    if (window.checkautoI18n && typeof window.checkautoI18n.getLanguage === 'function') {
      return window.checkautoI18n.getLanguage();
    }
    return document.documentElement.lang === 'en' ? 'en' : 'lt';
  }

  function text(key, lt, en) {
    var fallback = getLanguage() === 'en' ? en : lt;
    if (window.checkautoI18n && typeof window.checkautoI18n.translate === 'function') {
      return window.checkautoI18n.translate(key, fallback);
    }
    return fallback;
  }

  function labels() {
    return {
      seller: text('gallery.seller_said', 'Pardavėjas sakė', 'Seller said'),
      found: text('gallery.we_found', 'Ką radome', 'What we found'),
      loading: text('gallery.loading', 'Kraunami patikrų atvejai…', 'Loading inspection cases…'),
      error: text('gallery.error', 'Patikrų atvejų nepavyko įkelti.', 'Inspection cases could not be loaded.'),
      retry: text('gallery.retry', 'Bandyti dar kartą', 'Try again'),
      empty: text('gallery.empty', 'Šioje kategorijoje atvejų dar nėra.', 'There are no cases in this category yet.'),
      loadMore: text('gallery.load_more', 'Rodyti daugiau', 'Show more'),
      showing: text('gallery.showing', 'Rodoma {shown} iš {total} atvejų.', 'Showing {shown} of {total} cases.'),
      zoom: text('gallery.zoom', 'Padidinti nuotrauką: {title}', 'Enlarge image: {title}'),
      close: text('gallery.close', 'Uždaryti nuotrauką', 'Close image'),
      dialogTitle: text('gallery.dialog_title', 'Patikros nuotrauka', 'Inspection image'),
      unavailable: text('gallery.image_unavailable', 'Nuotrauka nepasiekiama', 'Image unavailable')
    };
  }

  function replaceTokens(template, values) {
    return Object.keys(values).reduce(function (result, key) {
      return result.replace('{' + key + '}', String(values[key]));
    }, template);
  }

  var resultStatus = document.createElement('p');
  resultStatus.className = 'gallery-results-status';
  resultStatus.setAttribute('role', 'status');
  resultStatus.setAttribute('aria-live', 'polite');
  resultStatus.setAttribute('aria-atomic', 'true');
  grid.parentNode.insertBefore(resultStatus, grid);

  var state = document.createElement('div');
  state.className = 'gallery-state';
  state.setAttribute('role', 'status');
  state.setAttribute('aria-live', 'polite');
  state.setAttribute('aria-atomic', 'true');
  var stateMessage = document.createElement('p');
  var retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'btn btn-secondary gallery-retry';
  state.appendChild(stateMessage);
  state.appendChild(retryButton);
  grid.parentNode.insertBefore(state, grid);

  var loadMoreButton = document.createElement('button');
  loadMoreButton.type = 'button';
  loadMoreButton.className = 'btn btn-secondary gallery-load-more';
  loadMoreButton.setAttribute('aria-controls', grid.id);
  grid.parentNode.insertBefore(loadMoreButton, grid.nextSibling);

  var dialog = document.createElement('div');
  dialog.className = 'gallery-lightbox';
  dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'gallery-dialog-title');

  var dialogTitle = document.createElement('h2');
  dialogTitle.id = 'gallery-dialog-title';
  dialogTitle.className = 'visually-hidden';
  var dialogImage = document.createElement('img');
  dialogImage.className = 'gallery-lightbox-image';
  var closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'gallery-lightbox-close';
  closeButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  dialog.appendChild(dialogTitle);
  dialog.appendChild(closeButton);
  dialog.appendChild(dialogImage);
  document.body.appendChild(dialog);

  function setBackgroundInert(shouldBeInert) {
    if (shouldBeInert) {
      if (backgroundState.length) return;
      Array.prototype.slice.call(document.body.children).forEach(function (element) {
        if (element === dialog) return;
        backgroundState.push({ element: element, inert: Boolean(element.inert) });
        element.inert = true;
      });
      return;
    }
    backgroundState.forEach(function (entry) { entry.element.inert = entry.inert; });
    backgroundState = [];
  }

  function openDialog(button, image, title) {
    if (!image || image.dataset.unavailable === 'true' || !image.currentSrc && !image.src) return;
    lastTrigger = button;
    previousBodyOverflow = document.body.style.overflow;
    dialogTitle.textContent = labels().dialogTitle + ': ' + title;
    dialogImage.src = image.currentSrc || image.src;
    dialogImage.alt = image.alt;
    closeButton.setAttribute('aria-label', labels().close);
    dialog.hidden = false;
    dialog.classList.add('open');
    setBackgroundInert(true);
    document.body.style.overflow = 'hidden';
    closeButton.focus();
  }

  function closeDialog() {
    if (dialog.hidden) return;
    dialog.classList.remove('open');
    dialog.hidden = true;
    dialogImage.removeAttribute('src');
    document.body.style.overflow = previousBodyOverflow;
    setBackgroundInert(false);
    if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus();
    lastTrigger = null;
  }

  function createSkeleton() {
    var card = document.createElement('article');
    card.className = 'gallery-card gallery-card--skeleton';
    card.setAttribute('aria-hidden', 'true');
    var image = document.createElement('div');
    image.className = 'gallery-card-image gallery-skeleton-block';
    var body = document.createElement('div');
    body.className = 'gallery-card-body';
    body.innerHTML = '<span class="gallery-skeleton-line gallery-skeleton-line--title"></span>' +
      '<span class="gallery-skeleton-line"></span><span class="gallery-skeleton-line"></span>';
    card.appendChild(image);
    card.appendChild(body);
    return card;
  }

  function showLoading() {
    var copy = labels();
    state.hidden = false;
    state.dataset.state = 'loading';
    stateMessage.textContent = copy.loading;
    retryButton.hidden = true;
    resultStatus.textContent = '';
    loadMoreButton.hidden = true;
    grid.replaceChildren();
    for (var index = 0; index < PAGE_SIZE; index += 1) grid.appendChild(createSkeleton());
  }

  function showError() {
    var copy = labels();
    state.hidden = false;
    state.dataset.state = 'error';
    stateMessage.textContent = copy.error;
    retryButton.textContent = copy.retry;
    retryButton.hidden = false;
    resultStatus.textContent = '';
    loadMoreButton.hidden = true;
    grid.replaceChildren();
  }

  function appendUnavailableLabel(imageWrap) {
    if (imageWrap.querySelector('.gallery-image-unavailable')) return;
    var unavailableLabel = document.createElement('span');
    unavailableLabel.className = 'gallery-image-unavailable';
    unavailableLabel.textContent = labels().unavailable;
    imageWrap.appendChild(unavailableLabel);
  }

  function markImageUnavailable(image, zoomButton, imageWrap, source) {
    unavailableImages[source] = true;
    image.dataset.unavailable = 'true';
    if (zoomButton) zoomButton.remove();
    imageWrap.classList.add('gallery-card-image--unavailable');
    image.alt = labels().unavailable;
    image.removeAttribute('src');
    image.hidden = true;
    appendUnavailableLabel(imageWrap);
  }

  function createCard(item) {
    var lang = getLanguage();
    var content = item[lang] || item.lt;
    var copy = labels();
    var card = document.createElement('article');
    card.className = 'gallery-card ' + (item.recommended
      ? 'gallery-card--recommended'
      : 'gallery-card--not-recommended');
    card.dataset.category = item.category;

    var imageWrap = document.createElement('div');
    imageWrap.className = 'gallery-card-image';
    var image = document.createElement('img');
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 800;
    image.height = 500;
    image.alt = content.title + ' — ' + content.tag;
    var imageUnavailable = item.imageAvailable === false || !item.image || unavailableImages[item.image];
    if (imageUnavailable) {
      image.dataset.unavailable = 'true';
      image.alt = copy.unavailable;
      image.hidden = true;
      imageWrap.classList.add('gallery-card-image--unavailable');
    } else {
      image.src = item.image;
    }

    var tag = document.createElement('span');
    tag.className = 'gallery-tag gallery-tag--' + item.category;
    tag.textContent = content.tag;
    imageWrap.appendChild(image);
    imageWrap.appendChild(tag);
    if (imageUnavailable) appendUnavailableLabel(imageWrap);

    var zoomButton = null;
    if (!imageUnavailable) {
      zoomButton = document.createElement('button');
      zoomButton.type = 'button';
      zoomButton.className = 'gallery-zoom-btn';
      zoomButton.setAttribute('aria-label', replaceTokens(copy.zoom, { title: content.title }));
      zoomButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.2 10.2 14 14M5 7h4M7 5v4"/></svg>';
      zoomButton.addEventListener('click', function () {
        openDialog(zoomButton, image, content.title);
      });
      imageWrap.appendChild(zoomButton);
    }

    if (!imageUnavailable) {
      image.addEventListener('error', function () {
        markImageUnavailable(image, zoomButton, imageWrap, item.image);
      });
    }

    var body = document.createElement('div');
    body.className = 'gallery-card-body';
    var title = document.createElement('h2');
    title.className = 'gallery-card-title';
    title.textContent = content.title;
    body.appendChild(title);

    function appendDetail(labelText, value, found) {
      var detail = document.createElement('div');
      detail.className = 'gallery-card-detail';
      var label = document.createElement('span');
      label.className = 'gallery-detail-label' + (found ? ' gallery-detail-label--found' : '');
      label.textContent = labelText;
      var paragraph = document.createElement('p');
      paragraph.textContent = value;
      detail.appendChild(label);
      detail.appendChild(paragraph);
      body.appendChild(detail);
    }

    appendDetail(copy.seller, content.seller, false);
    appendDetail(copy.found, content.found, true);
    var verdict = document.createElement('div');
    verdict.className = 'gallery-verdict';
    verdict.textContent = content.verdict;
    body.appendChild(verdict);

    card.appendChild(imageWrap);
    card.appendChild(body);
    return card;
  }

  function filteredItems() {
    return items.filter(function (item) {
      return activeFilter === 'all' || item.category === activeFilter;
    });
  }

  function render() {
    var copy = labels();
    var matching = filteredItems();
    var visible = matching.slice(0, visibleCount);
    grid.replaceChildren();
    state.hidden = true;
    state.dataset.state = '';
    retryButton.hidden = true;

    filterButtons.forEach(function (button) {
      var pressed = button.dataset.filter === activeFilter;
      button.classList.toggle('active', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    });

    if (!matching.length) {
      state.hidden = false;
      state.dataset.state = 'empty';
      stateMessage.textContent = copy.empty;
      resultStatus.textContent = copy.empty;
      loadMoreButton.hidden = true;
      return;
    }

    visible.forEach(function (item) { grid.appendChild(createCard(item)); });
    resultStatus.textContent = replaceTokens(copy.showing, {
      shown: visible.length,
      total: matching.length
    });
    loadMoreButton.textContent = copy.loadMore;
    loadMoreButton.hidden = visible.length >= matching.length;
  }

  function loadGallery() {
    showLoading();
    fetch(GALLERY_DATA_URL, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('Gallery request failed: ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.items)) throw new Error('Gallery data is invalid');
        items = data.items;
        hasLoaded = true;
        visibleCount = PAGE_SIZE;
        render();
      })
      .catch(function () {
        hasLoaded = false;
        showError();
      });
  }

  filterButtons.forEach(function (button) {
    button.type = 'button';
    button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    button.addEventListener('click', function () {
      activeFilter = button.dataset.filter || 'all';
      visibleCount = PAGE_SIZE;
      render();
    });
  });

  loadMoreButton.addEventListener('click', function () {
    var previousShown = Math.min(visibleCount, filteredItems().length);
    visibleCount += PAGE_SIZE;
    render();
    var cards = grid.querySelectorAll('.gallery-card');
    var nextHeading = cards[previousShown] && cards[previousShown].querySelector('h2');
    if (nextHeading) {
      nextHeading.tabIndex = -1;
      nextHeading.focus();
      nextHeading.addEventListener('blur', function () { nextHeading.removeAttribute('tabindex'); }, { once: true });
    }
  });
  retryButton.addEventListener('click', loadGallery);
  closeButton.addEventListener('click', closeDialog);
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) closeDialog();
  });
  dialogImage.addEventListener('error', closeDialog);

  document.addEventListener('keydown', function (event) {
    if (dialog.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      closeButton.focus();
    }
  });

  window.addEventListener('checkauto:languagechange', function () {
    closeButton.setAttribute('aria-label', labels().close);
    if (hasLoaded) render();
    else if (state.dataset.state === 'loading') showLoading();
    else if (state.dataset.state === 'error') showError();
  });

  closeButton.setAttribute('aria-label', labels().close);
  loadGallery();
})();
