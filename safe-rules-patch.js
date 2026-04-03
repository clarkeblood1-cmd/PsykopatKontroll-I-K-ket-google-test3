
(function () {
  'use strict';

  function norm(v) {
    try {
      if (typeof window.normalizeText === 'function') return window.normalizeText(v || '');
    } catch (e) {}
    return String(v || '').trim().toLowerCase();
  }

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fb == null ? 0 : fb);
  }

  function isWeightUnit(unit) {
    const u = String(unit || '').toLowerCase();
    return ['g','kg','hg','mg','ml','cl','dl','l'].includes(u);
  }

  function isCountUnit(unit) {
    const u = String(unit || '').toLowerCase();
    return u === 'st' || u === 'paket' || u === 'pkt';
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

  function getQuickTemplate(name) {
    if (!Array.isArray(window.quickItems)) return null;
    return window.quickItems.find(q => norm(q && q.name) === norm(name)) || null;
  }

  function getBuyMatch(name, unit, size) {
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
    const qty = Math.max(1, num(quantity, 1));
    const finalUnit = String(unit || template?.unit || fallback?.unit || 'st').toLowerCase().replace('pkt', 'paket');
    const finalSize = num(size, 0);

    let buyItem = null;
    try {
      if (typeof window.buildQuickPackBuyItem === 'function' && template && num(template.size, 0) > 0) {
        buyItem = window.buildQuickPackBuyItem(template, qty);
      }
    } catch (e) {}

    if (!buyItem) {
      buyItem = {
        name: template?.name || fallback?.name || name,
        quantity: qty,
        unit: finalUnit,
        size: finalSize,
        price: num(template?.price ?? fallback?.price, 0),
        category: template?.category || fallback?.category || '',
        place: template?.place || fallback?.place || 'kyl',
        room: template?.room || fallback?.room || window.activeRoom || 'koket',
        img: template?.img || fallback?.img || '',
        type: 'buy'
      };
    }

    const existing = getBuyMatch(buyItem.name, buyItem.unit, buyItem.size);
    if (existing) {
      existing.quantity = Math.max(1, num(existing.quantity, 1) + num(buyItem.quantity, 1));
    } else {
      if (!Array.isArray(window.items)) window.items = [];
      window.items.push(buyItem);
    }
  }

  function mergeDuplicatesSoft() {
    if (!Array.isArray(window.items)) return;
    const out = [];

    function sameHome(a, b) {
      return a && b &&
        a.type === 'home' && b.type === 'home' &&
        norm(a.name) === norm(b.name) &&
        String(a.room || '') === String(b.room || '') &&
        String(a.place || '') === String(b.place || '');
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
      const match = out.find(existing => sameHome(existing, item) || sameBuy(existing, item));
      if (!match) {
        out.push(item);
        return;
      }

      if (item.type === 'buy') {
        match.quantity = Math.max(1, num(match.quantity, 1) + num(item.quantity, 1));
        return;
      }

      const unit = String(item.unit || match.unit || '').toLowerCase().replace('pkt', 'paket');
      if (isCountUnit(unit) || (isWeightUnit(unit) && num(item.quantity, 1) > 1)) {
        match.quantity = Math.max(1, num(match.quantity, 1) + num(item.quantity, 1));
        if (!num(match.size, 0) && num(item.size, 0)) match.size = num(item.size, 0);
      } else if (isWeightUnit(unit)) {
        match.size = num(match.size, 0) + num(item.size, 0);
        match.quantity = 1;
      } else {
        match.quantity = Math.max(1, num(match.quantity, 1) + num(item.quantity, 1));
      }
    });

    window.items = out;
  }

  function lockQuickTemplateSyncSoft() {
    try {
      if (typeof window.cloneTemplateFieldsForListItem === 'function' && !window.__safeQuickLockWrapped) {
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
        window.__safeQuickLockWrapped = true;
      }
    } catch (e) {}
  }

  function getRecipeEntriesSelected() {
    try {
      if (typeof window.getSelectedRecipe === 'function' && typeof window.getCombinedRecipeIngredientEntries === 'function') {
        const recipe = window.getSelectedRecipe();
        if (!recipe) return [];
        return window.getCombinedRecipeIngredientEntries([{ slot: { label: 'Recept' }, recipe, recipeName: recipe.name }]) || [];
      }
    } catch (e) {}
    return [];
  }

  function recipeName(entry) {
    const ing = entry?.ingredient || entry || {};
    return ing.name || entry?.name || '';
  }

  function recipeUnit(entry) {
    const ing = entry?.ingredient || entry || {};
    return String(ing.unit || entry?.unit || 'g');
  }

  function recipeAmount(entry) {
    const ing = entry?.ingredient || entry || {};
    const value = entry?.canonicalAmount ?? entry?.amount ?? ing?.canonicalAmount ?? ing?.amount ?? 0;
    return Math.max(0, num(value, 0));
  }

  function addCountRecipeItemsToBuy(entries) {
    (entries || []).forEach(entry => {
      const name = recipeName(entry);
      const unit = recipeUnit(entry);
      const amount = recipeAmount(entry);
      if (!name || amount <= 0 || !isCountUnit(unit)) return;
      const template = getQuickTemplate(name);
      addOrMergeBuy(name, amount, unit, 0, template, { name, unit, type: 'buy' });
    });
  }

  function addWeightConsumptionToBuy(beforeItem, afterItem) {
    if (!beforeItem) return;
    const live = afterItem || beforeItem;
    if (String(live.type || '') !== 'home') return;

    const template = getQuickTemplate(live.name);
    if (!template) return;

    const templateUnit = String(template.unit || live.unit || '').toLowerCase();
    if (!isWeightUnit(templateUnit)) return;

    const packBase = toBase(template.size, templateUnit);
    if (packBase <= 0) return;

    const beforeQty = Math.max(1, num(beforeItem.quantity, 1));
    const afterQty = Math.max(0, num(afterItem ? afterItem.quantity : 0, 0));
    const beforeTotal = toBase(beforeItem.size, beforeItem.unit || templateUnit) * beforeQty;
    const afterTotal = toBase(afterItem ? afterItem.size : beforeItem.size, (afterItem ? afterItem.unit : beforeItem.unit) || templateUnit) * afterQty;

    if (afterTotal >= beforeTotal) return;

    const used = Math.max(0, beforeTotal - afterTotal);
    const packs = Math.floor(used / packBase);
    if (packs <= 0) return;

    addOrMergeBuy(live.name, packs, template.unit || live.unit || 'g', num(template.size, 0), template, live);
  }

  function saveRenderSoft() {
    try { mergeDuplicatesSoft(); } catch (e) {}
    try {
      if (typeof window.save === 'function') window.save();
      else localStorage.setItem('matlista', JSON.stringify(window.items || []));
    } catch (e) {}
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
  }

  function patchUpdateQuantitySoft() {
    if (typeof window.updateQuantity !== 'function' || window.__safeUpdateWrapped) return false;
    const original = window.updateQuantity;
    window.updateQuantity = function() {
      const index = arguments[0];
      const before = Array.isArray(window.items) && window.items[index] ? JSON.parse(JSON.stringify(window.items[index])) : null;
      const result = original.apply(this, arguments);
      const after = Array.isArray(window.items) ? (window.items[index] || null) : null;
      try { addWeightConsumptionToBuy(before, after); } catch (e) { console.error(e); }
      saveRenderSoft();
      return result;
    };
    window.__safeUpdateWrapped = true;
    return true;
  }

  function patchSaveEditItemSoft() {
    if (typeof window.saveEditItem !== 'function' || window.__safeEditWrapped) return false;
    const original = window.saveEditItem;
    window.saveEditItem = function() {
      const idxEl = document.getElementById('editIndex');
      const idx = idxEl ? Number(idxEl.value) : NaN;
      const before = Number.isFinite(idx) && Array.isArray(window.items) && window.items[idx]
        ? JSON.parse(JSON.stringify(window.items[idx]))
        : null;
      const result = original.apply(this, arguments);
      const after = Number.isFinite(idx) && Array.isArray(window.items) ? (window.items[idx] || null) : null;
      try { addWeightConsumptionToBuy(before, after); } catch (e) { console.error(e); }
      saveRenderSoft();
      return result;
    };
    window.__safeEditWrapped = true;
    return true;
  }

  function patchRecipeSoft() {
    if (typeof window.useRecipeIngredients !== 'function' || window.__safeRecipeWrapped) return false;
    const original = window.useRecipeIngredients;
    window.useRecipeIngredients = function() {
      const entries = getRecipeEntriesSelected();
      const result = original.apply(this, arguments);
      try { addCountRecipeItemsToBuy(entries); } catch (e) { console.error(e); }
      saveRenderSoft();
      return result;
    };
    window.__safeRecipeWrapped = true;
    return true;
  }

  function boot() {
    lockQuickTemplateSyncSoft();
    const ok1 = patchUpdateQuantitySoft();
    const ok2 = patchSaveEditItemSoft();
    const ok3 = patchRecipeSoft();
    try { mergeDuplicatesSoft(); } catch (e) {}
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
    if (!ok1 && !ok2 && !ok3) setTimeout(boot, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
