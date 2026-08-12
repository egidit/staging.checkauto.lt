/* ==========================================================================
   contact-form.js - Public booking request flow for checkauto.lt

   Loads admin-defined availability, lets the customer reserve one slot for
   review, and submits the vehicle/contact details to Supabase Edge Functions.

   No dependencies. Vanilla JS.
   ========================================================================== */

(function () {
  'use strict';

  var BOOKING_ENDPOINT = 'https://ddhhhieitupjixynjrry.supabase.co/functions/v1/public-booking';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_E-TFw7kuSofnw-xDmBk54w_0Ld0HTyC';
  var TERMS_TEXT_VERSION = 'terms-2026-07-03';
  var PRIVACY_TEXT_VERSION = 'privacy-2026-07-03';
  var EARLY_SERVICE_CONSENT_VERSION = 'early-service-consent-2026-08-12';
  var VEHICLE_ACCESS_TEXT_VERSION = 'vehicle-access-via-terms-2026-07-03';

  var MESSAGES = {
    lt: {
      sending: 'Rezervuojama...',
      loadingSlots: 'Kraunami galimi laikai...',
      chooseService: 'Pirmiausia pasirinkite patikros tipą.',
      chooseSlot: 'Pasirinkite vieną iš galimų laikų.',
      chooseLegal: 'Norint rezervuoti laiką reikia patvirtinti taisykles, privatumo politiką ir paslaugos pradėjimo sąlygą.',
      serviceRequiredHint: 'Privaloma paslauga',
      noSlots: 'Šiuo metu šiai paslaugai laisvų laikų nerasta. Pasirinkite kitą paslaugą arba susisiekite telefonu ar el. paštu.',
      availabilityError: 'Laisvų laikų nepavyko įkelti dėl techninės klaidos. Bandykite dar kartą.',
      connectionError: 'Nepavyko susisiekti su rezervacijos sistema. Patikrinkite interneto ryšį ir bandykite dar kartą.',
      availableCount: 'Galimi laikai per artimiausias 45 dienas',
      slotReview: 'Peržiūrėsime',
      slotUnavailable: 'Pasirinktas laikas nebėra prieinamas. Pasirinkite kitą laiką.',
      duplicateRequest: 'Šiam laikui rezervacijos užklausa jau pateikta. Patikrinkite el. paštą dėl jos numerio.',
      requestRejected: 'Rezervacijos duomenų nepavyko priimti. Patikrinkite laukus ir bandykite dar kartą.',
      success: 'Užklausa gauta. Pasirinktas laikas laikinai rezervuotas, patvirtinimą atsiųsime el. paštu.',
      rateLimited: 'Išsiųsta per daug užklausų. Bandykite dar kartą vėliau.',
      bookingError: 'Rezervacijos užklausos nepavyko išsiųsti dėl techninės klaidos. Bandykite dar kartą arba rašykite info@checkauto.lt.'
    },
    en: {
      sending: 'Reserving...',
      loadingSlots: 'Loading available times...',
      chooseService: 'Select an inspection type first.',
      chooseSlot: 'Choose one available time.',
      chooseLegal: 'To reserve a time, confirm the terms, privacy policy, and early service condition.',
      serviceRequiredHint: 'Required service',
      noSlots: 'No available times were found for this service. Choose another service or contact us by phone or email.',
      availabilityError: 'Available times could not be loaded because of a technical error. Please try again.',
      connectionError: 'Could not connect to the booking system. Check your internet connection and try again.',
      availableCount: 'Available times in the next 45 days',
      slotReview: 'Review first',
      slotUnavailable: 'The selected time is no longer available. Please choose another time.',
      duplicateRequest: 'A booking request for this time has already been submitted. Check your email for its reference.',
      requestRejected: 'The booking details could not be accepted. Review the form and try again.',
      success: 'Request received. The selected time is temporarily reserved; we will send confirmation by email.',
      rateLimited: 'Too many requests were sent. Please try again later.',
      bookingError: 'The booking request could not be sent because of a technical error. Please try again or email info@checkauto.lt.'
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

  function setSubmitting(button, label, isSubmitting, idleLabel) {
    if (button) button.disabled = isSubmitting;
    if (label) label.textContent = isSubmitting ? message('sending') : idleLabel;
  }

  function initFloatingFields(form) {
    var fields = Array.prototype.slice.call(form.querySelectorAll('.floating-field'));
    if (!fields.length) return;

    function syncField(field) {
      var control = field.querySelector('input, textarea');
      if (!control) return;

      field.classList.toggle('has-value', control.value.length > 0);

      if (control.validity.valid) {
        field.classList.remove('is-invalid');
        control.removeAttribute('aria-invalid');
      } else if (form.classList.contains('was-validated')) {
        field.classList.add('is-invalid');
        control.setAttribute('aria-invalid', 'true');
      }
    }

    fields.forEach(function (field) {
      var control = field.querySelector('input, textarea');
      if (!control) return;

      ['input', 'change', 'blur'].forEach(function (eventName) {
        control.addEventListener(eventName, function () {
          syncField(field);
        });
      });

      control.addEventListener('invalid', function () {
        field.classList.add('is-invalid');
        control.setAttribute('aria-invalid', 'true');
      });
    });

    function syncAllFields() {
      fields.forEach(syncField);
    }

    form.addEventListener('reset', function () {
      setTimeout(syncAllFields, 0);
    });
    window.addEventListener('pageshow', syncAllFields);

    syncAllFields();
    [100, 500, 1500].forEach(function (delay) {
      setTimeout(syncAllFields, delay);
    });
  }

  function initServiceSelect(form, serviceSelect) {
    var root = form.querySelector('[data-booking-service-select]');
    if (!root || !serviceSelect) return null;

    var trigger = root.querySelector('[data-booking-service-trigger]');
    var menu = root.querySelector('[data-booking-service-menu]');
    var label = root.querySelector('[data-booking-service-label]');
    var options = Array.prototype.slice.call(root.querySelectorAll('[data-service-option]'));

    if (!trigger || !menu || !label || !options.length) return null;

    function getOptionTitle(option) {
      var title = option.querySelector('.booking-service-option-title');
      return title ? title.textContent.trim() : option.textContent.trim();
    }

    function setOpen(isOpen) {
      if (trigger.disabled) isOpen = false;
      menu.hidden = !isOpen;
      root.classList.toggle('is-open', isOpen);
      trigger.setAttribute('aria-expanded', String(isOpen));
    }

    function updateDisabledState() {
      trigger.disabled = serviceSelect.disabled;
      root.classList.toggle('is-disabled', serviceSelect.disabled);
      if (serviceSelect.disabled) setOpen(false);
    }

    function focusOption(index) {
      var option = options[index];
      if (option) option.focus();
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
      } else {
        label.textContent = serviceSelect.options[0] ? serviceSelect.options[0].textContent : message('chooseService');
      }

      root.classList.toggle('has-value', Boolean(selectedOption));
      root.dataset.selectedService = selectedOption ? selectedValue : '';
      root.classList.remove('is-invalid');
      trigger.removeAttribute('aria-invalid');
      updateDisabledState();
    }

    trigger.addEventListener('click', function () {
      setOpen(!root.classList.contains('is-open'));
    });

    trigger.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
        var selected = menu.querySelector('[aria-selected="true"]') || options[0];
        if (selected) selected.focus();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
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
          focusOption(index + 1 < options.length ? index + 1 : 0);
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          focusOption(index - 1 >= 0 ? index - 1 : options.length - 1);
        }
        if (event.key === 'Home') {
          event.preventDefault();
          focusOption(0);
        }
        if (event.key === 'End') {
          event.preventDefault();
          focusOption(options.length - 1);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          trigger.focus();
        }
        if (event.key === 'Tab') setOpen(false);
      });
    });

    document.addEventListener('click', function (event) {
      if (!root.contains(event.target)) setOpen(false);
    });

    root.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!root.contains(document.activeElement)) setOpen(false);
      }, 0);
    });

    serviceSelect.addEventListener('change', updateFromSelect);
    form.addEventListener('reset', function () {
      setTimeout(updateFromSelect, 0);
    });
    window.addEventListener('checkauto:languagechange', updateFromSelect);

    if (typeof MutationObserver === 'function') {
      var disabledObserver = new MutationObserver(updateDisabledState);
      disabledObserver.observe(serviceSelect, { attributes: true, attributeFilter: ['disabled'] });
    }

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
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY
    };
  }

  function uniqueAvailabilityTimes(slots) {
    var byTime = {};
    (Array.isArray(slots) ? slots : []).forEach(function (slot) {
      var key = [
        String(slot.service_code || ''),
        String(slot.start_at || ''),
        String(slot.end_at || '')
      ].join('|');
      var current = byTime[key];
      if (!current || String(slot.slot_id || '').localeCompare(String(current.slot_id || '')) < 0) {
        byTime[key] = slot;
      }
    });
    return Object.keys(byTime).map(function (key) { return byTime[key]; }).sort(function (a, b) {
      return String(a.start_at || '').localeCompare(String(b.start_at || '')) ||
        String(a.end_at || '').localeCompare(String(b.end_at || ''));
    });
  }

  function renderSlots(slotsEl, slots, selectedSlotInput) {
    slots = uniqueAvailabilityTimes(slots);
    clearElement(slotsEl);
    selectedSlotInput.value = '';

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
        });

        grid.appendChild(button);
      });

      group.appendChild(grid);
      slotsEl.appendChild(group);
    });
  }

  async function loadAvailability(serviceSelect, slotsEl, selectedSlotInput, statusEl) {
    var serviceCode = serviceSelect.value;
    clearElement(slotsEl);
    selectedSlotInput.value = '';

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

      if (!response.ok) throw new Error('availabilityError');

      var data = await response.json();
      if (!data || !Array.isArray(data.slots)) throw new Error('availabilityError');
      renderSlots(slotsEl, data.slots, selectedSlotInput);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      var key = error instanceof Error && error.message === 'availabilityError'
        ? 'availabilityError'
        : 'connectionError';
      clearElement(slotsEl);
      slotsEl.appendChild(createStatusText(message(key)));
      setFormStatus(statusEl, 'error', message(key));
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
    var legalConsent = form.querySelector('[data-legal-consent]');

    if (!serviceSelect || !slotsEl || !selectedSlotInput) return;
    initFloatingFields(form);
    var serviceWidget = initServiceSelect(form, serviceSelect);

    serviceSelect.addEventListener('change', function () {
      setFormStatus(statusEl, '', '');
      slotsEl.classList.remove('is-invalid');
      loadAvailability(serviceSelect, slotsEl, selectedSlotInput, statusEl);
    });

    form.addEventListener('input', function () {
      if (statusEl && statusEl.textContent) setFormStatus(statusEl, '', '');
      if (legalConsent && legalConsent.checked) {
        var checkbox = legalConsent.closest('.form-checkbox');
        if (checkbox) checkbox.classList.remove('is-invalid');
      }
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      form.classList.add('was-validated');

      if (!serviceSelect.value) {
        if (serviceWidget) {
          serviceWidget.root.classList.add('is-invalid');
          serviceWidget.trigger.setAttribute('aria-invalid', 'true');
        }
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

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var idleLabel = submitLabel ? submitLabel.textContent : '';
      var formData = new FormData(form);
      var legalAccepted = formData.get('legalConsent') === 'on';
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
        termsAccepted: legalAccepted,
        termsTextVersion: TERMS_TEXT_VERSION,
        privacyAccepted: legalAccepted,
        privacyTextVersion: PRIVACY_TEXT_VERSION,
        earlyServiceConsent: legalAccepted,
        earlyServiceConsentTextVersion: EARLY_SERVICE_CONSENT_VERSION,
        vehicleAccessConfirmed: legalAccepted,
        vehicleAccessTextVersion: VEHICLE_ACCESS_TEXT_VERSION,
        marketingConsent: false,
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

        if (!response.ok) {
          var responseBody = null;
          try {
            responseBody = await response.json();
          } catch (_) {
            responseBody = null;
          }

          if (response.status === 429) throw new Error('rateLimited');
          if (response.status === 409) {
            var responseMessage = responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : '';
            throw new Error(responseMessage.indexOf('already submitted') !== -1
              ? 'duplicateRequest'
              : 'slotUnavailable');
          }
          if (response.status >= 400 && response.status < 500) throw new Error('requestRejected');
          throw new Error('bookingError');
        }

        form.reset();
        form.classList.remove('was-validated');
        if (serviceWidget) serviceWidget.update();
        clearElement(slotsEl);
        slotsEl.classList.remove('is-invalid');
        slotsEl.appendChild(createStatusText(message('chooseService')));
        setFormStatus(statusEl, 'success', message('success'));
      } catch (error) {
        var knownErrors = [
          'rateLimited',
          'slotUnavailable',
          'duplicateRequest',
          'requestRejected',
          'bookingError'
        ];
        var key = error instanceof Error && knownErrors.indexOf(error.message) !== -1
          ? error.message
          : 'connectionError';
        setFormStatus(statusEl, 'error', message(key));

        if (key === 'slotUnavailable') {
          loadAvailability(serviceSelect, slotsEl, selectedSlotInput, statusEl);
        }
      } finally {
        setSubmitting(submitButton, submitLabel, false, idleLabel);
      }
    });

    loadAvailability(serviceSelect, slotsEl, selectedSlotInput, statusEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBookingForm);
  } else {
    initBookingForm();
  }
})();
