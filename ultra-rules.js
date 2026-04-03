
(function () {
  'use strict';

  function norm(v) {
    try {
      if (typeof window.normalizeText === 'function') return window.normalizeText(v || '');
    } catch (e) {}
    return String(v || '').trim().toLowerCase();
  }

  function safeNum(v, fb = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }

  function isWeightUnit(unit) {
    const u = String(unit || '').toLowerCase();
    return ['g', 'kg', 'hg', 'mg', 'ml', 'cl', 'dl', 'l'].includes(u);
  }

  function supportsSize(unit) {
    try {
      if (typeof window.supportsSize === 'function') return window.supportsSize(unit);
    } catch (e) {}
    return isWeightUnit(unit);
  }

  function formatWeight(size, unit) {
    try {
      if (typeof window.formatSmartMeasureDisplay === 'function') {
        return window.formatSmartMeasureDisplay(size, unit);
      }
    } catch (e) {}
    const n = safeNum(size, 0);
    const u = String(unit || '').toLowerCase();
    if (u === 'g' && n >= 1000) return (n / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' kg';
    if (u === 'ml' && n >= 1000) return (n / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' l';
    return `${n} ${u}`.trim();
  }

  function getQuickByName(name) {
    if (!Array.isArray(window.quickItems)) return null;
    return window.quickItems.find(q => norm(q?.name) === norm(name)) || null;
  }

  function ensurePaketLabel() {
    try {
      document.querySelectorAll('option[value="pkt"]').forEach(opt => { opt.textContent = 'paket'; });
    } catch (e) {}
  }

  function lockQuickTemplateSync() {
    // Snabblista must NOT mutate quantities in home/buy
    window.syncQuickItemFromItem = function () { return; };
    try { syncQuickItemFromItem = window.syncQuickItemFromItem; } catch (e) {}
  }

  function sameVariantForMerge(a, b) {
    if (!a || !b) return false;
    if (norm(a.name) !== norm(b.name)) return false;
    if (String(a.type || 'home') !== String(b.type || 'home')) return false;
    const ua = String(a.unit || '').toLowerCase();
    const ub = String(b.unit || '').toLowerCase();
    const pa = String(a.place || '');
    const pb = String(b.place || '');
    const ra = String(a.room || '');
    const rb = String(b.room || '');

    // For weight/package items we merge aggressively by name + type + place + room
    if (supportsSize(ua) || supportsSize(ub) || ua === 'paket' || ua === 'pkt' || ub === 'paket' || ub === 'pkt') {
      return pa === pb && ra === rb;
    }

    return ua === ub && pa === pb && ra === rb;
  }

  function mergeUltraItems(list) {
    const arr = Array.isArray(list) ? list.slice() : [];
    const out = [];

    arr.forEach(item => {
      if (!item) return;
      const next = { ...item };

      if (String(next.unit || '').toLowerCase() === 'pkt') next.unit = 'paket';

      const existing = out.find(entry => sameVariantForMerge(entry, next));
      if (!existing) {
        out.push(next);
        return;
      }

      const unit = String(next.unit || existing.unit || '').toLowerCase();
      const isWeightish = supportsSize(unit) || supportsSize(existing.unit) || unit === 'paket' || unit === 'pkt';

      if (isWeightish) {
        existing.quantity = Math.max(1, safeNum(existing.quantity, 1) + safeNum(next.quantity, 1));
        // Keep per-pack size from template if available; never sum size for package rows.
        if (!safeNum(existing.size, 0) && safeNum(next.size, 0)) existing.size = safeNum(next.size, 0);
      } else {
        existing.quantity = Math.max(1, safeNum(existing.quantity, 1) + safeNum(next.quantity, 1));
      }

      if (!existing.img && next.img) existing.img = next.img;
      if (!safeNum(existing.price, 0) && safeNum(next.price, 0)) existing.price = safeNum(next.price, 0);
      existing.category = existing.category || next.category;
      existing.place = existing.place || next.place;
      existing.room = existing.room || next.room;
      existing.measureText = existing.measureText || next.measureText || '';
      existing.weightText = existing.weightText || next.weightText || '';
    });

    return out;
  }

  function persistAndRefresh() {
    try {
      if (Array.isArray(window.items)) window.items = mergeUltraItems(window.items);
    } catch (e) {}
    try {
      if (typeof window.save === 'function') window.save();
      else localStorage.setItem('matlista', JSON.stringify(window.items || []));
    } catch (e) { console.error(e); }
    try { if (typeof window.checkRecipe === 'function') window.checkRecipe(); } catch (e) {}
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
  }

  function patchTransferSingleItem() {
    const original = window.transferSingleItem;
    if (typeof original !== 'function') return false;

    window.transferSingleItem = function ultraTransferSingleItem(index, targetType, targetPlace = null) {
      const sourceItem = Array.isArray(window.items) ? window.items[index] : null;
      if (!sourceItem) return;

      const sourceType = sourceItem.type === 'buy' ? 'buy' : 'home';
      const target = targetType === 'buy' ? 'buy' : 'home';

      // buy -> home: same item should merge onto one row
      if (sourceType === 'buy' && target === 'home') {
        const qty = Math.max(1, safeNum(
          typeof window.getTransferQuantity === 'function'
            ? window.getTransferQuantity(sourceItem, target)
            : sourceItem.quantity || 1,
          1
        ));
        const template = getQuickByName(sourceItem.name) || sourceItem;
        const place = targetPlace || sourceItem.place || template.place || 'kyl';

        const newHome = {
          ...sourceItem,
          type: 'home',
          place,
          room: sourceItem.room || template.room || window.activeRoom || 'koket',
          unit: String(sourceItem.unit || template.unit || '').toLowerCase() === 'pkt' ? 'paket' : (sourceItem.unit || template.unit || 'st'),
          quantity: qty,
          size: safeNum(template.size || sourceItem.size || 0, 0) || sourceItem.size || template.size || 0
        };

        const existing = window.items.find((entry, i) =>
          i !== index &&
          entry &&
          entry.type === 'home' &&
          sameVariantForMerge(entry, newHome)
        );

        if (existing) {
          existing.quantity = Math.max(1, safeNum(existing.quantity, 1) + qty);
          if (!safeNum(existing.size, 0) && safeNum(newHome.size, 0)) existing.size = safeNum(newHome.size, 0);
        } else {
          window.items.push(newHome);
        }

        sourceItem.quantity = Math.max(0, safeNum(sourceItem.quantity, 0) - qty);
        if (sourceItem.quantity <= 0) window.items.splice(index, 1);

        persistAndRefresh();
        return;
      }

      return original(index, targetType, targetPlace);
    };

    return true;
  }

  function patchUpdateQuantity() {
    const original = window.updateQuantity;
    if (typeof original !== 'function') return false;

    window.updateQuantity = function ultraUpdateQuantity(index, delta) {
      const item = Array.isArray(window.items) ? window.items[index] : null;
      const before = item ? { ...item } : null;
      const oldQty = item ? safeNum(item.quantity, 1) : 0;

      const result = original(index, delta);

      const current = Array.isArray(window.items) ? window.items[index] : null;
      const target = current || before;
      if (!target) return result;

      const template = getQuickByName(target.name);
      const itemType = String(target.type || 'home');
      const unit = String((current?.unit || before?.unit || template?.unit || '')).toLowerCase();

      // Keep package/weight rows as per-pack size, never total size
      if ((unit === 'paket' || unit === 'pkt' || supportsSize(unit)) && template && safeNum(template.size, 0) > 0) {
        const live = current || target;
        live.size = safeNum(template.size, 0);
        live.measureText = supportsSize(unit) ? formatWeight(live.size, unit) : (live.measureText || '');
        live.weightText = isWeightUnit(unit) ? formatWeight(live.size, unit) : (live.weightText || '');
      }

      // Rule: when amount removed from home reaches template size, queue that many packs to buy
      if (before && itemType === 'home' && template && safeNum(template.size, 0) > 0 && supportsSize(unit)) {
        const newQty = current ? safeNum(current.quantity, 1) : 0;
        const removedQty = Math.max(0, oldQty - newQty);
        if (removedQty > 0) {
          const packCount = removedQty * Math.max(1, safeNum(template.quantity, 1));
          let buyItem = null;
          try {
            if (typeof window.buildQuickPackBuyItem === 'function') {
              buyItem = window.buildQuickPackBuyItem(template, packCount);
            }
          } catch (e) {}
          if (!buyItem) {
            buyItem = {
              name: template.name || before.name,
              price: safeNum(template.price, 0),
              quantity: packCount,
              unit: String(template.unit || before.unit || 'g').toLowerCase() === 'pkt' ? 'paket' : (template.unit || before.unit || 'g'),
              size: safeNum(template.size, 0),
              measureText: formatWeight(safeNum(template.size, 0), template.unit || before.unit || 'g'),
              weightText: formatWeight(safeNum(template.size, 0), template.unit || before.unit || 'g'),
              category: template.category || before.category || '',
              place: template.place || 'kyl',
              room: template.room || before.room || window.activeRoom || 'koket',
              img: template.img || before.img || '',
              type: 'buy'
            };
          }

          try {
            if (typeof window.pushOrMergeBuyPack === 'function') {
              window.pushOrMergeBuyPack(buyItem);
            } else {
              window.items.push(buyItem);
            }
          } catch (e) {
            window.items.push(buyItem);
          }

          persistAndRefresh();
        }
      }

      return result;
    };

    return true;
  }

  function patchRenderFormatting() {
    const original = window.formatItemAmount;
    if (typeof original !== 'function') return false;

    window.formatItemAmount = function ultraFormatItemAmount(item) {
      if (!item) return original(item);

      const unit = String(item.unit || '').toLowerCase() === 'pkt' ? 'paket' : String(item.unit || '').toLowerCase();
      const qty = Math.max(1, safeNum(item.quantity, 1));
      const size = safeNum(item.size, 0);

      if ((unit === 'paket' || supportsSize(unit)) && size > 0 && qty > 1) {
        const total = qty * size;
        const unitLabel = unit === 'paket' ? 'paket' : unit;
        return `${formatWeight(total, unit)} totalt • ${qty} ${unitLabel} × ${formatWeight(size, unit)}`;
      }
      if ((unit === 'paket' || supportsSize(unit)) && size > 0 && qty === 1) {
        const unitLabel = unit === 'paket' ? 'paket' : unit;
        return `${formatWeight(size, unit)} • ${qty} ${unitLabel}`;
      }

      return original(item);
    };

    return true;
  }

  function patchQuickUiButtons() {
    if (document.getElementById('ultraQuickButtons')) return;
    const homeList = document.getElementById('homeList');
    if (!homeList) return;

    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-ultra-add-pack]');
      if (!btn) return;
      const name = btn.getAttribute('data-ultra-add-pack');
      const entry = Array.isArray(window.items) ? window.items.find(it => it && it.type === 'home' && norm(it.name) === norm(name)) : null;
      if (!entry) return;
      const idx = window.items.indexOf(entry);
      if (idx < 0) return;
      if (typeof window.updateQuantity === 'function') {
        window.updateQuantity(idx, 1);
      } else {
        entry.quantity = safeNum(entry.quantity, 1) + 1;
        persistAndRefresh();
      }
    }, true);

    const observer = new MutationObserver(() => {
      document.querySelectorAll('.card').forEach(card => {
        if (card.querySelector('.ultra-pack-btn')) return;
        const text = card.textContent || '';
        const match = Array.isArray(window.items)
          ? window.items.find(it => it && text.toLowerCase().includes(String(it.name || '').toLowerCase()))
          : null;
        if (!match || match.type !== 'home') return;
        const unit = String(match.unit || '').toLowerCase();
        if (!(unit === 'paket' || supportsSize(unit))) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ghost-btn ultra-pack-btn';
        btn.setAttribute('data-ultra-add-pack', match.name || '');
        btn.textContent = '+1 paket';
        btn.style.marginTop = '8px';

        const info = card.querySelector('.info') || card;
        info.appendChild(btn);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function install() {
    ensurePaketLabel();
    lockQuickTemplateSync();
    patchTransferSingleItem();
    patchUpdateQuantity();
    patchRenderFormatting();
    try { if (Array.isArray(window.items)) window.items = mergeUltraItems(window.items); } catch (e) {}
    try { if (typeof window.save === 'function') window.save(); } catch (e) {}
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
    try { patchQuickUiButtons(); } catch (e) {}
  }

  function boot() {
    if (typeof window.render !== 'function') {
      setTimeout(boot, 120);
      return;
    }
    install();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
