(function () {
  'use strict';

  function nrm(value) {
    if (typeof window.normalizeText === 'function') return window.normalizeText(value);
    return String(value || '').trim().toLowerCase();
  }

  function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function isPack(itemOrUnit) {
    const unit = typeof itemOrUnit === 'object' && itemOrUnit ? itemOrUnit.unit : itemOrUnit;
    return typeof window.isPackUnit === 'function'
      ? window.isPackUnit(unit || '')
      : ['pkt', 'paket'].includes(String(unit || '').toLowerCase());
  }

  function isMeasure(itemOrUnit) {
    const unit = typeof itemOrUnit === 'object' && itemOrUnit ? itemOrUnit.unit : itemOrUnit;
    return typeof window.supportsSize === 'function'
      ? window.supportsSize(unit || '')
      : ['g', 'kg', 'ml', 'dl', 'l', 'krm', 'tsk', 'msk'].includes(String(unit || '').toLowerCase());
  }

  function isWeight(itemOrUnit) {
    const unit = typeof itemOrUnit === 'object' && itemOrUnit ? itemOrUnit.unit : itemOrUnit;
    return typeof window.isWeightUnit === 'function'
      ? window.isWeightUnit(unit || '')
      : ['g', 'kg'].includes(String(unit || '').toLowerCase());
  }

  function getMeasureUnit(item) {
    if (!item) return '';
    if (isPack(item)) {
      if (typeof window.getPackMeasureUnit === 'function') return window.getPackMeasureUnit(item, 'g');
      return String(item.packMeasureUnit || 'g').toLowerCase();
    }
    return String(item.unit || 'st').toLowerCase();
  }

  function parseSize(item) {
    if (!item) return 0;
    const unit = getMeasureUnit(item) || 'g';
    if (typeof window.parseSmartMeasureInput === 'function') {
      const parsed = window.parseSmartMeasureInput(item.measureText || item.weightText || item.size, unit);
      const n = Number(parsed);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return Math.max(0, num(item.size, 0));
  }

  function formatSize(size, unit) {
    if (!(size > 0)) return '';
    if (typeof window.getMeasureTextFromSize === 'function') return window.getMeasureTextFromSize(size, unit);
    return `${size} ${unit}`;
  }

  function cloneItem(item) {
    const out = { ...item };
    out.type = out.type === 'buy' ? 'buy' : 'home';
    out.quantity = Math.max(0, num(out.quantity, 0));
    out.size = parseSize(out);
    if (isPack(out)) {
      out.packMeasureUnit = getMeasureUnit(out);
      if (out.size > 0) {
        out.measureText = formatSize(out.size, out.packMeasureUnit);
        out.weightText = isWeight(out.packMeasureUnit) ? out.measureText : '';
      }
    } else if (isMeasure(out)) {
      const unit = getMeasureUnit(out);
      if (out.size > 0) {
        out.measureText = formatSize(out.size, unit);
        out.weightText = isWeight(unit) ? out.measureText : '';
      }
    }
    return out;
  }

  function getQuickTemplate(name) {
    if (!Array.isArray(window.quickItems)) return null;
    return window.quickItems.find((item) => item && nrm(item.name) === nrm(name)) || null;
  }

  function getTemplateBaseSize(item) {
    const quick = getQuickTemplate(item?.name || '');
    if (!quick) return 0;
    const quickUnit = String(quick.unit || 'st').toLowerCase();
    const itemUnit = String(item?.unit || 'st').toLowerCase();
    const quickMeasureUnit = getMeasureUnit(quick);

    if (isPack(quickUnit) && isMeasure(itemUnit) && quickMeasureUnit === itemUnit) {
      return parseSize(quick);
    }
    if (!isPack(quickUnit) && isMeasure(quickUnit) && quickUnit === itemUnit) {
      return parseSize(quick);
    }
    return 0;
  }

  function shouldUseTemplateQuantity(item) {
    if (!item || item.type !== 'home') return false;
    if (!isMeasure(item)) return false;
    return getTemplateBaseSize(item) > 0 && Math.max(0, num(item.quantity, 0)) > 0;
  }

  function recalcMeasuredItemFromTemplate(item) {
    if (!shouldUseTemplateQuantity(item)) return item;
    const qty = Math.max(0, num(item.quantity, 0));
    const unit = String(item.unit || 'g').toLowerCase();
    const baseSize = getTemplateBaseSize(item);
    const total = Math.max(0, baseSize * qty);
    item.size = total;
    item.measureText = total > 0 ? formatSize(total, unit) : '';
    item.weightText = isWeight(unit) ? item.measureText : '';
    return item;
  }

  function normalizeAllMeasuredHomeItems() {
    if (!Array.isArray(window.items)) return;
    window.items = window.items.map((item) => {
      const copy = cloneItem(item);
      return recalcMeasuredItemFromTemplate(copy);
    });
  }

  function makeKey(item) {
    const entry = cloneItem(item);
    const type = entry.type === 'buy' ? 'buy' : 'home';
    const room = entry.room || 'koket';
    const place = entry.place || 'kyl';

    if (isPack(entry)) {
      const bits = [type, 'pack', nrm(entry.name), String(entry.unit || 'pkt').toLowerCase(), getMeasureUnit(entry), String(parseSize(entry) || 0)];
      return type === 'buy' ? bits.join('|') : bits.concat([room, place]).join('|');
    }

    if (isMeasure(entry)) {
      const bits = [type, 'measure', nrm(entry.name), String(entry.unit || 'g').toLowerCase()];
      return type === 'buy' ? bits.join('|') : bits.concat([room, place]).join('|');
    }

    const bits = [type, 'count', nrm(entry.name), String(entry.unit || 'st').toLowerCase()];
    return type === 'buy' ? bits.join('|') : bits.concat([room, place]).join('|');
  }

  function mergeInto(existing, incoming) {
    existing.price = num(existing.price, 0) || num(incoming.price, 0);
    existing.img = existing.img || incoming.img || '';
    existing.category = existing.category || incoming.category;
    existing.room = existing.room || incoming.room;
    existing.place = existing.place || incoming.place || 'kyl';
    existing.bestBefore = [existing.bestBefore, incoming.bestBefore].filter(Boolean).sort()[0] || '';
    existing.shelfLifeDays = Math.max(num(existing.shelfLifeDays, 0), num(incoming.shelfLifeDays, 0));
    existing.openDays = Math.max(num(existing.openDays, 0), num(incoming.openDays, 0));
    existing.packMode = existing.packMode === 'bags' || incoming.packMode === 'bags' ? 'bags' : (existing.packMode || incoming.packMode || '');
    if (!existing.openedDate && incoming.openedDate) existing.openedDate = incoming.openedDate;
    existing.openedAmount = Math.max(0, num(existing.openedAmount, 0) + num(incoming.openedAmount, 0));

    if (isPack(existing)) {
      existing.quantity = Math.max(0, num(existing.quantity, 0) + num(incoming.quantity, 0));
      existing.size = Math.max(parseSize(existing), parseSize(incoming));
      existing.packMeasureUnit = existing.packMeasureUnit || incoming.packMeasureUnit || getMeasureUnit(existing);
      existing.measureText = formatSize(existing.size, existing.packMeasureUnit || getMeasureUnit(existing));
      existing.weightText = isWeight(existing.packMeasureUnit || getMeasureUnit(existing)) ? existing.measureText : '';
      return existing;
    }

    if (isMeasure(existing)) {
      existing.quantity = Math.max(0, num(existing.quantity, 0) + num(incoming.quantity, 0));
      existing.size = Math.max(0, parseSize(existing) + parseSize(incoming));
      existing.measureText = formatSize(existing.size, getMeasureUnit(existing));
      existing.weightText = isWeight(existing) ? existing.measureText : '';
      return existing;
    }

    existing.quantity = Math.max(0, num(existing.quantity, 0) + num(incoming.quantity, 0));
    return existing;
  }

  function mergeListSmart(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      if (!raw || !String(raw.name || '').trim()) return;
      const item = recalcMeasuredItemFromTemplate(cloneItem(raw));
      if (item.quantity <= 0 && num(item.openedAmount, 0) <= 0) return;
      const key = makeKey(item);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...item });
        return;
      }
      mergeInto(existing, item);
    });
    const merged = Array.from(map.values()).map((item) => recalcMeasuredItemFromTemplate(item));
    return merged.filter((item) => item && String(item.name || '').trim() && (num(item.quantity, 0) > 0 || num(item.openedAmount, 0) > 0));
  }

  function normalizeQuickItems(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      if (!raw || !String(raw.name || '').trim()) return;
      const item = cloneItem(raw);
      const key = nrm(item.name);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...item, quantity: Math.max(1, num(item.quantity, 1)) });
        return;
      }
      existing.price = num(existing.price, 0) || num(item.price, 0);
      existing.unit = item.unit || existing.unit || 'st';
      existing.quantity = Math.max(num(existing.quantity, 1), num(item.quantity, 1), 1);
      existing.size = parseSize(existing) || parseSize(item);
      existing.packMeasureUnit = existing.packMeasureUnit || item.packMeasureUnit || '';
      existing.measureText = existing.measureText || item.measureText || '';
      existing.weightText = existing.weightText || item.weightText || '';
      existing.category = existing.category || item.category;
      existing.place = existing.place || item.place;
      existing.room = existing.room || item.room;
      existing.img = existing.img || item.img || '';
      existing.shelfLifeDays = Math.max(num(existing.shelfLifeDays, 0), num(item.shelfLifeDays, 0));
      existing.openDays = Math.max(num(existing.openDays, 0), num(item.openDays, 0));
    });
    return Array.from(map.values());
  }

  function applySmartMerge() {
    normalizeAllMeasuredHomeItems();
    if (Array.isArray(window.items)) window.items = mergeListSmart(window.items);
    if (Array.isArray(window.quickItems)) window.quickItems = normalizeQuickItems(window.quickItems);
  }

  window.mergeItems = mergeListSmart;
  if (typeof mergeItems !== 'undefined') mergeItems = mergeListSmart;

  const originalSave = typeof window.save === 'function' ? window.save : null;
  if (originalSave && !originalSave.__zipFinalPatched) {
    window.save = function patchedSave() {
      applySmartMerge();
      return originalSave.apply(this, arguments);
    };
    window.save.__zipFinalPatched = true;
    if (typeof save !== 'undefined') save = window.save;
  }

  const originalRender = typeof window.render === 'function' ? window.render : null;
  if (originalRender && !originalRender.__zipFinalPatched) {
    window.render = function patchedRender() {
      applySmartMerge();
      return originalRender.apply(this, arguments);
    };
    window.render.__zipFinalPatched = true;
    if (typeof render !== 'undefined') render = window.render;
  }

  const originalUpdateQuantity = typeof window.updateQuantity === 'function' ? window.updateQuantity : null;
  if (originalUpdateQuantity && !originalUpdateQuantity.__zipFinalPatched) {
    window.updateQuantity = function updateQuantityZipFinal(index, value) {
      const item = Array.isArray(window.items) ? window.items[index] : null;
      if (!item) return originalUpdateQuantity.apply(this, arguments);

      const oldQty = Math.max(0, num(item.quantity, 0));
      const newQty = Math.max(0, num(value, 0));
      const baseSize = getTemplateBaseSize(item);

      if (item.type === 'home' && isMeasure(item) && baseSize > 0) {
        item.quantity = newQty;
        item.size = baseSize * newQty;
        item.measureText = newQty > 0 ? formatSize(item.size, item.unit || 'g') : '';
        item.weightText = isWeight(item.unit || 'g') ? item.measureText : '';

        if (newQty === 0) {
          window.items.splice(index, 1);
        } else if (typeof window.syncQuickItemFromItem === 'function') {
          window.syncQuickItemFromItem(item);
        }

        applySmartMerge();
        if (typeof window.save === 'function') window.save();
        if (typeof window.render === 'function') window.render();
        return;
      }

      const result = originalUpdateQuantity.apply(this, arguments);
      applySmartMerge();
      return result;
    };
    window.updateQuantity.__zipFinalPatched = true;
    if (typeof updateQuantity !== 'undefined') updateQuantity = window.updateQuantity;
  }

  const originalSaveEditItem = typeof window.saveEditItem === 'function' ? window.saveEditItem : null;
  if (originalSaveEditItem && !originalSaveEditItem.__zipFinalPatched) {
    window.saveEditItem = function saveEditItemZipFinal() {
      const result = originalSaveEditItem.apply(this, arguments);
      applySmartMerge();
      if (typeof window.save === 'function') window.save();
      if (typeof window.render === 'function') window.render();
      return result;
    };
    window.saveEditItem.__zipFinalPatched = true;
    if (typeof saveEditItem !== 'undefined') saveEditItem = window.saveEditItem;
  }

  const originalTransferSingleItem = typeof window.transferSingleItem === 'function' ? window.transferSingleItem : null;
  if (originalTransferSingleItem && !originalTransferSingleItem.__zipFinalPatched) {
    window.transferSingleItem = function transferSingleItemZipFinal(index, targetType, targetPlace = null) {
      const sourceItem = Array.isArray(window.items) ? window.items[index] : null;
      const normalizedTargetType = targetType === 'buy' ? 'buy' : 'home';
      const sourceType = sourceItem && sourceItem.type === 'buy' ? 'buy' : 'home';

      if (sourceItem && sourceType === 'buy' && normalizedTargetType === 'home') {
        const moved = recalcMeasuredItemFromTemplate(cloneItem({ ...sourceItem, type: 'home', place: targetPlace || sourceItem.place || 'kyl' }));
        const movedKey = makeKey(moved);
        const existing = window.items.find((entry, entryIndex) => entryIndex !== index && makeKey({ ...entry, type: 'home' }) === movedKey);

        if (existing) {
          mergeInto(existing, moved);
          window.items.splice(index, 1);
          applySmartMerge();
          if (typeof window.syncQuickItemFromItem === 'function') window.syncQuickItemFromItem(existing);
          if (typeof window.save === 'function') window.save();
          if (typeof window.render === 'function') window.render();
          return;
        }
      }

      const result = originalTransferSingleItem.apply(this, arguments);
      applySmartMerge();
      return result;
    };
    window.transferSingleItem.__zipFinalPatched = true;
    if (typeof transferSingleItem !== 'undefined') transferSingleItem = window.transferSingleItem;
  }

  const originalAddHomeItemFromTemplate = typeof window.addHomeItemFromTemplate === 'function' ? window.addHomeItemFromTemplate : null;
  if (originalAddHomeItemFromTemplate && !originalAddHomeItemFromTemplate.__zipFinalPatched) {
    window.addHomeItemFromTemplate = function addHomeItemFromTemplateZipFinal(sourceItem, quantity, targetPlace) {
      const incoming = recalcMeasuredItemFromTemplate(cloneItem({
        ...(sourceItem || {}),
        type: 'home',
        quantity: Math.max(1, num(quantity, 1)),
        place: targetPlace || sourceItem?.place || 'kyl'
      }));
      const key = makeKey(incoming);
      const existing = Array.isArray(window.items) ? window.items.find((entry) => makeKey({ ...entry, type: 'home' }) === key) : null;
      if (existing) {
        mergeInto(existing, incoming);
        existing.type = 'home';
        applySmartMerge();
        if (typeof window.syncQuickItemFromItem === 'function') window.syncQuickItemFromItem(existing);
        return;
      }
      const result = originalAddHomeItemFromTemplate.apply(this, arguments);
      applySmartMerge();
      return result;
    };
    window.addHomeItemFromTemplate.__zipFinalPatched = true;
    if (typeof addHomeItemFromTemplate !== 'undefined') addHomeItemFromTemplate = window.addHomeItemFromTemplate;
  }

  window.addPackAmountToHome = function addPackAmountToHome(nameOrItem, packCount, targetPlace) {
    const count = Math.max(1, Math.round(num(packCount, 1)));
    const source = typeof nameOrItem === 'string'
      ? (Array.isArray(window.quickItems) ? window.quickItems.find(item => item && nrm(item.name) === nrm(nameOrItem)) : null)
      : nameOrItem;
    if (!source) return false;
    if (typeof window.addHomeItemFromTemplate === 'function') {
      window.addHomeItemFromTemplate(source, count, targetPlace || source.place || 'kyl');
      applySmartMerge();
      if (typeof window.save === 'function') window.save();
      if (typeof window.render === 'function') window.render();
      return true;
    }
    return false;
  };

  applySmartMerge();
  window.__packMergeFix = 'zip-final-v1-weight-quantity-template';
})();
