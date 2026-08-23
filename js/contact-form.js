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
  var MARKETING_CONSENT_TEXT_VERSION = 'booking-form-2026-07-02';

  var MESSAGES = {
    lt: {
      sending: 'Rezervuojama...',
      loadingSlots: 'Kraunami galimi laikai...',
      chooseService: 'Pirmiausia pasirinkite patikros tipą.',
      chooseSlot: 'Pasirinkite vieną iš galimų laikų.',
      chooseLegal: 'Sutikite su taisyklėmis ir privatumo politika.',
      serviceRequiredHint: 'Privaloma paslauga',
      slotsAvailable: 'Pasirinkite laiką.',
      formNeedsAttention: 'Patikrinkite pažymėtus laukus. Perkelta į pirmą nebaigtą lauką.',
      nameRequired: 'Įveskite vardą ir pavardę.',
      phoneRequired: 'Įveskite telefono numerį.',
      phoneInvalid: 'Įveskite tinkamą telefono numerį.',
      emailRequired: 'Įveskite el. pašto adresą.',
      emailInvalid: 'Įveskite tinkamą el. pašto adresą.',
      vehicleRequired: 'Įveskite automobilio duomenis.',
      locationRequired: 'Įveskite automobilio vietą arba adresą.',
      listingUrlInvalid: 'Įveskite visą nuorodą, prasidedančią „https://“.',
      fieldInvalid: 'Patikrinkite šio lauko reikšmę.',
      noSlots: 'Šiuo metu šiai paslaugai laisvų laikų nerasta. Pasirinkite kitą paslaugą arba susisiekite telefonu ar el. paštu.',
      availabilityError: 'Laisvų laikų nepavyko įkelti dėl techninės klaidos. Bandykite dar kartą.',
      connectionError: 'Nepavyko susisiekti su rezervacijos sistema. Patikrinkite interneto ryšį ir bandykite dar kartą.',
      slotUnavailable: 'Pasirinktas laikas nebėra prieinamas. Pasirinkite kitą laiką.',
      duplicateRequest: 'Šiam laikui rezervacijos užklausa jau pateikta. Patikrinkite el. paštą dėl jos numerio.',
      requestRejected: 'Rezervacijos duomenų nepavyko priimti. Patikrinkite laukus ir bandykite dar kartą.',
      successTitle: 'Rezervacijos užklausa gauta',
      success: 'Laikas laikinai rezervuotas. Patvirtinimą atsiųsime el. paštu.',
      successReference: 'Užklausos numeris',
      successTime: 'Pasirinktas laikas',
      emailWarning: 'Užklausa išsaugota, tačiau patvirtinimo el. laiško pristatyti nepavyko. Jei jo negaunate, susisiekite ir nurodykite užklausos numerį.',
      rateLimited: 'Išsiųsta per daug užklausų. Bandykite dar kartą vėliau.',
      bookingError: 'Rezervacijos užklausos nepavyko išsiųsti dėl techninės klaidos. Bandykite dar kartą arba rašykite info@checkauto.lt.'
    },
    en: {
      sending: 'Reserving...',
      loadingSlots: 'Loading available times...',
      chooseService: 'Select an inspection type first.',
      chooseSlot: 'Choose one available time.',
      chooseLegal: 'Accept the Terms and Conditions and acknowledge the Privacy Policy.',
      serviceRequiredHint: 'Required service',
      slotsAvailable: 'Choose a time.',
      formNeedsAttention: 'Review the highlighted fields. Focus moved to the first incomplete field.',
      nameRequired: 'Enter your full name.',
      phoneRequired: 'Enter your phone number.',
      phoneInvalid: 'Enter a valid phone number.',
      emailRequired: 'Enter your email address.',
      emailInvalid: 'Enter a valid email address.',
      vehicleRequired: 'Enter the car details.',
      locationRequired: 'Enter the car location or address.',
      listingUrlInvalid: 'Enter the full URL beginning with “https://”.',
      fieldInvalid: 'Review the value in this field.',
      noSlots: 'No available times were found for this service. Choose another service or contact us by phone or email.',
      availabilityError: 'Available times could not be loaded because of a technical error. Please try again.',
      connectionError: 'Could not connect to the booking system. Check your internet connection and try again.',
      slotUnavailable: 'The selected time is no longer available. Please choose another time.',
      duplicateRequest: 'A booking request for this time has already been submitted. Check your email for its reference.',
      requestRejected: 'The booking details could not be accepted. Review the form and try again.',
      successTitle: 'Booking request received',
      success: 'The time is temporarily reserved. We will send confirmation by email.',
      successReference: 'Request reference',
      successTime: 'Selected time',
      emailWarning: 'Your request was saved, but the confirmation email could not be delivered. If it does not arrive, contact us and quote the request reference.',
      rateLimited: 'Too many requests were sent. Please try again later.',
      bookingError: 'The booking request could not be sent because of a technical error. Please try again or email info@checkauto.lt.'
    }
  };

  var availabilityController = null;
  var currentAvailabilitySlots = [];

  function getActiveLang() {
    return document.documentElement.lang === 'en' ? 'en' : 'lt';
  }

  function message(key) {
    var lang = getActiveLang();
    return MESSAGES[lang][key] || MESSAGES.lt[key];
  }

  function formatDate(value) {
    var lang = getActiveLang();
    var parts = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'lt-LT', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'Europe/Vilnius'
    }).formatToParts(new Date(value));
    var values = {};

    parts.forEach(function (part) {
      if (part.type !== 'literal') values[part.type] = part.value;
    });

    function capitalize(text) {
      return text ? text.charAt(0).toLocaleUpperCase(lang === 'en' ? 'en-GB' : 'lt-LT') + text.slice(1) : '';
    }

    if (lang === 'en') {
      return capitalize(values.weekday) + ', ' + values.day + ' ' + capitalize(values.month);
    }

    return capitalize(values.weekday) + ', ' + capitalize(values.month) + ' ' + values.day + 'd.';
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat(getActiveLang() === 'en' ? 'en-GB' : 'lt-LT', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Vilnius'
    }).format(new Date(value));
  }

  function clearElement(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function setFormStatus(statusEl, type, text, messageKey) {
    if (!statusEl) return;
    clearElement(statusEl);
    statusEl.textContent = text || '';
    statusEl.dataset.messageKey = messageKey || '';
    statusEl.dataset.statusType = type || '';
    delete statusEl.dataset.statusKind;
    statusEl.classList.toggle('is-success', type === 'success');
    statusEl.classList.toggle('is-error', type === 'error');
  }

  function setSlotStatus(statusEl, messageKey, count) {
    if (!statusEl) return;
    statusEl.dataset.messageKey = messageKey || '';
    statusEl.dataset.count = typeof count === 'number' ? String(count) : '';
    statusEl.textContent = message(messageKey);
  }

  function setAvailabilityRetry(slotsEl, isVisible) {
    var retryButton = slotsEl ? slotsEl.querySelector('[data-booking-slot-retry]') : null;
    if (retryButton) retryButton.hidden = !isVisible;
  }

  function appendDefinitionRow(list, labelText, valueText) {
    if (!list || !valueText) return;
    var row = document.createElement('div');
    var term = document.createElement('dt');
    var description = document.createElement('dd');
    term.textContent = labelText;
    description.textContent = valueText;
    row.appendChild(term);
    row.appendChild(description);
    list.appendChild(row);
  }

  function renderBookingSuccess(statusEl, data) {
    if (!statusEl) return;
    clearElement(statusEl);
    statusEl.dataset.messageKey = '';
    statusEl.dataset.statusType = 'success';
    statusEl.dataset.statusKind = 'bookingSuccess';
    statusEl.classList.add('is-success');
    statusEl.classList.remove('is-error');

    var title = document.createElement('strong');
    title.className = 'contact-form-status-title';
    title.textContent = message('successTitle');
    statusEl.appendChild(title);

    var summary = document.createElement('p');
    summary.textContent = message('success');
    statusEl.appendChild(summary);

    var details = document.createElement('dl');
    details.className = 'contact-form-status-details';
    appendDefinitionRow(details, message('successReference'), data && data.reference ? String(data.reference) : '');
    appendDefinitionRow(
      details,
      message('successTime'),
      data && data.requestedStartAt
        ? formatDate(data.requestedStartAt) + ', ' + formatTime(data.requestedStartAt)
        : ''
    );
    if (details.childElementCount) statusEl.appendChild(details);

    if (data && data.emailDelivery && data.emailDelivery.warning) {
      var warning = document.createElement('p');
      warning.className = 'contact-form-status-warning';
      warning.textContent = message('emailWarning');
      statusEl.appendChild(warning);
    }
  }

  function toggleDescription(control, descriptionId, shouldInclude) {
    if (!control || !descriptionId) return;

    var ids = String(control.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .filter(function (id) { return id !== descriptionId; });

    if (shouldInclude) ids.push(descriptionId);

    if (ids.length) {
      control.setAttribute('aria-describedby', ids.join(' '));
    } else {
      control.removeAttribute('aria-describedby');
    }
  }

  function setSubmitLabel(label, isSubmitting, idleLabel) {
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

    var errorEl = root.querySelector('.form-error');
    var trigger = root.querySelector('[data-booking-service-trigger]');

    if (!trigger) {
      function setNativeInvalid(isInvalid) {
        root.classList.toggle('is-invalid', isInvalid);
        if (isInvalid) {
          serviceSelect.setAttribute('aria-invalid', 'true');
        } else {
          serviceSelect.removeAttribute('aria-invalid');
        }

        if (errorEl) {
          errorEl.hidden = !isInvalid;
          if (isInvalid) errorEl.textContent = message('chooseService');
          toggleDescription(serviceSelect, errorEl.id, isInvalid);
        }
      }

      function updateNativeSelect() {
        root.classList.toggle('has-value', Boolean(serviceSelect.value));
        root.classList.toggle('is-disabled', serviceSelect.disabled);
        if (serviceSelect.value) setNativeInvalid(false);
      }

      serviceSelect.addEventListener('change', updateNativeSelect);
      form.addEventListener('reset', function () {
        setTimeout(updateNativeSelect, 0);
      });
      window.addEventListener('checkauto:languagechange', updateNativeSelect);

      if (typeof MutationObserver === 'function') {
        var nativeDisabledObserver = new MutationObserver(updateNativeSelect);
        nativeDisabledObserver.observe(serviceSelect, { attributes: true, attributeFilter: ['disabled'] });
      }

      updateNativeSelect();

      return {
        root: root,
        trigger: serviceSelect,
        update: updateNativeSelect,
        setInvalid: setNativeInvalid
      };
    }

    var menu = root.querySelector('[data-booking-service-menu]');
    var valueLabel = root.querySelector('[data-booking-service-label]');
    var options = Array.prototype.slice.call(root.querySelectorAll('[data-service-option]'));
    var activeIndex = -1;
    var typeahead = '';
    var typeaheadTimer = null;

    if (!trigger || !menu || !valueLabel || !options.length) return null;

    function getOptionTitle(option) {
      var title = option.querySelector('.booking-service-option-title');
      return title ? title.textContent.trim() : option.textContent.trim();
    }

    function getSelectedIndex() {
      return options.findIndex(function (option) {
        return option.dataset.value === serviceSelect.value;
      });
    }

    function setInvalid(isInvalid) {
      root.classList.toggle('is-invalid', isInvalid);
      if (isInvalid) {
        trigger.setAttribute('aria-invalid', 'true');
      } else {
        trigger.removeAttribute('aria-invalid');
      }

      if (errorEl) {
        errorEl.hidden = !isInvalid;
        if (isInvalid) errorEl.textContent = message('chooseService');
        toggleDescription(trigger, errorEl.id, isInvalid);
      }
    }

    function syncOptionState() {
      var selectedIndex = getSelectedIndex();
      var open = root.classList.contains('is-open');

      options.forEach(function (option, index) {
        var isCurrent = open ? index === activeIndex : index === selectedIndex;
        option.classList.toggle('is-committed', index === selectedIndex);
        option.classList.toggle('is-active', open && index === activeIndex);
        option.setAttribute('aria-selected', String(isCurrent));
      });

      if (open && options[activeIndex]) {
        trigger.setAttribute('aria-activedescendant', options[activeIndex].id);
        options[activeIndex].scrollIntoView({ block: 'nearest' });
      } else {
        trigger.removeAttribute('aria-activedescendant');
      }
    }

    function setActive(index) {
      if (!options.length) return;
      activeIndex = Math.max(0, Math.min(index, options.length - 1));
      syncOptionState();
    }

    function setOpen(isOpen, preferredIndex) {
      if (serviceSelect.disabled) isOpen = false;

      if (isOpen) {
        var selectedIndex = getSelectedIndex();
        activeIndex = typeof preferredIndex === 'number'
          ? preferredIndex
          : (selectedIndex >= 0 ? selectedIndex : 0);
      }

      menu.hidden = !isOpen;
      root.classList.toggle('is-open', isOpen);
      trigger.setAttribute('aria-expanded', String(isOpen));
      syncOptionState();
    }

    function commitActiveOption() {
      var option = options[activeIndex];
      if (!option) return;

      var nextValue = option.dataset.value || '';
      var valueChanged = serviceSelect.value !== nextValue;
      serviceSelect.value = nextValue;
      if (valueChanged) {
        serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        updateFromSelect();
      }
      setOpen(false);
    }

    function updateDisabledState() {
      trigger.disabled = serviceSelect.disabled;
      trigger.setAttribute('aria-disabled', String(serviceSelect.disabled));
      trigger.tabIndex = serviceSelect.disabled ? -1 : 0;
      root.classList.toggle('is-disabled', serviceSelect.disabled);
      if (serviceSelect.disabled) setOpen(false);
    }

    function setCollapsedValue(text, hasSelection) {
      if (valueLabel.tagName === 'INPUT') {
        valueLabel.value = hasSelection ? text : '';
        valueLabel.placeholder = hasSelection ? '' : text;
      } else {
        valueLabel.textContent = text;
      }
    }

    function updateFromSelect() {
      var selectedValue = serviceSelect.value;
      var selectedOption = null;

      options.forEach(function (option) {
        var isSelected = option.dataset.value === selectedValue;
        if (isSelected) selectedOption = option;
      });

      if (selectedOption) {
        setCollapsedValue(getOptionTitle(selectedOption), true);
      } else {
        setCollapsedValue(
          serviceSelect.options[0] ? serviceSelect.options[0].textContent : message('chooseService'),
          false
        );
      }

      root.classList.toggle('has-value', Boolean(selectedOption));
      root.dataset.selectedService = selectedOption ? selectedValue : '';
      if (selectedOption) setInvalid(false);
      updateDisabledState();
      syncOptionState();
    }

    trigger.addEventListener('click', function () {
      if (serviceSelect.disabled) return;
      trigger.focus();
      setOpen(!root.classList.contains('is-open'));
    });

    trigger.addEventListener('keydown', function (event) {
      var isOpen = root.classList.contains('is-open');

      if (event.key === 'Tab' && isOpen) {
        commitActiveOption();
        return;
      }

      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (isOpen) {
          commitActiveOption();
        } else {
          setOpen(true);
        }
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!isOpen) {
          setOpen(true, event.key === 'ArrowUp' ? options.length - 1 : undefined);
        } else {
          setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
        }
        return;
      }

      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        if (!isOpen) setOpen(true);
        setActive(event.key === 'Home' ? 0 : options.length - 1);
        return;
      }

      if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
        typeahead += event.key.toLocaleLowerCase(getActiveLang() === 'en' ? 'en-GB' : 'lt-LT');
        clearTimeout(typeaheadTimer);
        typeaheadTimer = setTimeout(function () { typeahead = ''; }, 500);

        var matchIndex = options.findIndex(function (option) {
          return getOptionTitle(option).toLocaleLowerCase(getActiveLang() === 'en' ? 'en-GB' : 'lt-LT').indexOf(typeahead) === 0;
        });

        if (matchIndex >= 0) {
          event.preventDefault();
          if (!isOpen) setOpen(true, matchIndex);
          setActive(matchIndex);
        }
      }
    });

    menu.addEventListener('mousedown', function (event) {
      var target = event.target;
      if (target && target.nodeType !== 1) target = target.parentElement;
      if (event.button === 0 && target && target.closest('[data-service-option]')) {
        event.preventDefault();
      }
    });

    options.forEach(function (option, index) {
      option.addEventListener('click', function () {
        setActive(index);
        commitActiveOption();
        trigger.focus();
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
      update: updateFromSelect,
      setInvalid: setInvalid
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

  function renderSlots(slotsEl, slotOptionsEl, slotStatusEl, slots, selectedSlotInput, preferredSlotId, focusFirst) {
    var hadSlotFocus = slotsEl.contains(document.activeElement);
    slots = uniqueAvailabilityTimes(slots);
    clearElement(slotOptionsEl);
    selectedSlotInput.value = '';
    setAvailabilityRetry(slotsEl, false);

    if (!slots.length) {
      setSlotStatus(slotStatusEl, 'noSlots');
      slotsEl.setAttribute('tabindex', '0');
      if (hadSlotFocus || focusFirst) slotsEl.focus();
      return 0;
    }

    setSlotStatus(slotStatusEl, 'slotsAvailable', slots.length);
    slotsEl.setAttribute('tabindex', '-1');

    var grouped = {};
    var createdOptions = [];
    var preferredOption = null;

    function selectSlot(option, shouldFocus) {
      createdOptions.forEach(function (item) {
        var isSelected = item === option;
        item.setAttribute('aria-checked', String(isSelected));
        item.classList.toggle('is-selected', isSelected);
        item.setAttribute('tabindex', isSelected ? '0' : '-1');
      });

      selectedSlotInput.value = option.dataset.slotId || '';
      slotsEl.classList.remove('is-invalid');
      slotsEl.removeAttribute('aria-invalid');
      var slotError = document.getElementById('contact-slot-error');
      if (slotError) {
        slotError.hidden = true;
        toggleDescription(slotsEl, slotError.id, false);
      }
      selectedSlotInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (shouldFocus) option.focus();
    }

    slots.forEach(function (slot) {
      var key = formatDate(slot.start_at);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(slot);
    });

    Object.keys(grouped).forEach(function (dateLabel, groupIndex) {
      var group = document.createElement('div');
      group.className = 'booking-slot-group';

      var heading = document.createElement('h4');
      heading.id = 'contact-slot-date-' + groupIndex;
      heading.textContent = dateLabel;
      group.appendChild(heading);

      var grid = document.createElement('div');
      grid.className = 'booking-slot-grid';

      grouped[dateLabel].forEach(function (slot, slotIndex) {
        var optionId = 'contact-slot-' + groupIndex + '-' + slotIndex;
        var timeId = optionId + '-time';
        var option = document.createElement('div');
        option.id = optionId;
        option.className = 'booking-slot';
        option.dataset.slotId = String(slot.slot_id || '');
        option.setAttribute('role', 'radio');
        option.setAttribute('aria-checked', 'false');
        option.setAttribute('aria-labelledby', heading.id + ' ' + timeId);
        option.setAttribute('tabindex', '-1');

        var time = document.createElement('span');
        time.id = timeId;
        time.className = 'booking-slot-time';
        time.textContent = formatTime(slot.start_at);
        option.appendChild(time);

        option.addEventListener('click', function () {
          selectSlot(option, true);
        });

        option.addEventListener('keydown', function (event) {
          var currentIndex = createdOptions.indexOf(option);
          var nextIndex = currentIndex;

          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % createdOptions.length;
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex = (currentIndex - 1 + createdOptions.length) % createdOptions.length;
          } else if (event.key === 'Home') {
            nextIndex = 0;
          } else if (event.key === 'End') {
            nextIndex = createdOptions.length - 1;
          } else if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            selectSlot(option, true);
            return;
          } else {
            return;
          }

          event.preventDefault();
          selectSlot(createdOptions[nextIndex], true);
        });

        createdOptions.push(option);
        if (preferredSlotId && preferredSlotId === String(slot.slot_id)) {
          option.setAttribute('aria-checked', 'true');
          option.classList.add('is-selected');
          option.setAttribute('tabindex', '0');
          selectedSlotInput.value = String(slot.slot_id);
          preferredOption = option;
        }

        grid.appendChild(option);
      });

      group.appendChild(grid);
      slotOptionsEl.appendChild(group);
    });

    var activeOption = preferredOption || createdOptions[0];
    if (activeOption && !preferredOption) activeOption.setAttribute('tabindex', '0');
    if (activeOption && (focusFirst || hadSlotFocus)) activeOption.focus();

    return slots.length;
  }

  async function loadAvailability(serviceSelect, slotsEl, slotOptionsEl, slotStatusEl, selectedSlotInput, statusEl, focusFirst) {
    var serviceCode = serviceSelect.value;
    clearElement(slotOptionsEl);
    selectedSlotInput.value = '';
    currentAvailabilitySlots = [];
    setAvailabilityRetry(slotsEl, false);
    slotsEl.removeAttribute('aria-invalid');
    slotsEl.classList.remove('is-invalid');

    if (!serviceCode) {
      if (availabilityController) availabilityController.abort();
      slotsEl.setAttribute('aria-busy', 'false');
      slotsEl.setAttribute('tabindex', '0');
      setSlotStatus(slotStatusEl, 'chooseService');
      return 0;
    }

    if (availabilityController) availabilityController.abort();
    var controller = new AbortController();
    availabilityController = controller;

    slotsEl.setAttribute('aria-busy', 'true');
    slotsEl.setAttribute('tabindex', '0');
    setSlotStatus(slotStatusEl, 'loadingSlots');

    try {
      var response = await fetch(BOOKING_ENDPOINT + '?service=' + encodeURIComponent(serviceCode), {
        method: 'GET',
        headers: getHeaders(),
        signal: controller.signal
      });

      if (!response.ok) throw new Error('availabilityError');

      var data = await response.json();
      if (!data || !Array.isArray(data.slots)) throw new Error('availabilityError');
      currentAvailabilitySlots = data.slots;
      return renderSlots(slotsEl, slotOptionsEl, slotStatusEl, data.slots, selectedSlotInput, '', focusFirst);
    } catch (error) {
      if (error && error.name === 'AbortError') return 0;
      var key = error instanceof Error && error.message === 'availabilityError'
        ? 'availabilityError'
        : 'connectionError';
      clearElement(slotOptionsEl);
      slotsEl.setAttribute('tabindex', '0');
      setSlotStatus(slotStatusEl, key);
      setAvailabilityRetry(slotsEl, true);
      return 0;
    } finally {
      if (availabilityController === controller) {
        slotsEl.setAttribute('aria-busy', 'false');
      }
    }
  }

  function initBookingForm() {
    var form = document.querySelector('[data-contact-form]');
    if (!form) return;

    var serviceSelect = form.querySelector('[data-booking-service]');
    var slotsEl = form.querySelector('[data-booking-slots]');
    var slotOptionsEl = form.querySelector('[data-booking-slot-options]');
    var slotStatusEl = form.querySelector('[data-booking-slot-status]');
    var slotErrorEl = document.getElementById('contact-slot-error');
    var selectedSlotInput = form.querySelector('[data-booking-slot-id]');
    var submitButton = form.querySelector('[data-contact-form-submit]');
    var submitLabel = form.querySelector('[data-contact-submit-label]');
    var statusEl = form.querySelector('[data-contact-form-status]');
    var retryButton = form.querySelector('[data-booking-slot-retry]');
    var consentGroup = form.querySelector('[data-legal-consents]');
    var termsConsent = form.querySelector('[data-terms-consent]');
    var requiredConsents = [termsConsent].filter(Boolean);
    var marketingConsent = form.querySelector('[data-marketing-consent]');
    var textControls = Array.prototype.slice.call(form.querySelectorAll('.floating-field input, .floating-field textarea'));
    var isSubmitting = false;
    var hasAttemptedSubmit = false;
    var lastSuccessData = null;
    var observedServiceValue = '';

    if (!serviceSelect || !slotsEl || !slotOptionsEl || !slotStatusEl || !selectedSlotInput) return;

    try {
      var requestedService = new URL(window.location.href).searchParams.get('service');
      if (requestedService === 'full_inspection' || requestedService === 'computer_diagnostics') {
        serviceSelect.value = requestedService;
      }
    } catch (_) {
      // Keep the default selection when the current URL cannot be parsed.
    }
    observedServiceValue = serviceSelect.value;

    function isControlValid(control) {
      if (!control || !control.willValidate) return true;

      if (
        control.required &&
        (control.tagName === 'INPUT' || control.tagName === 'TEXTAREA') &&
        control.type !== 'checkbox' &&
        control.type !== 'radio' &&
        !String(control.value || '').trim()
      ) {
        return false;
      }

      return control.validity.valid;
    }

    function canSubmitForm() {
      if (!selectedSlotInput.value) return false;

      return Array.prototype.every.call(form.elements, function (control) {
        return isControlValid(control);
      });
    }

    function syncSubmitButton() {
      if (!submitButton) return;
      var isReady = !isSubmitting && canSubmitForm();
      submitButton.setAttribute('aria-disabled', String(!isReady));
      submitButton.setAttribute('aria-busy', String(isSubmitting));
      submitButton.disabled = !isReady;
      submitButton.classList.toggle('is-disabled', !isReady && !isSubmitting);
      submitButton.classList.toggle('is-submitting', isSubmitting);
    }

    function setBookingSubmitting(nextState, idleLabel) {
      isSubmitting = nextState;
      setSubmitLabel(submitLabel, isSubmitting, idleLabel);
      syncSubmitButton();
    }

    initFloatingFields(form);
    var serviceWidget = initServiceSelect(form, serviceSelect);

    function setInlineError(errorEl, key, isVisible) {
      if (!errorEl) return;
      if (key) errorEl.dataset.errorKey = key;
      if (isVisible) errorEl.textContent = message(key || errorEl.dataset.errorKey);
      errorEl.hidden = !isVisible;
    }

    function controlErrorKey(control) {
      if (control.id === 'contact-name') return 'nameRequired';
      if (control.id === 'contact-phone') {
        return !String(control.value || '').trim() ? 'phoneRequired' : 'phoneInvalid';
      }
      if (control.id === 'contact-email') {
        return !String(control.value || '').trim() ? 'emailRequired' : 'emailInvalid';
      }
      if (control.id === 'contact-vehicle') return 'vehicleRequired';
      if (control.id === 'contact-location') return 'locationRequired';
      if (control.id === 'contact-listing-url') return 'listingUrlInvalid';
      return 'fieldInvalid';
    }

    function setControlError(control, shouldShow) {
      var isInvalid = shouldShow && !isControlValid(control);
      var field = control.closest('.floating-field');
      var errorEl = control.id ? document.getElementById(control.id + '-error') : null;

      if (field) field.classList.toggle('is-invalid', isInvalid);
      if (isInvalid) {
        control.setAttribute('aria-invalid', 'true');
      } else {
        control.removeAttribute('aria-invalid');
      }
      setInlineError(errorEl, controlErrorKey(control), isInvalid);
      if (errorEl) toggleDescription(control, errorEl.id, isInvalid);
      return !isInvalid;
    }

    function setSlotError(isInvalid) {
      slotsEl.classList.toggle('is-invalid', isInvalid);
      if (isInvalid) {
        slotsEl.setAttribute('aria-invalid', 'true');
      } else {
        slotsEl.removeAttribute('aria-invalid');
      }
      setInlineError(slotErrorEl, 'chooseSlot', isInvalid);
      if (slotErrorEl) toggleDescription(slotsEl, slotErrorEl.id, isInvalid);
    }

    function setLegalError(isInvalid) {
      if (!consentGroup || !requiredConsents.length) return;
      var errorEl = document.getElementById('contact-legal-error');
      consentGroup.classList.toggle('is-invalid', isInvalid);
      requiredConsents.forEach(function (consent) {
        if (isInvalid && !consent.checked) consent.setAttribute('aria-invalid', 'true');
        else consent.removeAttribute('aria-invalid');
      });
      setInlineError(errorEl, 'chooseLegal', isInvalid);
    }

    function focusInvalidTarget(target) {
      if (!target || typeof target.focus !== 'function') return;
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }

      target.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth'
      });
    }

    function validateForm(shouldFocus, shouldAnnounce) {
      var invalidTargets = [];
      var serviceInvalid = !serviceSelect.value;
      if (serviceWidget) serviceWidget.setInvalid(serviceInvalid);
      if (serviceInvalid && serviceWidget) invalidTargets.push(serviceWidget.trigger);

      var slotInvalid = Boolean(serviceSelect.value) && !selectedSlotInput.value;
      setSlotError(slotInvalid);
      if (slotInvalid) {
        invalidTargets.push(slotOptionsEl.querySelector('[role="radio"][tabindex="0"]') || slotsEl);
      }

      textControls.forEach(function (control) {
        if (!setControlError(control, true)) invalidTargets.push(control);
      });

      var legalInvalid = requiredConsents.some(function (consent) { return !consent.checked; });
      setLegalError(legalInvalid);
      if (legalInvalid) {
        invalidTargets.push(requiredConsents.find(function (consent) { return !consent.checked; }));
      }

      var isValid = invalidTargets.length === 0 && canSubmitForm();
      if (!isValid && shouldAnnounce) {
        setFormStatus(statusEl, 'error', message('formNeedsAttention'), 'formNeedsAttention');
      }

      if (!isValid && shouldFocus) focusInvalidTarget(invalidTargets[0]);
      return isValid;
    }

    function clearValidationErrors() {
      form.classList.remove('was-validated');
      if (serviceWidget) serviceWidget.setInvalid(false);
      setSlotError(false);
      textControls.forEach(function (control) {
        setControlError(control, false);
      });
      setLegalError(false);
    }

    function refreshVisibleMessages() {
      form.querySelectorAll('.form-error:not([hidden])').forEach(function (errorEl) {
        if (errorEl.dataset.errorKey) errorEl.textContent = message(errorEl.dataset.errorKey);
      });

      if (slotStatusEl.dataset.messageKey) {
        var slotCount = Number(slotStatusEl.dataset.count || 0);
        setSlotStatus(slotStatusEl, slotStatusEl.dataset.messageKey, slotCount);
      }

      if (statusEl && statusEl.dataset.messageKey) {
        setFormStatus(
          statusEl,
          statusEl.dataset.statusType || '',
          message(statusEl.dataset.messageKey),
          statusEl.dataset.messageKey
        );
      } else if (statusEl && statusEl.dataset.statusKind === 'bookingSuccess' && lastSuccessData) {
        renderBookingSuccess(statusEl, lastSuccessData);
      }
    }

    serviceSelect.addEventListener('change', function () {
      observedServiceValue = serviceSelect.value;
      setFormStatus(statusEl, '', '');
      if (serviceWidget) serviceWidget.setInvalid(false);
      setSlotError(false);
      loadAvailability(serviceSelect, slotsEl, slotOptionsEl, slotStatusEl, selectedSlotInput, statusEl, false);
      syncSubmitButton();
    });

    form.addEventListener('input', function (event) {
      var preserveValidationSummary = hasAttemptedSubmit &&
        statusEl && statusEl.dataset.messageKey === 'formNeedsAttention';
      if (statusEl && statusEl.textContent && !preserveValidationSummary) {
        setFormStatus(statusEl, '', '');
      }

      if (hasAttemptedSubmit) {
        if (textControls.indexOf(event.target) !== -1) setControlError(event.target, true);
        if (event.target === selectedSlotInput) setSlotError(!selectedSlotInput.value);
        if (requiredConsents.indexOf(event.target) !== -1) {
          setLegalError(requiredConsents.some(function (consent) { return !consent.checked; }));
        }

        if (validateForm(false, false)) setFormStatus(statusEl, '', '');
      }

      syncSubmitButton();
    });

    textControls.forEach(function (control) {
      control.addEventListener('blur', function () {
        setControlError(control, true);
      });
    });

    if (consentGroup) {
      consentGroup.addEventListener('focusout', function () {
        setTimeout(function () {
          if (!consentGroup.contains(document.activeElement)) {
            setLegalError(requiredConsents.some(function (consent) { return !consent.checked; }));
          }
        }, 0);
      });
    }

    if (retryButton) {
      retryButton.addEventListener('click', function () {
        setFormStatus(statusEl, '', '');
        loadAvailability(serviceSelect, slotsEl, slotOptionsEl, slotStatusEl, selectedSlotInput, statusEl, true);
      });
    }

    form.addEventListener('change', syncSubmitButton);
    form.addEventListener('reset', function () {
      setTimeout(function () {
        hasAttemptedSubmit = false;
        observedServiceValue = serviceSelect.value;
        if (availabilityController) availabilityController.abort();
        currentAvailabilitySlots = [];
        clearElement(slotOptionsEl);
        slotsEl.setAttribute('aria-busy', 'false');
        slotsEl.setAttribute('tabindex', '0');
        setSlotStatus(slotStatusEl, 'chooseService');
        setAvailabilityRetry(slotsEl, false);
        clearValidationErrors();
        if (serviceWidget) serviceWidget.update();
        syncSubmitButton();
      }, 0);
    });

    window.addEventListener('pageshow', function () {
      if (serviceWidget) serviceWidget.update();
      if (serviceSelect.value !== observedServiceValue) {
        observedServiceValue = serviceSelect.value;
        loadAvailability(serviceSelect, slotsEl, slotOptionsEl, slotStatusEl, selectedSlotInput, statusEl, false);
      }
      syncSubmitButton();
    });

    window.addEventListener('checkauto:languagechange', function () {
      var preferredSlotId = selectedSlotInput.value;
      if (currentAvailabilitySlots.length) {
        renderSlots(
          slotsEl,
          slotOptionsEl,
          slotStatusEl,
          currentAvailabilitySlots,
          selectedSlotInput,
          preferredSlotId,
          false
        );
      }
      refreshVisibleMessages();
      syncSubmitButton();
    });

    [100, 500, 1500].forEach(function (delay) {
      setTimeout(function () {
        if (serviceWidget) serviceWidget.update();
        if (serviceSelect.value !== observedServiceValue) {
          observedServiceValue = serviceSelect.value;
          loadAvailability(serviceSelect, slotsEl, slotOptionsEl, slotStatusEl, selectedSlotInput, statusEl, false);
        }
        syncSubmitButton();
      }, delay);
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (isSubmitting) return;

      hasAttemptedSubmit = true;
      form.classList.add('was-validated');

      if (!validateForm(true, true)) {
        syncSubmitButton();
        return;
      }

      var idleLabel = submitLabel ? submitLabel.textContent : '';
      var formData = new FormData(form);
      var termsAccepted = formData.get('termsConsent') === 'on';
      var marketingAccepted = formData.get('marketingConsent') === 'on';
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
        termsAccepted: termsAccepted,
        termsTextVersion: TERMS_TEXT_VERSION,
        privacyAccepted: termsAccepted,
        privacyTextVersion: PRIVACY_TEXT_VERSION,
        marketingConsent: marketingAccepted,
        marketingConsentTextVersion: MARKETING_CONSENT_TEXT_VERSION
      };

      setFormStatus(statusEl, '', '', '');
      setBookingSubmitting(true, idleLabel);

      try {
        var response = await fetch(BOOKING_ENDPOINT, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });

        var responseBody = null;
        try {
          responseBody = await response.json();
        } catch (_) {
          responseBody = null;
        }

        if (!response.ok) {
          if (response.status === 429) throw new Error('rateLimited');
          if (response.status === 409) {
            var responseCode = responseBody && typeof responseBody.code === 'string'
              ? responseBody.code
              : '';
            var responseMessage = responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : '';
            throw new Error(
              responseCode === 'duplicate_booking_request' ||
              responseCode === 'duplicate_request' ||
              responseMessage === 'A booking request for this time was already submitted. Check your email for its reference.'
              ? 'duplicateRequest'
              : 'slotUnavailable'
            );
          }
          if (response.status >= 400 && response.status < 500) throw new Error('requestRejected');
          throw new Error('bookingError');
        }

        lastSuccessData = responseBody || {};
        form.reset();
        renderBookingSuccess(statusEl, lastSuccessData);
        setTimeout(function () {
          if (statusEl) statusEl.focus();
        }, 0);
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
        setFormStatus(statusEl, 'error', message(key), key);

        if (key === 'slotUnavailable') {
          await loadAvailability(
            serviceSelect,
            slotsEl,
            slotOptionsEl,
            slotStatusEl,
            selectedSlotInput,
            statusEl,
            true
          );
        }
      } finally {
        setBookingSubmitting(false, idleLabel);
      }
    });

    syncSubmitButton();
    loadAvailability(serviceSelect, slotsEl, slotOptionsEl, slotStatusEl, selectedSlotInput, statusEl, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBookingForm);
  } else {
    initBookingForm();
  }
})();
