import { PATHS } from './routes.js';

const groups = [
  {
    label: 'Today',
    items: [
      { page: 'dashboard', label: 'Dashboard', href: PATHS.dashboard }
    ]
  },
  {
    label: 'Operations',
    items: [
      { page: 'bookings', label: 'Bookings', href: PATHS.bookings },
      { page: 'availability', label: 'Availability', href: PATHS.availability },
      { page: 'customers', label: 'Customers', href: PATHS.customers },
      { page: 'invoices', label: 'Invoices', href: PATHS.invoices }
    ]
  },
  {
    label: 'Growth',
    items: [
      { page: 'marketing', label: 'Marketing', href: PATHS.marketing }
    ]
  }
];

export function renderShell(page) {
  const target = document.querySelector('[data-admin-shell]');
  if (!target || page === 'login') return;

  target.innerHTML = `
    <aside class="admin-sidebar" aria-label="Admin navigation">
      <a class="admin-brand admin-sidebar-brand" href="${PATHS.dashboard}">check<span>auto</span>.lt</a>
      <nav class="admin-sidebar-nav">
        ${groups.map((group) => `
          <section class="admin-nav-group">
            <h2>${group.label}</h2>
            ${group.items.map((item) => `
              <a href="${item.href}" data-admin-nav="${item.page}">${item.label}</a>
            `).join('')}
          </section>
        `).join('')}
      </nav>
      <div class="admin-sidebar-account">
        <div class="admin-sidebar-user">
          <p class="admin-sync-state" data-admin-sync-state data-state="synced">Synced</p>
          <p data-admin-user></p>
        </div>
        <div class="admin-shell-actions">
          <button class="admin-button admin-button-secondary" type="button" data-admin-refresh>Refresh</button>
          <button class="admin-button admin-button-ghost" type="button" data-admin-logout>Sign out</button>
        </div>
      </div>
    </aside>
  `;
}
