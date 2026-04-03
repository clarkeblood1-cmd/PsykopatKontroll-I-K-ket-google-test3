
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

  function clone(v) {
    try { return JSON.parse(JSON.stringify(v)); }
    catch (e) { return v ? Object.assign({}, v) : v; }
  }

  function isWeightUnit(unit) {
    const u = String(unit || '').toLowerCase();
    return ['g','kg','hg','mg','ml','cl','dl','l'].includes(u);
  }

  function isCountUnit(unit) {
    const u = String(unit || '').toLowerCase().replace('pkt', 'paket');
    return u === 'st' || u === 'paket';
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

  function quickByName(name) {
    if (!Array.isArray(window.quickItems)) return null;
    return window.quickItems.find(q => q && norm(q.name) === norm(name)) || null;
  }

  function findBuyRow(name, unit, size) {
    if (!Array.isArray(window.items)) return null;
    const finalUnit = String(unit || '').toLowerCase().replace('pkt', 'paket');
    return window.items.find(item =>
      item &&
      item.type === 'buy' &&
      norm(item.name) === norm(name) &&
      String(item.unit || '').toLowerCase().replace('pkt', 'paket') === finalUnit &&
      num(item.size, 0) === num(size, 0)
    ) || null;
  }

  function addOrMergeBuy(name, quantity, unit, size, template, fallback) {
    const qty = Math.max(0, num(quantity, 0));
    if (!qty) return;

    const finalUnit = String(unit || template?.unit || fallback?.unit || 'st').toLowerCase().replace('pkt', 'paket');
    const finalSize = num(size, 0);

    let row = findBuyRow(name, finalUnit, finalSize);
    if (!row) {
      row = {
        name: template?.name || fallback?.name || name,
        type: 'buy',
        quantity: 0,
        unit: finalUnit,
        size: finalSize,
        price: num(template?.price ?? fallback?.price, 0),
        category: template?.category || fallback?.category || '',
        place: template?.place || fallback?.place || 'kyl',
        room: template?.room || fallback?.room || window.activeRoom || 'koket',
        img: template?.img || fallback?.img || ''
      };
      if (!Array.isArray(window.items)) window.items = [];
      window.items.push(row);
    }
    row.quantity = Math.max(0, num(row.quantity, 0)) + qty;
  }

  function mergeItemsSoft() {
    if (!Array.isArray(window.items)) return;

    const out = [];
    function sameHome(a, b) {
      return a && b &&
        a.type === 'home' && b.type === 'home' &&
        norm(a.name) === norm(b.name) &&
        String(a.room || '') === String(b.room || '') &&
        String(a.place || '') === String(b.place || '') &&
        String(a.unit || '').toLowerCase().replace('pkt','paket') === String(b.unit || '').toLowerCase().replace('pkt','paket');
    }
    function sameBuy(a, b) {
      return a && b &&
        a.type === 'buy' && b.type === 'buy' &&
        norm(a.name) === norm(b.name) &&
        String(a.unit || '').toLowerCase().replace('pkt','paket') === String(b.unit || '').toLowerCase().replace('pkt','paket') &&
        num(a.size, 0) === num(b.size, 0);
    }

    window.items.forEach(item => {
      if (!item) return;
      item.unit = String(item.unit || '').toLowerCase() === 'pkt' ? 'paket' : item.unit;

      const existing = out.find(entry => sameHome(entry, item) || sameBuy(entry, item));
      if (!existing) {
        out.push(item);
        return;
      }

      const unit = String(item.unit || existing.unit || '').toLowerCase().replace('pkt','paket');

      if (existing.type === 'buy') {
        existing.quantity = Math.max(0, num(existing.quantity, 0)) + Math.max(0, num(item.quantity, 0));
        return;
      }

      if (isCountUnit(unit)) {
        existing.quantity = Math.max(0, num(existing.quantity, 0)) + Math.max(0, num(item.quantity, 0));
        if (!num(existing.size, 0) && num(item.size, 0)) existing.size = num(item.size, 0);
        return;
      }

      if (isWeightUnit(unit) && num(existing.quantity, 1) <= 1 && num(item.quantity, 1) <= 1) {
        existing.size = num(existing.size, 0) + num(item.size, 0);
        existing.quantity = 1;
        return;
      }

      existing.quantity = Math.max(0, num(existing.quantity, 0)) + Math.max(0, num(item.quantity, 0));
      if (!num(existing.size, 0) && num(item.size, 0)) existing.size = num(item.size, 0);
    });

    window.items = out.filter(item => !(item && item.type === 'home' && num(item.quantity, 0) <= 0 && !num(item.size, 0)));
  }

  function persistSoft() {
    try { mergeItemsSoft(); } catch (e) { console.error(e); }
    try {
      if (typeof window.save === 'function') window.save();
      else localStorage.setItem('matlista', JSON.stringify(window.items || []));
    } catch (e) {}
    try { if (typeof window.checkRecipe === 'function') window.checkRecipe(); } catch (e) {}
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
  }

  function lockQuickTemplateSync() {
    try {
      if (typeof window.cloneTemplateFieldsForListItem === 'function' && !window.__allRulesQuickLock) {
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
          next.openedAmount = listItem.openedAmount;
          return next;
        };
        window.__allRulesQuickLock = true;
      }
    } catch (e) {}
    try {
      window.syncQuickItemFromItem = function () { return; };
    } catch (e) {}
  }

  function getSelectedEntries() {
    try {
      if (typeof window.getSelectedRecipe === 'function' && typeof window.getCombinedRecipeIngredientEntries === 'function') {
        const recipe = window.getSelectedRecipe();
        if (!recipe) return [];
        return window.getCombinedRecipeIngredientEntries([{ slot: { label: 'Recept' }, recipe, recipeName: recipe.name }]) || [];
      }
    } catch (e) {}
    return [];
  }

  function entryName(entry) {
    const ing = entry?.ingredient || entry || {};
    return ing.name || entry?.name || '';
  }

  function entryUnit(entry) {
    const ing = entry?.ingredient || entry || {};
    return String(ing.unit || entry?.unit || 'g').toLowerCase().replace('pkt','paket');
  }

  function entryAmount(entry) {
    const ing = entry?.ingredient || entry || {};
    return Math.max(0, num(entry?.canonicalAmount ?? entry?.amount ?? ing?.canonicalAmount ?? ing?.amount ?? 0, 0));
  }

  function homeRowsByNameUnit(name, unit) {
    if (!Array.isArray(window.items)) return [];
    return window.items.filter(item =>
      item &&
      item.type === 'home' &&
      norm(item.name) === norm(name) &&
      String(item.unit || '').toLowerCase().replace('pkt','paket') === unit
    );
  }

  function consumeCountRowsExactly(entries) {
    (entries || []).forEach(entry => {
      const name = entryName(entry);
      const unit = entryUnit(entry);
      const amount = entryAmount(entry);
      if (!name || !amount || !isCountUnit(unit)) return;

      let remaining = amount;
      homeRowsByNameUnit(name, unit).forEach(row => {
        if (remaining <= 0) return;
        const have = Math.max(0, num(row.quantity, 0));
        const take = Math.min(have, remaining);
        row.quantity = have - take;
        remaining -= take;
      });

      if (Array.isArray(window.items)) {
        window.items = window.items.filter(item =>
          !(item && item.type === 'home' && norm(item.name) === norm(name) && String(item.unit || '').toLowerCase().replace('pkt','paket') === unit && num(item.quantity, 0) <= 0)
        );
      }

      addOrMergeBuy(name, amount, unit, 0, quickByName(name), { name, unit });
    });
  }

  function addWeightBuyFromDelta(beforeItem, afterItem) {
    if (!beforeItem) return;
    const live = afterItem || beforeItem;
    if (!live || live.type !== 'home') return;

    const template = quickByName(live.name);
    if (!template) return;

    const unit = String(template.unit || live.unit || '').toLowerCase();
    if (!isWeightUnit(unit)) return;

    const packBase = toBase(template.size, unit);
    if (packBase <= 0) return;

    const beforeQty = Math.max(0, num(beforeItem.quantity, 1));
    const afterQty = Math.max(0, num(afterItem ? afterItem.quantity : 0, 0));

    const beforeTotal = toBase(beforeItem.size, beforeItem.unit || unit) * (beforeQty || 1);
    const afterTotal = toBase(afterItem ? afterItem.size : beforeItem.size, (afterItem ? afterItem.unit : beforeItem.unit) || unit) * (afterQty || 1);

    if (afterTotal >= beforeTotal) return;

    const used = Math.max(0, beforeTotal - afterTotal);
    const packs = Math.floor(used / packBase);
    if (packs <= 0) return;

    addOrMergeBuy(live.name, packs * Math.max(1, num(template.quantity, 1)), template.unit || unit, num(template.size, 0), template, live);
  }

  function patchUpdateQuantity() {
    if (typeof window.updateQuantity !== 'function' || window.__allRulesUpdateWrapped) return false;
    const original = window.updateQuantity;
    window.updateQuantity = function(index) {
      const before = Array.isArray(window.items) && window.items[index] ? clone(window.items[index]) : null;
      const result = original.apply(this, arguments);
      const after = Array.isArray(window.items) ? (window.items[index] || null) : null;
      try { addWeightBuyFromDelta(before, after); } catch (e) { console.error(e); }
      persistSoft();
      return result;
    };
    window.__allRulesUpdateWrapped = true;
    return true;
  }

  function patchSaveEditItem() {
    if (typeof window.saveEditItem !== 'function' || window.__allRulesEditWrapped) return false;
    const original = window.saveEditItem;
    window.saveEditItem = function() {
      const idxEl = document.getElementById('editIndex');
      const idx = idxEl ? Number(idxEl.value) : NaN;
      const before = Number.isFinite(idx) && Array.isArray(window.items) && window.items[idx] ? clone(window.items[idx]) : null;
      const result = original.apply(this, arguments);
      const after = Number.isFinite(idx) && Array.isArray(window.items) ? (window.items[idx] || null) : null;
      try { addWeightBuyFromDelta(before, after); } catch (e) { console.error(e); }
      persistSoft();
      return result;
    };
    window.__allRulesEditWrapped = true;
    return true;
  }

  function patchRecipe() {
    if (typeof window.useRecipeIngredients !== 'function' || window.__allRulesRecipeWrapped) return false;
    const original = window.useRecipeIngredients;
    window.useRecipeIngredients = function() {
      const entries = getSelectedEntries();
      const countEntries = entries.filter(e => isCountUnit(entryUnit(e)));
      const nonCountEntries = entries.filter(e => !isCountUnit(entryUnit(e)));

      if (nonCountEntries.length && typeof window.consumeIngredientEntries === 'function') {
        window.consumeIngredientEntries(nonCountEntries);
      } else if (!countEntries.length) {
        const result = original.apply(this, arguments);
        persistSoft();
        return result;
      }

      consumeCountRowsExactly(countEntries);
      persistSoft();
      return;
    };
    window.__allRulesRecipeWrapped = true;
    return true;
  }

  function patchFormatting() {
    if (typeof window.formatItemAmount !== 'function' || window.__allRulesFormatWrapped) return false;
    const original = window.formatItemAmount;
    window.formatItemAmount = function(item) {
      if (!item) return original(item);
      const unit = String(item.unit || '').toLowerCase().replace('pkt','paket');
      const qty = Math.max(0, num(item.quantity, 0));
      const size = num(item.size, 0);

      function smart(value, unit) {
        try {
          if (typeof window.formatSmartMeasureDisplay === 'function' && isWeightUnit(unit)) {
            return window.formatSmartMeasureDisplay(value, unit);
          }
        } catch (e) {}
        return `${value} ${unit}`.trim();
      }

      if (isWeightUnit(unit) && qty > 1 && size > 0) {
        return `${smart(size * qty, unit)} totalt • ${qty} × ${smart(size, unit)}`;
      }
      if (unit === 'paket' && qty > 0 && size > 0) {
        const t = quickByName(item.name);
        const weightUnit = String((t && t.packMeasureUnit) || (t && t.measureUnit) || 'g').toLowerCase();
        if (isWeightUnit(weightUnit)) {
          return `${smart(size * qty, weightUnit)} totalt • ${qty} paket`;
        }
      }
      return original(item);
    };
    window.__allRulesFormatWrapped = true;
    return true;
  }

  function boot() {
    lockQuickTemplateSync();
    const ok1 = patchUpdateQuantity();
    const ok2 = patchSaveEditItem();
    const ok3 = patchRecipe();
    patchFormatting();
    persistSoft();
    if (!ok1 && !ok2 && !ok3) setTimeout(boot, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
