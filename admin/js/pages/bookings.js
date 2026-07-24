export const page = 'bookings';

export function renderStaticPage(root) {
  root.innerHTML = `
    <section class="admin-page-heading">
      <div>
        <span class="section-label">Work queue</span>
        <h1>Bookings</h1>
      </div>
    </section>

    <section class="admin-workbench admin-bookings-workbench">
      <div class="admin-panel admin-list-panel">
        <div class="admin-panel-header">
          <div>
            <span class="section-label">Bookings</span>
            <h2>Queue</h2>
          </div>
          <div class="admin-segmented" data-admin-filters>
            <button class="is-active" type="button" data-filter="pending">Needs review</button>
            <button type="button" data-filter="today">Today</button>
            <button type="button" data-filter="confirmed">Confirmed</button>
            <button type="button" data-filter="completed">Done</button>
            <button type="button" data-filter="all">All</button>
          </div>
          <div class="admin-segmented" data-admin-booking-sort aria-label="Sort bookings">
            <button class="is-active" type="button" data-booking-sort="asc">Date ↑</button>
            <button type="button" data-booking-sort="desc">Date ↓</button>
          </div>
        </div>
        <div class="admin-booking-list" data-admin-booking-list></div>
      </div>
    </section>
  `;
}

export async function initPage() {}

export function renderPage() {}

export function destroyPage() {}
