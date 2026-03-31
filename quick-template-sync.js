
(function () {
  'use strict';

  function norm(value) {
    if (typeof window.normalizeText === 'function') return window.normalizeText(value);
    return String(value || '').trim().toLowerCase();
  }

  function safeNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function keepOrIncoming(current, incoming) {
    return incoming != null && incoming !== '' ? incoming : current;
  }

  function normalizePlace(place, room) {
    if (typeof window.ensurePlaceExists === 'function') return window.ensurePlaceExists(place || 'kyl', room);
    return place || 'kyl';
  }

  function normalizeCategory(category, room) {
    if (typeof window.ensureCategoryExists === 'function') {
      const fallback = typeof window.getRoomFallbackCategory === 'function' ? window.getRoomFallbackCategory(room) : 'ÖVRIGT';
      return window.ensureCategoryExists(category || fallback, room);
    }
    return category || 'ÖVRIGT';
  }

  function cloneTemplateFieldsForListItem(listItem, quickTemplate, oldNameNormalized) {
    if (!listItem || !quickTemplate) return listItem;
    const room = keepOrIncoming(listItem.room, quickTemplate.room || window.activeRoom || 'koket');
    const next = { ...listItem };

    // Things that SHOULD sync from snabblista
    next.name = keepOrIncoming(listItem.name, quickTemplate.name);
    next.price = safeNum(keepOrIncoming(listItem.price, quickTemplate.price), 0) || safeNum(listItem.price, 0);
    next.unit = quickTemplate.unit || listItem.unit || 'st';
    next.size = keepOrIncoming(listItem.size, quickTemplate.size);
    next.packMeasureUnit = keepOrIncoming(listItem.packMeasureUnit, quickTemplate.packMeasureUnit || '');
    next.measureText = keepOrIncoming(listItem.measureText, quickTemplate.measureText || '');
    next.weightText = keepOrIncoming(listItem.weightText, quickTemplate.weightText || '');
    next.room = quickTemplate.room || room;
    next.place = normalizePlace(quickTemplate.place || listItem.place || 'kyl', next.room);
    next.category = normalizeCategory(quickTemplate.category || listItem.category || 'ÖVRIGT', next.room);
    next.img = keepOrIncoming(listItem.img, quickTemplate.img || '');
    next.shelfLifeDays = safeNum(keepOrIncoming(listItem.shelfLifeDays, quickTemplate.shelfLifeDays), 0);
    next.openDays = safeNum(keepOrIncoming(listItem.openDays, quickTemplate.openDays), 0);

    // Things that MUST stay on Har hemma / Behöver köpa
    next.quantity = safeNum(listItem.quantity, 1);
    next.type = listItem.type;
    next.bestBefore = listItem.bestBefore || '';
    next.openedDate = listItem.openedDate || '';
    next.openedAmount = safeNum(listItem.openedAmount, 0);
    next.packMode = listItem.packMode || '';

    // Keep match compatibility after rename
    next._quickTemplateName = quickTemplate.name || listItem._quickTemplateName || listItem.name || '';

    if (typeof window.normalizeExpiryFields === 'function') {
      return window.normalizeExpiryFields(next);
    }
    return next;
  }

  function propagateQuickChange(oldName, quickTemplate) {
    if (!Array.isArray(window.items) || !quickTemplate) return;
    const oldNorm = norm(oldName || quickTemplate.name);
    const quickNorm = norm(quickTemplate.name);

    window.items = window.items.map(function (item) {
      const itemTemplateNorm = norm(item && item._quickTemplateName);
      const itemNameNorm = norm(item && item.name);
      const matches = item && (itemTemplateNorm === oldNorm || itemNameNorm === oldNorm || itemTemplateNorm === quickNorm || itemNameNorm === quickNorm);
      if (!matches) return item;
      return cloneTemplateFieldsForListItem(item, quickTemplate, oldNorm);
    });

    if (typeof window.mergeItems === 'function') {
      window.items = window.mergeItems(window.items);
    }
  }

  function patchQuickPlaceCategory() {
    const originalPlace = window.changeQuickPlace;
    if (typeof originalPlace === 'function' && !originalPlace.__quickSyncPatched) {
      window.changeQuickPlace = function patchedChangeQuickPlace(index, newPlace) {
        const item = Array.isArray(window.quickItems) ? window.quickItems[index] : null;
        const oldName = item ? item.name : '';
        const result = originalPlace.apply(this, arguments);
        const changed = Array.isArray(window.quickItems) ? window.quickItems[index] : null;
        if (changed) {
          propagateQuickChange(oldName, changed);
          if (typeof window.save === 'function') window.save();
          if (typeof window.render === 'function') window.render();
        }
        return result;
      };
      window.changeQuickPlace.__quickSyncPatched = true;
    }

    const originalCategory = window.changeQuickCategory;
    if (typeof originalCategory === 'function' && !originalCategory.__quickSyncPatched) {
      window.changeQuickCategory = function patchedChangeQuickCategory(index, newCategory) {
        const item = Array.isArray(window.quickItems) ? window.quickItems[index] : null;
        const oldName = item ? item.name : '';
        const result = originalCategory.apply(this, arguments);
        const changed = Array.isArray(window.quickItems) ? window.quickItems[index] : null;
        if (changed) {
          propagateQuickChange(oldName, changed);
          if (typeof window.save === 'function') window.save();
          if (typeof window.render === 'function') window.render();
        }
        return result;
      };
      window.changeQuickCategory.__quickSyncPatched = true;
    }
  }

  function patchSaveQuickTemplate() {
    const original = window.saveQuickTemplate;
    if (typeof original !== 'function' || original.__quickSyncPatched) return;

    window.saveQuickTemplate = function patchedSaveQuickTemplate(item) {
      const oldExisting = Array.isArray(window.quickItems)
        ? window.quickItems.find(function (q) { return norm(q && q.name) === norm(item && item.name); })
        : null;
      const oldName = oldExisting ? oldExisting.name : (item && item.name) || '';
      const result = original.apply(this, arguments);
      const quick = Array.isArray(window.quickItems)
        ? window.quickItems.find(function (q) { return norm(q && q.name) === norm(item && item.name); })
        : null;
      if (quick) propagateQuickChange(oldName, quick);
      return result;
    };
    window.saveQuickTemplate.__quickSyncPatched = true;
  }

  function patchSaveEditItem() {
    const original = window.saveEditItem;
    if (typeof original !== 'function' || original.__quickSyncPatched) return;

    window.saveEditItem = function patchedSaveEditItem() {
      const isQuick = !!window.editingQuick;
      const oldItem = isQuick && Array.isArray(window.quickItems) && window.editingIndex != null
        ? { ...window.quickItems[window.editingIndex] }
        : null;

      const result = original.apply(this, arguments);

      if (isQuick && oldItem) {
        const quick = Array.isArray(window.quickItems)
          ? window.quickItems.find(function (q) {
              return norm(q && q.name) === norm(oldItem.name) || norm(q && q.name) === norm(document.getElementById('editName') && document.getElementById('editName').value);
            })
          : null;

        if (quick) {
          propagateQuickChange(oldItem.name, quick);
          if (typeof window.save === 'function') window.save();
          if (typeof window.render === 'function') window.render();
        }
      }

      return result;
    };
    window.saveEditItem.__quickSyncPatched = true;
  }

  function patchQuickNameSyncAfterInlineEdits() {
    // When quick items exist and older data lacks _quickTemplateName, set it once.
    if (!Array.isArray(window.items) || !Array.isArray(window.quickItems)) return;
    const quickNames = new Map(window.quickItems.map(function (q) { return [norm(q.name), q.name]; }));
    window.items.forEach(function (item) {
      if (!item) return;
      if (!item._quickTemplateName && quickNames.has(norm(item.name))) {
        item._quickTemplateName = quickNames.get(norm(item.name));
      }
    });
  }

  function boot() {
    patchQuickPlaceCategory();
    patchSaveQuickTemplate();
    patchSaveEditItem();
    patchQuickNameSyncAfterInlineEdits();
    if (typeof window.save === 'function') window.save();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.propagateQuickChange = propagateQuickChange;
})();
