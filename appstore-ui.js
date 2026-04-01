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

  function isoToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function addDaysIso(days, fromDate) {
    const d = fromDate ? new Date(fromDate) : new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + Math.max(0, Number(days || 0)));
    return d.toISOString().slice(0, 10);
  }

  function showToast(message, tone) {
    let wrap = byId('appToastStack');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'appToastStack';
      wrap.className = 'app-toast-stack';
      document.body.appendChild(wrap);
    }
    const toast = document.createElement('div');
    toast.className = 'app-toast' + (tone ? ` is-${tone}` : '');
    toast.textContent = message;
    wrap.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 260);
    }, 2200);
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

  function insertPremiumHero() {
    const homeSection = document.querySelector('[data-page="home"]');
    if (homeSection && !byId('premiumHomeHero')) {
      const hero = document.createElement('div');
      hero.id = 'premiumHomeHero';
      hero.className = 'premium-hero premium-hero-home';
      hero.innerHTML = `
        <div class="premium-hero-copy">
          <div class="premium-hero-badge">✨ App Store v3</div>
          <h2>Smart översikt över allt du har hemma</h2>
          <p>Snabbare flöde, tydligare varningar och swipe mellan sidor som i en riktig app.</p>
        </div>
        <div class="premium-hero-stats">
          <div class="premium-stat"><span>Hemma</span><strong id="heroHomeCount">0</strong></div>
          <div class="premium-stat"><span>Snart slut</span><strong id="heroExpiryCount">0</strong></div>
          <div class="premium-stat"><span>Att köpa</span><strong id="heroBuyCount">0</strong></div>
        </div>
        <div class="premium-hero-hint" id="premiumHeroHint">👈👉 Svep vänster eller höger mellan sidor</div>
      `;
      const topRow = homeSection.querySelector('.section-top-row');
      if (topRow) topRow.insertAdjacentElement('afterend', hero);
      else homeSection.prepend(hero);
    }

    const quickSection = document.querySelector('[data-page="quick"]');
    if (quickSection && !byId('premiumQuickHero')) {
      const hero = document.createElement('div');
      hero.id = 'premiumQuickHero';
      hero.className = 'premium-inline-panel';
      hero.innerHTML = `
        <div>
          <div class="premium-inline-title">⚡ Snabblista pro</div>
          <div class="premium-inline-text">Sök direkt, lägg till snabbare och fyll hemmet utan extra klick.</div>
        </div>
        <div class="premium-inline-pills">
          <span class="premium-inline-pill" id="quickTemplateCountPill">0 mallar</span>
          <span class="premium-inline-pill">Enter = spara</span>
          <span class="premium-inline-pill">Ctrl + Enter = använd direkt</span>
        </div>
      `;
      const topRow = quickSection.querySelector('.section-top-row');
      if (topRow) topRow.insertAdjacentElement('afterend', hero);
      else quickSection.prepend(hero);
    }
  }

  function formatDayLabel(days) {
    if (days == null) return '—';
    if (days > 1) return `${days} dagar kvar`;
    if (days === 1) return '1 dag kvar';
    if (days === 0) return 'Går ut idag';
    if (days === -1) return 'Gick ut igår';
    return `Gick ut för ${Math.abs(days)} dagar sedan`;
  }

  function updatePremiumHero() {
    const items = Array.isArray(window.items) ? window.items : [];
    const quickItems = Array.isArray(window.quickItems) ? window.quickItems : [];
    const homeItems = items.filter(item => item.type === 'home');
    const buyItems = items.filter(item => item.type === 'buy');
    const alerts = typeof window.collectExpiryAlertItems === 'function' ? window.collectExpiryAlertItems() : [];

    const homeCount = byId('heroHomeCount');
    const expiryCount = byId('heroExpiryCount');
    const buyCount = byId('heroBuyCount');
    const quickPill = byId('quickTemplateCountPill');
    if (homeCount) homeCount.textContent = String(homeItems.length);
    if (expiryCount) expiryCount.textContent = String(alerts.length);
    if (buyCount) buyCount.textContent = String(buyItems.length);
    if (quickPill) quickPill.textContent = `${quickItems.length} mallar`;

    const dashboard = byId('expiryDashboardPro');
    if (dashboard) {
      if (!alerts.length) {
        dashboard.innerHTML = '<div class="premium-empty">Inga varor behöver varning just nu. Bra jobbat. ✅</div>';
      } else {
        dashboard.innerHTML = alerts.slice(0, 5).map(entry => `
          <article class="premium-expiry-card is-${escapeHtml(entry.status.level || 'muted')}">
            <div class="premium-expiry-top">
              <strong>${escapeHtml(entry.item.name || 'Vara')}</strong>
              <span>${escapeHtml(formatDayLabel(entry.status.effectiveDaysLeft))}</span>
            </div>
            <div class="premium-expiry-meta">
              <span>${escapeHtml((entry.item.category || 'ÖVRIGT').toString())}</span>
              <span>${escapeHtml((entry.item.place || 'plats').toString())}</span>
            </div>
          </article>
        `).join('');
      }
    }
  }

  function decorateHomeCards() {
    const cards = document.querySelectorAll('#homeList .card');
    cards.forEach(card => {
      card.classList.remove('card-expired', 'card-warning', 'card-good');
      const text = card.textContent || '';
      if (/Gick ut/i.test(text)) card.classList.add('card-expired');
      else if (/Går ut idag|1 dag kvar|2 dagar kvar|3 dagar kvar/i.test(text)) card.classList.add('card-warning');
      else if (/dagar kvar/i.test(text)) card.classList.add('card-good');
    });
  }

  function patchMarkOpened() {
    if (window.markItemOpened && window.markItemOpened.__premiumPatched) return;
    window.pickOpenedDate = function pickOpenedDate(index) {
      const item = Array.isArray(window.items) ? window.items[index] : null;
      if (!item || item.type !== 'home') return;
      const picked = window.prompt(`Välj öppnad-datum för ${item.name || 'varan'} (ÅÅÅÅ-MM-DD)`, item.openedDate || isoToday());
      if (picked == null) return;
      const value = String(picked).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        showToast('Fel datumformat. Använd ÅÅÅÅ-MM-DD.', 'error');
        return;
      }
      window.markItemOpened(index, value);
    };

    window.markItemOpened = function markItemOpenedPatched(index, customDate) {
      const items = Array.isArray(window.items) ? window.items : null;
      const item = items ? items[index] : null;
      if (!item || item.type !== 'home') return;
      const openedDate = customDate || isoToday();
      item.openedDate = openedDate;
      if (!item.bestBefore && Number(item.shelfLifeDays || 0) > 0) {
        item.bestBefore = addDaysIso(Number(item.shelfLifeDays || 0), openedDate);
      }
      if (typeof window.save === 'function') window.save();
      if (typeof window.render === 'function') window.render();
      if (typeof window.maybeSendExpiryNotifications === 'function') window.maybeSendExpiryNotifications(true);
      showToast(customDate ? 'Öppnad-datum sparat.' : 'Markerad som öppnad idag.', 'success');
    };
    window.markItemOpened.__premiumPatched = true;
  }

  function enhanceOpenButtons() {
    document.querySelectorAll('#homeList .actions').forEach(actions => {
      const openBtn = Array.from(actions.querySelectorAll('button')).find(btn => /Öppna idag/i.test(btn.textContent || ''));
      if (!openBtn || openBtn.dataset.premiumEnhanced === '1') return;
      openBtn.dataset.premiumEnhanced = '1';
      const onclickAttr = openBtn.getAttribute('onclick') || '';
      const match = onclickAttr.match(/markItemOpened\((\d+)\)/);
      if (!match) return;
      const index = Number(match[1]);
      const dateBtn = document.createElement('button');
      dateBtn.type = 'button';
      dateBtn.className = 'ghost-btn premium-date-btn';
      dateBtn.textContent = '📅 Datum';
      dateBtn.addEventListener('click', function () {
        if (typeof window.pickOpenedDate === 'function') window.pickOpenedDate(index);
      });
      openBtn.insertAdjacentElement('afterend', dateBtn);
    });
  }

  function patchNotificationUi() {
    if (window.requestExpiryNotifications && !window.requestExpiryNotifications.__premiumWrapped) {
      const original = window.requestExpiryNotifications;
      window.requestExpiryNotifications = async function wrappedRequestExpiryNotifications() {
        await original.apply(this, arguments);
        if (!('Notification' in window)) {
          showToast('Notiser stöds inte här.', 'error');
          return;
        }
        if (Notification.permission === 'granted') showToast('Notiser aktiverade 🔔', 'success');
        else if (Notification.permission === 'denied') showToast('Notiser är blockerade i webbläsaren.', 'error');
      };
      window.requestExpiryNotifications.__premiumWrapped = true;
    }
  }

  function syncNotifyButtons() {
    const state = ('Notification' in window) ? Notification.permission : 'unsupported';
    const label = state === 'granted'
      ? '🔔 Notiser aktiva'
      : state === 'denied'
        ? '🔕 Notiser blockerade'
        : '🔔 Aktivera notiser';
    ['expiryNotifyBtn', 'expiryNotifyBtnPro'].forEach(id => {
      const btn = byId(id);
      if (!btn) return;
      btn.textContent = label;
      btn.disabled = state === 'unsupported';
    });
  }

  function setupSwipeNavigation() {
    const root = document.querySelector('.main-app-shell') || document.body;
    if (!root || root.dataset.swipeReady === '1') return;
    root.dataset.swipeReady = '1';
    const pages = ['home', 'buy', 'quick', 'week', 'recipes', 'manage'];
    let startX = 0;
    let startY = 0;
    let dragging = false;

    function shouldIgnore(target) {
      return !!(target && target.closest('input, textarea, select, button, .modal-box, #imageModal img, .suggestion-box, .room-tabs, .room-subtabs'));
    }

    root.addEventListener('touchstart', function (event) {
      if (shouldIgnore(event.target)) return;
      const touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      dragging = true;
    }, { passive: true });

    root.addEventListener('touchend', function (event) {
      if (!dragging) return;
      dragging = false;
      const touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      const current = String(window.activeKitchenPage || localStorage.getItem('activeKitchenPage') || 'home');
      const currentIndex = Math.max(0, pages.indexOf(current));
      const nextIndex = dx < 0 ? Math.min(pages.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
      if (nextIndex === currentIndex) return;
      if (typeof window.setActiveKitchenPage === 'function') {
        window.setActiveKitchenPage(pages[nextIndex]);
        showToast(`Sida: ${document.querySelector(`[data-page-tab="${pages[nextIndex]}"]`)?.textContent?.trim() || pages[nextIndex]}`, 'info');
      }
    }, { passive: true });
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
      syncNotifyButtons();
      updatePremiumHero();
      decorateHomeCards();
      enhanceOpenButtons();
      return result;
    };
    window.render.__appstoreUiPatched = true;
  }

  function boot() {
    insertHomeTools();
    insertPremiumHero();
    patchMarkOpened();
    patchNotificationUi();
    setupSwipeNavigation();
    hookRender();
    syncNotifyButtons();
    updatePremiumHero();
    enhanceOpenButtons();
    decorateHomeCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
