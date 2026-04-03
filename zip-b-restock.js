
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

  function toBase(value, unit) {
    const n = num(value, 0);
    const u = String(unit || '').toLowerCase();
    if (u === 'kg' || u === 'l') return n * 1000;
    if (u === 'hg') return n * 100;
    if (u === 'cl') return n * 10;
    if (u === 'dl') return n * 100;
    return n;
  }

  function fromBase(value, unit) {
    const n = num(value, 0);
    const u = String(unit || '').toLowerCase();
    if (u === 'kg' || u === 'l') return n / 1000;
    if (u === 'hg') return n / 100;
    if (u === 'cl') return n / 10;
    if (u === 'dl') return n / 100;
    return n;
  }

  function getQuickTemplate(name) {
    if (!Array.isArray(window.quickItems)) return null;
    return window.quickItems.find(q => norm(q && q.name) === norm(name)) || null;
  }

  function formatDisplay(value, unit) {
    const n = num(value, 0);
    const u = String(unit || '').toLowerCase();
    try {
      if (typeof window.formatSmartMeasureDisplay === 'function') {
        return window.formatSmartMeasureDisplay(n, u);
      }
    } catch (e) {}
    if ((u === 'g' || u === 'ml') && n >= 1000) {
      return (n / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' ' + (u === 'g' ? 'kg' : 'l');
    }
    return n.toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' ' + u;
  }

  function getBuyEntries() {
    return Array.isArray(window.items) ? window.items.filter(it => it && it.type === 'buy') : [];
  }

  function getCurrentBuyPackCount(template) {
    const tSize = num(template && template.size, 0);
    const tUnit = String((template && template.unit) || 'g').toLowerCase();
    const tName = norm(template && template.name);
    return getBuyEntries()
      .filter(item =>
        norm(item.name) === tName &&
        String(item.unit || '').toLowerCase() === tUnit &&
        num(item.size, 0) === tSize
      )
      .reduce((sum, item) => sum + Math.max(1, num(item.quantity, 1)), 0);
  }

  function buildBuyItemFromTemplate(template, qty) {
    const count = Math.max(1, num(qty, 1));
    try {
      if (typeof window.buildQuickPackBuyItem === 'function') {
        const built = window.buildQuickPackBuyItem(template, count);
        if (built) return built;
      }
    } catch (e) {}

    const unit = template.unit || 'g';
    return {
      name: template.name,
      quantity: count,
      unit,
      size: num(template.size, 0),
      price: num(template.price, 0),
      category: template.category || '',
      place: template.place || 'kyl',
      room: template.room || window.activeRoom || 'koket',
      img: template.img || '',
      type: 'buy',
      measureText: formatDisplay(template.size, unit),
      weightText: formatDisplay(template.size, unit)
    };
  }

  function pushOrMergeBuyItem(item) {
    try {
      if (typeof window.pushOrMergeBuyPack === 'function') {
        window.pushOrMergeBuyPack(item);
        return;
      }
    } catch (e) {}
    if (!Array.isArray(window.items)) window.items = [];
    window.items.push(item);
  }

  function ensureBuyCountForUsedWeight(beforeItem, afterItem) {
    if (!beforeItem) return;
    const live = afterItem || beforeItem;
    if (String(live.type || '') !== 'home') return;

    const template = getQuickTemplate(live.name);
    if (!template) return;

    const tUnit = String(template.unit || live.unit || '').toLowerCase();
    if (!isWeightUnit(tUnit)) return;

    const templateBase = toBase(template.size, tUnit);
    if (templateBase <= 0) return;

    // total weight before/after in base unit
    const beforePerUnit = num(beforeItem.size, 0);
    const beforeQty = Math.max(1, num(beforeItem.quantity, 1));
    const beforeTotalBase = toBase(beforePerUnit, beforeItem.unit || tUnit) * beforeQty;

    const afterPerUnit = afterItem ? num(afterItem.size, 0) : num(beforeItem.size, 0);
    const afterQty = afterItem ? Math.max(0, num(afterItem.quantity, 0)) : 0;
    const afterTotalBase = toBase(afterPerUnit, (afterItem ? afterItem.unit : beforeItem.unit) || tUnit) * afterQty;

    if (afterTotalBase >= beforeTotalBase) return; // only when consuming/removing

    const usedBase = Math.max(0, beforeTotalBase - afterTotalBase);
    const packsUsed = Math.floor(usedBase / templateBase);
    if (packsUsed <= 0) return;

    const existingBuyPacks = getCurrentBuyPackCount(template);
    const targetBuyPacks = existingBuyPacks + packsUsed;

    // add exactly the newly consumed pack count
    const item = buildBuyItemFromTemplate(template, packsUsed);
    pushOrMergeBuyItem(item);

    try {
      if (typeof window.save === 'function') window.save();
      if (typeof window.render === 'function') window.render();
    } catch (e) {}
  }

  function patchQuickSyncLock() {
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

  function patchUpdateQuantity() {
    const original = window.updateQuantity;
    if (typeof original !== 'function') return false;

    window.updateQuantity = function patchedZipBUpdateQuantity(index, delta) {
      const before = Array.isArray(window.items) && window.items[index] ? { ...window.items[index] } : null;
      const result = original.apply(this, arguments);
      const after = Array.isArray(window.items) ? (window.items[index] || null) : null;
      try { ensureBuyCountForUsedWeight(before, after); } catch (e) { console.error(e); }
      return result;
    };
    return true;
  }

  function patchSaveEditItem() {
    const original = window.saveEditItem;
    if (typeof original !== 'function') return false;

    window.saveEditItem = function patchedZipBSaveEditItem() {
      const indexEl = document.getElementById('editIndex');
      const idx = indexEl ? Number(indexEl.value) : NaN;
      const before = Number.isFinite(idx) && Array.isArray(window.items) && window.items[idx]
        ? { ...window.items[idx] }
        : null;
      const result = original.apply(this, arguments);
      const after = Number.isFinite(idx) && Array.isArray(window.items) ? (window.items[idx] || null) : null;
      try { ensureBuyCountForUsedWeight(before, after); } catch (e) { console.error(e); }
      return result;
    };
    return result;
  }

  function patchTransferSingleItem() {
    const original = window.transferSingleItem;
    if (typeof original !== 'function') return false;

    window.transferSingleItem = function patchedZipBTransferSingleItem(index, targetType, targetPlace) {
      const before = Array.isArray(window.items) && window.items[index] ? { ...window.items[index] } : null;
      const result = original.apply(this, arguments);
      // after transfer, source row may be reduced/removed
      const after = Array.isArray(window.items) ? (window.items[index] || null) : null;
      try { ensureBuyCountForUsedWeight(before, after); } catch (e) { console.error(e); }
      return result;
    };
    return true;
  }

  function boot() {
    patchQuickSyncLock();

    const ok1 = patchUpdateQuantity();
    const ok2 = patchSaveEditItem();
    const ok3 = patchTransferSingleItem();

    if (!ok1 && !ok2 && !ok3) {
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
