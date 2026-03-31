
(function () {
  'use strict';

  const DEFAULT_TEMPLATES = {
    'mjolk': { bestBeforeDays: 7, openDays: 5 },
    'filmjolk': { bestBeforeDays: 10, openDays: 5 },
    'yoghurt': { bestBeforeDays: 10, openDays: 5 },
    'brod': { bestBeforeDays: 5, openDays: 3 },
    'limpa': { bestBeforeDays: 5, openDays: 3 },
    'juice': { bestBeforeDays: 14, openDays: 7 },
    'ost': { bestBeforeDays: 21, openDays: 7 },
    'smor': { bestBeforeDays: 30, openDays: 14 },
    'skinka': { bestBeforeDays: 7, openDays: 4 },
    'gradde': { bestBeforeDays: 10, openDays: 5 },
    'kottfars': { bestBeforeDays: 2, openDays: 1 },
    'kyckling': { bestBeforeDays: 2, openDays: 1 }
  };

  let notificationTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function normalizeTextLite(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function todayAtMidnight() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isoDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function addDaysIso(days, fromDate) {
    const d = fromDate ? new Date(fromDate) : todayAtMidnight();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + Math.max(0, Number(days || 0)));
    return d.toISOString().slice(0, 10);
  }

  function diffDays(targetDate) {
    if (!targetDate) return null;
    const base = todayAtMidnight().getTime();
    const d = new Date(targetDate);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - base) / 86400000);
  }

  function getTemplateDefaults(name) {
    const key = normalizeTextLite(name);
    if (!key) return {};
    if (DEFAULT_TEMPLATES[key]) return { ...DEFAULT_TEMPLATES[key] };

    const match = Object.keys(DEFAULT_TEMPLATES).find(entry => key.includes(entry) || entry.includes(key));
    return match ? { ...DEFAULT_TEMPLATES[match] } : {};
  }

  function numberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function positiveIntOrBlank(value) {
    if (value === '' || value == null) return '';
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 0 ? n : '';
  }

  function ensureExpiryFields(item) {
    if (!item || typeof item !== 'object') return item;

    if (item.bestBeforeDate && !item.bestBefore) item.bestBefore = item.bestBeforeDate;
    if (item.openedOn && !item.openedDate) item.openedDate = item.openedOn;

    item.bestBefore = isoDate(item.bestBefore);
    item.openedDate = isoDate(item.openedDate);

    const template = getTemplateDefaults(item.name);
    const bestBeforeDays = positiveIntOrBlank(item.bestBeforeDays);
    const openDays = positiveIntOrBlank(item.openDays);

    if (bestBeforeDays === '' && template.bestBeforeDays != null) item.bestBeforeDays = template.bestBeforeDays;
    else if (bestBeforeDays !== '') item.bestBeforeDays = bestBeforeDays;

    if (openDays === '' && template.openDays != null) item.openDays = template.openDays;
    else if (openDays !== '') item.openDays = openDays;

    return item;
  }

  function expiryInfo(item) {
    ensureExpiryFields(item);
    const info = {
      bestBeforeDaysLeft: diffDays(item.bestBefore),
      openedDaysElapsed: item.openedDate ? Math.max(0, -diffDays(item.openedDate)) : null,
      openedDaysLeft: null,
      tone: 'ok',
      rows: []
    };

    if (info.bestBeforeDaysLeft != null) {
      if (info.bestBeforeDaysLeft < 0) {
        info.tone = 'expired';
        info.rows.push(`🔴 Bäst före gick ut för ${Math.abs(info.bestBeforeDaysLeft)} dag${Math.abs(info.bestBeforeDaysLeft) === 1 ? '' : 'ar'} sedan`);
      } else if (info.bestBeforeDaysLeft === 0) {
        info.tone = 'expired';
        info.rows.push('🔴 Bäst före idag');
      } else if (info.bestBeforeDaysLeft <= 3) {
        if (info.tone !== 'expired') info.tone = 'warn';
        info.rows.push(`🟡 Bäst före om ${info.bestBeforeDaysLeft} dag${info.bestBeforeDaysLeft === 1 ? '' : 'ar'}`);
      } else {
        info.rows.push(`🟢 Bäst före om ${info.bestBeforeDaysLeft} dagar`);
      }
    }

    if (item.openedDate && Number(item.openDays || 0) > 0) {
      info.openedDaysLeft = Number(item.openDays || 0) - Number(info.openedDaysElapsed || 0);
      if (info.openedDaysLeft < 0) {
        info.tone = 'expired';
        info.rows.push(`🟠 Öppnad gick ut för ${Math.abs(info.openedDaysLeft)} dag${Math.abs(info.openedDaysLeft) === 1 ? '' : 'ar'} sedan`);
      } else if (info.openedDaysLeft === 0) {
        if (info.tone !== 'expired') info.tone = 'warn';
        info.rows.push('🟠 Öppnad går ut idag');
      } else if (info.openedDaysLeft <= 2) {
        if (info.tone !== 'expired') info.tone = 'warn';
        info.rows.push(`🟠 ${info.openedDaysLeft} dag${info.openedDaysLeft === 1 ? '' : 'ar'} kvar efter öppning`);
      } else {
        info.rows.push(`🔓 ${info.openedDaysLeft} dagar kvar efter öppning`);
      }
    } else if (item.openedDate) {
      info.rows.push(`🔓 Öppnad ${info.openedDaysElapsed || 0} dag${(info.openedDaysElapsed || 0) === 1 ? '' : 'ar'} sedan`);
    }

    return info;
  }

  function compareByExpiry(a, b) {
    const aInfo = expiryInfo(a);
    const bInfo = expiryInfo(b);

    const aBest = aInfo.bestBeforeDaysLeft == null ? 999999 : aInfo.bestBeforeDaysLeft;
    const bBest = bInfo.bestBeforeDaysLeft == null ? 999999 : bInfo.bestBeforeDaysLeft;
    if (aBest !== bBest) return aBest - bBest;

    const aOpened = aInfo.openedDaysLeft == null ? 999999 : aInfo.openedDaysLeft;
    const bOpened = bInfo.openedDaysLeft == null ? 999999 : bInfo.openedDaysLeft;
    if (aOpened !== bOpened) return aOpened - bOpened;

    return String(a?.name || '').localeCompare(String(b?.name || ''), 'sv', { sensitivity: 'base' });
  }

  function requestNotificationPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch (error) {}
  }

  function notificationKey(item, type, daysLeft) {
    return ['expiry_notice', type, normalizeTextLite(item?.name || ''), daysLeft, item?.bestBefore || '', item?.openedDate || ''].join('|');
  }

  function wasNotified(key) {
    try { return localStorage.getItem(key) === '1'; } catch (error) { return false; }
  }

  function markNotified(key) {
    try { localStorage.setItem(key, '1'); } catch (error) {}
  }

  function notifySoonExpiringItems() {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (!Array.isArray(window.items)) return;

      window.items
        .filter(item => item && item.type === 'home')
        .forEach(item => {
          const info = expiryInfo(item);

          if (info.bestBeforeDaysLeft != null && info.bestBeforeDaysLeft >= 0 && info.bestBeforeDaysLeft <= 1) {
            const key = notificationKey(item, 'best-before', info.bestBeforeDaysLeft);
            if (!wasNotified(key)) {
              new Notification('Snart utgången', {
                body: `${item.name || 'Vara'} ${info.bestBeforeDaysLeft === 0 ? 'går ut idag' : 'går ut imorgon'}.`
              });
              markNotified(key);
            }
          }

          if (item.openedDate && info.openedDaysLeft != null && info.openedDaysLeft >= 0 && info.openedDaysLeft <= 1) {
            const key = notificationKey(item, 'opened', info.openedDaysLeft);
            if (!wasNotified(key)) {
              new Notification('Snart slut efter öppning', {
                body: `${item.name || 'Vara'} ${info.openedDaysLeft === 0 ? 'går ut idag efter öppning' : 'går ut imorgon efter öppning'}.`
              });
              markNotified(key);
            }
          }
        });
    } catch (error) {}
  }

  function scheduleNotifications() {
    if (notificationTimer) clearInterval(notificationTimer);
    notificationTimer = setInterval(notifySoonExpiringItems, 60000);
    setTimeout(notifySoonExpiringItems, 1200);
  }

  function buildExpiryFields() {
    if (byId('itemBestBeforeWrap')) return;

    const controls = document.querySelector('.quick-add-controls');
    const priceField = document.querySelector('.quick-field.quick-field-price');
    if (!controls || !priceField) return;

    const bestBeforeWrap = document.createElement('div');
    bestBeforeWrap.className = 'quick-field quick-field-expiry';
    bestBeforeWrap.id = 'itemBestBeforeWrap';
    bestBeforeWrap.innerHTML = '<input id="itemBestBefore" type="date" title="Bäst före datum">';

    const bestBeforeDaysWrap = document.createElement('div');
    bestBeforeDaysWrap.className = 'quick-field quick-field-expiry';
    bestBeforeDaysWrap.id = 'itemBestBeforeDaysWrap';
    bestBeforeDaysWrap.innerHTML = '<input id="itemBestBeforeDays" type="number" min="0" placeholder="Bäst före dagar">';

    const openDaysWrap = document.createElement('div');
    openDaysWrap.className = 'quick-field quick-field-expiry';
    openDaysWrap.id = 'itemOpenDaysWrap';
    openDaysWrap.innerHTML = '<input id="itemOpenDays" type="number" min="0" placeholder="Öppnad dagar">';

    controls.insertBefore(bestBeforeWrap, priceField.nextSibling);
    controls.insertBefore(bestBeforeDaysWrap, bestBeforeWrap.nextSibling);
    controls.insertBefore(openDaysWrap, bestBeforeDaysWrap.nextSibling);

    const nameInput = byId('itemName');
    if (nameInput) {
      nameInput.addEventListener('blur', applyTemplateDefaultsToForm, { passive: true });
      nameInput.addEventListener('change', applyTemplateDefaultsToForm, { passive: true });
    }
  }

  function buildExpiryDashboard() {
    if (byId('expiryDashboard')) return;
    const homeSection = byId('homeList')?.closest('.section');
    if (!homeSection || !homeSection.parentNode) return;

    const dash = document.createElement('section');
    dash.className = 'section expiry-dashboard';
    dash.id = 'expiryDashboard';
    dash.innerHTML = [
      '<div class="expiry-dashboard-head">',
      '<div>',
      '<div class="section-title">⏳ Går ut snart</div>',
      '<div class="section-subtitle" style="text-align:left;margin-top:6px;">Visar de 5 viktigaste varorna först.</div>',
      '</div>',
      '<button type="button" class="ghost-btn" id="enableExpiryNotifBtn">🔔 Aktivera varningar</button>',
      '</div>',
      '<div id="expiryDashboardList" class="expiry-dashboard-list"></div>'
    ].join('');

    homeSection.parentNode.insertBefore(dash, homeSection);

    const btn = byId('enableExpiryNotifBtn');
    if (btn) btn.addEventListener('click', requestNotificationPermission);
  }

  function applyTemplateDefaultsToForm(force = false) {
    const name = byId('itemName')?.value || '';
    const matchedQuick = Array.isArray(window.quickItems)
      ? window.quickItems.find(q => normalizeTextLite(q?.name) === normalizeTextLite(name))
      : null;

    const source = matchedQuick || { name, ...getTemplateDefaults(name) };
    const bestBeforeInput = byId('itemBestBefore');
    const bestBeforeDaysInput = byId('itemBestBeforeDays');
    const openDaysInput = byId('itemOpenDays');

    if (!bestBeforeInput || !bestBeforeDaysInput || !openDaysInput) return;

    const bestBeforeDays = positiveIntOrBlank(source.bestBeforeDays);
    const openDays = positiveIntOrBlank(source.openDays);

    if (force || !bestBeforeDaysInput.value) {
      bestBeforeDaysInput.value = bestBeforeDays === '' ? '' : String(bestBeforeDays);
    }
    if (force || !openDaysInput.value) {
      openDaysInput.value = openDays === '' ? '' : String(openDays);
    }
    if ((force || !bestBeforeInput.value) && bestBeforeDays !== '') {
      bestBeforeInput.value = addDaysIso(bestBeforeDays);
    }
  }

  function clearExpiryFields() {
    const ids = ['itemBestBefore', 'itemBestBeforeDays', 'itemOpenDays'];
    ids.forEach(id => {
      const el = byId(id);
      if (el) el.value = '';
    });
  }

  function patchBuildItemFromForm() {
    if (typeof window.buildItemFromForm !== 'function' || window.buildItemFromForm.__expiryPatched) return;

    const original = window.buildItemFromForm;
    window.buildItemFromForm = function patchedBuildItemFromForm() {
      const result = original.apply(this, arguments);
      if (!result || !result.item) return result;

      const bestBeforeInput = byId('itemBestBefore');
      const bestBeforeDaysInput = byId('itemBestBeforeDays');
      const openDaysInput = byId('itemOpenDays');
      const matchedQuick = result.matchedQuick || null;
      const item = result.item;

      const template = getTemplateDefaults(item.name);
      const bestBeforeDays = positiveIntOrBlank(bestBeforeDaysInput?.value);
      const openDays = positiveIntOrBlank(openDaysInput?.value);

      item.bestBeforeDays = bestBeforeDays !== '' ? bestBeforeDays
        : positiveIntOrBlank(matchedQuick?.bestBeforeDays) !== '' ? positiveIntOrBlank(matchedQuick?.bestBeforeDays)
        : template.bestBeforeDays ?? '';

      item.openDays = openDays !== '' ? openDays
        : positiveIntOrBlank(matchedQuick?.openDays) !== '' ? positiveIntOrBlank(matchedQuick?.openDays)
        : template.openDays ?? '';

      item.bestBefore = isoDate(bestBeforeInput?.value)
        || isoDate(matchedQuick?.bestBefore)
        || (item.bestBeforeDays !== '' ? addDaysIso(item.bestBeforeDays) : '');

      ensureExpiryFields(item);
      return result;
    };
    window.buildItemFromForm.__expiryPatched = true;
  }

  function patchSaveQuickTemplate() {
    if (typeof window.saveQuickTemplate !== 'function' || window.saveQuickTemplate.__expiryPatched) return;

    const original = window.saveQuickTemplate;
    window.saveQuickTemplate = function patchedSaveQuickTemplate(item) {
      ensureExpiryFields(item);
      const result = original.apply(this, arguments);

      const list = Array.isArray(window.quickItems) ? window.quickItems : [];
      const found = list.find(entry => normalizeTextLite(entry?.name) === normalizeTextLite(item?.name));
      if (found) {
        ensureExpiryFields(found);
        if (item.bestBeforeDays !== '' && item.bestBeforeDays != null) found.bestBeforeDays = positiveIntOrBlank(item.bestBeforeDays);
        if (item.openDays !== '' && item.openDays != null) found.openDays = positiveIntOrBlank(item.openDays);
        if (item.bestBefore) found.bestBefore = isoDate(item.bestBefore);
      }
      return result;
    };
    window.saveQuickTemplate.__expiryPatched = true;
  }

  function patchSaveHomeItem() {
    if (typeof window.saveHomeItem !== 'function' || window.saveHomeItem.__expiryPatched) return;

    const original = window.saveHomeItem;
    window.saveHomeItem = function patchedSaveHomeItem(item) {
      ensureExpiryFields(item);
      const beforeLength = Array.isArray(window.items) ? window.items.length : 0;
      const result = original.apply(this, arguments);

      if (Array.isArray(window.items)) {
        const addedOrMerged = window.items.find(entry => entry && entry.type === 'home' && normalizeTextLite(entry.name) === normalizeTextLite(item.name));
        if (addedOrMerged) {
          ensureExpiryFields(addedOrMerged);
          if (item.bestBefore) {
            const current = diffDays(addedOrMerged.bestBefore);
            const incoming = diffDays(item.bestBefore);
            if (incoming != null && (current == null || incoming < current)) {
              addedOrMerged.bestBefore = isoDate(item.bestBefore);
            }
          }
          if (positiveIntOrBlank(item.openDays) !== '') addedOrMerged.openDays = positiveIntOrBlank(item.openDays);
          if (positiveIntOrBlank(item.bestBeforeDays) !== '') addedOrMerged.bestBeforeDays = positiveIntOrBlank(item.bestBeforeDays);
        }

        window.items.forEach(ensureExpiryFields);
      }
      return result;
    };
    window.saveHomeItem.__expiryPatched = true;
  }

  function patchClearInputs() {
    if (typeof window.clearInputs !== 'function' || window.clearInputs.__expiryPatched) return;
    const original = window.clearInputs;
    window.clearInputs = function patchedClearInputs() {
      const result = original.apply(this, arguments);
      clearExpiryFields();
      return result;
    };
    window.clearInputs.__expiryPatched = true;
  }

  function openToday(index) {
    const item = Array.isArray(window.items) ? window.items[index] : null;
    if (!item) return;
    item.openedDate = isoDate(new Date());
    ensureExpiryFields(item);
    if (typeof window.save === 'function') window.save();
    if (typeof window.render === 'function') window.render();
  }

  function clearOpenedDate(index) {
    const item = Array.isArray(window.items) ? window.items[index] : null;
    if (!item) return;
    item.openedDate = '';
    if (typeof window.save === 'function') window.save();
    if (typeof window.render === 'function') window.render();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createExpiryMarkup(item, index) {
    const info = expiryInfo(item);
    if (!info.rows.length && !item.bestBefore && !item.openDays && !item.openedDate) {
      return '<div class="expiry-block expiry-block-empty">Ingen bäst före satt</div>';
    }

    return [
      `<div class="expiry-block expiry-tone-${info.tone}">`,
      info.rows.map(row => `<div class="expiry-row">${escapeHtml(row)}</div>`).join(''),
      '<div class="expiry-actions-inline">',
      `<button type="button" class="ghost-btn expiry-open-btn" onclick="openToday(${index})">Öppna idag</button>`,
      item.openedDate ? `<button type="button" class="ghost-btn expiry-reset-btn" onclick="clearOpenedDate(${index})">Nollställ öppnad</button>` : '',
      '</div>',
      '</div>'
    ].join('');
  }

  function patchCreateCard() {
    if (typeof window.createCard !== 'function' || window.createCard.__expiryPatched) return;

    const original = window.createCard;
    window.createCard = function patchedCreateCard(item, source) {
      const card = original.apply(this, arguments);
      if (!card || source === 'quick' || item?.type !== 'home') return card;

      const realIndex = Array.isArray(window.items) ? window.items.indexOf(item) : -1;
      if (realIndex < 0) return card;

      ensureExpiryFields(item);

      const info = card.querySelector('.info');
      if (info && !info.querySelector('.expiry-block')) {
        info.insertAdjacentHTML('beforeend', createExpiryMarkup(item, realIndex));
      }

      return card;
    };
    window.createCard.__expiryPatched = true;
  }

  function patchRenderHomeList() {
    if (typeof window.renderHomeList !== 'function' || window.renderHomeList.__expiryPatched) return;

    const original = window.renderHomeList;
    window.renderHomeList = function patchedRenderHomeList(searchText, categoryFilter) {
      if (Array.isArray(window.items)) {
        const homeItems = window.items.filter(item => item && item.type === 'home');
        homeItems.forEach(ensureExpiryFields);
        homeItems.sort(compareByExpiry);
      }
      return original.apply(this, arguments);
    };
    window.renderHomeList.__expiryPatched = true;
  }

  function updateDashboard() {
    const target = byId('expiryDashboardList');
    if (!target || !Array.isArray(window.items)) return;

    const expiring = window.items
      .filter(item => item && item.type === 'home')
      .map(item => ({ item, info: expiryInfo(item) }))
      .filter(entry => entry.info.bestBeforeDaysLeft != null || entry.info.openedDaysLeft != null)
      .sort((a, b) => compareByExpiry(a.item, b.item))
      .slice(0, 5);

    if (!expiring.length) {
      target.innerHTML = '<div class="empty">Inga varor med bäst före ännu.</div>';
      return;
    }

    target.innerHTML = expiring.map(entry => {
      const item = entry.item;
      const lines = entry.info.rows.map(row => `<div class="expiry-dashboard-meta">${escapeHtml(row)}</div>`).join('');
      return [
        `<div class="expiry-dashboard-card tone-${entry.info.tone}">`,
        `<div class="expiry-dashboard-name">${escapeHtml(item.name || 'Vara')}</div>`,
        `<div class="expiry-dashboard-meta">${escapeHtml((window.getRoomLabel ? window.getRoomLabel(item.room || window.activeRoom || 'koket') : (item.room || 'Rum')))}</div>`,
        lines,
        '</div>'
      ].join('');
    }).join('');
  }

  function patchRender() {
    if (typeof window.render !== 'function' || window.render.__expiryPatched) return;
    const original = window.render;
    window.render = function patchedRender() {
      if (Array.isArray(window.items)) window.items.forEach(ensureExpiryFields);
      if (Array.isArray(window.quickItems)) window.quickItems.forEach(ensureExpiryFields);
      const result = original.apply(this, arguments);
      updateDashboard();
      return result;
    };
    window.render.__expiryPatched = true;
  }

  function applyPatches() {
    buildExpiryFields();
    buildExpiryDashboard();
    patchBuildItemFromForm();
    patchSaveQuickTemplate();
    patchSaveHomeItem();
    patchClearInputs();
    patchCreateCard();
    patchRenderHomeList();
    patchRender();
    applyTemplateDefaultsToForm(false);
    scheduleNotifications();
    requestNotificationPermission();
    if (Array.isArray(window.items)) window.items.forEach(ensureExpiryFields);
    if (Array.isArray(window.quickItems)) window.quickItems.forEach(ensureExpiryFields);
  }

  function installGlobals() {
    window.openToday = openToday;
    window.clearOpenedDate = clearOpenedDate;
    window.applyTemplateDefaultsToForm = applyTemplateDefaultsToForm;
    window.ensureExpiryFields = ensureExpiryFields;
    window.expiryInfo = expiryInfo;
  }

  function boot() {
    installGlobals();
    applyPatches();
    if (typeof window.render === 'function') {
      try { window.render(); } catch (error) { console.error(error); }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
