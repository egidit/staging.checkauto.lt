(function () {
  'use strict';

  var ZOOM_SCALE = 2.5;
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
  var frame = document.createElement('div');
  frame.className = 'gallery-lightbox-frame';
  var dialogImage = document.createElement('img');
  dialogImage.className = 'gallery-lightbox-image';
  dialogImage.draggable = false;
  var closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'gallery-lightbox-close';
  closeButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  frame.appendChild(dialogImage);
  dialog.appendChild(dialogTitle);
  dialog.appendChild(closeButton);
  dialog.appendChild(frame);
  document.body.appendChild(dialog);

  /* Click to zoom in at the pointer, drag to pan, click again to zoom out. */
  var zoomed = false;
  var originX = 50;
  var originY = 50;
  var drag = null;
  var justDragged = false;
  var pressedInFrame = false;

  function applyZoom() {
    dialogImage.style.transformOrigin = originX + '% ' + originY + '%';
    dialogImage.style.transform = zoomed ? 'scale(' + ZOOM_SCALE + ')' : '';
    frame.classList.toggle('is-zoomed', zoomed);
  }

  function resetZoom() {
    zoomed = false;
    originX = 50;
    originY = 50;
    drag = null;
    frame.classList.remove('is-dragging');
    applyZoom();
  }

  function sizeFrame() {
    var width = dialogImage.naturalWidth || 800;
    var height = dialogImage.naturalHeight || 500;
    var ratio = Math.min(window.innerWidth * 0.9 / width, window.innerHeight * 0.85 / height, 1);
    frame.style.width = Math.round(width * ratio) + 'px';
    frame.style.height = Math.round(height * ratio) + 'px';
  }

  function clamp(value) {
    return Math.max(0, Math.min(100, value));
  }

  function startDrag(x, y) {
    if (!zoomed) return;
    drag = { x: x, y: y, originX: originX, originY: originY };
    justDragged = false;
  }

  function moveDrag(x, y) {
    if (!drag) return false;
    var dx = x - drag.x;
    var dy = y - drag.y;
    if (!justDragged && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return false;
    justDragged = true;
    frame.classList.add('is-dragging');
    var box = frame.getBoundingClientRect();
    /* Dragging right moves the picture right, so the zoom origin moves left. */
    originX = clamp(drag.originX - dx / (box.width * (ZOOM_SCALE - 1)) * 100);
    originY = clamp(drag.originY - dy / (box.height * (ZOOM_SCALE - 1)) * 100);
    applyZoom();
    return true;
  }

  function endDrag() {
    if (!drag) return;
    drag = null;
    frame.classList.remove('is-dragging');
    setTimeout(function () { justDragged = false; }, 0);
  }

  frame.addEventListener('click', function (event) {
    if (justDragged) return;
    if (zoomed) {
      zoomed = false;
    } else {
      var box = frame.getBoundingClientRect();
      originX = clamp((event.clientX - box.left) / box.width * 100);
      originY = clamp((event.clientY - box.top) / box.height * 100);
      zoomed = true;
    }
    applyZoom();
  });

  frame.addEventListener('mousedown', function (event) {
    pressedInFrame = true;
    if (!zoomed) return;
    event.preventDefault();
    startDrag(event.clientX, event.clientY);
  });

  window.addEventListener('mousemove', function (event) {
    moveDrag(event.clientX, event.clientY);
  });

  window.addEventListener('mouseup', function () {
    endDrag();
    setTimeout(function () { pressedInFrame = false; }, 0);
  });

  frame.addEventListener('touchstart', function (event) {
    if (event.touches.length === 1) startDrag(event.touches[0].clientX, event.touches[0].clientY);
  }, { passive: true });

  frame.addEventListener('touchmove', function (event) {
    if (event.touches.length !== 1) return;
    if (moveDrag(event.touches[0].clientX, event.touches[0].clientY)) event.preventDefault();
  }, { passive: false });

  frame.addEventListener('touchend', endDrag);
  frame.addEventListener('touchcancel', endDrag);

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
    resetZoom();
    dialogImage.src = image.currentSrc || image.src;
    dialogImage.alt = image.alt;
    sizeFrame();
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
    resetZoom();
    dialogImage.removeAttribute('src');
    document.body.style.overflow = previousBodyOverflow;
    setBackgroundInert(false);
    if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus();
    lastTrigger = null;
  }

  closeButton.addEventListener('click', closeDialog);
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog && !pressedInFrame && !justDragged) closeDialog();
  });
  dialogImage.addEventListener('load', sizeFrame);
  dialogImage.addEventListener('error', closeDialog);
  window.addEventListener('resize', function () {
    if (!dialog.hidden) sizeFrame();
  });

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
