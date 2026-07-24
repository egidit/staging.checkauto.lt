import { api } from './core/api.js';
import { auth } from './core/auth.js';
import { calendar } from './core/calendar.js';
import { controls } from './core/controls.js';
import { drawers } from './core/drawers.js';
import { formatters } from './core/formatting.js';
import { modals } from './core/modals.js';
import { realtime } from './core/realtime.js';
import { PATHS, PAGE_TITLES } from './core/routes.js';
import { initAdminRuntime } from './core/runtime.js';
import { renderShell } from './core/shell.js';
import { state } from './core/state.js';
import { toast } from './core/toast.js';
import { validators } from './core/validation.js';

const pageControllers = {
  dashboard: () => import('./pages/dashboard.js'),
  bookings: () => import('./pages/bookings.js'),
  availability: () => import('./pages/availability.js'),
  customers: () => import('./pages/customers.js'),
  invoices: () => import('./pages/invoices.js'),
  marketing: () => import('./pages/marketing.js'),
  login: () => import('./pages/login.js')
};

function createContext(page) {
  return {
    page,
    state,
    api,
    auth,
    routes: { PATHS, PAGE_TITLES },
    shell: { renderShell },
    modals,
    drawers,
    toast,
    realtime,
    formatters,
    validators,
    controls,
    calendar
  };
}

function renderBootstrapError(error) {
  const root = document.querySelector('[data-page-root]') || document.body;
  root.innerHTML = `
    <section class="admin-loading">
      <div>
        <div class="admin-brand">check<span>auto</span>.lt</div>
        <p>Admin console could not start.</p>
        <p class="admin-form-status">${error instanceof Error ? error.message : 'Unknown startup error.'}</p>
      </div>
    </section>
  `;
}

async function boot() {
  const page = document.body.dataset.adminPage || 'dashboard';
  const loadController = pageControllers[page] || pageControllers.dashboard;
  const context = createContext(page);
  const controller = await loadController();

  renderShell(page);

  const root = document.querySelector('[data-page-root]');
  if (root && typeof controller.renderStaticPage === 'function') {
    controller.renderStaticPage(root, context);
  }

  if (typeof controller.initPage === 'function') {
    await controller.initPage(context);
  }

  initAdminRuntime(controller);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    boot().catch(renderBootstrapError);
  });
} else {
  boot().catch(renderBootstrapError);
}
