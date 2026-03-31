
(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function todayPlus(days) {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function ensureDemoData() {
    const hasDemoData = localStorage.getItem('matlista_demo_seeded') === '1';
    if (hasDemoData) return;

    const quickItems = [
      {
        name: 'Mjölk', quantity: 1, unit: 'st', price: 22.90, category: 'MAT',
        place: 'kyl', room: 'koket', img: '', shelfLifeDays: 7, openDays: 5
      },
      {
        name: 'Bröd', quantity: 1, unit: 'st', price: 32.90, category: 'MAT',
        place: 'skafferi', room: 'koket', img: '', shelfLifeDays: 5, openDays: 3
      },
      {
        name: 'Juice', quantity: 1, unit: 'st', price: 28.90, category: 'MAT',
        place: 'kyl', room: 'koket', img: '', shelfLifeDays: 10, openDays: 7
      },
      {
        name: 'Ost', quantity: 1, unit: 'st', price: 49.90, category: 'MAT',
        place: 'kyl', room: 'koket', img: '', shelfLifeDays: 14, openDays: 7
      }
    ];

    const items = [
      {
        name: 'Mjölk', quantity: 2, unit: 'st', price: 22.90, category: 'MAT',
        place: 'kyl', room: 'koket', img: '', type: 'home',
        shelfLifeDays: 7, openDays: 5, bestBefore: todayPlus(2), openedDate: todayPlus(-1),
        _quickTemplateName: 'Mjölk'
      },
      {
        name: 'Bröd', quantity: 1, unit: 'st', price: 32.90, category: 'MAT',
        place: 'skafferi', room: 'koket', img: '', type: 'home',
        shelfLifeDays: 5, openDays: 3, bestBefore: todayPlus(1), openedDate: '',
        _quickTemplateName: 'Bröd'
      },
      {
        name: 'Juice', quantity: 1, unit: 'st', price: 28.90, category: 'MAT',
        place: 'kyl', room: 'koket', img: '', type: 'buy',
        shelfLifeDays: 10, openDays: 7, bestBefore: '', openedDate: '',
        _quickTemplateName: 'Juice'
      },
      {
        name: 'Ost', quantity: 1, unit: 'st', price: 49.90, category: 'MAT',
        place: 'kyl', room: 'koket', img: '', type: 'buy',
        shelfLifeDays: 14, openDays: 7, bestBefore: '', openedDate: '',
        _quickTemplateName: 'Ost'
      }
    ];

    const roomConfigs = {
      koket: {
        categories: ['ÖVRIGT', 'MAT', 'KÖTTFÄRS', 'BAKINGREDIENSER'],
        places: [
          { key: 'kyl', label: '🧊 Kyl' },
          { key: 'frys', label: '❄️ Frys' },
          { key: 'kryddor', label: '🌶️ Kryddor' },
          { key: 'skafferi', label: '🥫 Skafferi' }
        ]
      },
      badrummet: {
        categories: ['ÖVRIGT'],
        places: [{ key: 'hylla', label: '🧴 Hylla' }]
      },
      hallen: {
        categories: ['ÖVRIGT'],
        places: [{ key: 'hylla', label: '🧺 Hylla' }]
      },
      'sovrummet-1': {
        categories: ['ÖVRIGT'],
        places: [{ key: 'hylla', label: '🗄️ Hylla' }]
      }
    };

    const roomDefs = [
      { key: 'koket', label: 'KÖKET', defaultCategories: ['ÖVRIGT', 'MAT', 'KÖTTFÄRS', 'BAKINGREDIENSER'], defaultPlaces: [{ key: 'kyl', label: '🧊 Kyl' }, { key: 'frys', label: '❄️ Frys' }, { key: 'kryddor', label: '🌶️ Kryddor' }, { key: 'skafferi', label: '🥫 Skafferi' }] },
      { key: 'badrummet', label: 'BADRUMMET', defaultCategories: ['ÖVRIGT'], defaultPlaces: [{ key: 'hylla', label: '🧴 Hylla' }] },
      { key: 'hallen', label: 'HALLEN', defaultCategories: ['ÖVRIGT'], defaultPlaces: [{ key: 'hylla', label: '🧺 Hylla' }] },
      { key: 'sovrummet-1', label: 'SOVRUMMET 1', defaultCategories: ['ÖVRIGT'], defaultPlaces: [{ key: 'hylla', label: '🗄️ Hylla' }] }
    ];

    localStorage.setItem('matlista', JSON.stringify(items));
    localStorage.setItem('matlista_snabb', JSON.stringify(quickItems));
    localStorage.setItem('matlista_recept', JSON.stringify([]));
    localStorage.setItem('matlista_categories', JSON.stringify(['ÖVRIGT', 'MAT', 'KÖTTFÄRS', 'BAKINGREDIENSER']));
    localStorage.setItem('matlista_recipe_categories', JSON.stringify(['matlagning', 'bakverk']));
    localStorage.setItem('matlista_places', JSON.stringify([
      { key: 'kyl', label: '🧊 Kyl' },
      { key: 'frys', label: '❄️ Frys' },
      { key: 'kryddor', label: '🌶️ Kryddor' },
      { key: 'skafferi', label: '🥫 Skafferi' }
    ]));
    localStorage.setItem('matlista_room_configs', JSON.stringify(roomConfigs));
    localStorage.setItem('matlista_rooms', JSON.stringify(roomDefs));
    localStorage.setItem('matlista_active_room', 'koket');
    localStorage.setItem('matlista_active_place_filter', '');
    localStorage.setItem('matlista_expiry_sort_mode', 'expiry');
    localStorage.setItem('matlista_demo_seeded', '1');
  }

  function switchToPage(page) {
    if (typeof window.setActiveKitchenPage === 'function') {
      window.setActiveKitchenPage(page);
      return;
    }
    document.querySelectorAll('[data-page]').forEach(function (el) {
      el.classList.toggle('page-visible', el.getAttribute('data-page') === page);
    });
  }

  function showAppDemoMode() {
    const gate = byId('flowGate');
    const shell = byId('mainAppShell');

    try {
      localStorage.setItem('offline_mode', '1');
      window.cloudSyncDisabled = true;
      ensureDemoData();
    } catch (e) {}

    if (gate) {
      gate.dataset.view = 'app';
      gate.style.display = 'none';
    }

    if (shell) {
      shell.classList.remove('app-shell-locked');
    }

    document.body.classList.remove('flow-gate-open');
    document.body.classList.add('offline-mode', 'demo-mode');

    const offlineInfo = byId('offlineInfo');
    if (offlineInfo) offlineInfo.style.display = '';

    const authStatus = byId('authStatus');
    if (authStatus) authStatus.textContent = 'Demo-läge aktivt';

    const googleLoginBtn = byId('googleLoginBtn');
    const googleLogoutBtn = byId('googleLogoutBtn');
    const offlineModeBtn = byId('offlineModeBtn');
    const exitOfflineModeBtn = byId('exitOfflineModeBtn');

    if (googleLoginBtn) googleLoginBtn.style.display = 'none';
    if (googleLogoutBtn) googleLogoutBtn.style.display = 'none';
    if (offlineModeBtn) offlineModeBtn.style.display = 'none';
    if (exitOfflineModeBtn) exitOfflineModeBtn.style.display = '';

    if (typeof window.render === 'function') {
      try { window.render(); } catch (e) { console.error(e); }
    }

    switchToPage('home');
  }

  function addDemoButtons() {
    const loginSection = document.querySelector('[data-flow-view="login"]');
    const choiceSection = document.querySelector('[data-flow-view="choice"]');
    if (!loginSection || byId('demoBypassBtn')) return;

    const wrap = document.createElement('div');
    wrap.className = 'demo-bypass-wrap';
    wrap.innerHTML = [
      '<button type="button" id="demoBypassBtn" class="flow-secondary-btn demo-bypass-btn">⚡ Demo utan Google</button>',
      '<div class="demo-bypass-note">Hoppar förbi Google och öppnar Har hemma direkt med testdata.</div>'
    ].join('');
    loginSection.appendChild(wrap);

    const btn = byId('demoBypassBtn');
    if (btn) btn.addEventListener('click', showAppDemoMode);

    if (choiceSection && !byId('demoBypassBtnChoice')) {
      const wrap2 = document.createElement('div');
      wrap2.className = 'demo-bypass-wrap';
      wrap2.innerHTML = '<button type="button" id="demoBypassBtnChoice" class="flow-secondary-btn demo-bypass-btn">⚡ Demo utan Google</button>';
      choiceSection.appendChild(wrap2);
      byId('demoBypassBtnChoice').addEventListener('click', showAppDemoMode);
    }
  }

  function forceLoginScreenIfStuckLoading() {
    const gate = byId('flowGate');
    if (!gate) return;
    setTimeout(function () {
      if (gate.dataset.view === 'loading') {
        gate.dataset.view = 'login';
        gate.querySelectorAll('[data-flow-view]').forEach(function (section) {
          section.style.display = section.getAttribute('data-flow-view') === 'login' ? '' : 'none';
        });
        document.body.classList.add('flow-gate-open');
      }
    }, 1200);
  }

  function addResetDemoButton() {
    const headerLeft = document.querySelector('.header-left');
    if (!headerLeft || byId('resetDemoDataBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'resetDemoDataBtn';
    btn.className = 'install-btn';
    btn.textContent = '♻️ Demo-data';
    btn.style.display = '';
    btn.addEventListener('click', function () {
      localStorage.removeItem('matlista_demo_seeded');
      ensureDemoData();
      if (typeof window.location.reload === 'function') window.location.reload();
    });
    headerLeft.appendChild(btn);
  }

  function boot() {
    addDemoButtons();
    addResetDemoButton();
    forceLoginScreenIfStuckLoading();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.showAppDemoMode = showAppDemoMode;
})();
