
(function () {
  'use strict';

  function norm(v) {
    try {
      if (typeof window.normalizeText === 'function') return window.normalizeText(v || '');
    } catch (e) {}
    return String(v || '').trim().toLowerCase();
  }

  function num(v, fb = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }

  function isWeightUnit(unit) {
    const u = String(unit || '').toLowerCase();
    return ['g', 'kg', 'hg', 'mg', 'ml', 'cl', 'dl', 'l'].includes(u);
  }

  function toBaseWeight(value, unit) {
    const n = num(value, 0);
    const u = String(unit || '').toLowerCase();
    if (u === 'kg' || u === 'l') return n * 1000;
    if (u === 'hg') return n * 100;
    if (u === 'cl') return n * 10;
    if (u === 'dl') return n * 100;
    return n;
  }

  function formatDisplay(value, unit) {
    const n = num(value, 0);
    const u = String(unit || '').toLowerCase();
    try {
      if (typeof window.formatSmartMeasureDisplay === 'function') {
        return window.formatSmartMeasureDisplay(n, u);
      }
    } catch (e) {}
    if ((u === 'g' || u === 'ml') && n >= 1000) return (n / 1000).toLocaleString('sv-SE', {maximumFractionDigits: 2}) + ' ' + (u === 'g' ? 'kg' : 'l');
    return n.toLocaleString('sv-SE', {maximumFractionDigits: 2}) + ' ' + u;
  }

  function getQuickTemplate(name) {
    if (!Array.isArray(window.quickItems)) return null;
    return window.quickItems.find(q => norm(q && q.name) === norm(name)) || null;
  }

  function buyListArray() {
    if (!Array.isArray(window.items)) return [];
    return window.items;
  }

  function hasPendingRestock(name, template) {
    const tSize = num(template && template.size, 0);
    const tUnit = String((template && template.unit) || 'g').toLowerCase();
    return buyListArray().some(item =>
      item &&
      item.type === 'buy' &&
      norm(item.name) === norm(name) &&
      num(item.size, 0) === tSize &&
      String(item.unit || '').toLowerCase() === tUnit
    );
  }

  function addRestockFromTemplate(template, count) {
    const qty = Math.max(1, num(count, 1));
    let buyItem = null;

    try {
      if (typeof window.buildQuickPackBuyItem === 'function') {
        buyItem = window.buildQuickPackBuyItem(template, qty);
      }
    } catch (e) {}

    if (!buyItem) {
      buyItem = {
        name: template.name,
        quantity: qty,
        unit: template.unit || 'g',
        size: num(template.size, 0),
        price: num(template.price, 0),
        category: template.category || '',
        place: template.place || 'kyl',
        room: template.room || window.activeRoom || 'koket',
        img: template.img || '',
        type: 'buy',
        measureText: formatDisplay(template.size, template.unit || 'g'),
        weightText: formatDisplay(template.size, template.unit || 'g')
      };
    }

    try {
      if (typeof window.pushOrMergeBuyPack === 'function') {
        window.pushOrMergeBuyPack(buyItem);
      } else {
        window.items.push(buyItem);
      }
    } catch (e) {
      window.items.push(buyItem);
    }
  }

  function maybeRestockBelowTemplate(beforeItem, afterItem) {
    if (!beforeItem) return;
    const live = afterItem || beforeItem;
    if (String(live.type || '') !== 'home') return;

    const template = getQuickTemplate(live.name);
    if (!template) return;

    const unit = String(live.unit || template.unit || '').toLowerCase();
    const tUnit = String(template.unit || unit || 'g').toLowerCase();
    if (!isWeightUnit(unit) && !isWeightUnit(tUnit)) return;

    const templateBase = toBaseWeight(template.size, tUnit);
    if (templateBase <= 0) return;

    const beforeQty = Math.max(1, num(beforeItem.quantity, 1));
    const afterQty = Math.max(0, num(afterItem ? afterItem.quantity : 0, 0));

    const beforeBase = toBaseWeight(beforeItem.size, unit || tUnit) * beforeQty;
    const afterBase = toBaseWeight(afterItem ? afterItem.size : beforeItem.size, (afterItem ? afterItem.unit : beforeItem.unit) || unit || tUnit) * afterQty;

    // Only when it crosses from >= template to < template
    const crossedBelow = beforeBase >= templateBase && afterBase < templateBase
    if (!crossedBelow) return;

    if (hasPendingRestock(live.name, template)) return;

    addRestockFromTemplate(template, 1);

    try {
      if (typeof window.save === 'function') window.save();
      if (typeof window.render === 'function') window.render();
    } catch (e) {}
  }

  function patchUpdateQuantity() {
    const original = window.updateQuantity;
    if (typeof original !== 'function') return false;

    window.updateQuantity = function patchedThresholdUpdateQuantity(index, delta) {
      const before = Array.isArray(window.items) && window.items[index] ? { ...window.items[index] } : null;
      const result = original(index, delta);
      const after = Array.isArray(window.items) ? window.items[index] || null : null;
      try { maybeRestockBelowTemplate(before, after); } catch (e) { console.error(e); }
      return result;
    };
    return true;
  }

  function patchSaveEditItem() {
    const original = window.saveEditItem;
    if (typeof original !== 'function') return false;

    window.saveEditItem = function patchedThresholdSaveEditItem() {
      const indexEl = document.getElementById('editIndex');
      const idx = indexEl ? Number(indexEl.value) : NaN;
      const before = Number.isFinite(idx) && Array.isArray(window.items) && window.items[idx] ? { ...window.items[idx] } : null;
      const result = original.apply(this, arguments);
      const after = Number.isFinite(idx) && Array.isArray(window.items) ? window.items[idx] || null : null;
      try { maybeRestockBelowTemplate(before, after); } catch (e) { console.error(e); }
      return result;
    };
    return true;
  }

  function patchQuickSyncLock() {
    // Snabblista should remain template-only && never overwrite home/buy amounts
    try {
      if (typeof window.cloneTemplateFieldsForListItem === 'function') {
        const original = window.cloneTemplateFieldsForListItem;
        window.cloneTemplateFieldsForListItem = function(listItem, quickTemplate, oldNameNormalized) {
          const next = original(listItem, quickTemplate, oldNameNormalized);
          if (!next || !listItem) return next;
          next.quantity = listItem.quantity;
          next.size = listItem.size;
          next.measureText = listItem.measureText;
          next.weightText = listItem.weightText;
          return next;
        };
      }
    } catch (e) {}
  }

  function boot() {
    patchQuickSyncLock();
    const ok1 = patchUpdateQuantity();
    const ok2 = patchSaveEditItem();
    if (!ok1 && !ok2) {
      setTimeout(boot, 150);
      return;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
