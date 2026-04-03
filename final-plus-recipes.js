
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

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

  function ensurePreviewUi() {
    const recipeBox = document.querySelector('[data-page="recipes"] #recipeSection .recipe-box:last-child .container');
    if (!recipeBox || byId('finalPlusPreviewBox')) return;

    const box = document.createElement('div');
    box.id = 'finalPlusPreviewBox';
    box.className = 'final-plus-preview';
    box.innerHTML = `
      <div class="final-plus-preview-head">
        <div class="final-plus-preview-title">🍳 Preview innan lagat</div>
        <div id="finalPlusPreviewMeta" class="final-plus-preview-meta">Välj ett recept</div>
      </div>
      <div id="finalPlusPreviewList" class="final-plus-preview-list">Ingen preview ännu.</div>
    `;
    const cookButton = recipeBox.querySelector('button[onclick="useRecipeIngredients()"]');
    if (cookButton && cookButton.parentNode) {
      cookButton.parentNode.insertBefore(box, cookButton);
      cookButton.textContent = '🍳 Lagat detta';
    } else {
      recipeBox.appendChild(box);
    }
  }

  function formatAmount(unit, amount, name) {
    try {
      if (typeof window.formatRecipeAmount === 'function') return window.formatRecipeAmount(unit, amount, name);
    } catch (e) {}
    const n = num(amount, 0);
    return `${n} ${unit || ''}`.trim();
  }

  function getCombinedEntriesForSelectedRecipe() {
    const recipe = typeof window.getSelectedRecipe === 'function' ? window.getSelectedRecipe() : null;
    if (!recipe) return { recipe: null, entries: [] };

    const entries = typeof window.getCombinedRecipeIngredientEntries === 'function'
      ? window.getCombinedRecipeIngredientEntries([{ slot: { label: 'Recept' }, recipe, recipeName: recipe.name }])
      : [];

    return { recipe, entries: Array.isArray(entries) ? entries : [] };
  }

  function buildPreviewRows(entries) {
    return entries
      .map(entry => {
        const ingredient = typeof window.normalizeRecipeIngredient === 'function'
          ? window.normalizeRecipeIngredient(entry?.ingredient || entry)
          : (entry?.ingredient || entry);

        if (!ingredient) return null;

        const amount = Math.max(0, num(
          entry?.canonicalAmount ??
          entry?.amount ??
          ingredient?.canonicalAmount ??
          ingredient?.amount ??
          (typeof window.recipeIngredientCanonicalAmount === 'function' ? window.recipeIngredientCanonicalAmount(ingredient) : 0),
          0
        ));

        const label = ingredient.name || 'Ingrediens';
        return {
          name: label,
          unit: ingredient.unit || 'g',
          amount,
          display: formatAmount(ingredient.unit || 'g', amount, label)
        };
      })
      .filter(Boolean);
  }

  function updatePreview() {
    ensurePreviewUi();

    const meta = byId('finalPlusPreviewMeta');
    const list = byId('finalPlusPreviewList');
    if (!meta || !list) return;

    const { recipe, entries } = getCombinedEntriesForSelectedRecipe();
    if (!recipe) {
      meta.textContent = 'Välj ett recept';
      list.textContent = 'Ingen preview ännu.';
      return;
    }

    const rows = buildPreviewRows(entries);
    meta.textContent = `${recipe.name || 'Recept'} • ${rows.length} ingredienser`;

    if (!rows.length) {
      list.textContent = 'Inga ingredienser att dra av.';
      return;
    }

    list.innerHTML = rows.map(row => (
      `<div class="final-plus-row"><span class="final-plus-name">${escapeHtml(row.name)}</span><span class="final-plus-amount">-${escapeHtml(row.display)}</span></div>`
    )).join('');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function mergeSameItems() {
    if (!Array.isArray(window.items)) return;
    const out = [];
    window.items.forEach(item => {
      if (!item) return;
      const idx = out.findIndex(existing =>
        existing &&
        existing.type === item.type &&
        norm(existing.name) === norm(item.name) &&
        String(existing.place || '') === String(item.place || '') &&
        String(existing.room || '') === String(item.room || '') &&
        String(existing.unit || '') === String(item.unit || '') &&
        num(existing.size, 0) === num(item.size, 0)
      );
      if (idx < 0) {
        out.push(item);
      } else {
        out[idx].quantity = Math.max(1, num(out[idx].quantity, 1) + num(item.quantity, 1));
      }
    });
    window.items = out;
  }

  function persist() {
    try { mergeSameItems(); } catch (e) {}
    try {
      if (typeof window.save === 'function') window.save();
      else localStorage.setItem('matlista', JSON.stringify(window.items || []));
    } catch (e) {}
    try { if (typeof window.checkRecipe === 'function') window.checkRecipe(); } catch (e) {}
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
    try { updatePreview(); } catch (e) {}
  }

  function patchUseRecipeIngredients() {
    if (typeof window.useRecipeIngredients !== 'function' || window.__finalPlusRecipeWrapped) return false;
    const original = window.useRecipeIngredients;

    window.useRecipeIngredients = function finalPlusUseRecipeIngredients() {
      const { recipe, entries } = getCombinedEntriesForSelectedRecipe();
      if (!recipe) return;

      const rows = buildPreviewRows(entries);
      const previewText = rows.map(row => `- ${row.name}: ${row.display}`).join('\n');
      const confirmed = window.confirm(`Laga "${recipe.name || 'recept'}"?\n\nDet här dras av från Har hemma:\n${previewText || '- inga ingredienser'}`);
      if (!confirmed) return;

      if (typeof window.consumeIngredientEntries === 'function') {
        window.consumeIngredientEntries(entries);
      } else {
        original.apply(this, arguments);
        persist();
        return;
      }

      persist();
    };

    window.__finalPlusRecipeWrapped = true;
    return true;
  }

  function patchSelectorsForPreview() {
    const select = byId('recipeSelect');
    const category = byId('recipeCategoryFilter');
    const search = byId('recipeSearch');

    if (select && !select.__finalPlusBound) {
      select.addEventListener('change', updatePreview);
      select.__finalPlusBound = true;
    }
    if (category && !category.__finalPlusBound) {
      category.addEventListener('change', function(){ setTimeout(updatePreview, 50); });
      category.__finalPlusBound = true;
    }
    if (search && !search.__finalPlusBound) {
      search.addEventListener('input', function(){ setTimeout(updatePreview, 50); });
      search.__finalPlusBound = true;
    }
  }

  function patchWeekCook() {
    if (typeof window.cookSelectedWeekRecipe !== 'function' || window.__finalPlusWeekWrapped) return false;
    const original = window.cookSelectedWeekRecipe;
    window.cookSelectedWeekRecipe = function finalPlusCookSelectedWeekRecipe() {
      const confirmed = window.confirm('Laga valt veckorecept och dra av ingredienser från Har hemma?');
      if (!confirmed) return;
      const result = original.apply(this, arguments);
      setTimeout(persist, 20);
      return result;
    };
    window.__finalPlusWeekWrapped = true;
    return true;
  }

  function boot() {
    ensurePreviewUi();
    patchSelectorsForPreview();
    const ok1 = patchUseRecipeIngredients();
    patchWeekCook();
    updatePreview();
    if (!ok1) {
      setTimeout(boot, 150);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
