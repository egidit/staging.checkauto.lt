export const page = 'dashboard';

export function renderStaticPage(root) {
  root.innerHTML = `
    <section class="admin-page-heading">
      <div>
        <span class="section-label">Today</span>
        <h1>Dashboard</h1>
      </div>
    </section>

    <section class="admin-stats" data-admin-stats></section>

    <section class="admin-dashboard-grid">
      <section class="admin-panel admin-calendar-panel">
        <div class="admin-panel-header admin-panel-header-compact">
          <div>
            <span class="section-label">Schedule</span>
            <h2 data-admin-calendar-title>Today</h2>
          </div>
          <div class="admin-calendar-controls">
            <button class="admin-button admin-button-secondary" type="button" data-calendar-prev aria-label="Previous period">‹</button>
            <button class="admin-button admin-button-secondary" type="button" data-calendar-today>Today</button>
            <button class="admin-button admin-button-secondary" type="button" data-calendar-next aria-label="Next period">›</button>
            <div class="admin-segmented" data-calendar-view>
              <button class="is-active" type="button" data-view="week">Week</button>
              <button type="button" data-view="day">Day</button>
            </div>
            <label class="admin-date-jump">
              <span>Jump to</span>
              <input type="text" inputmode="numeric" placeholder="2026-12-31" data-calendar-date>
            </label>
          </div>
        </div>
        <div class="admin-calendar-legend" data-admin-calendar-legend></div>
        <div class="admin-calendar" data-admin-calendar></div>
      </section>
    </section>

    <aside class="admin-preview" data-admin-preview hidden></aside>
  `;
}

export function afterInit() {}

export async function initPage() {}

export function renderPage() {}

export function destroyPage() {}
