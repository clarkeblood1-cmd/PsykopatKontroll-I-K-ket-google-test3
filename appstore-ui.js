
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

  function insertHero() {
    const page = document.querySelector('.page');
    const summary = document.querySelector('.summary-bar');
    if (!page || !summary || byId('appStoreHero')) return;

    const hero = document.createElement('section');
    hero.className = 'app-store-hero';
    hero.id = 'appStoreHero';
    hero.innerHTML = `
      <div class="app-store-hero-card">
        <div class="app-store-hero-copy">
          <div class="app-store-kicker">PsykopatKontroll • Premium home inventory</div>
          <h1>Ha hemma med riktig bäst före, öppnad och smart varning</h1>
          <p>Få App Store-känsla med tydliga kort, expiring dashboard, sortering på utgångsdatum och notiser som verkligen hjälper dig innan maten går ut.</p>
          <div class="app-store-hero-chips">
            <span>⏳ Bäst före</span>
            <span>📂 Öppna idag</span>
            <span>🔔 Notiser</span>
            <span>🏠 Rum & platser</span>
          </div>
        </div>
        <div class="app-store-hero-art">
          <div class="app-store-icon-ring">
            <img src="icons/icon-512.png" alt="Appikon">
          </div>
        </div>
      </div>
    `;
    page.insertBefore(hero, summary);
  }

  function enhanceHeader() {
    const title = document.querySelector('.header-title');
    if (!title || title.querySelector('.header-app-icon')) return;
    const icon = document.createElement('img');
    icon.src = 'icons/icon-192.png';
    icon.alt = 'Appikon';
    icon.className = 'header-app-icon';
    title.insertBefore(icon, title.firstChild);
  }

  function insertHomeTools() {
    const homeSection = document.querySelector('[data-page="home"]');
    const subtitle = byId('homeRoomSubtitle');
    if (!homeSection || !subtitle || byId('expiryTopPanel')) return;

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
    subtitle.insertAdjacentElement('afterend', panel);

    const dashboard = document.createElement('div');
    dashboard.id = 'expiryDashboardPro';
    dashboard.className = 'expiry-dashboard-pro';
    panel.insertAdjacentElement('afterend', dashboard);

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

  function insertQuickTip() {
    const quickHero = document.querySelector('.quick-add-hero-card');
    if (!quickHero || byId('quickExpiryTip')) return;
    const div = document.createElement('div');
    div.id = 'quickExpiryTip';
    div.className = 'quick-expiry-tip';
    div.innerHTML = `
      <strong>Pro tips:</strong>
      Sätt <em>Bäst före</em>, <em>Bäst före dagar</em> och <em>Efter öppning dagar</em> direkt när du lägger till en vara,
      så får du smart nedräkning och varning i Har hemma.
    `;
    quickHero.appendChild(div);
  }

  function getAlerts() {
    if (typeof window.collectExpiryAlertItems === 'function') return window.collectExpiryAlertItems();
    return [];
  }

  function formatRemaining(days) {
    if (typeof window.formatRemainingDays === 'function') return window.formatRemainingDays(days);
    if (days == null) return '';
    if (days > 1) return days + ' dagar kvar';
    if (days === 1) return '1 dag kvar';
    if (days === 0) return 'Går ut idag';
    return 'Gick ut för ' + Math.abs(days) + ' dagar sedan';
  }

  function roomLabel(item) {
    if (typeof window.getRoomLabel === 'function') {
      return window.getRoomLabel(item.room || window.activeRoom || 'koket');
    }
    return item.room || 'Rum';
  }

  function updateNotifyButtonState() {
    const btn = byId('expiryNotifyBtnPro');
    if (!btn) return;
    const supported = 'Notification' in window;
    if (!supported) {
      btn.disabled = true;
      btn.textContent = '🔕 Notiser stöds inte';
      return;
    }
    const perm = Notification.permission;
    btn.disabled = false;
    btn.textContent = perm === 'granted' ? '🔔 Notiser aktiva' : '🔔 Aktivera notiser';
  }

  function updateDashboard() {
    const target = byId('expiryDashboardPro');
    if (!target) return;
    const alerts = getAlerts();
    if (!alerts.length) {
      target.innerHTML = '<div class="empty">Inga varor ligger nära utgång just nu. Lägg till bäst före på dina varor för att få smart överblick.</div>';
      return;
    }

    const top = alerts.slice(0, 5);
    target.innerHTML = top.map(function(entry) {
      const status = entry.status || {};
      const item = entry.item || {};
      const dangerClass = status.effectiveDaysLeft < 0 ? 'expired' : (status.effectiveDaysLeft <= 3 ? 'warning' : 'good');
      const badges = (typeof window.getExpiryBadges === 'function' ? window.getExpiryBadges(item) : [])
        .slice(0, 3)
        .map(function(b) { return '<span class="expiry-mini-pill expiry-' + escapeHtml(b.level) + '">' + escapeHtml(b.label) + '</span>'; })
        .join('');

      return `
        <article class="expiry-dashboard-card-pro ${dangerClass}">
          <div class="expiry-dashboard-card-head">
            <div>
              <div class="expiry-dashboard-name">${escapeHtml(item.name || 'Vara')}</div>
              <div class="expiry-dashboard-room">${escapeHtml(roomLabel(item))}</div>
            </div>
            <div class="expiry-dashboard-days">${escapeHtml(formatRemaining(status.effectiveDaysLeft))}</div>
          </div>
          <div class="expiry-dashboard-badges">${badges}</div>
          <div class="expiry-dashboard-actions">
            <button type="button" class="ghost-btn" onclick="markItemOpened(${window.items ? window.items.indexOf(item) : -1})">📂 Öppna idag</button>
          </div>
        </article>
      `;
    }).join('');

    const countNode = byId('expiringSoonCount');
    if (countNode) countNode.textContent = String(alerts.length);
  }

  function insertSummaryUpgrade() {
    const summary = document.querySelector('.summary-bar');
    if (!summary || byId('expiringSummaryBox')) return;
    const box = document.createElement('div');
    box.className = 'summary-box summary-box-expiring';
    box.id = 'expiringSummaryBox';
    box.innerHTML = `
      <div>Snart utgångna</div>
      <strong id="expiringSoonCount">0</strong>
      <div class="summary-expiring-caption">Bäst före + öppnad</div>
    `;
    summary.appendChild(box);
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
      updateNotifyButtonState();
      updateDashboard();
      return result;
    };
    window.render.__appstoreUiPatched = true;
  }

  function boot() {
    enhanceHeader();
    insertHero();
    insertSummaryUpgrade();
    insertHomeTools();
    insertQuickTip();
    hookRender();
    updateNotifyButtonState();
    if (typeof window.render === 'function') window.render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
