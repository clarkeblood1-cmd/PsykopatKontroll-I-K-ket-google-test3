
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

  function isCountUnit(unit) {
    const u = String(unit || '').toLowerCase();
    return u === 'st' || u === 'paket' || u === 'pkt';
  }

  function isWeightUnit(unit) {
    const u = String(unit || '').toLowerCase();
    return ['g','kg','hg','mg','ml','cl','dl','l'].includes(u);
  }

  function smartAmount(value, unit) {
    const n = num(value, 0);
    const u = String(unit || '').toLowerCase() === 'pkt' ? 'paket' : String(unit || '').toLowerCase();
    try {
      if (typeof window.formatSmartMeasureDisplay === 'function' && isWeightUnit(u)) {
        return window.formatSmartMeasureDisplay(n, u);
      }
    } catch (e) {}
    return `${n} ${u}`.trim();
  }

  function getBuyItemMatch(name, unit, size) {
    if (!Array.isArray(window.items)) return null;
    const u = String(unit || '').toLowerCase() === 'pkt' ? 'paket' : String(unit || '').toLowerCase();
    return window.items.find(item =>
      item &&
      item.type === 'buy' &&
      norm(item.name) === norm(name) &&
      String(item.unit || '').toLowerCase().replace('pkt', 'paket') === u &&
      num(item.size, 0) === num(size, 0)
    ) || null;
  }

  function addOrMergeBuy(name, quantity, unit, size, template, fallbackItem) {
    if (!quantity || quantity <= 0) return;

    const finalUnit = String(unit || template?.unit || fallbackItem?.unit || 'st').toLowerCase() === 'pkt'
      ? 'paket'
      : (unit || template?.unit || fallbackItem?.unit || 'st');

    let buyItem = null;

    try {
      if (typeof window.buildQuickPackBuyItem === 'function' && template && num(template.size, 0) > 0) {
        buyItem = window.buildQuickPackBuyItem(template, quantity);
      }
    } catch (e) {}

    if (!buyItem) {
      buyItem = {
        name: template?.name || fallbackItem?.name || name,
        quantity: Math.max(1, num(quantity, 1)),
        unit: finalUnit,
        size: num(size, 0),
        price: num(template?.price ?? fallbackItem?.price, 0),
        category: template?.category || fallbackItem?.category || '',
        place: template?.place || fallbackItem?.place || 'kyl',
        room: template?.room || fallbackItem?.room || window.activeRoom || 'koket',
        img: template?.img || fallbackItem?.img || '',
        type: 'buy',
        measureText: isWeightUnit(finalUnit) && num(size, 0) > 0 ? smartAmount(size, finalUnit) : '',
        weightText: isWeightUnit(finalUnit) && num(size, 0) > 0 ? smartAmount(size, finalUnit) : ''
      };
    }

    const existing = getBuyItemMatch(buyItem.name, buyItem.unit, buyItem.size);
    if (existing) {
      existing.quantity = Math.max(1, num(existing.quantity, 1) + num(buyItem.quantity, 1));
    } else if (Array.isArray(window.items)) {
      window.items.push(buyItem);
    } else {
      window.items = [buyItem];
    }
  }

  function recipeAmountForEntry(entry) {
    const ingredient = entry?.ingredient || entry || {};
    const amount = entry?.canonicalAmount ?? entry?.amount ?? ingredient?.canonicalAmount ?? ingredient?.amount ?? 0;
    return Math.max(0, num(amount, 0));
  }

  function recipeUnitForEntry(entry) {
    const ingredient = entry?.ingredient || entry || {};
    return String(ingredient.unit || entry?.unit || 'g');
  }

  function recipeNameForEntry(entry) {
    const ingredient = entry?.ingredient || entry || {};
    return ingredient.name || entry?.name || '';
  }

  function getTemplateByName(name) {
    if (!Array.isArray(window.quickItems)) return null;
    return window.quickItems.find(q => norm(q?.name) === norm(name)) || null;
  }

  function countRecipeRows(entries) {
    const rows = [];
    (entries || []).forEach(entry => {
      const name = recipeNameForEntry(entry);
      const unit = recipeUnitForEntry(entry);
      const amount = recipeAmountForEntry(entry);
      if (!name || amount <= 0 || !isCountUnit(unit)) return;
      rows.push({ name, unit: unit === 'pkt' ? 'paket' : unit, amount });
    });
    return rows;
  }

  function injectCountItemsToBuy(entries) {
    const rows = countRecipeRows(entries);
    rows.forEach(row => {
      const template = getTemplateByName(row.name);
      addOrMergeBuy(row.name, row.amount, row.unit, 0, template, { name: row.name, unit: row.unit, type: 'buy' });
    });
  }

  function patchRecipeCooking() {
    const original = window.useRecipeIngredients;
    if (typeof original !== 'function' || window.__finalPPRecipeWrapped) return false;

    window.useRecipeIngredients = function finalPlusPlusUseRecipeIngredients() {
      let entries = [];
      try {
        if (typeof window.getSelectedRecipe === 'function' && typeof window.getCombinedRecipeIngredientEntries === 'function') {
          const recipe = window.getSelectedRecipe();
          if (recipe) {
            entries = window.getCombinedRecipeIngredientEntries([{ slot: { label: 'Recept' }, recipe, recipeName: recipe.name }]) || [];
          }
        }
      } catch (e) {}

      const result = original.apply(this, arguments);

      try {
        injectCountItemsToBuy(entries);
      } catch (e) {
        console.error('FINAL++ recipe count-to-buy failed:', e);
      }

      try {
        if (typeof window.save === 'function') window.save();
      } catch (e) {}
      try {
        if (typeof window.render === 'function') window.render();
      } catch (e) {}

      return result;
    };

    window.__finalPPRecipeWrapped = true;
    return true;
  }

  function patchWeekCooking() {
    const original = window.cookSelectedWeekRecipe;
    if (typeof original !== 'function' || window.__finalPPWeekWrapped) return false;

    window.cookSelectedWeekRecipe = function finalPlusPlusCookWeekRecipe() {
      let beforeEntries = [];
      try {
        const recipeSelect = document.getElementById('weekRecipeSelect');
        const recipeId = recipeSelect ? recipeSelect.value : '';
        const recipe = Array.isArray(window.recipes) ? window.recipes.find(r => String(r.id || r.name) === String(recipeId)) : null;
        if (recipe && typeof window.getCombinedRecipeIngredientEntries === 'function') {
          beforeEntries = window.getCombinedRecipeIngredientEntries([{ slot: { label: 'Vecka' }, recipe, recipeName: recipe.name }]) || [];
        }
      } catch (e) {}

      const result = original.apply(this, arguments);

      try {
        injectCountItemsToBuy(beforeEntries);
      } catch (e) {
        console.error('FINAL++ week recipe count-to-buy failed:', e);
      }

      try {
        if (typeof window.save === 'function') window.save();
      } catch (e) {}
      try {
        if (typeof window.render === 'function') window.render();
      } catch (e) {}

      return result;
    };

    window.__finalPPWeekWrapped = true;
    return true;
  }

  function boot() {
    const ok1 = patchRecipeCooking();
    const ok2 = patchWeekCooking();
    if (!ok1 && !ok2) {
      setTimeout(boot, 150);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
