
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

  function getCombinedEntries() {
    try {
      const recipe = typeof window.getSelectedRecipe === 'function' ? window.getSelectedRecipe() : null;
      if (!recipe) return { recipe: null, entries: [] };
      const entries = typeof window.getCombinedRecipeIngredientEntries === 'function'
        ? window.getCombinedRecipeIngredientEntries([{ slot: { label: 'Recept' }, recipe, recipeName: recipe.name }])
        : [];
      return { recipe, entries: Array.isArray(entries) ? entries : [] };
    } catch (e) {
      return { recipe: null, entries: [] };
    }
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

  function ensureItems() {
    if (!Array.isArray(window.items)) window.items = [];
  }

  function findHomeRows(name, unit) {
    ensureItems();
    return window.items.filter(item =>
      item &&
      item.type === 'home' &&
      norm(item.name) === norm(name) &&
      String(item.unit || '').toLowerCase().replace('pkt', 'paket') === unit
    );
  }

  function findBuyRow(name, unit) {
    ensureItems();
    return window.items.find(item =>
      item &&
      item.type === 'buy' &&
      norm(item.name) === norm(name) &&
      String(item.unit || '').toLowerCase().replace('pkt', 'paket') === unit &&
      num(item.size, 0) === 0
    ) || null;
  }

  function subtractFromHomeExact(name, unit, amount) {
    let remaining = Math.max(0, num(amount, 0));
    const rows = findHomeRows(name, unit);

    for (const row of rows) {
      if (remaining <= 0) break;
      const have = Math.max(0, num(row.quantity, 0));
      const take = Math.min(have, remaining);
      row.quantity = have - take;
      remaining -= take;
    }

    window.items = window.items.filter(item =>
      !(item &&
        item.type === 'home' &&
        norm(item.name) === norm(name) &&
        String(item.unit || '').toLowerCase().replace('pkt', 'paket') === unit &&
        num(item.quantity, 0) <= 0)
    );
  }

  function addToBuyExact(name, unit, amount) {
    ensureItems();
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

  function mergeBuyRows() {
    ensureItems();
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
      if (!match) out.push(item);
      else match.quantity = Math.max(0, num(match.quantity, 0)) + Math.max(0, num(item.quantity, 0));
    }
    window.items = out;
  }

  function saveRefresh() {
    try {
      if (typeof window.save === 'function') window.save();
      else localStorage.setItem('matlista', JSON.stringify(window.items || []));
    } catch (e) {}
    try { if (typeof window.checkRecipe === 'function') window.checkRecipe(); } catch (e) {}
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
  }

  function install() {
    if (window.__countForceFixInstalled) return;
    window.__countForceFixInstalled = true;

    window.useRecipeIngredients = function useRecipeIngredientsCountForceFix() {
      const payload = getCombinedEntries();
      if (!payload.recipe) return;

      const countEntries = payload.entries.filter(e => isCountUnit(getUnit(e)));
      const nonCountEntries = payload.entries.filter(e => !isCountUnit(getUnit(e)));

      if (nonCountEntries.length && typeof window.consumeIngredientEntries === 'function') {
        window.consumeIngredientEntries(nonCountEntries);
      }

      countEntries.forEach(entry => {
        const name = getName(entry);
        const unit = getUnit(entry);
        const amount = getAmount(entry);
        if (!name || !amount) return;
        subtractFromHomeExact(name, unit, amount);
        addToBuyExact(name, unit, amount);
      });

      mergeBuyRows();
      saveRefresh();
    };
  }

  function boot() {
    install();
    if (typeof window.render === 'function') {
      try { window.render(); } catch (e) {}
    } else {
      setTimeout(boot, 150);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
