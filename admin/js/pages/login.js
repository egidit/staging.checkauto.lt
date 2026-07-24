export const page = 'login';

export function renderStaticPage(root) {
  root.innerHTML = `
    <section class="admin-login">
      <div class="admin-login-panel">
        <div class="admin-brand">check<span>auto</span>.lt</div>
        <p class="admin-login-kicker">Admin</p>
        <h1>Sign in</h1>
        <form data-admin-login-form>
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <p class="admin-status" data-admin-login-status role="status" aria-live="polite"></p>
          <button class="admin-button admin-button-primary" type="submit">Sign in</button>
        </form>
      </div>
    </section>
  `;
}

export async function initPage() {}

export function renderPage() {}

export function destroyPage() {}
