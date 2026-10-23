(function () {
  'use strict';

  var lastTrigger = null;
  var backgroundState = [];
  var previousBodyOverflow = '';

  function text(key, lt, en) {
    var lang = window.checkautoI18n && typeof window.checkautoI18n.getLanguage === 'function'
      ? window.checkautoI18n.getLanguage()
      : document.documentElement.lang === 'en' ? 'en' : 'lt';
    var fallback = lang === 'en' ? en : lt;
    if (window.checkautoI18n && typeof window.checkautoI18n.translate === 'function') {
      return window.checkautoI18n.translate(key, fallback);
    }
    return fallback;
  }

  function labels() {
    return {
      close: text('gallery.close', 'Uždaryti nuotrauką', 'Close image'),
      dialogTitle: text('gallery.dialog_title', 'Patikros nuotrauka', 'Inspection image')
    };
  }

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
  });

  closeButton.setAttribute('aria-label', labels().close);

  window.checkautoLightbox = { open: openDialog };
})();
