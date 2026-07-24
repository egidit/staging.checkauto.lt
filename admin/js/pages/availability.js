export const page = 'availability';

export function renderStaticPage(root) {
  root.innerHTML = `
    <section class="admin-page-heading">
      <div>
        <span class="section-label">Calendar</span>
        <h1>Availability</h1>
      </div>
    </section>

    <section class="admin-availability-layout">
      <div class="admin-panel admin-availability-editor">
        <div class="admin-panel-header">
          <div>
            <span class="section-label">Slot</span>
            <h2 data-admin-slot-form-title>New slot</h2>
          </div>
        </div>
        <form class="admin-slot-form" data-admin-slot-form novalidate>
          <input type="hidden" name="slotId" data-admin-slot-id>
          <input type="hidden" name="serviceCode" value="all" data-admin-slot-service>
          <label>Date<input name="date" type="date" required data-admin-slot-date></label>
          <fieldset class="admin-time-range">
            <legend>Time</legend>
            <label><span>Start</span><span class="admin-select-wrap"><select name="startTime" required data-admin-slot-start></select></span></label>
            <label><span>End</span><span class="admin-select-wrap"><select name="endTime" required data-admin-slot-end></select></span></label>
          </fieldset>
          <label>Assign to<span class="admin-select-wrap"><select name="assignedStaffId" data-admin-slot-staff></select></span></label>
          <label class="admin-field-wide">Note<input name="internalNote" type="text" maxlength="500" placeholder="Example: Kaunas only / call first"></label>
          <fieldset class="admin-repeat">
            <label class="admin-checkbox admin-repeat-toggle">
              <input type="checkbox" name="repeatWeekly" data-admin-repeat-toggle>
              <span>Repeat weekly</span>
            </label>
            <label data-admin-repeat-weeks-wrap>Weeks<span class="admin-select-wrap"><select name="repeatWeeks" data-admin-repeat-weeks disabled>
              <option value="2">2 weeks</option>
              <option value="3">3 weeks</option>
              <option value="4" selected>4 weeks</option>
              <option value="6">6 weeks</option>
              <option value="8">8 weeks</option>
            </select></span></label>
          </fieldset>
          <p class="admin-slot-mode-note" data-admin-slot-mode-note>Select an open slot in the calendar to edit it.</p>
          <div class="admin-form-error" data-admin-slot-error role="status" aria-live="polite"></div>
          <div class="admin-action-buttons">
            <button class="admin-button admin-button-primary" type="submit" data-admin-slot-submit>Create slot</button>
            <button class="admin-button admin-button-secondary" type="button" data-admin-slot-reset hidden>New slot</button>
            <button class="admin-button admin-button-danger" type="button" data-admin-slot-delete hidden>Delete slot</button>
          </div>
        </form>
      </div>

      <div class="admin-panel admin-calendar-panel admin-availability-calendar-panel">
        <div class="admin-panel-header admin-panel-header-compact">
          <div>
            <span class="section-label">Schedule</span>
            <h2 data-admin-calendar-title>Availability</h2>
          </div>
          <div class="admin-calendar-controls">
            <button class="admin-button admin-button-secondary" type="button" data-calendar-prev aria-label="Previous period">‹</button>
            <button class="admin-button admin-button-secondary" type="button" data-calendar-today>Today</button>
            <button class="admin-button admin-button-secondary" type="button" data-calendar-next aria-label="Next period">›</button>
            <div class="admin-segmented" data-calendar-view>
              <button class="is-active" type="button" data-view="week">Week</button>
              <button type="button" data-view="day">Day</button>
            </div>
            <label class="admin-date-jump"><span>Jump to</span><input type="text" inputmode="numeric" placeholder="2026-12-31" data-calendar-date></label>
          </div>
        </div>
        <div class="admin-calendar-legend" data-admin-calendar-legend></div>
        <div class="admin-calendar" data-admin-calendar></div>
      </div>
    </section>
  `;
}

export async function initPage() {}

export function renderPage() {}

export function destroyPage() {}
