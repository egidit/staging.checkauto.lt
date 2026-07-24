(function () {
  'use strict';

  var grid = document.querySelector('.gallery-grid');

  /* ---- Get current language ---- */
  function getLang() {
    return localStorage.getItem('checkauto-lang') || document.documentElement.lang || 'lt';
  }

  /* ---- Get i18n labels ---- */
  function getLabels(lang) {
    var labels = {
      lt: { seller: 'Pardavėjas sakė', found: 'Ką radome' },
      en: { seller: 'Seller said', found: 'What we found' }
    };
    return labels[lang] || labels.lt;
  }

  /* ---- Escape HTML to prevent XSS ---- */
  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  /* ---- Build a single card ---- */
  function buildCard(item, lang) {
    var t = item[lang] || item.lt;
    var labels = getLabels(lang);
    var article = document.createElement('article');
    article.className = 'gallery-card' + (item.recommended ? ' gallery-card--recommended' : ' gallery-card--not-recommended');
    article.setAttribute('data-category', item.category);

    article.innerHTML =
      '<div class="gallery-card-image">' +
        '<img src="' + esc(item.image) + '" alt="' + esc(t.title) + '" loading="lazy" width="800" height="500">' +
        '<span class="gallery-tag gallery-tag--' + esc(item.category) + '">' + esc(t.tag) + '</span>' +
        '<button class="gallery-zoom-btn" aria-label="Zoom">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.2 10.2 14 14"/><path d="M5 7h4M7 5v4"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="gallery-card-body">' +
        '<h3 class="gallery-card-title">' + esc(t.title) + '</h3>' +
        '<div class="gallery-card-detail">' +
          '<span class="gallery-detail-label">' + esc(labels.seller) + '</span>' +
          '<p>' + esc(t.seller) + '</p>' +
        '</div>' +
        '<div class="gallery-card-detail">' +
          '<span class="gallery-detail-label gallery-detail-label--found">' + esc(labels.found) + '</span>' +
          '<p>' + esc(t.found) + '</p>' +
        '</div>' +
        '<div class="gallery-verdict">' + esc(t.verdict) + '</div>' +
      '</div>';

    return article;
  }

  /* ---- Render gallery from JSON ---- */
  function renderGallery(items) {
    var lang = getLang();
    grid.innerHTML = '';
    items.forEach(function (item) {
      grid.appendChild(buildCard(item, lang));
    });
    initFilters();
    initLightbox();
  }

  /* ---- Filters ---- */
  function initFilters() {
    var filters = document.querySelectorAll('.gallery-filter');
    var cards = document.querySelectorAll('.gallery-card');

    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var filter = btn.getAttribute('data-filter');
        filters.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        cards.forEach(function (card) {
          if (filter === 'all' || card.getAttribute('data-category') === filter) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  /* ---- Lightbox ---- */
  function initLightbox() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.92);justify-content:center;align-items:center;';

    var closeBtn = document.createElement('button');
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;line-height:1;z-index:2;';
    closeBtn.innerHTML = '&#10005;';

    var imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'position:relative;overflow:hidden;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.4);cursor:zoom-in;';

    var lbImg = document.createElement('img');
    lbImg.style.cssText = 'display:block;width:100%;height:100%;';
    lbImg.draggable = false;

    imgWrap.appendChild(lbImg);
    overlay.appendChild(closeBtn);
    overlay.appendChild(imgWrap);
    document.body.appendChild(overlay);

    var zoomed = false;
    var SCALE = 2.5;
    var originX = 50, originY = 50; /* percentages */

    /* drag state */
    var dragging = false;
    var dragStartX = 0, dragStartY = 0;
    var dragStartOX = 0, dragStartOY = 0;
    var hasDragged = false;
    var mouseDownOnImg = false;

    function clampOrigin() {
      originX = Math.max(0, Math.min(100, originX));
      originY = Math.max(0, Math.min(100, originY));
    }

    function applyTransform(animate) {
      lbImg.style.transition = animate ? 'transform 0.3s ease, transform-origin 0.3s ease' : 'none';
      lbImg.style.transformOrigin = originX + '% ' + originY + '%';
      lbImg.style.transform = zoomed ? 'scale(' + SCALE + ')' : 'scale(1)';
    }

    function sizeWrap() {
      var maxW = window.innerWidth * 0.9;
      var maxH = window.innerHeight * 0.85;
      var nw = lbImg.naturalWidth || 800;
      var nh = lbImg.naturalHeight || 500;
      var ratio = Math.min(maxW / nw, maxH / nh, 1);
      imgWrap.style.width = Math.round(nw * ratio) + 'px';
      imgWrap.style.height = Math.round(nh * ratio) + 'px';
    }

    function openLightbox(src, alt) {
      lbImg.src = src;
      lbImg.alt = alt || '';
      zoomed = false;
      originX = 50;
      originY = 50;
      imgWrap.style.cursor = 'zoom-in';

      if (lbImg.complete && lbImg.naturalWidth) {
        sizeWrap();
        applyTransform(false);
      } else {
        lbImg.onload = function () {
          sizeWrap();
          applyTransform(false);
        };
      }

      overlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      zoomed = false;
      lbImg.style.transform = 'scale(1)';
    }

    /* zoom in / out on click */
    imgWrap.addEventListener('click', function (e) {
      e.stopPropagation();
      if (hasDragged) return;
      if (zoomed) {
        /* zoom out — keep current origin so animation zooms out from where user is looking */
        zoomed = false;
        applyTransform(true);
        imgWrap.style.cursor = 'zoom-in';
      } else {
        var rect = imgWrap.getBoundingClientRect();
        originX = ((e.clientX - rect.left) / rect.width) * 100;
        originY = ((e.clientY - rect.top) / rect.height) * 100;
        clampOrigin();
        zoomed = true;
        applyTransform(true);
        imgWrap.style.cursor = 'zoom-out';
      }
    });

    /* drag to pan when zoomed — shifts transform-origin */
    imgWrap.addEventListener('mousedown', function (e) {
      mouseDownOnImg = true;
      if (!zoomed) return;
      e.preventDefault();
      dragging = true;
      hasDragged = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartOX = originX;
      dragStartOY = originY;
      imgWrap.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true;
      var rect = imgWrap.getBoundingClientRect();
      /* dragging right → content moves right → origin decreases */
      originX = dragStartOX - (dx / (rect.width * (SCALE - 1))) * 100;
      originY = dragStartOY - (dy / (rect.height * (SCALE - 1))) * 100;
      clampOrigin();
      applyTransform(false);
    });

    window.addEventListener('mouseup', function () {
      setTimeout(function () { mouseDownOnImg = false; }, 0);
      if (!dragging) return;
      dragging = false;
      if (zoomed) imgWrap.style.cursor = 'zoom-out';
      setTimeout(function () { hasDragged = false; }, 0);
    });

    /* touch support */
    imgWrap.addEventListener('touchstart', function (e) {
      if (!zoomed || e.touches.length !== 1) return;
      dragging = true;
      hasDragged = false;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      dragStartOX = originX;
      dragStartOY = originY;
    }, { passive: true });

    imgWrap.addEventListener('touchmove', function (e) {
      if (!dragging || e.touches.length !== 1) return;
      e.preventDefault();
      var dx = e.touches[0].clientX - dragStartX;
      var dy = e.touches[0].clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true;
      var rect = imgWrap.getBoundingClientRect();
      originX = dragStartOX - (dx / (rect.width * (SCALE - 1))) * 100;
      originY = dragStartOY - (dy / (rect.height * (SCALE - 1))) * 100;
      clampOrigin();
      applyTransform(false);
    }, { passive: false });

    imgWrap.addEventListener('touchend', function () {
      dragging = false;
      setTimeout(function () { hasDragged = false; }, 0);
    });

    document.querySelectorAll('.gallery-zoom-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var img = btn.closest('.gallery-card-image').querySelector('img');
        if (img) openLightbox(img.src, img.alt);
      });
    });

    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeLightbox();
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && !mouseDownOnImg) closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.style.display === 'flex') closeLightbox();
    });
  }

  /* ---- Load JSON and render ---- */
  if (grid) {
    fetch('/data/gallery.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderGallery(data.items);

        /* Re-render when language changes */
        var observer = new MutationObserver(function (mutations) {
          mutations.forEach(function (m) {
            if (m.attributeName === 'lang') {
              renderGallery(data.items);
            }
          });
        });
        observer.observe(document.documentElement, { attributes: true });
      })
      .catch(function (err) { console.error('Gallery JSON load error:', err); });
  }
})();
