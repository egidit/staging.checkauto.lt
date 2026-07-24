/* ==========================================================================
   contact-form.js - Public booking request flow for checkauto.lt

   Loads admin-defined availability, lets the customer reserve one slot for
   review, and submits the vehicle/contact details to Supabase Edge Functions.

   No dependencies. Vanilla JS.
   ========================================================================== */

(function () {
  'use strict';

  var BOOKING_ENDPOINT = 'https://ddhhhieitupjixynjrry.supabase.co/functions/v1/public-booking';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkaGhoaWVpdHVwaml4eW5qcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDAyOTQsImV4cCI6MjA5NzcxNjI5NH0.PXAxGc3TSFUnbcyWdizhkiJkKqJlqD1Ic8PHAjHSFIc';
  var TERMS_TEXT_VERSION = 'terms-2026-07-03';
  var PRIVACY_TEXT_VERSION = 'privacy-2026-07-03';
  var EARLY_SERVICE_CONSENT_VERSION = 'early-service-consent-2026-07-03';
  var VEHICLE_ACCESS_CONSENT_VERSION = 'vehicle-access-confirmation-2026-07-03';

  var MESSAGES = {
    lt: {
      sending: 'Rezervuojama...',
      loadingSlots: 'Kraunami galimi laikai...',
      chooseService: 'Pirmiausia pasirinkite patikros tipą.',
      chooseSlot: 'Pasirinkite vieną iš galimų laikų.',
      chooseLegal: 'Norint rezervuoti laiką reikia sutikti su taisyklėmis ir privatumo politika.',
      chooseEarlyService: 'Patvirtinkite 14 dienų paslaugos pradėjimo sutikimą.',
      chooseVehicleAccess: 'Patvirtinkite, kad automobilis bus prieinamas ir patikrai bus gautas leidimas.',
      serviceRequiredHint: 'Privaloma paslauga',
      noSlots: 'Šiuo metu nėra viešai prieinamų laikų šiai paslaugai. Susisiekite telefonu arba el. paštu.',
      availableCount: 'Galimi laikai per artimiausias 45 dienas',
      slotReview: 'Peržiūrėsime',
      selectedEmpty: 'Pasirinktas laikas bus rodomas čia.',
      selectedPrefix: 'Pasirinktas laikas:',
      slotUnavailable: 'Pasirinktas laikas nebėra prieinamas. Pasirinkite kitą laiką.',
      success: 'Užklausa gauta. Pasirinktas laikas laikinai rezervuotas, patvirtinimą atsiųsime el. paštu.',
      rateLimited: 'Išsiųsta per daug užklausų. Bandykite dar kartą vėliau.',
      error: 'Rezervacijos užklausos išsiųsti nepavyko. Bandykite dar kartą arba rašykite info@checkauto.lt.'
    },
    en: {
      sending: 'Reserving...',
      loadingSlots: 'Loading available times...',
      chooseService: 'Select an inspection type first.',
      chooseSlot: 'Choose one available time.',
      chooseLegal: 'To reserve a time, you need to accept the terms and privacy policy.',
      chooseEarlyService: 'Confirm the 14-day early service start consent.',
      chooseVehicleAccess: 'Confirm that the car will be accessible and permission for inspection will be available.',
      serviceRequiredHint: 'Required service',
      noSlots: 'There are no public times for this service right now. Please contact us by phone or email.',
      availableCount: 'Available times in the next 45 days',
      slotReview: 'Review first',
      selectedEmpty: 'Your selected time will appear here.',
      selectedPrefix: 'Selected time:',
      slotUnavailable: 'The selected time is no longer available. Please choose another time.',
      success: 'Request received. The selected time is temporarily reserved; we will send confirmation by email.',
      rateLimited: 'Too many requests were sent. Please try again later.',
      error: 'The booking request could not be sent. Please try again or email info@checkauto.lt.'
    }
  };

  var availabilityController = null;

  function getActiveLang() {
    return document.documentElement.lang === 'en' ? 'en' : 'lt';
  }

  function message(key) {
    var lang = getActiveLang();
    return MESSAGES[lang][key] || MESSAGES.lt[key];
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat(getActiveLang() === 'en' ? 'en-GB' : 'lt-LT', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'Europe/Vilnius'
    }).format(new Date(value));
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat(getActiveLang() === 'en' ? 'en-GB' : 'lt-LT', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Vilnius'
    }).format(new Date(value));
  }

  function formatSelectedSlot(slot) {
    return formatDate(slot.start_at) + ', ' + formatTime(slot.start_at) + ' - ' + formatTime(slot.end_at);
  }

  function createStatusText(text) {
    var p = document.createElement('p');
    p.className = 'booking-slot-empty';
    p.textContent = text;
    return p;
  }

  function clearElement(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function setFormStatus(statusEl, type, text) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('is-success', type === 'success');
    statusEl.classList.toggle('is-error', type === 'error');
  }

  function setSelectedSummary(summaryEl, slot) {
    if (!summaryEl) return;
    if (!slot) {
      summaryEl.textContent = message('selectedEmpty');
      summaryEl.dataset.state = 'empty';
      return;
    }
    summaryEl.textContent = message('selectedPrefix') + ' ' + formatSelectedSlot(slot);
    summaryEl.dataset.state = 'selected';
  }

  function setSubmitting(button, label, isSubmitting, idleLabel) {
    if (button) button.disabled = isSubmitting;
    if (label) label.textContent = isSubmitting ? message('sending') : idleLabel;
  }

  function initServiceSelect(form, serviceSelect) {
    var root = form.querySelector('[data-booking-service-select]');
    if (!root || !serviceSelect) return null;

    var trigger = root.querySelector('[data-booking-service-trigger]');
    var menu = root.querySelector('[data-booking-service-menu]');
    var label = root.querySelector('[data-booking-service-label]');
    var meta = root.querySelector('[data-booking-service-meta]');
    var options = Array.prototype.slice.call(root.querySelectorAll('[data-service-option]'));

    if (!trigger || !menu || !label || !options.length) return null;

    function getOptionTitle(option) {
      var title = option.querySelector('.booking-service-option-title');
      return title ? title.textContent.trim() : option.textContent.trim();
    }

    function getOptionMeta(option) {
      var text = option.querySelector('.booking-service-option-text');
      return text ? text.textContent.trim() : '';
    }

    function setOpen(isOpen) {
      root.classList.toggle('is-open', isOpen);
      trigger.setAttribute('aria-expanded', String(isOpen));
    }

    function updateFromSelect() {
      var selectedValue = serviceSelect.value;
      var selectedOption = null;

      options.forEach(function (option) {
        var isSelected = option.dataset.value === selectedValue;
        option.setAttribute('aria-selected', String(isSelected));
        if (isSelected) selectedOption = option;
      });

      if (selectedOption) {
        label.textContent = getOptionTitle(selectedOption);
        if (meta) meta.textContent = getOptionMeta(selectedOption);
      } else {
        label.textContent = serviceSelect.options[0] ? serviceSelect.options[0].textContent : message('chooseService');
        if (meta) meta.textContent = message('serviceRequiredHint');
      }

      root.classList.toggle('has-value', Boolean(selectedOption));
      root.classList.remove('is-invalid');
    }

    trigger.addEventListener('click', function () {
      setOpen(!root.classList.contains('is-open'));
    });

    trigger.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
        var selected = menu.querySelector('[aria-selected="true"]') || options[0];
        if (selected) selected.focus();
      }
      if (event.key === 'Escape') setOpen(false);
    });

    options.forEach(function (option, index) {
      option.addEventListener('click', function () {
        serviceSelect.value = option.dataset.value || '';
        serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
        setOpen(false);
        trigger.focus();
      });

      option.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          (options[index + 1] || options[0]).focus();
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          (options[index - 1] || options[options.length - 1]).focus();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          trigger.focus();
        }
      });
    });

    document.addEventListener('click', function (event) {
      if (!root.contains(event.target)) setOpen(false);
    });

    serviceSelect.addEventListener('change', updateFromSelect);
    form.addEventListener('reset', function () {
      setTimeout(updateFromSelect, 0);
    });
    window.addEventListener('checkauto:languagechange', updateFromSelect);

    updateFromSelect();

    return {
      root: root,
      trigger: trigger,
      update: updateFromSelect
    };
  }

  function getHeaders() {
    return {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    };
  }

  function renderSlots(slotsEl, slots, selectedSlotInput, selectedSummaryEl) {
    clearElement(slotsEl);
    selectedSlotInput.value = '';
    setSelectedSummary(selectedSummaryEl, null);

    if (!slots.length) {
      slotsEl.appendChild(createStatusText(message('noSlots')));
      return;
    }

    var count = document.createElement('p');
    count.className = 'booking-slot-count';
    count.textContent = slots.length + ' · ' + message('availableCount');
    slotsEl.appendChild(count);

    var grouped = {};
    slots.forEach(function (slot) {
      var key = formatDate(slot.start_at);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(slot);
    });

    Object.keys(grouped).forEach(function (dateLabel) {
      var group = document.createElement('div');
      group.className = 'booking-slot-group';

      var heading = document.createElement('h3');
      heading.textContent = dateLabel;
      group.appendChild(heading);

      var grid = document.createElement('div');
      grid.className = 'booking-slot-grid';

      grouped[dateLabel].forEach(function (slot) {
        var button = document.createElement('button');
        button.className = 'booking-slot';
        button.type = 'button';
        button.setAttribute('aria-pressed', 'false');
        button.dataset.slotId = slot.slot_id;
        button.innerHTML =
          '<span class="booking-slot-time">' + formatTime(slot.start_at) + ' - ' + formatTime(slot.end_at) + '</span>' +
          '<span class="booking-slot-note">' + message('slotReview') + '</span>';

        button.addEventListener('click', function () {
          var buttons = slotsEl.querySelectorAll('.booking-slot');
          buttons.forEach(function (item) {
            item.classList.remove('is-selected');
            item.setAttribute('aria-pressed', 'false');
          });

          button.classList.add('is-selected');
          button.setAttribute('aria-pressed', 'true');
          selectedSlotInput.value = slot.slot_id;
          slotsEl.classList.remove('is-invalid');
          selectedSlotInput.dispatchEvent(new Event('input', { bubbles: true }));
          setSelectedSummary(selectedSummaryEl, slot);
        });

        grid.appendChild(button);
      });

      group.appendChild(grid);
      slotsEl.appendChild(group);
    });
  }

  async function loadAvailability(serviceSelect, slotsEl, selectedSlotInput, statusEl, selectedSummaryEl) {
    var serviceCode = serviceSelect.value;
    clearElement(slotsEl);
    selectedSlotInput.value = '';
    setSelectedSummary(selectedSummaryEl, null);

    if (!serviceCode) {
      slotsEl.appendChild(createStatusText(message('chooseService')));
      return;
    }

    if (availabilityController) availabilityController.abort();
    availabilityController = new AbortController();

    slotsEl.appendChild(createStatusText(message('loadingSlots')));

    try {
      var response = await fetch(BOOKING_ENDPOINT + '?service=' + encodeURIComponent(serviceCode), {
        method: 'GET',
        headers: getHeaders(),
        signal: availabilityController.signal
      });

      if (!response.ok) throw new Error('Availability request failed');

      var data = await response.json();
      renderSlots(slotsEl, Array.isArray(data.slots) ? data.slots : [], selectedSlotInput, selectedSummaryEl);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      clearElement(slotsEl);
      slotsEl.appendChild(createStatusText(message('error')));
      setFormStatus(statusEl, 'error', message('error'));
    }
  }

  function initBookingForm() {
    var form = document.querySelector('[data-contact-form]');
    if (!form) return;

    var serviceSelect = form.querySelector('[data-booking-service]');
    var slotsEl = form.querySelector('[data-booking-slots]');
    var selectedSlotInput = form.querySelector('[data-booking-slot-id]');
    var submitButton = form.querySelector('[data-contact-form-submit]');
    var submitLabel = form.querySelector('[data-contact-submit-label]');
    var statusEl = form.querySelector('[data-contact-form-status]');
    var selectedSummaryEl = form.querySelector('[data-booking-selected-summary]');
    var legalConsent = form.querySelector('[data-legal-consent]');
    var earlyServiceConsent = form.querySelector('[data-early-service-consent]');
    var vehicleAccessConsent = form.querySelector('[data-vehicle-access-consent]');

    if (!serviceSelect || !slotsEl || !selectedSlotInput) return;
    var serviceWidget = initServiceSelect(form, serviceSelect);
    setSelectedSummary(selectedSummaryEl, null);

    serviceSelect.addEventListener('change', function () {
      setFormStatus(statusEl, '', '');
      slotsEl.classList.remove('is-invalid');
      loadAvailability(serviceSelect, slotsEl, selectedSlotInput, statusEl, selectedSummaryEl);
    });

    form.addEventListener('input', function () {
      if (statusEl && statusEl.textContent) setFormStatus(statusEl, '', '');
      [legalConsent, earlyServiceConsent, vehicleAccessConsent].forEach(function (checkboxInput) {
        if (!checkboxInput || !checkboxInput.checked) return;
        var checkbox = checkboxInput.closest('.form-checkbox');
        if (checkbox) checkbox.classList.remove('is-invalid');
      });
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      form.classList.add('was-validated');

      if (!serviceSelect.value) {
        if (serviceWidget) serviceWidget.root.classList.add('is-invalid');
        setFormStatus(statusEl, 'error', message('chooseService'));
        if (serviceWidget) serviceWidget.trigger.focus();
        return;
      }

      if (!selectedSlotInput.value) {
        slotsEl.classList.add('is-invalid');
        setFormStatus(statusEl, 'error', message('chooseSlot'));
        slotsEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }

      if (legalConsent && !legalConsent.checked) {
        var legalWrapper = legalConsent.closest('.form-checkbox');
        if (legalWrapper) legalWrapper.classList.add('is-invalid');
        setFormStatus(statusEl, 'error', message('chooseLegal'));
        legalConsent.focus();
        return;
      }

      if (earlyServiceConsent && !earlyServiceConsent.checked) {
        var earlyServiceWrapper = earlyServiceConsent.closest('.form-checkbox');
        if (earlyServiceWrapper) earlyServiceWrapper.classList.add('is-invalid');
        setFormStatus(statusEl, 'error', message('chooseEarlyService'));
        earlyServiceConsent.focus();
        return;
      }

      if (vehicleAccessConsent && !vehicleAccessConsent.checked) {
        var vehicleAccessWrapper = vehicleAccessConsent.closest('.form-checkbox');
        if (vehicleAccessWrapper) vehicleAccessWrapper.classList.add('is-invalid');
        setFormStatus(statusEl, 'error', message('chooseVehicleAccess'));
        vehicleAccessConsent.focus();
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var idleLabel = submitLabel ? submitLabel.textContent : '';
      var formData = new FormData(form);
      var payload = {
        slotId: selectedSlotInput.value,
        serviceCode: String(formData.get('serviceCode') || '').trim(),
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        vehicle: String(formData.get('vehicle') || '').trim(),
        vehicleLocation: String(formData.get('vehicleLocation') || '').trim(),
        listingUrl: String(formData.get('listingUrl') || '').trim(),
        message: String(formData.get('message') || '').trim(),
        website: String(formData.get('website') || '').trim(),
        pageUrl: window.location.href,
        language: getActiveLang(),
        termsAccepted: formData.get('legalConsent') === 'on',
        termsTextVersion: TERMS_TEXT_VERSION,
        privacyAccepted: formData.get('legalConsent') === 'on',
        privacyTextVersion: PRIVACY_TEXT_VERSION,
        earlyServiceConsent: formData.get('earlyServiceConsent') === 'on',
        earlyServiceConsentTextVersion: EARLY_SERVICE_CONSENT_VERSION,
        vehicleAccessConfirmed: formData.get('vehicleAccessConsent') === 'on',
        vehicleAccessTextVersion: VEHICLE_ACCESS_CONSENT_VERSION,
        marketingConsent: formData.get('marketingConsent') === 'on',
        marketingConsentTextVersion: 'booking-form-2026-07-02'
      };

      setFormStatus(statusEl, '', '');
      setSubmitting(submitButton, submitLabel, true, idleLabel);

      try {
        var response = await fetch(BOOKING_ENDPOINT, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });

        if (response.status === 429) throw new Error('rateLimited');
        if (response.status === 409) throw new Error('slotUnavailable');
        if (!response.ok) throw new Error('Request failed');

        form.reset();
        form.classList.remove('was-validated');
        if (serviceWidget) serviceWidget.update();
        clearElement(slotsEl);
        slotsEl.classList.remove('is-invalid');
        slotsEl.appendChild(createStatusText(message('chooseService')));
        setSelectedSummary(selectedSummaryEl, null);
        setFormStatus(statusEl, 'success', message('success'));
      } catch (error) {
        var key = 'error';
        if (error instanceof Error && error.message === 'rateLimited') key = 'rateLimited';
        if (error instanceof Error && error.message === 'slotUnavailable') key = 'slotUnavailable';
        setFormStatus(statusEl, 'error', message(key));

        if (key === 'slotUnavailable') {
          loadAvailability(serviceSelect, slotsEl, selectedSlotInput, statusEl, selectedSummaryEl);
        }
      } finally {
        setSubmitting(submitButton, submitLabel, false, idleLabel);
      }
    });

    loadAvailability(serviceSelect, slotsEl, selectedSlotInput, statusEl, selectedSummaryEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBookingForm);
  } else {
    initBookingForm();
  }
})();
