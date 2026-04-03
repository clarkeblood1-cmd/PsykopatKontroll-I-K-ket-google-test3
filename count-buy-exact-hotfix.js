
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

  function isCountUnit(unit) {
    const u = String(unit || '').toLowerCase().replace('pkt', 'paket');
    return u === 'st' || u === 'paket';
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

  function getName(entry) {
    const ing = entry?.ingredient || entry || {};
    return ing.name || entry?.name || '';
  }

  function getUnit(entry) {
    const ing = entry?.ingredient || entry || {};
    return String(ing.unit || entry?.unit || 'g').toLowerCase().replace('pkt', 'paket');
  }

  function getAmount(entry) {
    const ing = entry?.ingredient || entry || {};
    return Math.max(0, num(entry?.canonicalAmount ?? entry?.amount ?? ing?.canonicalAmount ?? ing?.amount ?? 0, 0));
  }

  function findHomeRows(name, unit) {
    if (!Array.isArray(window.items)) return [];
    return window.items.filter(item =>
      item &&
      item.type === 'home' &&
      norm(item.name) === norm(name) &&
      String(item.unit || '').toLowerCase().replace('pkt', 'paket') === unit
    );
  }

  function findBuyRow(name, unit) {
    if (!Array.isArray(window.items)) return null;
    return window.items.find(item =>
      item &&
      item.type === 'buy' &&
      norm(item.name) === norm(name) &&
      String(item.unit || '').toLowerCase().replace('pkt', 'paket') === unit &&
      num(item.size, 0) === 0
    ) || null;
  }

  function addExactCountToBuy(name, unit, amount) {
    if (!Array.isArray(window.items)) window.items = [];
    let row = findBuyRow(name, unit);
    if (!row) {
      row = {
        name: name,
        type: 'buy',
        quantity: 0,
        unit: unit,
        size: 0
      };
      window.items.push(row);
    }
    row.quantity = Math.max(0, num(row.quantity, 0)) + Math.max(0, num(amount, 0));
  }

  function subtractExactFromHome(name, unit, amount) {
    let remaining = Math.max(0, num(amount, 0));
    const rows = findHomeRows(name, unit);
    for (const row of rows) {
      if (remaining <= 0) break;
      const have = Math.max(0, num(row.quantity, 0));
      const take = Math.min(have, remaining);
      row.quantity = have - take;
      remaining -= take;
    }
    if (Array.isArray(window.items)) {
      window.items = window.items.filter(item =>
        !(item && item.type === 'home' && norm(item.name) === norm(name) && String(item.unit || '').toLowerCase().replace('pkt','paket') === unit && num(item.quantity, 0) <= 0)
      );
    }
  }

  function mergeBuyRows() {
    if (!Array.isArray(window.items)) return;
    const out = [];
    for (const item of window.items) {
      if (!item) continue;
      const unit = String(item.unit || '').toLowerCase().replace('pkt', 'paket');
      const match = out.find(existing =>
        existing &&
        existing.type === item.type &&
        norm(existing.name) === norm(item.name) &&
        String(existing.unit || '').toLowerCase().replace('pkt', 'paket') === unit &&
        num(existing.size, 0) === num(item.size, 0) &&
        (item.type === 'buy' || (String(existing.room || '') === String(item.room || '') && String(existing.place || '') === String(item.place || '')))
      );
      if (!match) {
        out.push(item);
      } else {
        match.quantity = Math.max(0, num(match.quantity, 0)) + Math.max(0, num(item.quantity, 0));
      }
    }
    window.items = out;
  }

  function applyExactCountRecipe(entries) {
    let changed = false;
    for (const entry of entries || []) {
      const name = getName(entry);
      const unit = getUnit(entry);
      const amount = getAmount(entry);
      if (!name || !isCountUnit(unit) || amount <= 0) continue;

      subtractExactFromHome(name, unit, amount);
      addExactCountToBuy(name, unit, amount);
      changed = true;
    }
    if (changed) mergeBuyRows();
    return changed;
  }

  function patchRecipe() {
    if (typeof window.useRecipeIngredients !== 'function' || window.__countBuyExactWrapped) return false;
    const original = window.useRecipeIngredients;

    window.useRecipeIngredients = function () {
      const entries = getSelectedEntries();
      const countEntries = entries.filter(e => isCountUnit(getUnit(e)));
      const nonCountEntries = entries.filter(e => !isCountUnit(getUnit(e)));

      if (nonCountEntries.length && typeof window.consumeIngredientEntries === 'function') {
        window.consumeIngredientEntries(nonCountEntries);
      } else if (!countEntries.length) {
        return original.apply(this, arguments);
      } else if (nonCountEntries.length) {
        return original.apply(this, arguments);
      }

      applyExactCountRecipe(countEntries);

      try {
        if (typeof window.save === 'function') window.save();
        else localStorage.setItem('matlista', JSON.stringify(window.items || []));
      } catch (e) {}
      try {
        if (typeof window.checkRecipe === 'function') window.checkRecipe();
      } catch (e) {}
      try {
        if (typeof window.render === 'function') window.render();
      } catch (e) {}

      return;
    };

    window.__countBuyExactWrapped = true;
    return true;
  }

  function boot() {
    const ok = patchRecipe();
    if (!ok) setTimeout(boot, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
