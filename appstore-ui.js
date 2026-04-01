
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function insertHomeTools() {
    const manageSection = document.querySelector('[data-page="manage"]');
    if (!manageSection || byId('expiryTopPanel')) return;

    const panel = document.createElement('div');
    panel.className = 'expiry-top-panel';
    panel.id = 'expiryTopPanel';
    panel.innerHTML = `
      <div class="expiry-top-left">
        <div class="expiry-top-title">⏳ Går ut snart</div>
        <div class="expiry-top-subtitle">Topp 5 viktigaste varorna först, med smart sortering och varningar.</div>
      </div>
      <div class="expiry-top-actions">
        <label class="expiry-control">
          <span>Sortering</span>
          <select id="expirySortModePro">
            <option value="expiry">Går ut först</option>
            <option value="name">Namn A-Ö</option>
          </select>
        </label>
        <button type="button" class="ghost-btn expiry-notify-btn" id="expiryNotifyBtnPro">🔔 Aktivera notiser</button>
      </div>
    `;

    // Place at top of Manage page
    manageSection.prepend(panel);

    const dashboard = document.createElement('div');
    dashboard.id = 'expiryDashboardPro';
    dashboard.className = 'expiry-dashboard-pro';
    panel.after(dashboard);

    const select = byId('expirySortModePro');
    if (select) {
      select.value = window.expirySortMode || 'expiry';
      select.addEventListener('change', function () {
        if (typeof window.setExpirySortMode === 'function') window.setExpirySortMode(this.value);
      });
    }

    const btn = byId('expiryNotifyBtnPro');
    if (btn) {
      btn.addEventListener('click', function () {
        if (typeof window.requestExpiryNotifications === 'function') window.requestExpiryNotifications();
      });
    }
  }

  function hookRender() {
    if (typeof window.render !== 'function' || window.render.__appstoreUiPatched) return;
    const original = window.render;
    window.render = function patchedRender() {
      const result = original.apply(this, arguments);
      const select = byId('expirySortModePro');
      if (select && select.value !== (window.expirySortMode || 'expiry')) {
        select.value = window.expirySortMode || 'expiry';
      }
      if (typeof window.updateExpiryControls === 'function') window.updateExpiryControls();
      if (typeof window.collectExpiryAlertItems === 'function') {
        // trigger any dashboard updates already wired elsewhere
      }
      return result;
    };
    window.render.__appstoreUiPatched = true;
  }

  function boot() {
    insertHomeTools();
    hookRender();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
