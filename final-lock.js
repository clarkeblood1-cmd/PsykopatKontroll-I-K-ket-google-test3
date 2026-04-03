
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

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (e) { return Object.assign({}, obj); }
  }

  function getQuickTemplate(name) {
    if (!Array.isArray(window.quickItems)) return null;
    return window.quickItems.find(q => norm(q && q.name) === norm(name)) || null;
  }

  function lockQuickTemplateFields() {
    // Snabblista is template only. Never overwrite live quantity/weight.
    try {
      if (typeof window.cloneTemplateFieldsForListItem === 'function' && !window.__finalLockQuickWrapped) {
        const original = window.cloneTemplateFieldsForListItem;
        window.cloneTemplateFieldsForListItem = function(listItem, quickTemplate, oldNameNormalized) {
          const next = original(listItem, quickTemplate, oldNameNormalized);
          if (!next || !listItem) return next;
          next.quantity = listItem.quantity;
          next.size = listItem.size;
          next.measureText = listItem.measureText;
          next.weightText = listItem.weightText;
          next.bestBefore = listItem.bestBefore;
          next.openedDate = listItem.openedDate;
          return next;
        };
        window.__finalLockQuickWrapped = true;
      }
    } catch (e) {}
  }

  function sameKitchenKey(a, b) {
    if (!a || !b) return false;
    if (norm(a.name) !== norm(b.name)) return false;
    if (String(a.type || '') !== String(b.type || '')) return false;
    if ((a.room || '') !== (b.room || '')) return false;
    if ((a.place || '') !== (b.place || '')) return false;
    return true;
  }

  function sameBuyKey(a, b) {
    if (!a || !b) return false;
    if (norm(a.name) !== norm(b.name)) return false;
    if (String(a.type || '') !== 'buy' || String(b.type || '') !== 'buy') return false;

    const au = String(a.unit || '').toLowerCase();
    const bu = String(b.unit || '').toLowerCase();
    const as = num(a.size, 0);
    const bs = num(b.size, 0);

    // for buy list we keep pack size identity
    return au === bu && as === bs;
  }

  function isPackLike(item) {
    const unit = String(item && item.unit || '').toLowerCase();
    return unit === 'paket' || unit === 'pkt' || unit === 'st';
  }

  function isPureWeightRow(item) {
    const unit = String(item && item.unit || '').toLowerCase();
    return isWeightUnit(unit) && num(item && item.quantity, 1) <= 1;
  }

  function ensureTemplatePerPack(item) {
    if (!item) return item;
    const template = getQuickTemplate(item.name);
    if (!template) return item;

    const unit = String(item.unit || template.unit || '').toLowerCase();
    if (isWeightUnit(unit) && num(item.quantity, 1) > 1 && num(template.size, 0) > 0) {
      // For multi-pack weight items, keep size as per pack from template.
      item.size = num(template.size, 0);
    }
    if ((unit === 'pkt')) item.unit = 'paket';
    return item;
  }

  function mergeHomeItems(items) {
    const out = [];
    items.forEach((raw) => {
      if (!raw || raw.type !== 'home') {
        out.push(raw);
        return;
      }

      const item = ensureTemplatePerPack(clone(raw));
      const existingIndex = out.findIndex(entry => entry && entry.type === 'home' && sameKitchenKey(entry, item));
      if (existingIndex < 0) {
        out.push(item);
        return;
      }

      const existing = out[existingIndex];
      const unit = String(item.unit || existing.unit || '').toLowerCase();

      if (isPureWeightRow(item) && isPureWeightRow(existing)) {
        const base = toBase(existing.size, existing.unit) + toBase(item.size, item.unit);
        existing.size = fromBase(base, existing.unit || item.unit || 'g');
        existing.quantity = 1;
      } else {
        existing.quantity = Math.max(1, num(existing.quantity, 1) + num(item.quantity, 1));
        if (!num(existing.size, 0) && num(item.size, 0)) existing.size = num(item.size, 0);
      }

      if (!existing.img && item.img) existing.img = item.img;
      if (!existing.category && item.category) existing.category = item.category;
      if (!existing.measureText && item.measureText) existing.measureText = item.measureText;
      if (!existing.weightText && item.weightText) existing.weightText = item.weightText;
    });
    return out;
  }

  function mergeBuyItems(items) {
    const out = [];
    items.forEach((raw) => {
      if (!raw || raw.type !== 'buy') {
        out.push(raw);
        return;
      }
      const item = clone(raw);
      const existingIndex = out.findIndex(entry => entry && entry.type === 'buy' && sameBuyKey(entry, item));
      if (existingIndex < 0) {
        out.push(item);
        return;
      }
      const existing = out[existingIndex];
      existing.quantity = Math.max(1, num(existing.quantity, 1) + num(item.quantity, 1));
      if (!existing.img && item.img) existing.img = item.img;
      if (!existing.category && item.category) existing.category = item.category;
      if (!existing.measureText && item.measureText) existing.measureText = item.measureText;
      if (!existing.weightText && item.weightText) existing.weightText = item.weightText;
    });
    return out;
  }

  function finalMergeAll() {
    if (!Array.isArray(window.items)) return;
    const homes = window.items.filter(it => it && it.type === 'home');
    const buys = window.items.filter(it => it && it.type === 'buy');
    const others = window.items.filter(it => !it || (it.type !== 'home' && it.type !== 'buy'));
    window.items = mergeHomeItems(homes).concat(mergeBuyItems(buys)).concat(others);
  }

  function buildBuyItemFromTemplate(template, qty) {
    const count = Math.max(1, num(qty, 1));
    try {
      if (typeof window.buildQuickPackBuyItem === 'function') {
        const built = window.buildQuickPackBuyItem(template, count);
        if (built) return built;
      }
    } catch (e) {}
    return {
      name: template.name,
      quantity: count,
      unit: template.unit || 'g',
      size: num(template.size, 0),
      price: num(template.price, 0),
      category: template.category || '',
      place: template.place || 'kyl',
      room: template.room || window.activeRoom || 'koket',
      img: template.img || '',
      type: 'buy',
      measureText: template.measureText || '',
      weightText: template.weightText || ''
    };
  }

  function addUsedWeightToBuy(beforeItem, afterItem) {
    if (!beforeItem) return;
    const live = afterItem || beforeItem;
    if (String(live.type || '') !== 'home') return;

    const template = getQuickTemplate(live.name);
    if (!template) return;

    const templateUnit = String(template.unit || live.unit || '').toLowerCase();
    if (!isWeightUnit(templateUnit)) return;

    const templateBase = toBase(template.size, templateUnit);
    if (templateBase <= 0) return;

    const beforeQty = Math.max(1, num(beforeItem.quantity, 1));
    const afterQty = Math.max(0, num(afterItem ? afterItem.quantity : 0, 0));
    const beforeTotalBase = toBase(beforeItem.size, beforeItem.unit || templateUnit) * beforeQty;
    const afterTotalBase = toBase(afterItem ? afterItem.size : beforeItem.size, (afterItem ? afterItem.unit : beforeItem.unit) || templateUnit) * afterQty;

    if (afterTotalBase >= beforeTotalBase) return;

    const usedBase = Math.max(0, beforeTotalBase - afterTotalBase);
    const packsUsed = Math.floor(usedBase / templateBase);
    if (packsUsed <= 0) return;

    const buyItem = buildBuyItemFromTemplate(template, packsUsed);
    if (!Array.isArray(window.items)) window.items = [];
    window.items.push(buyItem);
  }

  function persist() {
    finalMergeAll();
    try {
      if (typeof window.save === 'function') window.save();
      else localStorage.setItem('matlista', JSON.stringify(window.items || []));
    } catch (e) {}
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
  }

  function patchUpdateQuantity() {
    if (typeof window.updateQuantity !== 'function' || window.__finalLockUpdateWrapped) return;
    const original = window.updateQuantity;
    window.updateQuantity = function(index, delta) {
      const before = Array.isArray(window.items) && window.items[index] ? clone(window.items[index]) : null;
      const result = original.apply(this, arguments);
      const after = Array.isArray(window.items) ? (window.items[index] || null) : null;
      try { addUsedWeightToBuy(before, after); } catch (e) { console.error(e); }
      persist();
      return result;
    };
    window.__finalLockUpdateWrapped = true;
  }

  function patchSaveEditItem() {
    if (typeof window.saveEditItem !== 'function' || window.__finalLockEditWrapped) return;
    const original = window.saveEditItem;
    window.saveEditItem = function() {
      const indexEl = document.getElementById('editIndex');
      const idx = indexEl ? Number(indexEl.value) : NaN;
      const before = Number.isFinite(idx) && Array.isArray(window.items) && window.items[idx] ? clone(window.items[idx]) : null;
      const result = original.apply(this, arguments);
      const after = Number.isFinite(idx) && Array.isArray(window.items) ? (window.items[idx] || null) : null;
      try { addUsedWeightToBuy(before, after); } catch (e) { console.error(e); }
      persist();
      return result;
    };
    window.__finalLockEditWrapped = true;
  }

  function patchTransferSingleItem() {
    if (typeof window.transferSingleItem !== 'function' || window.__finalLockTransferWrapped) return;
    const original = window.transferSingleItem;
    window.transferSingleItem = function(index, targetType, targetPlace) {
      const before = Array.isArray(window.items) && window.items[index] ? clone(window.items[index]) : null;
      const result = original.apply(this, arguments);
      const after = Array.isArray(window.items) ? (window.items[index] || null) : null;
      try { addUsedWeightToBuy(before, after); } catch (e) { console.error(e); }
      persist();
      return result;
    };
    window.__finalLockTransferWrapped = true;
  }

  function patchFormatting() {
    if (typeof window.formatItemAmount !== 'function' || window.__finalLockFormatWrapped) return;
    const original = window.formatItemAmount;
    window.formatItemAmount = function(item) {
      if (!item) return original(item);

      const unit = String(item.unit || '').toLowerCase() === 'pkt' ? 'paket' : String(item.unit || '').toLowerCase();
      const qty = Math.max(1, num(item.quantity, 1));
      const size = num(item.size, 0);

      function smart(value, unit) {
        try {
          if (typeof window.formatSmartMeasureDisplay === 'function') return window.formatSmartMeasureDisplay(value, unit);
        } catch (e) {}
        if ((unit === 'g' || unit === 'ml') && value >= 1000) {
          return (value / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' ' + (unit === 'g' ? 'kg' : 'l');
        }
        return value.toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' ' + unit;
      }

      if (isWeightUnit(unit) && qty > 1 && size > 0) {
        const total = size * qty;
        return smart(total, unit) + ' totalt • ' + qty + ' × ' + smart(size, unit);
      }
      if ((unit === 'paket' || unit === 'st') && qty > 1 && size > 0) {
        const template = getQuickTemplate(item.name);
        const weightUnit = String((template && template.unit) || 'g').toLowerCase();
        const weightPerPack = num((template && template.size) || size, size);
        if (isWeightUnit(weightUnit)) {
          return smart(weightPerPack * qty, weightUnit) + ' totalt • ' + qty + ' ' + unit;
        }
      }
      return original(item);
    };
    window.__finalLockFormatWrapped = true;
  }

  function boot() {
    lockQuickTemplateFields();
    patchUpdateQuantity();
    patchSaveEditItem();
    patchTransferSingleItem();
    patchFormatting();
    persist();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
