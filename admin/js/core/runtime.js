/* ==========================================================================
   admin.js - CheckAuto admin app

   Static admin frontend. Data and mutations stay behind Supabase Auth,
   staff_profiles, and the admin-bookings Edge Function.
   ========================================================================== */

export function initAdminRuntime(pageController) {
  'use strict';

  var SUPABASE_URL = 'https://ddhhhieitupjixynjrry.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkaGhoaWVpdHVwaml4eW5qcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDAyOTQsImV4cCI6MjA5NzcxNjI5NH0.PXAxGc3TSFUnbcyWdizhkiJkKqJlqD1Ic8PHAjHSFIc';
  var ADMIN_ENDPOINT = SUPABASE_URL + '/functions/v1/admin-bookings';
  var ADMIN_BASE_PATH = (
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin/')
  ) ? '/admin' : '';
  function adminPath(path) {
    return ADMIN_BASE_PATH + path;
  }
  var PATHS = {
    dashboard: adminPath('/'),
    bookings: adminPath('/bookings/'),
    availability: adminPath('/availability/'),
    customers: adminPath('/customers/'),
    invoices: adminPath('/invoices/'),
    marketing: adminPath('/marketing/'),
    login: adminPath('/login/')
  };
  var SESSION_KEY = 'checkauto-admin-session';
  var DASHBOARD_CACHE_KEY = 'checkauto-admin-dashboard-cache';
  var DASHBOARD_CACHE_VERSION = 1;
  var DASHBOARD_CACHE_MAX_AGE_MS = 2 * 60 * 1000;
  var SESSION_REFRESH_MARGIN_MS = 60 * 1000;
  var TIME_ZONE = 'Europe/Vilnius';
  var DEFAULT_START_HOUR = 8;
  var DEFAULT_END_HOUR = 22;
  var HOUR_HEIGHT = 72;
  var SLOT_STEP_MINUTES = 15;

  var state = {
    page: '',
    session: null,
    staff: null,
    bookings: [],
    services: [],
    slots: [],
    staffList: [],
    events: [],
    notes: [],
    customers: [],
    invoices: [],
    customerEvents: [],
    marketingCampaigns: [],
    marketingRecipients: [],
    maintenancePreview: null,
    filter: 'pending',
    slotFilter: 'all',
    invoiceFilter: 'unpaid',
    bookingSort: 'asc',
    selectedBookingId: null,
    selectedSlotId: null,
    selectedCustomerId: null,
    selectedInvoiceId: null,
    selectedCampaignId: null,
    customerSearch: '',
    calendarView: 'week',
    calendarAnchor: '',
    previewEventId: null,
    realtimeSocket: null,
    realtimeHeartbeat: null,
    realtimeRefreshTimer: null,
    realtimeRef: 1,
    hasRendered: false,
    isRefreshing: false
  };

  var els = {};

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function partsToMap(parts) {
    return parts.reduce(function (map, part) {
      if (part.type !== 'literal') map[part.type] = part.value;
      return map;
    }, {});
  }

  function dateParts(value) {
    return partsToMap(new Intl.DateTimeFormat('lt-LT', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(value)));
  }

  function timeParts(value) {
    return partsToMap(new Intl.DateTimeFormat('lt-LT', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23'
    }).formatToParts(new Date(value)));
  }

  function dateTimeParts(value) {
    return partsToMap(new Intl.DateTimeFormat('lt-LT', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23'
    }).formatToParts(new Date(value)));
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatDate(value) {
    var parts = dateParts(value);
    return parts.year + '-' + parts.month + '-' + parts.day;
  }

  function formatTime(value) {
    var parts = timeParts(value);
    return parts.hour + ':' + parts.minute;
  }

  function formatDateTime(value) {
    if (!value) return 'Not provided';
    return formatDate(value) + ' ' + formatTime(value);
  }

  function formatRange(start, end) {
    if (!start || !end) return 'Not provided';
    if (formatDate(start) === formatDate(end)) {
      return formatDate(start) + ', ' + formatTime(start) + '-' + formatTime(end);
    }
    return formatDateTime(start) + ' - ' + formatDateTime(end);
  }

  function isValidYmd(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1]) &&
      date.getUTCMonth() === Number(match[2]) - 1 &&
      date.getUTCDate() === Number(match[3]);
  }

  function isValidHm(value) {
    var match = String(value || '').match(/^(\d{2}):(\d{2})$/);
    if (!match) return false;
    var hours = Number(match[1]);
    var minutes = Number(match[2]);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }

  function utcNoonFromYmd(value) {
    var parts = String(value).split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  }

  function ymdFromUtcDate(date) {
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
  }

  function addDaysYmd(value, days) {
    var date = utcNoonFromYmd(value);
    date.setUTCDate(date.getUTCDate() + days);
    return ymdFromUtcDate(date);
  }

  function startOfWeekYmd(value) {
    var date = utcNoonFromYmd(value);
    var day = date.getUTCDay();
    var mondayOffset = (day + 6) % 7;
    date.setUTCDate(date.getUTCDate() - mondayOffset);
    return ymdFromUtcDate(date);
  }

  function todayYmd() {
    return formatDate(new Date());
  }

  function compareYmd(a, b) {
    return String(a).localeCompare(String(b));
  }

  function timeToMinutes(value) {
    var parts = String(value || '').split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  function minutesToTime(minutes) {
    var normalized = Math.max(0, Math.min(23 * 60 + 45, minutes));
    return pad2(Math.floor(normalized / 60)) + ':' + pad2(normalized % 60);
  }

  function isoFromVilniusInput(dateValue, timeValue) {
    if (!isValidYmd(dateValue) || !isValidHm(timeValue)) {
      return null;
    }

    var datePartsRaw = dateValue.split('-').map(Number);
    var timePartsRaw = timeValue.split(':').map(Number);
    var utcGuess = Date.UTC(
      datePartsRaw[0],
      datePartsRaw[1] - 1,
      datePartsRaw[2],
      timePartsRaw[0],
      timePartsRaw[1]
    );
    var zonedParts = dateTimeParts(new Date(utcGuess).toISOString());
    var zonedTime = Date.UTC(
      Number(zonedParts.year),
      Number(zonedParts.month) - 1,
      Number(zonedParts.day),
      Number(zonedParts.hour),
      Number(zonedParts.minute)
    );
    return new Date(utcGuess - (zonedTime - utcGuess)).toISOString();
  }

  function dateInputValue(value) {
    return value ? formatDate(value) : todayYmd();
  }

  function timeInputValue(value) {
    return value ? formatTime(value) : '08:00';
  }

  function roundUpToStep(minutes, step) {
    return Math.ceil(minutes / step) * step;
  }

  function defaultSlotDateTime() {
    var now = dateTimeParts(new Date());
    var date = now.year + '-' + now.month + '-' + now.day;
    var minutes = Number(now.hour) * 60 + Number(now.minute) + 30;
    minutes = roundUpToStep(minutes, SLOT_STEP_MINUTES);

    if (minutes < DEFAULT_START_HOUR * 60) {
      minutes = DEFAULT_START_HOUR * 60;
    }

    if (minutes > DEFAULT_END_HOUR * 60) {
      date = addDaysYmd(date, 1);
      minutes = DEFAULT_START_HOUR * 60;
    }

    return { date: date, time: minutesToTime(minutes) };
  }

  function serviceById(id) {
    return state.services.find(function (service) { return service.id === id; }) || null;
  }

  function serviceByCode(code) {
    return state.services.find(function (service) { return service.code === code; }) || null;
  }

  function staffById(id) {
    return state.staffList.find(function (staff) { return staff.id === id; }) || null;
  }

  function customerById(id) {
    return state.customers.find(function (customer) { return customer.id === id; }) || null;
  }

  function customerForBooking(booking) {
    if (!booking || !booking.customer_id) return null;
    return customerById(booking.customer_id);
  }

  function invoicesForBooking(bookingId) {
    return state.invoices.filter(function (invoice) { return invoice.booking_id === bookingId; });
  }

  function activeInvoiceForBooking(bookingId) {
    return invoicesForBooking(bookingId).find(function (invoice) { return invoice.invoice_status !== 'void'; }) || null;
  }

  function invoicesForCustomer(customerId) {
    return state.invoices.filter(function (invoice) { return invoice.customer_id === customerId; });
  }

  function invoiceById(id) {
    return state.invoices.find(function (invoice) { return invoice.id === id; }) || null;
  }

  function bookingById(id) {
    return state.bookings.find(function (booking) { return booking.id === id; }) || null;
  }

  function slotById(id) {
    return state.slots.find(function (slot) { return slot.id === id; }) || null;
  }

  function campaignById(id) {
    return state.marketingCampaigns.find(function (campaign) { return campaign.id === id; }) || null;
  }

  function recipientsForCampaign(campaignId) {
    return state.marketingRecipients.filter(function (recipient) { return recipient.campaign_id === campaignId; });
  }

  function bookingsForCustomer(customerId) {
    return state.bookings.filter(function (booking) {
      return booking.customer_id === customerId && !booking.pii_redacted_at;
    });
  }

  function allBookingsForCustomer(customerId) {
    return state.bookings.filter(function (booking) {
      return booking.customer_id === customerId;
    });
  }

  function eventsForCustomer(customerId) {
    return state.customerEvents.filter(function (event) { return event.customer_id === customerId; });
  }

  function consentedCustomers() {
    return state.customers.filter(function (customer) {
      return customer.marketing_consent_status === 'opted_in' &&
        !customer.marketing_consent_withdrawn_at &&
        !customer.pii_redacted_at;
    });
  }

  function hasActiveLegalHold(record) {
    return Boolean(record && record.legal_hold_until && new Date(record.legal_hold_until) > new Date());
  }

  function customerRedactionBlockReasons(customer, bookings) {
    var reasons = [];
    if (hasActiveLegalHold(customer)) reasons.push('active legal hold');
    if (customer.marketing_consent_status === 'opted_in') reasons.push('active marketing consent');
    if (bookings.some(function (booking) { return ['pending', 'confirmed'].includes(booking.status); })) reasons.push('active booking');
    if (bookings.some(function (booking) { return hasActiveLegalHold(booking); })) reasons.push('booking legal hold');
    if (customer.pii_redacted_at) reasons.push('already redacted');
    return reasons;
  }

  function customerDeleteBlockReasons(customer, bookings) {
    var reasons = [];
    if (!customer.pii_redacted_at) reasons.push('redact profile first');
    if (hasActiveLegalHold(customer)) reasons.push('active legal hold');
    if (customer.marketing_consent_status === 'opted_in') reasons.push('active marketing consent');
    if (bookings.some(function (booking) { return ['pending', 'confirmed'].includes(booking.status); })) reasons.push('active booking');
    if (bookings.some(function (booking) { return hasActiveLegalHold(booking); })) reasons.push('booking legal hold');
    if (bookings.some(function (booking) { return !booking.pii_redacted_at; })) reasons.push('unredacted linked booking');
    return reasons;
  }

  function serviceNameById(id) {
    if (!id) return 'All inspection types';
    var service = serviceById(id);
    return service ? (service.name_en || service.name_lt) : 'Service';
  }

  function serviceNameForBooking(booking) {
    return serviceNameById(booking.service_id);
  }

  function statusLabel(status) {
    return {
      available: 'Available',
      pending: 'Pending',
      confirmed: 'Confirmed',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
      completed: 'Done',
      expired: 'Expired',
      open: 'Available',
      sent: 'Sent',
      failed: 'Failed',
      partial: 'Partial',
      sending: 'Sending'
    }[status] || status;
  }

  function statusTone(status) {
    if (status === 'available' || status === 'open') return 'available';
    if (status === 'pending') return 'pending';
    if (status === 'confirmed') return 'confirmed';
    if (status === 'completed') return 'completed';
    if (status === 'sent') return 'completed';
    if (status === 'failed') return 'pending';
    if (status === 'partial' || status === 'sending') return 'confirmed';
    return 'neutral';
  }

  function invoiceStatusLabel(invoice) {
    if (!invoice) return 'No invoice';
    if (invoice.invoice_status === 'void') return 'Void';
    return invoice.payment_status === 'paid' ? 'Paid' : 'Unpaid';
  }

  function invoiceTone(invoice) {
    if (!invoice) return 'available';
    if (invoice.invoice_status === 'void') return 'completed';
    return invoice.payment_status === 'paid' ? 'completed' : 'pending';
  }

  function paymentLabel(status) {
    return {
      unpaid: 'Unpaid',
      paid: 'Paid',
      invoice_unpaid: 'Invoice unpaid',
      invoice_paid: 'Invoice paid',
      not_required: 'Not required'
    }[status] || 'Unpaid';
  }

  function formatMoney(cents, currency) {
    return (currency || 'EUR') + ' ' + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function defaultInvoiceAmount(booking) {
    var service = booking && serviceById(booking.service_id);
    if (service && service.code === 'computer_diagnostics') return '20.00';
    if (service && service.code === 'full_inspection') return '100.00';
    return '100.00';
  }

  function defaultInvoiceDueDate() {
    return addDaysYmd(todayYmd(), 7);
  }

  function isScheduleStatus(status) {
    return ['pending', 'confirmed', 'completed'].includes(status);
  }

  function isActiveBookingStatus(status) {
    return ['pending', 'confirmed'].includes(status);
  }

  function getStoredSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function storeSession(session) {
    state.session = session;
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
      clearDashboardCache();
    }
  }

  function decodeJwtPayload(token) {
    try {
      var payload = String(token || '').split('.')[1];
      if (!payload) return null;
      var normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      normalized += '='.repeat((4 - normalized.length % 4) % 4);
      return JSON.parse(atob(normalized));
    } catch (error) {
      return null;
    }
  }

  function sessionUserId(session) {
    if (session && session.user && session.user.id) return session.user.id;
    var payload = decodeJwtPayload(session && session.access_token);
    return payload && payload.sub ? payload.sub : '';
  }

  function dashboardDataSnapshot() {
    return {
      staff: state.staff,
      bookings: state.bookings,
      services: state.services,
      slots: state.slots,
      staffList: state.staffList,
      events: state.events,
      notes: state.notes,
      customers: state.customers,
      invoices: state.invoices,
      customerEvents: state.customerEvents,
      marketingCampaigns: state.marketingCampaigns,
      marketingRecipients: state.marketingRecipients,
      maintenancePreview: state.maintenancePreview
    };
  }

  function clearDashboardCache() {
    try {
      sessionStorage.removeItem(DASHBOARD_CACHE_KEY);
    } catch (error) {
      // Browser storage may be unavailable in private or restricted contexts.
    }
  }

  function saveDashboardCache() {
    try {
      sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
        version: DASHBOARD_CACHE_VERSION,
        savedAt: Date.now(),
        userId: sessionUserId(state.session),
        data: dashboardDataSnapshot()
      }));
    } catch (error) {
      // Cache is an enhancement only.
    }
  }

  function applyDashboardData(data) {
    if (!data || typeof data !== 'object') return;
    if (data.staff) state.staff = data.staff;
    [
      'bookings',
      'services',
      'slots',
      'staffList',
      'events',
      'notes',
      'customers',
      'invoices',
      'customerEvents',
      'marketingCampaigns',
      'marketingRecipients'
    ].forEach(function (key) {
      if (Array.isArray(data[key])) state[key] = data[key];
    });
    if (Object.prototype.hasOwnProperty.call(data, 'maintenancePreview')) {
      state.maintenancePreview = data.maintenancePreview && typeof data.maintenancePreview === 'object' ? data.maintenancePreview : null;
    }
  }

  function restoreDashboardCache() {
    try {
      var cached = JSON.parse(sessionStorage.getItem(DASHBOARD_CACHE_KEY) || 'null');
      if (!cached || cached.version !== DASHBOARD_CACHE_VERSION || !cached.data) return false;
      if (Date.now() - Number(cached.savedAt || 0) > DASHBOARD_CACHE_MAX_AGE_MS) return false;
      var currentUserId = sessionUserId(state.session);
      if (cached.userId && currentUserId && cached.userId !== currentUserId) return false;
      applyDashboardData(cached.data);
      return Boolean(state.staff);
    } catch (error) {
      return false;
    }
  }

  function redirectTo(path) {
    if (window.location.pathname !== path) {
      window.location.replace(path);
    }
  }

  function isSessionExpired(session) {
    return Boolean(
      session &&
      session.expires_at &&
      Number(session.expires_at) * 1000 <= Date.now() + SESSION_REFRESH_MARGIN_MS
    );
  }

  async function refreshSession(session) {
    if (!session || !session.refresh_token) return null;

    var response = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });

    if (!response.ok) return null;
    return response.json();
  }

  async function getActiveSession() {
    var session = getStoredSession();
    if (!session || !session.access_token) return null;

    if (!isSessionExpired(session)) {
      state.session = session;
      return session;
    }

    try {
      var refreshed = await refreshSession(session);
      if (refreshed && refreshed.access_token) {
        storeSession(refreshed);
        return refreshed;
      }
    } catch (error) {
      // Fall through to clearing the unusable session.
    }

    storeSession(null);
    return null;
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + state.session.access_token
    };
  }

  async function login(email, password) {
    var response = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email: email, password: password })
    });

    if (!response.ok) {
      throw new Error('Sign in failed. Check your email and password.');
    }

    return response.json();
  }

  async function loadDashboard() {
    var response = await fetch(ADMIN_ENDPOINT + '?view=' + encodeURIComponent(adminViewForPage()), {
      method: 'GET',
      headers: authHeaders()
    });

    if (response.status === 401 || response.status === 403) {
      storeSession(null);
      throw new Error('This account is not approved for admin access or the session has expired.');
    }

    if (!response.ok) throw new Error('Could not load admin data.');

    applyDashboardData(await response.json());
    saveDashboardCache();
  }

  function adminViewForPage() {
    return {
      dashboard: 'schedule',
      availability: 'schedule',
      bookings: 'bookings',
      customers: 'customers',
      invoices: 'invoices',
      marketing: 'marketing'
    }[state.page] || 'all';
  }

  async function adminAction(payload) {
    var response = await fetch(ADMIN_ENDPOINT, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(data.error || 'The action could not be completed.');
    }
    return data;
  }

  function ensureToastRoot() {
    var root = $('[data-admin-toast-root]');
    if (!root) {
      root = document.createElement('div');
      root.className = 'admin-toast-root';
      root.setAttribute('data-admin-toast-root', '');
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(message, type) {
    var root = ensureToastRoot();
    var toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.dataset.type = type || 'info';
    toast.textContent = message;
    root.appendChild(toast);
    window.setTimeout(function () {
      toast.classList.add('is-leaving');
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
    }, 4200);
  }

  function scheduleRealtimeRefresh() {
    if (!state.session || !['dashboard', 'availability', 'bookings'].includes(state.page)) return;
    window.clearTimeout(state.realtimeRefreshTimer);
    state.realtimeRefreshTimer = window.setTimeout(function () {
      refresh().catch(function (error) {
        showToast(error instanceof Error ? error.message : 'Live refresh failed.', 'error');
      });
    }, 650);
  }

  function realtimeSend(topic, event, payload) {
    if (!state.realtimeSocket || state.realtimeSocket.readyState !== WebSocket.OPEN) return;
    state.realtimeRef += 1;
    state.realtimeSocket.send(JSON.stringify({
      topic: topic,
      event: event,
      payload: payload || {},
      ref: String(state.realtimeRef)
    }));
  }

  function closeRealtime() {
    if (state.realtimeHeartbeat) {
      window.clearInterval(state.realtimeHeartbeat);
      state.realtimeHeartbeat = null;
    }
    if (state.realtimeSocket) {
      state.realtimeSocket.onclose = null;
      state.realtimeSocket.close();
      state.realtimeSocket = null;
    }
  }

  function startRealtime() {
    if (!state.session || !state.staff || state.realtimeSocket) return;
    if (!('WebSocket' in window)) return;
    var socketUrl = SUPABASE_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(SUPABASE_ANON_KEY) + '&vsn=1.0.0';
    var topic = 'realtime:admin-schedule-' + state.staff.organization_id;
    var socket = new WebSocket(socketUrl);
    state.realtimeSocket = socket;

    socket.onopen = function () {
      realtimeSend(topic, 'phx_join', {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
          postgres_changes: [
            { event: '*', schema: 'public', table: 'availability_slots', filter: 'organization_id=eq.' + state.staff.organization_id },
            { event: '*', schema: 'public', table: 'bookings', filter: 'organization_id=eq.' + state.staff.organization_id }
          ]
        },
        access_token: state.session.access_token
      });
      state.realtimeHeartbeat = window.setInterval(function () {
        realtimeSend('phoenix', 'heartbeat', {});
      }, 25000);
    };

    socket.onmessage = function (event) {
      var message = {};
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.event === 'postgres_changes') {
        scheduleRealtimeRefresh();
      }
    };

    socket.onclose = function () {
      if (state.realtimeSocket === socket) state.realtimeSocket = null;
      if (state.realtimeHeartbeat) {
        window.clearInterval(state.realtimeHeartbeat);
        state.realtimeHeartbeat = null;
      }
      if (state.session && ['dashboard', 'availability', 'bookings'].includes(state.page)) {
        window.setTimeout(startRealtime, 10000);
      }
    };

    socket.onerror = function () {
      socket.close();
    };
  }

  function ensureModalRoot() {
    var root = $('[data-admin-modal-root]');
    if (!root) {
      root = document.createElement('div');
      root.className = 'admin-modal-root';
      root.setAttribute('data-admin-modal-root', '');
      root.hidden = true;
      document.body.appendChild(root);
    }
    return root;
  }

  function ensureConfirmRoot() {
    var root = $('[data-admin-confirm-root]');
    if (!root) {
      root = document.createElement('div');
      root.className = 'admin-modal-root admin-confirm-root';
      root.setAttribute('data-admin-confirm-root', '');
      root.hidden = true;
      document.body.appendChild(root);
    }
    return root;
  }

  function closeConfirmDialog() {
    var root = ensureConfirmRoot();
    root.hidden = true;
    root.innerHTML = '';
    if (ensureModalRoot().hidden) {
      document.body.classList.remove('admin-modal-open');
    }
  }

  function closeModal() {
    var root = ensureModalRoot();
    root.hidden = true;
    root.innerHTML = '';
    if (ensureConfirmRoot().hidden) {
      document.body.classList.remove('admin-modal-open');
    }
  }

  function modalRouteFromUrl() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('invoice')) return { type: 'invoice', id: params.get('invoice') };
    if (params.get('booking')) return { type: 'booking', id: params.get('booking') };
    if (params.get('customer')) return { type: 'customer', id: params.get('customer') };
    if (params.get('campaign')) return { type: 'campaign', id: params.get('campaign') };
    return null;
  }

  function modalUrl(route) {
    var url = new URL(window.location.href);
    ['customer', 'booking', 'invoice', 'campaign'].forEach(function (key) {
      url.searchParams.delete(key);
    });
    if (route && route.type && route.id) {
      url.searchParams.set(route.type, route.id);
    }
    return url.pathname + url.search + url.hash;
  }

  function modalHistoryDepth() {
    return Number(history.state && history.state.adminModalDepth || 0);
  }

  function modalHistoryState(route, depth) {
    return {
      checkautoAdmin: true,
      adminModalRoute: route || null,
      adminModalDepth: Math.max(0, Number(depth || 0))
    };
  }

  function replaceCurrentHistoryState() {
    var route = modalRouteFromUrl();
    var depth = history.state && history.state.checkautoAdmin ? modalHistoryDepth() : (route ? 1 : 0);
    history.replaceState(modalHistoryState(route, depth), '', window.location.href);
  }

  function syncSelectedModalState(route) {
    state.selectedBookingId = null;
    state.selectedCustomerId = null;
    state.selectedInvoiceId = null;
    state.selectedCampaignId = null;

    if (!route) return;
    if (route.type === 'booking') state.selectedBookingId = route.id;
    if (route.type === 'customer') state.selectedCustomerId = route.id;
    if (route.type === 'invoice') state.selectedInvoiceId = route.id;
    if (route.type === 'campaign') state.selectedCampaignId = route.id;
  }

  function renderModalRoute(route) {
    if (!route) {
      closeModal();
      return;
    }

    if (route.type === 'booking') {
      var booking = bookingById(route.id);
      if (booking) renderBookingModal(booking);
      else closeModal();
      return;
    }

    if (route.type === 'customer') {
      if (customerById(route.id)) renderCustomerModal(route.id);
      else closeModal();
      return;
    }

    if (route.type === 'invoice') {
      if (invoiceById(route.id)) renderInvoiceModal(route.id);
      else closeModal();
      return;
    }

    if (route.type === 'campaign') {
      if (campaignById(route.id)) renderCampaignModal(route.id);
      else closeModal();
    }
  }

  function renderModalFromCurrentUrl() {
    var route = modalRouteFromUrl();
    syncSelectedModalState(route);
    renderModalRoute(route);
  }

  function applyUrlModalState() {
    syncSelectedModalState(modalRouteFromUrl());
    renderPage();
    renderModalFromCurrentUrl();
  }

  function navigateToModal(type, id) {
    if (!type || !id) return;
    var route = { type: type, id: id };
    var current = modalRouteFromUrl();
    if (current && current.type === route.type && current.id === route.id) {
      renderModalRoute(route);
      return;
    }

    history.pushState(modalHistoryState(route, modalHistoryDepth() + 1), '', modalUrl(route));
    applyUrlModalState();
  }

  function closeModalRoute() {
    if (modalRouteFromUrl()) {
      history.replaceState(modalHistoryState(null, 0), '', modalUrl(null));
      syncSelectedModalState(null);
      closeModal();
      renderPage();
      return;
    }
    closeModal();
  }

  function openModal(html, size) {
    var root = ensureModalRoot();
    var route = modalRouteFromUrl();
    var canGoBack = Boolean(route && modalHistoryDepth() > 1);
    var navHtml = canGoBack
      ? '<div class="admin-modal-nav">' +
          '<button class="admin-button admin-button-secondary admin-modal-back" type="button" data-admin-modal-back>Back</button>' +
        '</div>'
      : '';

    root.hidden = false;
    root.innerHTML = '<div class="admin-modal-backdrop" data-admin-modal-close></div>' +
      '<section class="admin-modal-panel" data-size="' + escapeHtml(size || 'md') + '" role="dialog" aria-modal="true">' +
        navHtml +
        html +
      '</section>';
    document.body.classList.add('admin-modal-open');
    $all('[data-admin-modal-close]', root).forEach(function (item) {
      item.addEventListener('click', closeModalRoute);
    });
    var backButton = $('[data-admin-modal-back]', root);
    if (backButton) {
      backButton.addEventListener('click', function () {
        history.back();
      });
    }
    var firstInput = $('input, textarea, select, button', root);
    if (firstInput) firstInput.focus();
    return root;
  }

  function openConfirmDialog(options) {
    return new Promise(function (resolve) {
      var root = ensureConfirmRoot();
      root.hidden = false;
      root.innerHTML = '<div class="admin-modal-backdrop"></div>' +
        '<section class="admin-modal-panel admin-confirm-panel" data-size="sm" role="dialog" aria-modal="true">' +
          '<div class="admin-modal-header">' +
            '<div><span class="section-label">Confirm</span><h2>' + escapeHtml(options.title || 'Confirm action') + '</h2></div>' +
          '</div>' +
          '<p>' + escapeHtml(options.message || 'Continue?') + '</p>' +
          '<div class="admin-action-buttons admin-modal-actions">' +
            '<button class="admin-button admin-button-secondary" type="button" data-confirm-no>' + escapeHtml(options.cancelLabel || 'Cancel') + '</button>' +
            '<button class="admin-button ' + escapeHtml(options.danger ? 'admin-button-danger' : 'admin-button-primary') + '" type="button" data-confirm-yes>' + escapeHtml(options.confirmLabel || 'Continue') + '</button>' +
          '</div>' +
        '</section>';
      document.body.classList.add('admin-modal-open');

      function finish(value) {
        closeConfirmDialog();
        resolve(value);
      }

      $('[data-confirm-no]', root).addEventListener('click', function () { finish(false); });
      $('[data-confirm-yes]', root).addEventListener('click', function () { finish(true); });
      $('[data-confirm-no]', root).focus();
    });
  }

  function openSlotDeleteDialog(slot) {
    if (!slot || !slot.recurrence_series_id) {
      return openConfirmDialog(confirmOptionsForAction('deleteSlot')).then(function (confirmed) {
        return confirmed ? 'single' : null;
      });
    }

    return new Promise(function (resolve) {
      var root = ensureConfirmRoot();
      root.hidden = false;
      root.innerHTML = '<div class="admin-modal-backdrop"></div>' +
        '<section class="admin-modal-panel admin-confirm-panel" data-size="sm" role="dialog" aria-modal="true">' +
          '<div class="admin-modal-header">' +
            '<div><span class="section-label">Confirm</span><h2>Delete availability</h2></div>' +
          '</div>' +
          '<p>This slot is part of a weekly series.</p>' +
          '<div class="admin-action-buttons admin-modal-actions">' +
            '<button class="admin-button admin-button-secondary" type="button" data-confirm-no>Cancel</button>' +
            '<button class="admin-button admin-button-danger" type="button" data-confirm-single>Only this slot</button>' +
            '<button class="admin-button admin-button-danger" type="button" data-confirm-series>Whole series</button>' +
          '</div>' +
        '</section>';
      document.body.classList.add('admin-modal-open');

      function finish(value) {
        closeConfirmDialog();
        resolve(value);
      }

      $('[data-confirm-no]', root).addEventListener('click', function () { finish(null); });
      $('[data-confirm-single]', root).addEventListener('click', function () { finish('single'); });
      $('[data-confirm-series]', root).addEventListener('click', function () { finish('series'); });
      $('[data-confirm-no]', root).focus();
    });
  }

  function openMarketingSendConfirm(subject, body) {
    return new Promise(function (resolve) {
      var root = ensureConfirmRoot();
      root.hidden = false;
      root.innerHTML = '<div class="admin-modal-backdrop"></div>' +
        '<section class="admin-modal-panel admin-confirm-panel" data-size="lg" role="dialog" aria-modal="true">' +
          '<div class="admin-modal-header">' +
            '<div><span class="section-label">Confirm</span><h2>Send marketing email</h2></div>' +
          '</div>' +
          '<p>Send this email to every customer with active marketing consent?</p>' +
          '<div class="admin-email-preview admin-email-preview-modal"><iframe title="Marketing send preview" sandbox="" data-confirm-marketing-preview></iframe></div>' +
          '<div class="admin-action-buttons admin-modal-actions">' +
            '<button class="admin-button admin-button-secondary" type="button" data-confirm-no>Cancel</button>' +
            '<button class="admin-button admin-button-primary" type="button" data-confirm-yes>Send campaign</button>' +
          '</div>' +
        '</section>';
      document.body.classList.add('admin-modal-open');

      var frame = $('[data-confirm-marketing-preview]', root);
      if (frame) {
        frame.srcdoc = '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;color:#667085;padding:24px;">Loading preview...</body>';
        adminAction({
          action: 'previewMarketingEmail',
          marketingSubject: subject,
          marketingBody: body
        }).then(function (response) {
          frame.srcdoc = response.result && response.result.html ? response.result.html : '';
        }).catch(function (error) {
          frame.srcdoc = '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;color:#b42318;padding:24px;">' + escapeHtml(error instanceof Error ? error.message : 'Preview unavailable.') + '</body>';
        });
      }

      function finish(value) {
        closeConfirmDialog();
        resolve(value);
      }

      $('[data-confirm-no]', root).addEventListener('click', function () { finish(false); });
      $('[data-confirm-yes]', root).addEventListener('click', function () { finish(true); });
      $('[data-confirm-no]', root).focus();
    });
  }

  function confirmOptionsForAction(action) {
    return {
      confirmBooking: {
        title: 'Confirm booking',
        message: 'Confirm this booking and send the confirmation email?',
        confirmLabel: 'Confirm booking'
      },
      rejectBooking: {
        title: 'Reject booking',
        message: 'Reject this booking and email the customer?',
        confirmLabel: 'Reject booking',
        danger: true
      },
      cancelBooking: {
        title: 'Cancel booking',
        message: 'Cancel this booking and email the customer?',
        confirmLabel: 'Cancel booking',
        danger: true
      },
      completeBooking: {
        title: 'Mark done',
        message: 'Mark this booking as done?',
        confirmLabel: 'Mark done'
      },
      markCustomerErasureRequest: {
        title: 'Mark erasure request',
        message: 'Record that this customer requested erasure? This only records the request; retained invoice, legal-hold, or active operational records are not deleted.',
        confirmLabel: 'Mark request'
      },
      createAndSendInvoice: {
        title: 'Create and send invoice',
        message: 'Create an invoice PDF, send it to the customer, and mark it unpaid?',
        confirmLabel: 'Create invoice'
      },
      markBookingPaid: {
        title: 'Mark booking paid',
        message: 'Mark this Done booking as paid without creating an invoice?',
        confirmLabel: 'Mark paid'
      },
      markInvoicePaid: {
        title: 'Mark invoice paid',
        message: 'Mark this invoice as paid?',
        confirmLabel: 'Mark paid'
      },
      resendInvoice: {
        title: 'Resend invoice',
        message: 'Send this invoice PDF to the customer again?',
        confirmLabel: 'Resend invoice'
      },
      voidInvoice: {
        title: 'Void invoice',
        message: 'Void this invoice? The number and PDF stay retained and this cannot be undone.',
        confirmLabel: 'Void invoice',
        danger: true
      },
      deleteSlot: {
        title: 'Delete availability',
        message: 'Delete this availability slot entirely?',
        confirmLabel: 'Delete slot',
        danger: true
      },
      deleteSlotSeries: {
        title: 'Delete availability series',
        message: 'Delete every open slot in this weekly series?',
        confirmLabel: 'Delete series',
        danger: true
      },
      redactBookingPii: {
        title: 'Redact booking PII',
        message: 'Redact personal data from this booking? This cannot be undone.',
        confirmLabel: 'Redact booking',
        danger: true
      },
      redactCustomerPii: {
        title: 'Redact customer profile',
        message: 'Redact this customer profile? This cannot be undone.',
        confirmLabel: 'Redact customer',
        danger: true
      },
      deleteCustomerProfile: {
        title: 'Delete customer profile',
        message: 'Delete this redacted customer profile from the customer list? This cannot be undone.',
        confirmLabel: 'Delete profile',
        danger: true
      },
      sendMarketingCampaign: {
        title: 'Send marketing email',
        message: 'Send this email to every customer with active marketing consent?',
        confirmLabel: 'Send campaign'
      }
    }[action] || null;
  }

  function showConsole(options) {
    var wasHidden = Boolean(els.console && els.console.hidden);
    if (els.loading) els.loading.hidden = true;
    if (els.console) els.console.hidden = false;
    if (wasHidden && !(options && options.preserveScroll)) {
      window.scrollTo(0, 0);
    }
  }

  function setActiveNav() {
    $all('[data-admin-nav]').forEach(function (link) {
      link.classList.toggle('is-active', link.dataset.adminNav === state.page);
    });
  }

  function setUserLabel() {
    var target = $('[data-admin-user]');
    if (target && state.staff) {
      target.textContent = state.staff.display_name + ' - ' + state.staff.role;
    }
  }

  function renderStats() {
    if (!els.stats) return;
    var now = new Date();
    var today = todayYmd();
    var stalePending = state.bookings.filter(function (booking) {
      return booking.status === 'pending' && booking.pending_expires_at && new Date(booking.pending_expires_at) < now;
    }).length;
    var pending = state.bookings.filter(function (booking) {
      return booking.status === 'pending' && (!booking.pending_expires_at || new Date(booking.pending_expires_at) >= now);
    }).length;
    var confirmedToday = state.bookings.filter(function (booking) {
      var start = booking.final_start_at || booking.requested_start_at;
      return booking.status === 'confirmed' && start && formatDate(start) === today;
    }).length;
    var openNext7 = state.slots.filter(function (slot) {
      return slot.status === 'open' &&
        compareYmd(formatDate(slot.start_at), today) >= 0 &&
        compareYmd(formatDate(slot.start_at), addDaysYmd(today, 7)) < 0 &&
        !slotHasScheduleBooking(slot.id);
    }).length;

    els.stats.innerHTML =
      '<a class="admin-stat admin-stat-link" data-tone="' + (pending ? 'urgent' : 'neutral') + '" href="' + PATHS.bookings + '?filter=pending">' +
        '<span>Pending review</span><strong>' + pending + '</strong><em>' + (pending ? 'Open queue' : 'No waiting bookings') + '</em>' +
      '</a>' +
      '<a class="admin-stat admin-stat-link" data-tone="' + (confirmedToday ? 'active' : 'neutral') + '" href="' + PATHS.bookings + '?filter=confirmed">' +
        '<span>Confirmed today</span><strong>' + confirmedToday + '</strong><em>Today schedule</em>' +
      '</a>' +
      '<a class="admin-stat admin-stat-link" data-tone="' + (openNext7 ? 'available' : 'warning') + '" href="' + PATHS.availability + '">' +
        '<span>Open next 7 days</span><strong>' + openNext7 + '</strong><em>Manage availability</em>' +
      '</a>' +
      '<div class="admin-stat" data-tone="' + (stalePending ? 'warning' : 'neutral') + '">' +
        '<span>Cleanup health</span><strong>' + stalePending + '</strong><em>' + (stalePending ? 'Expired pending rows remain' : 'Expired pending cleanup clear') + '</em>' +
      '</div>';
  }

  function latestBookingsBySlot(predicate) {
    var map = {};
    state.bookings.slice().sort(function (a, b) {
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    }).forEach(function (booking) {
      if (predicate && !predicate(booking)) return;
      if (booking.availability_slot_id && !map[booking.availability_slot_id]) {
        map[booking.availability_slot_id] = booking;
      }
    });
    return map;
  }

  function slotHasActiveBooking(slotId) {
    return state.bookings.some(function (booking) {
      return booking.availability_slot_id === slotId && ['pending', 'confirmed'].includes(booking.status);
    });
  }

  function slotHasScheduleBooking(slotId) {
    return state.bookings.some(function (booking) {
      return booking.availability_slot_id === slotId && isScheduleStatus(booking.status);
    });
  }

  function buildCalendarEvents() {
    var bookingBySlot = latestBookingsBySlot(function (booking) {
      return isScheduleStatus(booking.status);
    });
    var events = [];

    state.slots.forEach(function (slot) {
      if (slot.status !== 'open') return;
      var booking = bookingBySlot[slot.id];
      if (booking) {
        events.push(calendarEventFromBooking(booking, slot));
        return;
      }

      events.push({
        id: 'slot:' + slot.id,
        type: 'slot',
        slotId: slot.id,
        status: 'available',
        start: slot.start_at,
        end: slot.end_at,
        title: serviceNameById(slot.service_id),
        meta: (staffById(slot.assigned_staff_id) || {}).display_name || 'Unassigned',
        href: PATHS.availability + '?slot=' + encodeURIComponent(slot.id)
      });
    });

    state.bookings.forEach(function (booking) {
      if (booking.availability_slot_id) return;
      if (!isScheduleStatus(booking.status)) return;
      events.push(calendarEventFromBooking(booking, null));
    });

    return events.sort(function (a, b) {
      return new Date(a.start) - new Date(b.start);
    });
  }

  function calendarEventFromBooking(booking, slot) {
    var start = booking.final_start_at || booking.requested_start_at || (slot && slot.start_at);
    var end = booking.final_end_at || booking.requested_end_at || (slot && slot.end_at);
    return {
      id: 'booking:' + booking.id,
      type: 'booking',
      bookingId: booking.id,
      slotId: booking.availability_slot_id || (slot && slot.id) || null,
      status: booking.status,
      start: start,
      end: end,
      title: booking.public_reference + ' - ' + booking.customer_name,
      meta: booking.vehicle || serviceNameForBooking(booking),
      href: PATHS.bookings + '?booking=' + encodeURIComponent(booking.id)
    };
  }

  function calendarRange() {
    if (state.calendarView === 'day') {
      return {
        start: state.calendarAnchor,
        endExclusive: addDaysYmd(state.calendarAnchor, 1),
        days: [state.calendarAnchor]
      };
    }

    var start = startOfWeekYmd(state.calendarAnchor);
    var days = [];
    for (var i = 0; i < 7; i += 1) days.push(addDaysYmd(start, i));
    return { start: start, endExclusive: addDaysYmd(start, 7), days: days };
  }

  function eventIsInRange(event, range) {
    var date = formatDate(event.start);
    return compareYmd(date, range.start) >= 0 && compareYmd(date, range.endExclusive) < 0;
  }

  function eventMinutes(value) {
    var parts = dateTimeParts(value);
    return Number(parts.hour) * 60 + Number(parts.minute);
  }

  function calendarHours(events) {
    var min = DEFAULT_START_HOUR;
    var max = DEFAULT_END_HOUR;

    events.forEach(function (event) {
      min = Math.min(min, Math.floor(eventMinutes(event.start) / 60));
      max = Math.max(max, Math.ceil(eventMinutes(event.end) / 60));
    });

    min = Math.max(0, min);
    max = Math.min(24, Math.max(min + 1, max));
    return { start: min, end: max };
  }

  function dayLabel(dateValue) {
    var weekday = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      weekday: 'short'
    }).format(utcNoonFromYmd(dateValue));
    return weekday + ' ' + dateValue.slice(5);
  }

  function renderDashboardPage() {
    els.stats = $('[data-admin-stats]');
    renderStats();
    renderCalendar();
  }

  function renderCalendar() {
    var calendar = $('[data-admin-calendar]');
    if (!calendar) return;

    var range = calendarRange();
    var events = buildCalendarEvents().filter(function (event) { return eventIsInRange(event, range); });
    var hours = calendarHours(events);
    var hourCount = hours.end - hours.start;
    var calendarTitle = $('[data-admin-calendar-title]');
    var dateInput = $('[data-calendar-date]');

    if (calendarTitle) {
      calendarTitle.textContent = state.calendarView === 'day'
        ? range.start
        : range.start + ' - ' + addDaysYmd(range.endExclusive, -1);
    }
    if (dateInput) dateInput.value = state.calendarAnchor;

    var legend = $('[data-admin-calendar-legend]');
    if (legend) {
      legend.innerHTML = [
        ['available', 'Available'],
        ['pending', 'Pending'],
        ['confirmed', 'Confirmed'],
        ['completed', 'Done']
      ].map(function (item) {
        return '<span data-tone="' + item[0] + '"><i></i>' + item[1] + '</span>';
      }).join('');
    }

    var byDay = {};
    range.days.forEach(function (day) { byDay[day] = []; });
    events.forEach(function (event) {
      var day = formatDate(event.start);
      if (byDay[day]) byDay[day].push(event);
    });

    calendar.innerHTML =
      '<div class="admin-calendar-scroll">' +
        '<div class="admin-calendar-grid" style="--day-count:' + range.days.length + ';--calendar-height:' + (hourCount * HOUR_HEIGHT) + 'px;">' +
          '<div class="admin-calendar-head">' +
            '<div class="admin-calendar-corner"></div>' +
            range.days.map(function (day) {
              return '<div class="admin-calendar-day-head" data-past="' + (compareYmd(day, todayYmd()) < 0 ? 'true' : 'false') + '">' + escapeHtml(dayLabel(day)) + '</div>';
            }).join('') +
          '</div>' +
          '<div class="admin-calendar-body">' +
            '<div class="admin-calendar-times">' + renderTimeRail(hours) + '</div>' +
            '<div class="admin-calendar-days">' + range.days.map(function (day) {
              return renderCalendarDay(day, byDay[day], hours);
            }).join('') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    $all('[data-calendar-event]').forEach(function (button) {
      button.addEventListener('click', function () {
        var event = events.find(function (item) { return item.id === button.dataset.calendarEvent; });
        if (!event) return;
        if (state.page === 'availability') {
          if (event.type === 'slot' && event.slotId) {
            selectSlotForEdit(event.slotId);
            return;
          }
          if (event.type === 'booking' && event.bookingId) {
            navigateToModal('booking', event.bookingId);
            return;
          }
        }
        state.previewEventId = button.dataset.calendarEvent;
        renderCalendarPreview(event);
      });
    });
  }

  function renderTimeRail(hours) {
    var html = '';
    for (var hour = hours.start; hour < hours.end; hour += 1) {
      html += '<div class="admin-calendar-time" style="height:' + HOUR_HEIGHT + 'px;">' + pad2(hour) + ':00</div>';
    }
    return html;
  }

  function renderCalendarDay(day, events, hours) {
    var lines = '';
    for (var hour = hours.start; hour < hours.end; hour += 1) {
      lines += '<div class="admin-calendar-line" style="height:' + HOUR_HEIGHT + 'px;"></div>';
    }

    return '<div class="admin-calendar-day" data-day="' + escapeHtml(day) + '" data-past="' + (compareYmd(day, todayYmd()) < 0 ? 'true' : 'false') + '">' +
      lines +
      events.map(function (event) { return renderCalendarEvent(event, hours); }).join('') +
    '</div>';
  }

  function renderCalendarEvent(event, hours) {
    var start = eventMinutes(event.start);
    var end = eventMinutes(event.end);
    var top = Math.max(0, start - hours.start * 60) / 60 * HOUR_HEIGHT;
    var height = Math.max(34, (Math.max(end, start + 15) - start) / 60 * HOUR_HEIGHT);
    var tone = statusTone(event.status);
    return '<button class="admin-calendar-event' + (event.slotId && event.slotId === state.selectedSlotId ? ' is-selected' : '') + (state.page === 'availability' && event.type === 'booking' ? ' is-readonly' : '') + '" type="button" data-tone="' + escapeHtml(tone) + '" data-calendar-event="' + escapeHtml(event.id) + '" style="top:' + top + 'px;height:' + height + 'px;">' +
      '<strong>' + escapeHtml(formatTime(event.start) + '-' + formatTime(event.end)) + '</strong>' +
      '<span>' + escapeHtml(event.title) + '</span>' +
      '<em>' + escapeHtml(statusLabel(event.status)) + '</em>' +
    '</button>';
  }

  function renderCalendarPreview(event) {
    var preview = $('[data-admin-preview]');
    if (!preview || !event) return;
    var isBooking = event.type === 'booking';
    var booking = isBooking ? state.bookings.find(function (item) { return item.id === event.bookingId; }) : null;
    var slot = event.slotId ? state.slots.find(function (item) { return item.id === event.slotId; }) : null;
    var rows = [
      ['Status', statusLabel(event.status)],
      ['Time', formatRange(event.start, event.end)],
      ['Service', isBooking && booking ? serviceNameForBooking(booking) : serviceNameById(slot && slot.service_id)],
      ['Assigned to', slot && slot.assigned_staff_id ? ((staffById(slot.assigned_staff_id) || {}).display_name || 'Assigned') : (booking && booking.assigned_to_staff_id ? ((staffById(booking.assigned_to_staff_id) || {}).display_name || 'Assigned') : 'Unassigned')]
    ];

    if (booking) {
      rows.push(['Customer', booking.customer_name]);
      rows.push(['Vehicle', booking.vehicle]);
    }

    preview.hidden = false;
    preview.innerHTML =
      '<div class="admin-preview-panel">' +
        '<button class="admin-preview-close" type="button" data-preview-close aria-label="Close preview">×</button>' +
        '<span class="admin-status-pill" data-status="' + escapeHtml(statusTone(event.status)) + '">' + escapeHtml(statusLabel(event.status)) + '</span>' +
        '<h2>' + escapeHtml(event.title) + '</h2>' +
        '<div class="admin-detail-list">' + rows.map(function (row) {
          return detailRow(row[0], row[1]);
        }).join('') + '</div>' +
        '<a class="admin-button admin-button-primary" href="' + escapeHtml(event.href) + '">' + (isBooking ? 'Open booking' : 'Manage availability') + '</a>' +
      '</div>';

    $('[data-preview-close]', preview).addEventListener('click', function () {
      preview.hidden = true;
      state.previewEventId = null;
    });
  }

  function bookingScheduleStart(booking) {
    return booking.final_start_at || booking.requested_start_at || booking.created_at || '';
  }

  function getFilteredBookings() {
    var bookings = state.bookings.slice();
    if (state.filter === 'today') {
      var today = todayYmd();
      bookings = bookings.filter(function (booking) {
        var start = bookingScheduleStart(booking);
        return start && ['pending', 'confirmed'].includes(booking.status) && formatDate(start) === today;
      });
    } else if (state.filter === 'completed') {
      bookings = bookings.filter(function (booking) { return booking.status === 'completed'; });
    } else if (state.filter !== 'all') {
      bookings = bookings.filter(function (booking) { return booking.status === state.filter; });
    }
    return bookings.sort(function (a, b) {
      var priority = { pending: 0, confirmed: 1, cancelled: 2, rejected: 3, expired: 4, completed: 5 };
      var direction = state.bookingSort === 'desc' ? -1 : 1;
      var dateCompare = (new Date(bookingScheduleStart(a)).getTime() || 0) - (new Date(bookingScheduleStart(b)).getTime() || 0);
      return (dateCompare * direction) ||
        ((priority[a.status] || 9) - (priority[b.status] || 9)) ||
        (new Date(b.created_at) - new Date(a.created_at));
    });
  }

  function renderBookingsPage() {
    els.bookingList = $('[data-admin-booking-list]');
    renderBookings();
  }

  function renderBookings() {
    var bookings = getFilteredBookings();
    if (!els.bookingList) return;

    if (!bookings.length) {
      els.bookingList.innerHTML = '<div class="admin-empty-state admin-empty-state-compact"><p>No bookings match this filter.</p></div>';
      return;
    }

    els.bookingList.innerHTML = bookings.map(function (booking) {
      var start = booking.final_start_at || booking.requested_start_at;
      var end = booking.final_end_at || booking.requested_end_at;
      return '<button class="admin-booking-item' + (booking.id === state.selectedBookingId ? ' is-selected' : '') + '" type="button" data-booking-id="' + escapeHtml(booking.id) + '">' +
        '<span class="admin-booking-item-header">' +
          '<span class="admin-booking-title">' + escapeHtml(booking.public_reference) + ' - ' + escapeHtml(booking.customer_name) + '</span>' +
          '<span class="admin-status-pill" data-status="' + escapeHtml(statusTone(booking.status)) + '">' + escapeHtml(statusLabel(booking.status)) + '</span>' +
        '</span>' +
        '<span class="admin-booking-meta">' + escapeHtml(serviceNameForBooking(booking)) + '</span>' +
        '<span class="admin-booking-meta">' + escapeHtml(formatRange(start, end)) + '</span>' +
        '<span class="admin-booking-meta">' + escapeHtml(booking.vehicle) + '</span>' +
      '</button>';
    }).join('');

    $all('[data-booking-id]', els.bookingList).forEach(function (button) {
      button.addEventListener('click', function () {
        state.selectedBookingId = button.dataset.bookingId;
        renderBookings();
        navigateToModal('booking', button.dataset.bookingId);
      });
    });
  }

  function detailRow(label, value) {
    return '<span><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(value || 'Not provided') + '</span>';
  }

  function renderBookingModal(booking) {
    var assigned = staffById(booking.assigned_to_staff_id);
    var requested = formatRange(booking.requested_start_at, booking.requested_end_at);
    var finalTime = booking.final_start_at ? formatRange(booking.final_start_at, booking.final_end_at) : 'Not confirmed yet';
    var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(booking.vehicle_location || '');
    var customer = customerForBooking(booking);

    var html =
      '<div class="admin-modal-header">' +
        '<div>' +
          '<span class="admin-status-pill" data-status="' + escapeHtml(statusTone(booking.status)) + '">' + escapeHtml(statusLabel(booking.status)) + '</span>' +
          '<h2>' + escapeHtml(booking.public_reference) + '</h2>' +
        '</div>' +
        '<button class="admin-preview-close" type="button" data-admin-modal-close aria-label="Close booking">×</button>' +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h3>Timing</h3>' +
        '<div class="admin-detail-list">' +
          detailRow('Service', serviceNameForBooking(booking)) +
          detailRow('Requested time', requested) +
          detailRow('Final time', finalTime) +
          detailRow('Assigned to', assigned ? assigned.display_name : 'Unassigned') +
          detailRow('Expires at', booking.pending_expires_at ? formatDateTime(booking.pending_expires_at) : '') +
        '</div>' +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h2>Customer</h2>' +
        '<div class="admin-detail-list">' +
          detailRow('Name', booking.customer_name) +
          detailRow('Email', booking.customer_email) +
          detailRow('Phone', booking.customer_phone) +
        '</div>' +
        '<div class="admin-quick-actions">' +
          '<a href="tel:' + escapeHtml(booking.customer_phone) + '">Call</a>' +
          '<a href="mailto:' + escapeHtml(booking.customer_email) + '">Email</a>' +
          (customer ? '<button class="admin-link-button" type="button" data-open-customer="' + escapeHtml(customer.id) + '">Open customer profile</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h2>Vehicle</h2>' +
        '<div class="admin-detail-list">' +
          detailRow('Vehicle', booking.vehicle) +
          detailRow('Location', booking.vehicle_location) +
          detailRow('Customer note', booking.customer_message) +
        '</div>' +
        '<div class="admin-quick-actions">' +
          '<a href="' + escapeHtml(mapsUrl) + '" target="_blank" rel="noopener noreferrer">Map</a>' +
          (booking.listing_url ? '<a href="' + escapeHtml(booking.listing_url) + '" target="_blank" rel="noopener noreferrer">Listing</a>' : '') +
        '</div>' +
      '</div>' +
      renderBookingInvoiceActions(booking) +
      renderRequestActions(booking);

    var modal = openModal(html, 'lg');

    $all('[data-admin-action-form]', modal).forEach(function (form) {
      form.addEventListener('submit', handleActionSubmit);
    });

    var completeButton = $('[data-complete-booking]', modal);
    if (completeButton) {
      completeButton.addEventListener('click', async function () {
        await runAction({ action: 'completeBooking', bookingId: completeButton.dataset.completeBooking }, 'completeBooking', completeButton);
      });
    }

    var customerButton = $('[data-open-customer]', modal);
    if (customerButton) {
      customerButton.addEventListener('click', function () {
        navigateToModal('customer', customerButton.dataset.openCustomer);
      });
    }

    var invoiceButton = $('[data-open-invoice]', modal);
    if (invoiceButton) {
      invoiceButton.addEventListener('click', function () {
        navigateToModal('invoice', invoiceButton.dataset.openInvoice);
      });
    }
  }

  function hiddenInput(name, value) {
    return '<input type="hidden" name="' + escapeHtml(name) + '" value="' + escapeHtml(value || '') + '">';
  }

  function renderInlineActionForm(action, label, buttonClass, fields, disabled, title) {
    var inputs = Object.keys(fields).map(function (name) {
      return hiddenInput(name, fields[name]);
    }).join('');
    return '<form class="admin-inline-action-form" data-admin-action-form data-action="' + escapeHtml(action) + '">' +
      inputs +
      '<button class="admin-button ' + escapeHtml(buttonClass) + '" type="submit"' + (disabled ? ' disabled' : '') + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + escapeHtml(label) + '</button>' +
      '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
    '</form>';
  }

  function renderSetHoldForm(customer, holdDefaultDate) {
    return '<form class="admin-action-form admin-privacy-form" data-admin-action-form data-action="setCustomerLegalHold">' +
      hiddenInput('customerId', customer.id) +
      '<div class="admin-action-grid">' +
        '<label>Hold until date<input name="holdUntilDate" type="text" inputmode="numeric" required value="' + escapeHtml(holdDefaultDate) + '" placeholder="2026-12-31"></label>' +
        '<label>Hold until time<input name="holdUntilTime" type="text" inputmode="numeric" required value="23:59" placeholder="23:59"></label>' +
      '</div>' +
      '<label>Reason<textarea name="legalHoldReason" maxlength="500" required placeholder="Required legal or dispute reason"></textarea></label>' +
      '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
      '<div class="admin-action-buttons"><button class="admin-button admin-button-secondary" type="submit">Set legal hold</button></div>' +
    '</form>';
  }

  function renderReleaseHoldForm(customer) {
    return '<form class="admin-action-form admin-privacy-form" data-admin-action-form data-action="releaseCustomerLegalHold">' +
      hiddenInput('customerId', customer.id) +
      '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
      '<div class="admin-action-buttons"><button class="admin-button admin-button-secondary" type="submit">Release legal hold</button></div>' +
    '</form>';
  }

  function paymentMethodOptions(selected) {
    return [
      ['cash', 'Cash'],
      ['bank_transfer', 'Bank transfer'],
      ['card', 'Card'],
      ['other', 'Other']
    ].map(function (item) {
      return '<option value="' + item[0] + '"' + (item[0] === selected ? ' selected' : '') + '>' + item[1] + '</option>';
    }).join('');
  }

  function renderCreateInvoiceForm(booking) {
    return '<form class="admin-action-form" data-admin-action-form data-action="createAndSendInvoice">' +
      hiddenInput('bookingId', booking.id) +
      '<div class="admin-action-grid">' +
        '<label>Amount<input name="amount" type="text" inputmode="decimal" required value="' + escapeHtml(defaultInvoiceAmount(booking)) + '" placeholder="100.00"></label>' +
        '<label>Due date<input name="dueDate" type="text" inputmode="numeric" required value="' + escapeHtml(defaultInvoiceDueDate()) + '" placeholder="2026-12-31"></label>' +
      '</div>' +
      '<div class="admin-action-grid">' +
        '<label>VAT<span class="admin-select-wrap"><select name="vatMode"><option value="none">No VAT</option><option value="included">VAT included</option></select></span></label>' +
        '<label>VAT rate %<input name="vatRate" type="text" inputmode="decimal" value="21" placeholder="21"></label>' +
      '</div>' +
      '<label>Service description<input name="serviceDescription" type="text" maxlength="300" value="' + escapeHtml(serviceNameForBooking(booking)) + '"></label>' +
      '<label>Billing details<textarea name="billingDetails" maxlength="1000" placeholder="Optional billing address, company code, VAT code..."></textarea></label>' +
      '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
      '<div class="admin-action-buttons"><button class="admin-button admin-button-primary" type="submit">Create and send invoice</button></div>' +
    '</form>';
  }

  function renderMarkBookingPaidForm(booking) {
    return '<form class="admin-action-form" data-admin-action-form data-action="markBookingPaid">' +
      hiddenInput('bookingId', booking.id) +
      '<div class="admin-action-grid">' +
        '<label>Payment method<span class="admin-select-wrap"><select name="paymentMethod">' + paymentMethodOptions('cash') + '</select></span></label>' +
        '<label>Payment note<input name="paymentNote" type="text" maxlength="500" placeholder="Optional"></label>' +
      '</div>' +
      '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
      '<div class="admin-action-buttons"><button class="admin-button admin-button-secondary" type="submit">Mark paid without invoice</button></div>' +
    '</form>';
  }

  function renderBookingInvoiceActions(booking) {
    if (booking.status !== 'completed') return '';
    var invoice = activeInvoiceForBooking(booking.id);

    if (invoice) {
      return '<div class="admin-detail-section">' +
        '<h2>Invoice and payment</h2>' +
        '<div class="admin-detail-list">' +
          detailRow('Invoice', invoice.invoice_number) +
          detailRow('Invoice status', invoiceStatusLabel(invoice)) +
          detailRow('Amount', formatMoney(invoice.amount_cents, invoice.currency)) +
          detailRow('Email status', invoice.email_status || 'not_sent') +
        '</div>' +
        '<div class="admin-action-buttons">' +
          '<button class="admin-button admin-button-secondary" type="button" data-open-invoice="' + escapeHtml(invoice.id) + '">Open invoice</button>' +
        '</div>' +
      '</div>';
    }

    if (booking.payment_status === 'paid') {
      return '<div class="admin-detail-section">' +
        '<h2>Invoice and payment</h2>' +
        '<div class="admin-detail-list">' +
          detailRow('Payment', paymentLabel(booking.payment_status)) +
          detailRow('Paid at', booking.paid_at ? formatDateTime(booking.paid_at) : '') +
          detailRow('Method', booking.payment_method) +
          detailRow('Note', booking.payment_note) +
        '</div>' +
      '</div>';
    }

    return '<div class="admin-detail-section">' +
      '<h2>Invoice and payment</h2>' +
      '<p class="admin-detail-note">Create an invoice only when needed. If the customer paid cash and no invoice is needed, mark this booking paid without invoice.</p>' +
      renderCreateInvoiceForm(booking) +
      renderMarkBookingPaidForm(booking) +
    '</div>';
  }

  function renderRequestActions(booking) {
    if (booking.status === 'pending') {
      return '<div class="admin-detail-section">' +
        '<h2>Confirmation</h2>' +
        '<form class="admin-action-form" data-admin-action-form data-action="confirmBooking">' +
          '<input type="hidden" name="bookingId" value="' + escapeHtml(booking.id) + '">' +
          '<div class="admin-action-grid">' +
            '<label>Date<input name="date" type="text" inputmode="numeric" required value="' + escapeHtml(dateInputValue(booking.requested_start_at)) + '" placeholder="2026-12-31"></label>' +
            '<label>Start<span class="admin-select-wrap"><select name="startTime" required>' + timeOptions(timeInputValue(booking.requested_start_at)) + '</select></span></label>' +
            '<label>End<span class="admin-select-wrap"><select name="endTime" required>' + timeOptions(timeInputValue(booking.requested_end_at)) + '</select></span></label>' +
          '</div>' +
          '<label>Assign to<span class="admin-select-wrap"><select name="assignedStaffId" required>' + staffOptions(booking.assigned_to_staff_id || (state.staff && state.staff.id)) + '</select></span></label>' +
          '<label>Internal note<textarea name="internalNote" maxlength="1000"></textarea></label>' +
          '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
          '<div class="admin-action-buttons"><button class="admin-button admin-button-primary" type="submit">Confirm booking</button></div>' +
        '</form>' +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h2>Rejection</h2>' +
        '<form class="admin-action-form" data-admin-action-form data-action="rejectBooking">' +
          '<input type="hidden" name="bookingId" value="' + escapeHtml(booking.id) + '">' +
          '<label>Customer-visible reason<textarea name="customerReason" maxlength="700"></textarea></label>' +
          '<label>Internal note<textarea name="internalNote" maxlength="1000"></textarea></label>' +
          '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
          '<div class="admin-action-buttons"><button class="admin-button admin-button-danger" type="submit">Reject booking</button></div>' +
        '</form>' +
      '</div>';
    }

    if (booking.status === 'confirmed') {
      return '<div class="admin-detail-section">' +
        '<h2>Actions</h2>' +
        '<form class="admin-action-form" data-admin-action-form data-action="cancelBooking">' +
          '<input type="hidden" name="bookingId" value="' + escapeHtml(booking.id) + '">' +
          '<label>Customer-visible cancellation reason<textarea name="customerReason" maxlength="700"></textarea></label>' +
          '<label>Internal note<textarea name="internalNote" maxlength="1000"></textarea></label>' +
          '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
          '<div class="admin-action-buttons">' +
            '<button class="admin-button admin-button-danger" type="submit">Cancel booking</button>' +
            '<button class="admin-button admin-button-primary" type="button" data-complete-booking="' + escapeHtml(booking.id) + '">Mark completed</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    }

    return '';
  }

  function normalizeSearch(value) {
    return String(value || '').toLowerCase().trim();
  }

  function customerSearchText(customer) {
    var bookings = bookingsForCustomer(customer.id);
    var invoices = invoicesForCustomer(customer.id);
    return [
      customer.id,
      customer.display_name,
      customer.email,
      customer.phone,
      customer.preferred_language,
      customer.marketing_consent_status,
      customer.marketing_consent_source,
      customer.marketing_consent_text_version,
      customer.legal_hold_reason,
      customer.pii_redacted_at ? 'redacted' : '',
      customer.erasure_requested_at ? 'erasure requested' : '',
      bookings.map(function (booking) {
        return [
          booking.public_reference,
          booking.status,
          booking.customer_name,
          booking.customer_email,
          booking.customer_phone,
          booking.vehicle,
          booking.vehicle_location,
          booking.listing_url,
          booking.customer_message,
          serviceNameForBooking(booking)
        ].join(' ');
      }).join(' '),
      invoices.map(function (invoice) {
        return [invoice.invoice_number, invoice.invoice_status, invoice.currency, invoice.amount_cents].join(' ');
      }).join(' ')
    ].join(' ').toLowerCase();
  }

  function getFilteredCustomers() {
    var query = normalizeSearch(state.customerSearch);
    var customers = state.customers.slice();
    if (query) {
      var parts = query.split(/\s+/).filter(Boolean);
      customers = customers.filter(function (customer) {
        var text = customerSearchText(customer);
        return parts.every(function (part) { return text.indexOf(part) !== -1; });
      });
    }
    return customers.sort(function (a, b) {
      return String(a.display_name || '').localeCompare(String(b.display_name || ''));
    });
  }

  function renderCustomersPage() {
    var search = $('[data-customer-search]');
    if (search && search.value !== state.customerSearch) search.value = state.customerSearch;
    renderCustomerList();
  }

  function renderCustomerList() {
    var list = $('[data-customer-list]');
    if (!list) return;
    var customers = getFilteredCustomers();
    var count = $('[data-customer-count]');
    if (count) count.textContent = customers.length + ' customers';

    if (!customers.length) {
      list.innerHTML = '<div class="admin-empty-state admin-empty-state-compact"><p>No customers match this search.</p></div>';
      return;
    }

    list.innerHTML = customers.map(function (customer) {
      var bookings = bookingsForCustomer(customer.id);
      var invoices = invoicesForCustomer(customer.id);
      return '<button class="admin-customer-item' + (customer.id === state.selectedCustomerId ? ' is-selected' : '') + '" type="button" data-customer-id="' + escapeHtml(customer.id) + '">' +
        '<span class="admin-booking-item-header">' +
          '<span class="admin-booking-title">' + escapeHtml(customer.display_name) + '</span>' +
          '<span class="admin-status-pill" data-status="' + escapeHtml(marketingTone(customer.marketing_consent_status)) + '">' + escapeHtml(marketingLabel(customer.marketing_consent_status)) + '</span>' +
        '</span>' +
        '<span class="admin-booking-meta">' + escapeHtml(customer.email) + (customer.phone ? ' - ' + escapeHtml(customer.phone) : '') + '</span>' +
        '<span class="admin-booking-meta">' + bookings.length + ' bookings - ' + invoices.length + ' invoices</span>' +
      '</button>';
    }).join('');

    $all('[data-customer-id]', list).forEach(function (button) {
      button.addEventListener('click', function () {
        navigateToModal('customer', button.dataset.customerId);
      });
    });
  }

  function marketingTone(status) {
    if (status === 'opted_in') return 'confirmed';
    if (status === 'withdrawn' || status === 'suppressed') return 'completed';
    return 'available';
  }

  function marketingLabel(status) {
    return {
      opted_in: 'Marketing on',
      withdrawn: 'Withdrawn',
      suppressed: 'Suppressed',
      not_asked: 'No consent'
    }[status] || 'No consent';
  }

  function renderCustomerModal(customerId) {
    var customer = customerById(customerId);
    if (!customer) return;
    state.selectedCustomerId = customer.id;

    var bookings = bookingsForCustomer(customer.id).sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    var linkedBookings = allBookingsForCustomer(customer.id);
    var invoices = invoicesForCustomer(customer.id);
    var events = eventsForCustomer(customer.id).slice(0, 8);
    var holdActive = hasActiveLegalHold(customer);
    var redactionBlockReasons = customerRedactionBlockReasons(customer, bookings);
    var redactionDisabled = redactionBlockReasons.length > 0;
    var redactionBlockText = redactionDisabled ? 'Blocked: ' + redactionBlockReasons.join(', ') + '.' : '';
    var deleteBlockReasons = customerDeleteBlockReasons(customer, linkedBookings);
    var deleteDisabled = deleteBlockReasons.length > 0;
    var deleteBlockText = deleteDisabled ? 'Blocked: ' + deleteBlockReasons.join(', ') + '.' : '';
    var erasureRequestDisabled = Boolean(customer.erasure_requested_at);
    var erasureRequestTitle = erasureRequestDisabled ? 'Erasure request already recorded.' : '';

    var html =
      '<div class="admin-modal-header" data-customer-modal="' + escapeHtml(customer.id) + '">' +
        '<div>' +
          '<span class="admin-status-pill" data-status="' + escapeHtml(marketingTone(customer.marketing_consent_status)) + '">' + escapeHtml(marketingLabel(customer.marketing_consent_status)) + '</span>' +
          '<h2>' + escapeHtml(customer.display_name) + '</h2>' +
        '</div>' +
        '<button class="admin-preview-close" type="button" data-admin-modal-close aria-label="Close customer">×</button>' +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h3>Contact</h3>' +
        '<div class="admin-detail-list">' +
          detailRow('Email', customer.email) +
          detailRow('Phone', customer.phone) +
          detailRow('Language', customer.preferred_language) +
          detailRow('Last booking', customer.last_booking_at ? formatDateTime(customer.last_booking_at) : '') +
          detailRow('Last invoice', customer.last_invoice_at ? formatDateTime(customer.last_invoice_at) : '') +
        '</div>' +
        '<div class="admin-quick-actions">' +
          '<a href="mailto:' + escapeHtml(customer.email) + '">Email</a>' +
          (customer.phone ? '<a href="tel:' + escapeHtml(customer.phone) + '">Call</a>' : '') +
        '</div>' +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h2>Bookings</h2>' +
        renderCustomerBookings(bookings) +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h2>Invoices</h2>' +
        renderCustomerInvoices(invoices) +
      '</div>' +
      '<details class="admin-detail-section admin-disclosure">' +
        '<summary>Privacy, consent, and legal controls</summary>' +
        '<div class="admin-detail-list">' +
          detailRow('Marketing consent', marketingLabel(customer.marketing_consent_status)) +
          detailRow('Consent at', customer.marketing_consent_at ? formatDateTime(customer.marketing_consent_at) : '') +
          detailRow('Consent source', customer.marketing_consent_source) +
          detailRow('Consent version', customer.marketing_consent_text_version) +
          detailRow('Re-permission due', customer.marketing_repermission_due_at ? formatDateTime(customer.marketing_repermission_due_at) : '') +
          detailRow('Legal hold until', customer.legal_hold_until ? formatDateTime(customer.legal_hold_until) : 'None') +
          detailRow('Legal hold review', customer.legal_hold_review_at ? formatDateTime(customer.legal_hold_review_at) : 'Not scheduled') +
          detailRow('Erasure request', customer.erasure_requested_at ? formatDateTime(customer.erasure_requested_at) : 'None') +
          detailRow('Erasure completed', customer.erasure_completed_at ? formatDateTime(customer.erasure_completed_at) : 'Not completed') +
          detailRow('Redacted at', customer.pii_redacted_at ? formatDateTime(customer.pii_redacted_at) : 'Not redacted') +
        '</div>' +
        '<p class="admin-detail-note">Redacting the customer profile also redacts linked non-active bookings. Invoice records stay retained.</p>' +
        '<p class="admin-detail-note">Deleting removes a redacted profile and linked non-active bookings after legal-hold, marketing, and active-booking checks pass.</p>' +
        (redactionDisabled ? '<p class="admin-detail-note admin-detail-note-warning">' + escapeHtml(redactionBlockText) + '</p>' : '') +
        (deleteDisabled ? '<p class="admin-detail-note admin-detail-note-warning">' + escapeHtml(deleteBlockText) + '</p>' : '') +
        (holdActive ? renderReleaseHoldForm(customer) : renderSetHoldForm(customer, addDaysYmd(todayYmd(), 180))) +
        '<div class="admin-action-buttons admin-privacy-buttons">' +
          renderInlineActionForm('markCustomerErasureRequest', 'Mark erasure request', 'admin-button-secondary', { customerId: customer.id }, erasureRequestDisabled, erasureRequestTitle) +
          (customer.marketing_consent_status === 'opted_in'
            ? renderInlineActionForm('withdrawCustomerMarketingConsent', 'Withdraw marketing consent', 'admin-button-secondary', { customerId: customer.id })
            : '') +
          renderInlineActionForm('redactCustomerPii', 'Redact customer profile', 'admin-button-danger', { customerId: customer.id }, redactionDisabled, redactionBlockText) +
          renderInlineActionForm('deleteCustomerProfile', 'Delete customer profile', 'admin-button-danger', { customerId: customer.id }, deleteDisabled, deleteBlockText) +
        '</div>' +
        '<div class="admin-detail-section">' +
          '<h3>Customer events</h3>' +
          renderCustomerEvents(events) +
        '</div>' +
      '</details>';

    var modal = openModal(html, 'lg');
    renderCustomerList();

    $all('[data-admin-action-form]', modal).forEach(function (form) {
      form.addEventListener('submit', handleActionSubmit);
    });
    $all('[data-open-booking]', modal).forEach(function (button) {
      button.addEventListener('click', function () {
        navigateToModal('booking', button.dataset.openBooking);
      });
    });
    $all('[data-open-invoice]', modal).forEach(function (button) {
      button.addEventListener('click', function () {
        navigateToModal('invoice', button.dataset.openInvoice);
      });
    });
  }

  function renderCustomerBookings(bookings) {
    if (!bookings.length) return '<p>No bookings linked to this customer.</p>';
    return '<div class="admin-mini-list">' + bookings.map(function (booking) {
      var start = booking.final_start_at || booking.requested_start_at;
      var end = booking.final_end_at || booking.requested_end_at;
      var invoice = activeInvoiceForBooking(booking.id);
      return '<button class="admin-mini-item" type="button" data-open-booking="' + escapeHtml(booking.id) + '">' +
        '<span><strong>' + escapeHtml(booking.public_reference) + '</strong> ' + escapeHtml(statusLabel(booking.status)) + '</span>' +
        '<span>' + escapeHtml(formatRange(start, end)) + '</span>' +
        '<span>' + escapeHtml(booking.vehicle || 'No vehicle') + '</span>' +
        '<span>' + escapeHtml(paymentLabel(booking.payment_status)) + ' - ' + escapeHtml(invoiceStatusLabel(invoice)) + '</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  function renderCustomerInvoices(invoices) {
    if (!invoices.length) return '<p>No invoices linked to this customer.</p>';
    return '<div class="admin-mini-list">' + invoices.map(function (invoice) {
      return '<button class="admin-mini-item" type="button" data-open-invoice="' + escapeHtml(invoice.id) + '">' +
        '<span><strong>' + escapeHtml(invoice.invoice_number) + '</strong> ' + escapeHtml(invoiceStatusLabel(invoice)) + '</span>' +
        '<span>' + escapeHtml(invoice.issued_at ? formatDateTime(invoice.issued_at) : 'Not issued') + '</span>' +
        '<span>' + escapeHtml(formatMoney(invoice.amount_cents, invoice.currency)) + '</span>' +
        '<span>Email: ' + escapeHtml(invoice.email_status || 'not_sent') + '</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  function renderCustomerEvents(events) {
    if (!events.length) return '<p>No customer events yet.</p>';
    return '<div class="admin-mini-list">' + events.map(function (event) {
      return '<div class="admin-mini-item">' +
        '<span><strong>' + escapeHtml(event.event_type) + '</strong></span>' +
        '<span>' + escapeHtml(formatDateTime(event.created_at)) + '</span>' +
        '<span>' + escapeHtml(event.message || '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function invoiceSearchText(invoice) {
    var customer = customerById(invoice.customer_id);
    var booking = bookingById(invoice.booking_id);
    return [
      invoice.invoice_number,
      invoice.invoice_status,
      invoice.payment_status,
      invoice.email_status,
      invoice.customer_name,
      invoice.customer_email,
      invoice.service_description,
      invoice.amount_cents,
      customer && customer.display_name,
      booking && booking.public_reference,
      booking && booking.vehicle
    ].join(' ').toLowerCase();
  }

  function filteredInvoices() {
    var invoices = state.invoices.slice().sort(function (a, b) {
      return new Date(b.issued_at || b.created_at) - new Date(a.issued_at || a.created_at);
    });
    if (state.invoiceFilter === 'unpaid') {
      invoices = invoices.filter(function (invoice) {
        return invoice.invoice_status === 'issued' && invoice.payment_status !== 'paid';
      });
    } else if (state.invoiceFilter === 'paid') {
      invoices = invoices.filter(function (invoice) {
        return invoice.invoice_status === 'issued' && invoice.payment_status === 'paid';
      });
    } else if (state.invoiceFilter === 'void') {
      invoices = invoices.filter(function (invoice) { return invoice.invoice_status === 'void'; });
    }
    return invoices;
  }

  function renderInvoicesPage() {
    renderInvoiceList();
  }

  function renderInvoiceList() {
    var list = $('[data-invoice-list]');
    if (!list) return;
    var invoices = filteredInvoices();
    if (!invoices.length) {
      list.innerHTML = '<div class="admin-empty-state admin-empty-state-compact"><p>No invoices match this filter.</p></div>';
      return;
    }

    list.innerHTML = invoices.map(function (invoice) {
      var booking = bookingById(invoice.booking_id);
      var customer = customerById(invoice.customer_id);
      return '<button class="admin-booking-item' + (invoice.id === state.selectedInvoiceId ? ' is-selected' : '') + '" type="button" data-invoice-id="' + escapeHtml(invoice.id) + '">' +
        '<span class="admin-booking-item-header">' +
          '<span class="admin-booking-title">' + escapeHtml(invoice.invoice_number) + ' - ' + escapeHtml(customer ? customer.display_name : invoice.customer_name) + '</span>' +
          '<span class="admin-status-pill" data-status="' + escapeHtml(invoiceTone(invoice)) + '">' + escapeHtml(invoiceStatusLabel(invoice)) + '</span>' +
        '</span>' +
        '<span class="admin-booking-meta">' + escapeHtml(booking ? booking.public_reference : 'No booking') + ' - ' + escapeHtml(invoice.issued_at ? formatDateTime(invoice.issued_at) : 'Not issued') + '</span>' +
        '<span class="admin-booking-meta">' + escapeHtml(formatMoney(invoice.amount_cents, invoice.currency)) + ' - due ' + escapeHtml(invoice.due_date || 'not set') + '</span>' +
        '<span class="admin-booking-meta">Email: ' + escapeHtml(invoice.email_status || 'not_sent') + '</span>' +
      '</button>';
    }).join('');

    $all('[data-invoice-id]', list).forEach(function (button) {
      button.addEventListener('click', function () {
        navigateToModal('invoice', button.dataset.invoiceId);
      });
    });
  }

  function renderMarkInvoicePaidForm(invoice) {
    return '<form class="admin-action-form" data-admin-action-form data-action="markInvoicePaid">' +
      hiddenInput('invoiceId', invoice.id) +
      '<div class="admin-action-grid">' +
        '<label>Payment method<span class="admin-select-wrap"><select name="paymentMethod">' + paymentMethodOptions('bank_transfer') + '</select></span></label>' +
        '<label>Payment note<input name="paymentNote" type="text" maxlength="500" placeholder="Optional"></label>' +
      '</div>' +
      '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
      '<div class="admin-action-buttons"><button class="admin-button admin-button-primary" type="submit">Mark invoice paid</button></div>' +
    '</form>';
  }

  function renderVoidInvoiceForm(invoice) {
    if (invoice.invoice_status === 'void') return '';
    return '<form class="admin-action-form" data-admin-action-form data-action="voidInvoice">' +
      hiddenInput('invoiceId', invoice.id) +
      '<label>Void reason<textarea name="voidReason" maxlength="700" required placeholder="Required reason"></textarea></label>' +
      '<div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>' +
      '<div class="admin-action-buttons"><button class="admin-button admin-button-danger" type="submit">Void invoice</button></div>' +
    '</form>';
  }

  function renderInvoiceModal(invoiceId) {
    var invoice = invoiceById(invoiceId);
    if (!invoice) return;
    state.selectedInvoiceId = invoice.id;
    var booking = bookingById(invoice.booking_id);
    var customer = customerById(invoice.customer_id);
    var html =
      '<div class="admin-modal-header">' +
        '<div>' +
          '<span class="admin-status-pill" data-status="' + escapeHtml(invoiceTone(invoice)) + '">' + escapeHtml(invoiceStatusLabel(invoice)) + '</span>' +
          '<h2>' + escapeHtml(invoice.invoice_number) + '</h2>' +
        '</div>' +
        '<button class="admin-preview-close" type="button" data-admin-modal-close aria-label="Close invoice">×</button>' +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h3>Invoice summary</h3>' +
        '<div class="admin-detail-list">' +
          detailRow('Status', invoice.invoice_status) +
          detailRow('Payment', invoiceStatusLabel(invoice)) +
          detailRow('Issued at', invoice.issued_at ? formatDateTime(invoice.issued_at) : '') +
          detailRow('Due date', invoice.due_date) +
          detailRow('Amount', formatMoney(invoice.amount_cents, invoice.currency)) +
          detailRow('VAT', formatMoney(invoice.tax_cents, invoice.currency)) +
          detailRow('Email status', invoice.email_status) +
          detailRow('Last sent', invoice.last_sent_at ? formatDateTime(invoice.last_sent_at) : '') +
          detailRow('Retention until', invoice.retention_hold_until) +
        '</div>' +
        (invoice.last_email_error ? '<p class="admin-detail-note admin-detail-note-warning">' + escapeHtml(invoice.last_email_error) + '</p>' : '') +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h3>Customer and booking</h3>' +
        '<div class="admin-detail-list">' +
          detailRow('Customer', customer ? customer.display_name : invoice.customer_name) +
          detailRow('Email', invoice.customer_email) +
          detailRow('Phone', invoice.customer_phone) +
          detailRow('Booking', booking ? booking.public_reference : '') +
          detailRow('Service', invoice.service_description) +
        '</div>' +
        '<div class="admin-action-buttons">' +
          (customer ? '<button class="admin-button admin-button-secondary" type="button" data-open-customer="' + escapeHtml(customer.id) + '">Open customer</button>' : '') +
          (booking ? '<button class="admin-button admin-button-secondary" type="button" data-open-booking="' + escapeHtml(booking.id) + '">Open booking</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="admin-detail-section">' +
        '<h3>PDF and actions</h3>' +
        '<div class="admin-action-buttons">' +
          (invoice.pdf_path ? '<button class="admin-button admin-button-secondary" type="button" data-view-invoice-pdf="' + escapeHtml(invoice.id) + '">View PDF</button>' : '') +
          (invoice.invoice_status === 'issued' ? '<button class="admin-button admin-button-secondary" type="button" data-resend-invoice="' + escapeHtml(invoice.id) + '">Resend invoice</button>' : '') +
        '</div>' +
        (invoice.invoice_status === 'issued' && invoice.payment_status !== 'paid' ? renderMarkInvoicePaidForm(invoice) : '') +
        renderVoidInvoiceForm(invoice) +
      '</div>';

    var modal = openModal(html, 'lg');
    renderInvoiceList();

    $all('[data-admin-action-form]', modal).forEach(function (form) {
      form.addEventListener('submit', handleActionSubmit);
    });
    var customerButton = $('[data-open-customer]', modal);
    if (customerButton) {
      customerButton.addEventListener('click', function () {
        navigateToModal('customer', customerButton.dataset.openCustomer);
      });
    }
    var bookingButton = $('[data-open-booking]', modal);
    if (bookingButton) {
      bookingButton.addEventListener('click', function () {
        navigateToModal('booking', bookingButton.dataset.openBooking);
      });
    }
    var resendButton = $('[data-resend-invoice]', modal);
    if (resendButton) {
      resendButton.addEventListener('click', function () {
        runAction({ action: 'resendInvoice', invoiceId: resendButton.dataset.resendInvoice }, 'resendInvoice', resendButton);
      });
    }
    var pdfButton = $('[data-view-invoice-pdf]', modal);
    if (pdfButton) {
      pdfButton.addEventListener('click', async function () {
        var pdfWindow = window.open('about:blank', '_blank');
        if (pdfWindow) {
          pdfWindow.opener = null;
          pdfWindow.document.title = 'Loading invoice PDF...';
        }

        try {
          setButtonBusy(pdfButton, true, busyLabelForAction('getInvoicePdfUrl'));
          var data = await adminAction({ action: 'getInvoicePdfUrl', invoiceId: pdfButton.dataset.viewInvoicePdf });
          if (data.result && data.result.url) {
            if (pdfWindow) {
              pdfWindow.location.href = data.result.url;
            } else {
              window.location.href = data.result.url;
            }
          } else if (pdfWindow) {
            pdfWindow.close();
          }
        } catch (error) {
          if (pdfWindow) pdfWindow.close();
          showToast(error instanceof Error ? error.message : 'Could not open invoice PDF.', 'error');
        } finally {
          if (document.body.contains(pdfButton)) setButtonBusy(pdfButton, false);
        }
      });
    }
  }

  function recipientStatusText(recipient) {
    return [
      recipient.status || 'unknown',
      recipient.sent_at ? formatDateTime(recipient.sent_at) : '',
      recipient.error_message ? recipient.error_message : ''
    ].filter(Boolean).join(' - ');
  }

  function renderCampaignModal(campaignId) {
    var campaign = campaignById(campaignId);
    if (!campaign) return;
    var recipients = recipientsForCampaign(campaign.id);
    var modal = openModal(
      '<div class="admin-modal-header">' +
        '<div>' +
          '<span class="admin-status-pill" data-status="' + escapeHtml(statusTone(campaign.status)) + '">' + escapeHtml(statusLabel(campaign.status || 'sent')) + '</span>' +
          '<h2>' + escapeHtml(campaign.subject) + '</h2>' +
        '</div>' +
        '<button class="admin-preview-close" type="button" data-admin-modal-close aria-label="Close campaign">×</button>' +
      '</div>' +
      '<div class="admin-campaign-layout">' +
        '<section class="admin-detail-section">' +
          '<h3>Summary</h3>' +
          '<div class="admin-detail-list">' +
            detailRow('Created', formatDateTime(campaign.created_at)) +
            detailRow('Sent', campaign.sent_at ? formatDateTime(campaign.sent_at) : '') +
            detailRow('Recipients', Number(campaign.audience_count || 0) + ' total') +
            detailRow('Delivery', Number(campaign.sent_count || 0) + ' sent / ' + Number(campaign.failed_count || 0) + ' failed') +
          '</div>' +
        '</section>' +
        '<details class="admin-detail-section admin-disclosure">' +
          '<summary>Recipients (' + recipients.length + ')</summary>' +
          '<div class="admin-mini-list admin-recipient-list">' +
            (recipients.length ? recipients.map(function (recipient) {
              return '<div class="admin-mini-item">' +
                '<span><strong>' + escapeHtml(recipient.recipient_email) + '</strong></span>' +
                '<span>' + escapeHtml(recipientStatusText(recipient)) + '</span>' +
              '</div>';
            }).join('') : '<div class="admin-empty-state admin-empty-state-compact"><p>No recipient records found for this campaign.</p></div>') +
          '</div>' +
        '</details>' +
        '<section class="admin-detail-section admin-field-wide">' +
          '<h3>Email preview</h3>' +
          '<div class="admin-email-preview admin-email-preview-modal"><iframe title="Campaign email preview" sandbox="" data-campaign-preview></iframe></div>' +
        '</section>' +
      '</div>',
      'lg'
    );

    var frame = $('[data-campaign-preview]', modal);
    if (frame) {
      frame.srcdoc = '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;color:#667085;padding:24px;">Loading preview...</body>';
      adminAction({
        action: 'previewMarketingEmail',
        marketingSubject: campaign.subject,
        marketingBody: campaign.body_text || ''
      }).then(function (response) {
        frame.srcdoc = response.result && response.result.html ? response.result.html : '';
      }).catch(function (error) {
        frame.srcdoc = '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;color:#b42318;padding:24px;">' + escapeHtml(error instanceof Error ? error.message : 'Preview unavailable.') + '</body>';
      });
    }
  }

  function renderMarketingPage() {
    var count = $('[data-marketing-audience-count]');
    var customers = consentedCustomers();
    if (count) count.textContent = customers.length + ' recipients';

    var campaigns = $('[data-marketing-campaigns]');
    if (campaigns) {
      campaigns.innerHTML = state.marketingCampaigns.length
        ? state.marketingCampaigns.map(function (campaign) {
          return '<button class="admin-mini-item admin-mini-button' + (campaign.id === state.selectedCampaignId ? ' is-selected' : '') + '" type="button" data-campaign-id="' + escapeHtml(campaign.id) + '">' +
            '<span><strong>' + escapeHtml(campaign.subject) + '</strong> ' + escapeHtml(statusLabel(campaign.status)) + '</span>' +
            '<span>' + escapeHtml(formatDateTime(campaign.created_at)) + '</span>' +
            '<span>' + Number(campaign.sent_count || 0) + ' sent / ' + Number(campaign.failed_count || 0) + ' failed / ' + Number(campaign.audience_count || 0) + ' total</span>' +
          '</button>';
        }).join('')
        : '<div class="admin-empty-state admin-empty-state-compact"><p>No marketing campaigns have been sent yet.</p></div>';

      $all('[data-campaign-id]', campaigns).forEach(function (button) {
        button.addEventListener('click', function () {
          navigateToModal('campaign', button.dataset.campaignId);
        });
      });
    }

    var form = $('[data-marketing-form]');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', handleActionSubmit);
    }
  }

  function staffOptions(selectedId) {
    return state.staffList.filter(function (staff) { return staff.is_active; }).map(function (staff) {
      return '<option value="' + escapeHtml(staff.id) + '"' + (staff.id === selectedId ? ' selected' : '') + '>' + escapeHtml(staff.display_name) + '</option>';
    }).join('');
  }

  function timeOptions(selectedTime, dateValue, disablePastStarts) {
    var selected = selectedTime || '08:00';
    var nowIso = new Date().toISOString();
    var html = '';

    for (var minutes = 0; minutes < 24 * 60; minutes += SLOT_STEP_MINUTES) {
      var value = minutesToTime(minutes);
      var disabled = false;
      if (disablePastStarts && dateValue && isValidYmd(dateValue)) {
        var iso = isoFromVilniusInput(dateValue, value);
        disabled = Boolean(iso && new Date(iso) <= new Date(nowIso));
      }
      if (disabled && disablePastStarts) continue;
      html += '<option value="' + value + '"' + (value === selected ? ' selected' : '') + (disabled ? ' disabled' : '') + '>' + value + '</option>';
    }

    return html;
  }

  function endTimeOptions(selectedTime, startTime) {
    var selected = selectedTime || minutesToTime(timeToMinutes(startTime) + selectedServiceDuration());
    var startMinutes = timeToMinutes(startTime);
    var html = '';
    for (var minutes = 0; minutes < 24 * 60; minutes += SLOT_STEP_MINUTES) {
      if (minutes <= startMinutes) continue;
      var value = minutesToTime(minutes);
      html += '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>' + value + '</option>';
    }
    return html;
  }

  function validateDateTimePair(dateValue, startTime, endTime) {
    if (!isValidYmd(dateValue)) {
      return { error: 'Use the date format YYYY-MM-DD.' };
    }

    var startAt = isoFromVilniusInput(dateValue, startTime);
    var endAt = isoFromVilniusInput(dateValue, endTime);
    if (!startAt || !endAt) {
      return { error: 'Choose a valid start and end time.' };
    }
    if (new Date(endAt) <= new Date(startAt)) {
      return { error: 'End time must be after start time.' };
    }
    if (new Date(startAt) <= new Date()) {
      return { error: 'Start time must be in the future.' };
    }
    return { startAt: startAt, endAt: endAt };
  }

  function busyLabelForAction(action) {
    return {
      confirmBooking: 'Confirming...',
      rejectBooking: 'Rejecting...',
      cancelBooking: 'Cancelling...',
      completeBooking: 'Marking...',
      createAndSendInvoice: 'Creating...',
      markBookingPaid: 'Saving...',
      markInvoicePaid: 'Saving...',
      resendInvoice: 'Sending...',
      voidInvoice: 'Voiding...',
      deleteSlot: 'Deleting...',
      deleteSlotSeries: 'Deleting...',
      updateSlot: 'Saving...',
      createSlot: 'Creating...',
      setCustomerLegalHold: 'Saving...',
      releaseCustomerLegalHold: 'Saving...',
      markCustomerErasureRequest: 'Saving...',
      withdrawCustomerMarketingConsent: 'Saving...',
      redactBookingPii: 'Redacting...',
      redactCustomerPii: 'Redacting...',
      deleteCustomerProfile: 'Deleting...',
      sendMarketingCampaign: 'Sending...',
      getInvoicePdfUrl: 'Opening...'
    }[action] || 'Working...';
  }

  function setButtonBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.busyOriginalText) {
        button.dataset.busyOriginalText = button.textContent;
        button.dataset.busyOriginalDisabled = button.disabled ? 'true' : 'false';
        button.dataset.busyOriginalAriaLabel = button.getAttribute('aria-label') || '';
      }
      button.disabled = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
      button.setAttribute('aria-label', label || 'Working...');
      return;
    }

    if (button.dataset.busyOriginalText) {
      button.textContent = button.dataset.busyOriginalText;
      button.disabled = button.dataset.busyOriginalDisabled === 'true';
      if (button.dataset.busyOriginalAriaLabel) {
        button.setAttribute('aria-label', button.dataset.busyOriginalAriaLabel);
      } else {
        button.removeAttribute('aria-label');
      }
      delete button.dataset.busyOriginalText;
      delete button.dataset.busyOriginalDisabled;
      delete button.dataset.busyOriginalAriaLabel;
    } else {
      button.disabled = false;
    }
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
  }

  function setFormBusy(form, busy, label) {
    if (!form) return;
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
    form.classList.toggle('is-busy', busy);
    if (busy) {
      $all('button[type="submit"]', form).forEach(function (button) {
        setButtonBusy(button, true, label);
      });
    }
    $all('button, input, select, textarea', form).forEach(function (control) {
      if (control.matches && control.matches('button[type="submit"]')) return;
      if (busy) {
        if (!control.dataset.busyOriginalDisabled) {
          control.dataset.busyOriginalDisabled = control.disabled ? 'true' : 'false';
        }
        control.disabled = true;
      } else if (control.dataset.busyOriginalDisabled) {
        control.disabled = control.dataset.busyOriginalDisabled === 'true';
        delete control.dataset.busyOriginalDisabled;
      }
    });
    if (!busy) {
      $all('button[type="submit"]', form).forEach(function (button) {
        setButtonBusy(button, false);
      });
    }
  }

  function setSyncState(label, tone) {
    var target = $('[data-admin-sync-state]');
    if (!target) return;
    target.textContent = label;
    target.dataset.state = tone || 'synced';
  }

  async function runAction(payload, confirmAction, trigger, options) {
    var opts = options || {};
    try {
      var confirmOptions = confirmOptionsForAction(confirmAction || payload.action);
      if (confirmOptions && !opts.skipConfirm) {
        var confirmed = await openConfirmDialog(confirmOptions);
        if (!confirmed) return;
      }
      setButtonBusy(trigger, true, busyLabelForAction(confirmAction || payload.action));
      setSyncState('Saving', 'loading');
      await adminAction(payload);
      await refresh({ preserveScroll: true });
      if (payload.invoiceId && invoiceById(payload.invoiceId)) navigateToModal('invoice', payload.invoiceId);
      if (payload.bookingId && bookingById(payload.bookingId)) navigateToModal('booking', payload.bookingId);
      showToast('Action completed.', 'success');
    } catch (error) {
      setSyncState('Action failed', 'error');
      showToast(error instanceof Error ? error.message : 'The action could not be completed.', 'error');
    } finally {
      if (trigger && document.body.contains(trigger)) {
        setButtonBusy(trigger, false);
      }
    }
  }

  async function deleteSlotWithChoice(slotId, trigger) {
    var slot = slotById(slotId);
    var scope = await openSlotDeleteDialog(slot);
    if (!scope) return;
    var action = scope === 'series' ? 'deleteSlotSeries' : 'deleteSlot';
    await runAction({ action: action, slotId: slotId }, action, trigger, { skipConfirm: true });
  }

  async function handleActionSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var action = form.dataset.action;
    var errorEl = $('[data-action-error]', form);
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('is-success');
    }

    var payload = {
      action: action,
      bookingId: data.get('bookingId'),
      customerId: data.get('customerId'),
      invoiceId: data.get('invoiceId'),
      assignedStaffId: data.get('assignedStaffId') || null,
      customerReason: data.get('customerReason') || null,
      internalNote: data.get('internalNote') || null,
      legalHoldReason: data.get('legalHoldReason') || null,
      paymentMethod: data.get('paymentMethod') || null,
      paymentNote: data.get('paymentNote') || null,
      voidReason: data.get('voidReason') || null
    };

    if (action === 'confirmBooking') {
      var validation = validateDateTimePair(String(data.get('date') || ''), String(data.get('startTime') || ''), String(data.get('endTime') || ''));
      if (validation.error) {
        if (errorEl) errorEl.textContent = validation.error;
        return;
      }
      payload.startAt = validation.startAt;
      payload.endAt = validation.endAt;
    }

    if (action === 'setCustomerLegalHold') {
      var holdDate = String(data.get('holdUntilDate') || '');
      var holdTime = String(data.get('holdUntilTime') || '');
      var holdUntil = isoFromVilniusInput(holdDate, holdTime);
      if (!holdUntil || new Date(holdUntil) <= new Date()) {
        if (errorEl) errorEl.textContent = 'Use a future legal hold date and time in YYYY-MM-DD and HH:mm format.';
        return;
      }
      if (!String(data.get('legalHoldReason') || '').trim()) {
        if (errorEl) errorEl.textContent = 'Legal hold reason is required.';
        return;
      }
      payload.holdUntil = holdUntil;
    }

    if (action === 'sendMarketingCampaign') {
      payload.marketingSubject = data.get('marketingSubject') || null;
      payload.marketingBody = data.get('marketingBody') || null;
      if (!String(payload.marketingSubject || '').trim() || !String(payload.marketingBody || '').trim()) {
        if (errorEl) errorEl.textContent = 'Subject and message are required.';
        return;
      }
    }

    if (action === 'createAndSendInvoice') {
      var amount = String(data.get('amount') || '').replace(',', '.').trim();
      var dueDate = String(data.get('dueDate') || '').trim();
      if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
        if (errorEl) errorEl.textContent = 'Use a valid amount, for example 100.00.';
        return;
      }
      if (!isValidYmd(dueDate) || compareYmd(dueDate, todayYmd()) < 0) {
        if (errorEl) errorEl.textContent = 'Use a due date in YYYY-MM-DD format. It cannot be in the past.';
        return;
      }
      if (String(data.get('vatMode') || '') === 'included' && !/^\d+(\.\d{1,2})?$/.test(String(data.get('vatRate') || '').replace(',', '.').trim())) {
        if (errorEl) errorEl.textContent = 'Use a valid VAT rate.';
        return;
      }
      payload.amount = amount;
      payload.dueDate = dueDate;
      payload.vatMode = data.get('vatMode') || 'none';
      payload.vatRate = data.get('vatRate') || null;
      payload.serviceDescription = data.get('serviceDescription') || null;
      payload.billingDetails = data.get('billingDetails') || null;
    }

    if (action === 'voidInvoice' && !String(data.get('voidReason') || '').trim()) {
      if (errorEl) errorEl.textContent = 'Void reason is required.';
      return;
    }

    if (action === 'sendMarketingCampaign') {
      var marketingConfirmed = await openMarketingSendConfirm(String(payload.marketingSubject || ''), String(payload.marketingBody || ''));
      if (!marketingConfirmed) return;
    } else {
      var confirmOptions = confirmOptionsForAction(action);
      if (confirmOptions) {
        var confirmed = await openConfirmDialog(confirmOptions);
        if (!confirmed) return;
      }
    }

    try {
      setFormBusy(form, true, busyLabelForAction(action));
      setSyncState('Saving', 'loading');
      var response = await adminAction(payload);
      if (action === 'deleteCustomerProfile') {
        state.selectedCustomerId = null;
        history.replaceState(modalHistoryState(null, 0), '', modalUrl(null));
      }
      await refresh({ preserveScroll: true });
      if (action === 'createAndSendInvoice' && response.result && response.result.id) {
        navigateToModal('invoice', response.result.id);
      } else if (action === 'deleteCustomerProfile') {
        closeModal();
        showToast('Customer profile deleted.', 'success');
        return;
      } else if (payload.invoiceId && invoiceById(payload.invoiceId)) {
        navigateToModal('invoice', payload.invoiceId);
      } else if (payload.bookingId && bookingById(payload.bookingId)) {
        navigateToModal('booking', payload.bookingId);
      } else if (payload.customerId && customerById(payload.customerId)) {
        navigateToModal('customer', payload.customerId);
      }
      showToast('Action completed.', 'success');
    } catch (error) {
      setSyncState('Action failed', 'error');
      if (errorEl && document.body.contains(errorEl)) {
        errorEl.textContent = error instanceof Error ? error.message : 'The action could not be completed.';
      } else {
        showToast(error instanceof Error ? error.message : 'The action could not be completed.', 'error');
      }
    } finally {
      if (document.body.contains(form)) {
        setFormBusy(form, false);
      }
    }
  }

  function renderAvailabilityPage() {
    renderAvailabilityOptions();
    syncSlotFormFromSelection();
    renderCalendar();
  }

  function selectedSlotHasActiveBooking(slotId) {
    return state.bookings.some(function (booking) {
      return booking.availability_slot_id === slotId && ['pending', 'confirmed'].includes(booking.status);
    });
  }

  function setRepeatControlsEnabled(enabled) {
    var form = $('[data-admin-slot-form]');
    if (!form) return;
    var repeatToggle = $('[data-admin-repeat-toggle]', form);
    var repeatWeeks = $('[data-admin-repeat-weeks]', form);
    var repeatWrap = $('[data-admin-repeat-weeks-wrap]', form);
    if (repeatWeeks) repeatWeeks.disabled = !enabled || !(repeatToggle && repeatToggle.checked);
    if (repeatWrap) repeatWrap.classList.toggle('is-disabled', !enabled || !(repeatToggle && repeatToggle.checked));
    if (repeatToggle) repeatToggle.disabled = !enabled;
  }

  function resetSlotForm() {
    var form = $('[data-admin-slot-form]');
    if (!form) return;
    state.selectedSlotId = null;
    history.replaceState(modalHistoryState(null, 0), '', PATHS.availability);
    form.reset();
    var slotId = $('[data-admin-slot-id]', form);
    if (slotId) slotId.value = '';
    var defaults = defaultSlotDateTime();
    var dateInput = $('[data-admin-slot-date]', form);
    var startSelect = $('[data-admin-slot-start]', form);
    if (dateInput) dateInput.value = defaults.date;
    if (startSelect) startSelect.dataset.pendingDefault = defaults.time;
    renderAvailabilityOptions();
    syncSlotFormFromSelection();
    renderCalendar();
  }

  function selectSlotForEdit(slotId) {
    var slot = slotById(slotId);
    if (!slot || selectedSlotHasActiveBooking(slotId)) return;
    state.selectedSlotId = slotId;
    state.calendarAnchor = formatDate(slot.start_at);
    history.replaceState(modalHistoryState(null, 0), '', PATHS.availability + '?slot=' + encodeURIComponent(slotId));
    renderAvailabilityPage();
  }

  function syncSlotFormFromSelection() {
    var form = $('[data-admin-slot-form]');
    if (!form) return;
    var slot = state.selectedSlotId ? slotById(state.selectedSlotId) : null;
    if (slot && selectedSlotHasActiveBooking(slot.id)) slot = null;
    if (!slot && state.selectedSlotId) {
      state.selectedSlotId = null;
      history.replaceState(modalHistoryState(null, 0), '', PATHS.availability);
    }

    var title = $('[data-admin-slot-form-title]');
    var note = $('[data-admin-slot-mode-note]');
    var slotId = $('[data-admin-slot-id]', form);
    var serviceSelect = $('[data-admin-slot-service]', form);
    var staffSelect = $('[data-admin-slot-staff]', form);
    var dateInput = $('[data-admin-slot-date]', form);
    var startSelect = $('[data-admin-slot-start]', form);
    var endSelect = $('[data-admin-slot-end]', form);
    var internalNote = $('[name="internalNote"]', form);
    var submit = $('[data-admin-slot-submit]', form);
    var reset = $('[data-admin-slot-reset]', form);
    var del = $('[data-admin-slot-delete]', form);
    var repeatToggle = $('[data-admin-repeat-toggle]', form);

    if (slot) {
      var service = serviceById(slot.service_id);
      if (title) title.textContent = 'Edit slot';
      if (note) note.textContent = 'Editing an open slot. Booked slots are read-only in the calendar.';
      if (slotId) slotId.value = slot.id;
      if (serviceSelect) serviceSelect.value = serviceSelect.tagName === 'SELECT' && service ? service.code : 'all';
      if (staffSelect) staffSelect.value = slot.assigned_staff_id || '';
      if (dateInput) dateInput.value = formatDate(slot.start_at);
      if (startSelect) startSelect.dataset.pendingDefault = formatTime(slot.start_at);
      rebuildSlotTimeOptions(true);
      if (startSelect) startSelect.value = formatTime(slot.start_at);
      if (endSelect) endSelect.value = formatTime(slot.end_at);
      if (internalNote) internalNote.value = slot.internal_note || '';
      if (submit) submit.textContent = 'Update slot';
      if (reset) reset.hidden = false;
      if (del) del.hidden = false;
      if (repeatToggle) repeatToggle.checked = false;
      setRepeatControlsEnabled(false);
      refreshCustomControls(form);
      return;
    }

    if (title) title.textContent = 'New slot';
    if (note) note.textContent = 'Select an open slot in the calendar to edit it.';
    if (slotId) slotId.value = '';
    if (submit) submit.textContent = 'Create slot';
    if (reset) reset.hidden = true;
    if (del) del.hidden = true;
    setRepeatControlsEnabled(true);
    refreshCustomControls(form);
  }

  function renderAvailabilityOptions() {
    var serviceSelect = $('[data-admin-slot-service]');
    var staffSelect = $('[data-admin-slot-staff]');
    var dateInput = $('[data-admin-slot-date]');
    var startSelect = $('[data-admin-slot-start]');
    var endSelect = $('[data-admin-slot-end]');
    if (!serviceSelect || !staffSelect || !dateInput || !startSelect || !endSelect) return;

    if (serviceSelect.tagName === 'SELECT') {
      var selectedService = serviceSelect.value || 'all';
      serviceSelect.innerHTML = '<option value="all"' + (selectedService === 'all' ? ' selected' : '') + '>All inspection types</option>' +
        state.services.filter(function (service) { return service.is_public; }).map(function (service) {
          return '<option value="' + escapeHtml(service.code) + '" data-duration="' + escapeHtml(service.default_duration_minutes) + '"' + (service.code === selectedService ? ' selected' : '') + '>' + escapeHtml(service.name_en || service.name_lt) + '</option>';
        }).join('');
    } else {
      serviceSelect.value = serviceSelect.value || 'all';
    }

    var selectedStaff = staffSelect.value;
    staffSelect.innerHTML = '<option value="">Unassigned</option>' + state.staffList.filter(function (staff) { return staff.is_active; }).map(function (staff) {
      return '<option value="' + escapeHtml(staff.id) + '"' + (staff.id === selectedStaff ? ' selected' : '') + '>' + escapeHtml(staff.display_name) + ' - ' + escapeHtml(staff.role) + '</option>';
    }).join('');

    if (!dateInput.value) {
      var defaults = defaultSlotDateTime();
      dateInput.value = defaults.date;
      startSelect.dataset.pendingDefault = defaults.time;
    }

    rebuildSlotTimeOptions();
    refreshCustomControls(document);
  }

  function selectedServiceDuration() {
    var serviceSelect = $('[data-admin-slot-service]');
    var service = serviceByCode(serviceSelect && serviceSelect.value);
    if (service) return Number(service.default_duration_minutes) || 120;
    return state.services.filter(function (item) { return item.is_public; }).reduce(function (max, item) {
      return Math.max(max, Number(item.default_duration_minutes) || 0);
    }, 0) || 120;
  }

  function rebuildSlotTimeOptions(preserveEnd) {
    var dateInput = $('[data-admin-slot-date]');
    var startSelect = $('[data-admin-slot-start]');
    var endSelect = $('[data-admin-slot-end]');
    if (!dateInput || !startSelect || !endSelect) return;

    var defaultStart = startSelect.value || startSelect.dataset.pendingDefault || defaultSlotDateTime().time;
    startSelect.innerHTML = timeOptions(defaultStart, dateInput.value, true);
    if (!startSelect.value && startSelect.options.length) startSelect.value = startSelect.options[0].value;
    delete startSelect.dataset.pendingDefault;

    var endValue = preserveEnd ? endSelect.value : minutesToTime(timeToMinutes(startSelect.value) + selectedServiceDuration());
    endSelect.innerHTML = endTimeOptions(endValue, startSelect.value);
    if (!endSelect.value || timeToMinutes(endSelect.value) <= timeToMinutes(startSelect.value)) {
      endSelect.value = minutesToTime(timeToMinutes(startSelect.value) + selectedServiceDuration());
    }
    refreshCustomControls(document);
  }

  async function handleSlotSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var errorEl = $('[data-admin-slot-error]', form);
    var data = new FormData(form);
    var dateValue = String(data.get('date') || '');
    var startTime = String(data.get('startTime') || '');
    var endTime = String(data.get('endTime') || '');
    var validation = validateDateTimePair(dateValue, startTime, endTime);
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('is-success');
    }

    if (validation.error) {
      if (errorEl) errorEl.textContent = validation.error;
      return;
    }

    var slotId = String(data.get('slotId') || '').trim();
    if (slotId) {
      try {
        setFormBusy(form, true, busyLabelForAction('updateSlot'));
        setSyncState('Saving', 'loading');
        await adminAction({
          action: 'updateSlot',
          slotId: slotId,
          serviceCode: data.get('serviceCode') || 'all',
          assignedStaffId: data.get('assignedStaffId') || null,
          startAt: validation.startAt,
          endAt: validation.endAt,
          internalNote: data.get('internalNote') || null
        });
        await refresh({ preserveScroll: true });
        if (errorEl) {
          errorEl.textContent = 'Slot updated.';
          errorEl.classList.add('is-success');
        }
      } catch (error) {
        setSyncState('Action failed', 'error');
        if (errorEl) errorEl.textContent = error instanceof Error ? error.message : 'Could not update slot.';
      } finally {
        if (document.body.contains(form)) setFormBusy(form, false);
      }
      return;
    }

    var repeat = data.get('repeatWeekly') === 'on';
    var weeks = repeat ? Number(data.get('repeatWeeks')) || 1 : 1;
    var recurrenceSeriesId = repeat && weeks > 1 && window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : null;
    var failures = [];
    var created = 0;
    setFormBusy(form, true, busyLabelForAction('createSlot'));
    setSyncState('Saving', 'loading');

    for (var i = 0; i < weeks; i += 1) {
      var occurrenceDate = addDaysYmd(dateValue, i * 7);
      var occurrence = validateDateTimePair(occurrenceDate, startTime, endTime);
      if (occurrence.error) {
        failures.push(occurrenceDate + ': ' + occurrence.error);
        continue;
      }

      try {
        await adminAction({
          action: 'createSlot',
          serviceCode: data.get('serviceCode') || 'all',
          assignedStaffId: data.get('assignedStaffId') || null,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          internalNote: data.get('internalNote') || null,
          recurrenceSeriesId: recurrenceSeriesId
        });
        created += 1;
      } catch (error) {
        failures.push(occurrenceDate + ': ' + (error instanceof Error ? error.message : 'Could not create slot.'));
      }
    }

    if (document.body.contains(form)) setFormBusy(form, false);
    await refresh({ preserveScroll: true });

    if (errorEl) {
      if (failures.length) {
        errorEl.textContent = created + ' created. Failed: ' + failures.join(' ');
      } else {
        errorEl.textContent = created === 1 ? 'Slot created.' : created + ' slots created.';
        errorEl.classList.add('is-success');
      }
    }
  }

  function renderSlots() {
    var slotList = $('[data-admin-slot-list]');
    if (!slotList) return;
    var bookingBySlot = latestBookingsBySlot(function (booking) {
      return isActiveBookingStatus(booking.status);
    });
    var completedSlotIds = {};
    state.bookings.forEach(function (booking) {
      if (booking.availability_slot_id && booking.status === 'completed') {
        completedSlotIds[booking.availability_slot_id] = true;
      }
    });
    var querySlotId = state.selectedSlotId;
    var slots = state.slots.slice().sort(function (a, b) { return new Date(a.start_at) - new Date(b.start_at); });

    slots = slots.filter(function (slot) {
      if (slot.status !== 'open') return false;
      if (completedSlotIds[slot.id]) return false;
      if (new Date(slot.end_at) < new Date()) return false;
      if (state.slotFilter !== 'all' && slot.status !== state.slotFilter) return false;
      return true;
    }).slice(0, 120);

    if (!slots.length) {
      slotList.innerHTML = '<div class="admin-empty-state admin-empty-state-compact"><p>No slots match this view.</p></div>';
      return;
    }

    slotList.innerHTML = slots.map(function (slot) {
      var service = serviceNameById(slot.service_id);
      var assignee = staffById(slot.assigned_staff_id);
      var booking = bookingBySlot[slot.id];
      var status = booking ? booking.status : 'available';
      var hasActiveBooking = booking && isActiveBookingStatus(booking.status);
      var seriesMeta = slot.recurrence_series_id ? ' - Weekly series' : '';
      return '<div class="admin-slot-item' + (slot.id === querySlotId ? ' is-selected' : '') + '" data-tone="' + escapeHtml(statusTone(status)) + '">' +
        '<div>' +
          '<div class="admin-booking-title">' + escapeHtml(formatRange(slot.start_at, slot.end_at)) + '</div>' +
          '<div class="admin-slot-meta">' + escapeHtml(service) + ' - ' + escapeHtml(assignee ? assignee.display_name : 'Unassigned') + ' - ' + escapeHtml(statusLabel(status) + seriesMeta) + '</div>' +
          (booking ? '<a class="admin-inline-link" href="' + PATHS.bookings + '?booking=' + encodeURIComponent(booking.id) + '">' + escapeHtml(booking.public_reference + ' - ' + booking.customer_name) + '</a>' : '') +
        '</div>' +
        '<div class="admin-slot-actions">' +
          (!hasActiveBooking ? '<button class="admin-button admin-button-danger" type="button" data-delete-slot="' + escapeHtml(slot.id) + '">Delete</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    $all('[data-delete-slot]', slotList).forEach(function (button) {
      button.addEventListener('click', async function () {
        await deleteSlotWithChoice(button.dataset.deleteSlot, button);
      });
    });
  }

  function customSelectLabel(select) {
    var option = select.options[select.selectedIndex];
    return option ? option.textContent : 'Select';
  }

  function renderCustomSelect(select) {
    var widget = select.nextElementSibling && select.nextElementSibling.classList.contains('admin-custom-select')
      ? select.nextElementSibling
      : null;
    if (!widget) return;
    var button = $('.admin-custom-select-button', widget);
    var menu = $('.admin-custom-select-menu', widget);
    if (button) button.textContent = customSelectLabel(select);
    if (!menu) return;
    menu.innerHTML = Array.prototype.map.call(select.options, function (option) {
      return '<button type="button" data-custom-value="' + escapeHtml(option.value) + '"' + (option.disabled ? ' disabled' : '') + (option.selected ? ' class="is-selected"' : '') + '>' + escapeHtml(option.textContent) + '</button>';
    }).join('');
    $all('[data-custom-value]', menu).forEach(function (optionButton) {
      optionButton.addEventListener('click', function () {
        select.value = optionButton.dataset.customValue;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        widget.classList.remove('is-open');
        renderCustomSelect(select);
      });
    });
  }

  function initCustomSelect(select) {
    if (!select || select.dataset.customSelectBound) return;
    select.dataset.customSelectBound = 'true';
    select.classList.add('is-customized');
    if (select.parentElement) select.parentElement.classList.add('has-custom-select');
    var widget = document.createElement('div');
    widget.className = 'admin-custom-select';
    widget.innerHTML = '<button class="admin-custom-select-button" type="button" aria-haspopup="listbox"></button><div class="admin-custom-select-menu" role="listbox"></div>';
    select.insertAdjacentElement('afterend', widget);
    $('.admin-custom-select-button', widget).addEventListener('click', function () {
      $all('.admin-custom-select.is-open').forEach(function (item) {
        if (item !== widget) item.classList.remove('is-open');
      });
      widget.classList.toggle('is-open');
    });
    select.addEventListener('change', function () {
      renderCustomSelect(select);
    });
    renderCustomSelect(select);
  }

  function monthStartFromYmd(value) {
    var base = isValidYmd(value) ? utcNoonFromYmd(value) : utcNoonFromYmd(todayYmd());
    base.setUTCDate(1);
    return ymdFromUtcDate(base);
  }

  function renderDatePicker(input) {
    var widget = input.nextElementSibling && input.nextElementSibling.classList.contains('admin-date-picker-widget')
      ? input.nextElementSibling
      : null;
    if (!widget) return;
    var month = widget.dataset.month || monthStartFromYmd(input.value);
    widget.dataset.month = month;
    var monthDate = utcNoonFromYmd(month);
    var monthLabel = new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(monthDate);
    var firstDay = monthDate.getUTCDay();
    var leading = (firstDay + 6) % 7;
    var cursor = utcNoonFromYmd(month);
    cursor.setUTCDate(cursor.getUTCDate() - leading);
    var days = [];
    for (var i = 0; i < 42; i += 1) {
      var value = ymdFromUtcDate(cursor);
      var outside = cursor.getUTCMonth() !== monthDate.getUTCMonth();
      var past = compareYmd(value, todayYmd()) < 0;
      days.push('<button type="button" data-date-value="' + value + '"' + (outside ? ' data-outside="true"' : '') + (past ? ' disabled' : '') + (value === input.value ? ' class="is-selected"' : '') + '>' + cursor.getUTCDate() + '</button>');
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    widget.innerHTML =
      '<button class="admin-date-picker-trigger" type="button">Pick date</button>' +
      '<div class="admin-date-picker-popover">' +
        '<div class="admin-date-picker-head">' +
          '<button type="button" data-date-prev aria-label="Previous month">‹</button>' +
          '<strong>' + escapeHtml(monthLabel) + '</strong>' +
          '<button type="button" data-date-next aria-label="Next month">›</button>' +
        '</div>' +
        '<div class="admin-date-picker-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>' +
        '<div class="admin-date-picker-grid">' + days.join('') + '</div>' +
      '</div>';
    $('.admin-date-picker-trigger', widget).addEventListener('click', function () {
      widget.classList.toggle('is-open');
    });
    $('[data-date-prev]', widget).addEventListener('click', function () {
      var next = utcNoonFromYmd(widget.dataset.month);
      next.setUTCMonth(next.getUTCMonth() - 1);
      widget.dataset.month = ymdFromUtcDate(next);
      renderDatePicker(input);
      widget.classList.add('is-open');
    });
    $('[data-date-next]', widget).addEventListener('click', function () {
      var next = utcNoonFromYmd(widget.dataset.month);
      next.setUTCMonth(next.getUTCMonth() + 1);
      widget.dataset.month = ymdFromUtcDate(next);
      renderDatePicker(input);
      widget.classList.add('is-open');
    });
    $all('[data-date-value]', widget).forEach(function (button) {
      button.addEventListener('click', function () {
        input.value = button.dataset.dateValue;
        widget.dataset.month = monthStartFromYmd(input.value);
        widget.classList.remove('is-open');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        renderDatePicker(input);
      });
    });
  }

  function initDatePicker(input) {
    if (!input || input.dataset.datePickerBound) return;
    input.dataset.datePickerBound = 'true';
    var widget = document.createElement('div');
    widget.className = 'admin-date-picker-widget';
    widget.dataset.month = monthStartFromYmd(input.value);
    input.insertAdjacentElement('afterend', widget);
    input.addEventListener('input', function () {
      if (isValidYmd(input.value)) widget.dataset.month = monthStartFromYmd(input.value);
      renderDatePicker(input);
    });
    renderDatePicker(input);
  }

  function initCustomControls(root) {
    $all('.admin-select-wrap select', root).forEach(initCustomSelect);
    refreshCustomControls(root);
    if (!document.body.dataset.customControlsBound) {
      document.body.dataset.customControlsBound = 'true';
      document.addEventListener('click', function (event) {
        $all('.admin-custom-select.is-open, .admin-date-picker-widget.is-open').forEach(function (widget) {
          if (!widget.contains(event.target)) widget.classList.remove('is-open');
        });
      });
    }
  }

  function refreshCustomControls(root) {
    $all('.admin-select-wrap select', root || document).forEach(renderCustomSelect);
    var input = $('[data-admin-slot-date]', root || document);
    if (input && input.dataset.datePickerBound) renderDatePicker(input);
  }

  function setupLoginEvents() {
    var form = $('[data-admin-login-form]');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var status = $('[data-admin-login-status]');
      var data = new FormData(event.currentTarget);
      status.textContent = '';
      setFormBusy(form, true, 'Signing in...');

      try {
        var session = await login(String(data.get('email') || ''), String(data.get('password') || ''));
        storeSession(session);
        await loadDashboard();
        redirectTo(PATHS.dashboard);
      } catch (error) {
        storeSession(null);
        status.textContent = error instanceof Error ? error.message : 'Sign in failed.';
      } finally {
        if (document.body.contains(form)) setFormBusy(form, false);
      }
    });
  }

  function setupShellEvents() {
    var refreshButton = $('[data-admin-refresh]');
    if (refreshButton) {
      refreshButton.addEventListener('click', async function () {
        setButtonBusy(refreshButton, true, 'Refreshing...');
        try {
          await refresh({ preserveScroll: true });
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Refresh failed.', 'error');
        } finally {
          if (document.body.contains(refreshButton)) setButtonBusy(refreshButton, false);
        }
      });
    }

    var logoutButton = $('[data-admin-logout]');
    if (logoutButton) {
      logoutButton.addEventListener('click', function () {
        closeRealtime();
        storeSession(null);
        redirectTo(PATHS.login);
      });
    }
  }

  function setupDashboardEvents() {
    var controls = $('[data-calendar-view]');
    if (controls) {
      $all('[data-view]', controls).forEach(function (button) {
        button.addEventListener('click', function () {
          state.calendarView = button.dataset.view;
          $all('[data-view]', controls).forEach(function (item) {
            item.classList.toggle('is-active', item === button);
          });
          renderCalendar();
        });
      });
    }

    var todayButton = $('[data-calendar-today]');
    if (todayButton) {
      todayButton.addEventListener('click', function () {
        state.calendarAnchor = todayYmd();
        renderCalendar();
      });
    }

    var prevButton = $('[data-calendar-prev]');
    if (prevButton) {
      prevButton.addEventListener('click', function () {
        state.calendarAnchor = addDaysYmd(state.calendarAnchor, state.calendarView === 'week' ? -7 : -1);
        renderCalendar();
      });
    }

    var nextButton = $('[data-calendar-next]');
    if (nextButton) {
      nextButton.addEventListener('click', function () {
        state.calendarAnchor = addDaysYmd(state.calendarAnchor, state.calendarView === 'week' ? 7 : 1);
        renderCalendar();
      });
    }

    var dateInput = $('[data-calendar-date]');
    if (dateInput) {
      dateInput.addEventListener('change', function () {
        if (isValidYmd(dateInput.value)) {
          state.calendarAnchor = dateInput.value;
          renderCalendar();
        }
      });
    }
  }

  function setupBookingEvents() {
    var filters = $('[data-admin-filters]');
    var sortControls = $('[data-admin-booking-sort]');

    if (filters) {
      $all('[data-filter]', filters).forEach(function (item) {
        item.classList.toggle('is-active', item.dataset.filter === state.filter);
      });
      $all('[data-filter]', filters).forEach(function (button) {
        button.addEventListener('click', function () {
          state.filter = button.dataset.filter;
          $all('[data-filter]', filters).forEach(function (item) {
            item.classList.toggle('is-active', item === button);
          });
          state.selectedBookingId = null;
          history.replaceState(modalHistoryState(null, 0), '', PATHS.bookings + '?filter=' + encodeURIComponent(state.filter) + '&sort=' + encodeURIComponent(state.bookingSort));
          closeModal();
          renderBookingsPage();
        });
      });
    }

    if (sortControls) {
      $all('[data-booking-sort]', sortControls).forEach(function (item) {
        item.classList.toggle('is-active', item.dataset.bookingSort === state.bookingSort);
      });
      $all('[data-booking-sort]', sortControls).forEach(function (button) {
        button.addEventListener('click', function () {
          state.bookingSort = button.dataset.bookingSort === 'desc' ? 'desc' : 'asc';
          $all('[data-booking-sort]', sortControls).forEach(function (item) {
            item.classList.toggle('is-active', item === button);
          });
          history.replaceState(modalHistoryState(null, 0), '', PATHS.bookings + '?filter=' + encodeURIComponent(state.filter) + '&sort=' + encodeURIComponent(state.bookingSort));
          renderBookingsPage();
        });
      });
    }
  }

  function setupCustomerEvents() {
    var search = $('[data-customer-search]');
    if (search) {
      search.addEventListener('input', function () {
        state.customerSearch = search.value;
        renderCustomerList();
      });
    }
  }

  function setupInvoiceEvents() {
    var filters = $('[data-invoice-filters]');
    if (!filters) return;
    $all('[data-invoice-filter]', filters).forEach(function (button) {
      button.addEventListener('click', function () {
        state.invoiceFilter = button.dataset.invoiceFilter;
        $all('[data-invoice-filter]', filters).forEach(function (item) {
          item.classList.toggle('is-active', item === button);
        });
        state.selectedInvoiceId = null;
        history.replaceState(modalHistoryState(null, 0), '', PATHS.invoices);
        closeModal();
        renderInvoicesPage();
      });
    });
  }

  function setupAvailabilityEvents() {
    var form = $('[data-admin-slot-form]');
    if (!form) return;

    var repeatToggle = $('[data-admin-repeat-toggle]', form);
    var repeatWeeks = $('[data-admin-repeat-weeks]', form);
    var serviceSelect = $('[data-admin-slot-service]', form);
    var dateInput = $('[data-admin-slot-date]', form);
    var startSelect = $('[data-admin-slot-start]', form);
    var resetButton = $('[data-admin-slot-reset]', form);
    var deleteButton = $('[data-admin-slot-delete]', form);
    var errorEl = $('[data-admin-slot-error]', form);

    if (repeatToggle && repeatWeeks) {
      repeatToggle.addEventListener('change', function () {
        setRepeatControlsEnabled(!String(($('[data-admin-slot-id]', form) || {}).value || '').trim());
      });
    }

    [serviceSelect, dateInput, startSelect].forEach(function (input) {
      if (!input) return;
      input.addEventListener('change', function () {
        rebuildSlotTimeOptions(false);
        refreshCustomControls(form);
      });
    });

    if (dateInput) {
      dateInput.addEventListener('input', function () {
        if (!dateInput.value) return;
        if (!isValidYmd(dateInput.value)) {
          if (errorEl) errorEl.textContent = 'Use the date format YYYY-MM-DD.';
          return;
        }
        if (compareYmd(dateInput.value, todayYmd()) < 0) {
          if (errorEl) errorEl.textContent = 'Past dates cannot be selected.';
          return;
        }
        if (errorEl && errorEl.textContent === 'Past dates cannot be selected.') errorEl.textContent = '';
      });
    }

    if (resetButton) {
      resetButton.addEventListener('click', resetSlotForm);
    }

    if (deleteButton) {
      deleteButton.addEventListener('click', async function () {
        var slotId = String(($('[data-admin-slot-id]', form) || {}).value || '').trim();
        if (!slotId) return;
        await deleteSlotWithChoice(slotId, deleteButton);
      });
    }

    form.addEventListener('submit', handleSlotSubmit);

    initCustomControls(form);
  }

  async function refresh(options) {
    var opts = options || {};
    state.isRefreshing = true;
    setSyncState(opts.background ? 'Refreshing' : 'Loading', 'loading');
    try {
      await loadDashboard();
      showConsole({ preserveScroll: opts.preserveScroll || state.hasRendered });
      setUserLabel();
      setActiveNav();
      renderPage();
      renderModalFromCurrentUrl();
      startRealtime();
      state.hasRendered = true;
      setSyncState('Synced', 'synced');
    } catch (error) {
      setSyncState('Sync failed', 'error');
      throw error;
    } finally {
      state.isRefreshing = false;
    }
  }

  function renderPage() {
    if (pageController && typeof pageController.beforeRender === 'function') {
      pageController.beforeRender({ state: state });
    }
    if (state.page === 'dashboard') renderDashboardPage();
    if (state.page === 'bookings') renderBookingsPage();
    if (state.page === 'availability') renderAvailabilityPage();
    if (state.page === 'customers') renderCustomersPage();
    if (state.page === 'invoices') renderInvoicesPage();
    if (state.page === 'marketing') renderMarketingPage();
  }

  async function init() {
    state.page = document.body.dataset.adminPage || '';
    state.calendarAnchor = todayYmd();
    var params = new URLSearchParams(window.location.search);
    state.selectedSlotId = params.get('slot');
    if (['pending', 'today', 'confirmed', 'completed', 'all'].includes(params.get('filter'))) {
      state.filter = params.get('filter');
    }
    if (['asc', 'desc'].includes(params.get('sort'))) {
      state.bookingSort = params.get('sort');
    }
    syncSelectedModalState(modalRouteFromUrl());
    replaceCurrentHistoryState();

    state.session = await getActiveSession();

    if (state.page === 'login') {
      if (state.session) {
        redirectTo(PATHS.dashboard);
        return;
      }
      setupLoginEvents();
      if (pageController && typeof pageController.afterInit === 'function') {
        pageController.afterInit({ state: state });
      }
      return;
    }

    if (!state.session) {
      redirectTo(PATHS.login);
      return;
    }

    els.loading = $('[data-admin-loading]');
    els.console = $('[data-admin-console]');
    els.stats = $('[data-admin-stats]');

    setupShellEvents();
    window.addEventListener('popstate', applyUrlModalState);
    if (state.page === 'dashboard' || state.page === 'availability') setupDashboardEvents();
    if (state.page === 'bookings') setupBookingEvents();
    if (state.page === 'availability') setupAvailabilityEvents();
    if (state.page === 'customers') setupCustomerEvents();
    if (state.page === 'invoices') setupInvoiceEvents();
    if (pageController && typeof pageController.afterEvents === 'function') {
      pageController.afterEvents({ state: state });
    }

    if (restoreDashboardCache()) {
      showConsole({ preserveScroll: true });
      setUserLabel();
      setActiveNav();
      renderPage();
      renderModalFromCurrentUrl();
      startRealtime();
      state.hasRendered = true;
      refresh({ background: true, preserveScroll: true }).catch(function (error) {
        if (!state.session) {
          redirectTo(PATHS.login);
          return;
        }
        showToast(error instanceof Error ? error.message : 'Refresh failed.', 'error');
      });
      return;
    }

    try {
      await refresh();
    } catch (error) {
      storeSession(null);
      redirectTo(PATHS.login);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
