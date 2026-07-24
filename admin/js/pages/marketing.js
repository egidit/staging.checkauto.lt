export const page = 'marketing';

export function renderStaticPage(root) {
  root.innerHTML = `
    <section class="admin-page-heading">
      <div>
        <span class="section-label">Growth</span>
        <h1>Marketing</h1>
      </div>
    </section>
    <section class="admin-marketing-layout">
      <div class="admin-panel admin-marketing-compose">
        <div class="admin-panel-header">
          <div>
            <span class="section-label">Compose</span>
            <h2>New email</h2>
          </div>
          <p class="admin-count" data-marketing-audience-count></p>
        </div>
        <form class="admin-action-form" data-marketing-form data-admin-action-form data-action="sendMarketingCampaign">
          <label>Subject<input name="marketingSubject" type="text" maxlength="140" required placeholder="Short subject line"></label>
          <label>Message<textarea name="marketingBody" maxlength="6000" required placeholder="Write the email message. A consent/unsubscribe footer is added automatically."></textarea></label>
          <div class="admin-form-error" data-action-error role="status" aria-live="polite"></div>
          <div class="admin-action-buttons"><button class="admin-button admin-button-primary" type="submit">Send email</button></div>
        </form>
      </div>
      <div class="admin-panel admin-marketing-history-panel">
        <div class="admin-panel-header"><div><span class="section-label">History</span><h2>Campaigns</h2></div></div>
        <div class="admin-mini-list" data-marketing-campaigns></div>
      </div>
    </section>
  `;
}

export async function initPage() {}

export function renderPage() {}

export function destroyPage() {}
