export const page = 'invoices';

export function renderStaticPage(root) {
  root.innerHTML = `
    <section class="admin-page-heading">
      <div>
        <span class="section-label">Money</span>
        <h1>Invoices</h1>
      </div>
    </section>
    <section class="admin-request-layout admin-request-layout-list">
      <div class="admin-panel">
        <div class="admin-panel-header">
          <div>
            <span class="section-label">Invoices</span>
            <h2>Ledger</h2>
          </div>
          <div class="admin-segmented" data-invoice-filters>
            <button type="button" data-invoice-filter="all">All</button>
            <button class="is-active" type="button" data-invoice-filter="unpaid">Unpaid</button>
            <button type="button" data-invoice-filter="paid">Paid</button>
            <button type="button" data-invoice-filter="void">Void</button>
          </div>
        </div>
        <div class="admin-invoice-list" data-invoice-list></div>
      </div>
    </section>
  `;
}

export async function initPage() {}

export function renderPage() {}

export function destroyPage() {}
