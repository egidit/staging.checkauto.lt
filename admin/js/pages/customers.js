export const page = 'customers';

export function renderStaticPage(root) {
  root.innerHTML = `
    <section class="admin-page-heading">
      <div>
        <span class="section-label">CRM</span>
        <h1>Customers</h1>
      </div>
    </section>
    <section class="admin-customer-layout">
      <div class="admin-panel admin-panel-full">
        <div class="admin-panel-header">
          <div>
            <span class="section-label">Search</span>
            <h2>Customer profiles</h2>
          </div>
          <p class="admin-count" data-customer-count></p>
        </div>
        <label class="admin-search">
          <span>Search anything</span>
          <input type="search" data-customer-search placeholder="Name, email, phone, booking, car, invoice...">
        </label>
        <div class="admin-customer-list" data-customer-list></div>
      </div>
    </section>
  `;
}

export async function initPage() {}

export function renderPage() {}

export function destroyPage() {}
