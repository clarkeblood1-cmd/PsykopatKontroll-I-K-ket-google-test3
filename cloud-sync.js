(function () {
  'use strict';

  let firebaseReady = false;
  let authReady = false;
  let syncReady = false;
  let cloudUnsubscribe = null;
  let saveWrapped = false;
  let remoteApplying = false;
  let saveTimer = null;
  let pendingInitialUpload = false;
  let lastSavedFingerprint = '';
  let lastAppliedFingerprint = '';
  let lastRemoteUpdatedAtMs = 0;

  function byId(id) {
    return document.getElementById(id);
  }

  function setAuthUi(user, message) {
    const status = byId('authStatus');
    const loginBtn = byId('googleLoginBtn');
    const logoutBtn = byId('googleLogoutBtn');
    const help = byId('firebaseHelp');

    if (status) {
      if (message) status.textContent = message;
      else status.textContent = user ? `Inloggad: ${user.displayName || user.email || 'Google-konto'}` : 'Inte inloggad';
    }

    if (loginBtn) loginBtn.style.display = user ? 'none' : '';
    if (logoutBtn) logoutBtn.style.display = user ? '' : 'none';
    if (help) help.style.display = firebaseReady ? 'none' : '';
  }

  function safeCall(fnName) {
    return typeof window[fnName] === 'function';
  }

  function initFirebase() {
    try {
      if (!window.firebase || !window.firebaseConfig) {
        setAuthUi(null, 'Firebase ej redo');
        return false;
      }

      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
      }

      firebaseReady = true;
      return true;
    } catch (error) {
      console.error('Firebase init error:', error);
      setAuthUi(null, 'Firebase-fel: ' + (error && error.message ? error.message : 'okänt fel'));
      return false;
    }
  }

  function getDocRef() {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    return firebase.firestore().collection('users').doc(user.uid).collection('appData').doc('main');
  }

  function normalizeStateForFingerprint(input) {
    const state = input && typeof input === 'object' ? input : {};
    return {
      items: Array.isArray(state.items) ? state.items : [],
      quickItems: Array.isArray(state.quickItems) ? state.quickItems : [],
      recipes: Array.isArray(state.recipes) ? state.recipes : [],
      categories: Array.isArray(state.categories) ? state.categories : ['MAT'],
      recipeCategories: Array.isArray(state.recipeCategories) ? state.recipeCategories : ['matlagning', 'bakverk'],
      places: Array.isArray(state.places) ? state.places : [],
      roomConfigs: state.roomConfigs && typeof state.roomConfigs === 'object' ? state.roomConfigs : {},
      roomDefs: Array.isArray(state.roomDefs) ? state.roomDefs : [],
      activeRoom: String(state.activeRoom || 'koket'),
      activePlaceFilter: typeof state.activePlaceFilter === 'string' ? state.activePlaceFilter : '',
      homeOpenState: state.homeOpenState && typeof state.homeOpenState === 'object' ? state.homeOpenState : {},
      recipeIngredientChoices: state.recipeIngredientChoices && typeof state.recipeIngredientChoices === 'object' ? state.recipeIngredientChoices : {},
      householdSize: Number(state.householdSize || 1),
      portionGrams: Math.max(1, Math.min(250, Number(state.portionGrams || 100))),
      weekPlanner: state.weekPlanner && typeof state.weekPlanner === 'object' ? state.weekPlanner : {},
      selectedWeekDay: String(state.selectedWeekDay || 'mon'),
      weekMealOrder: Array.isArray(state.weekMealOrder) ? state.weekMealOrder : [],
      activeKitchenPage: String(state.activeKitchenPage || 'home'),
      theme: String(state.theme || 'scifi')
    };
  }

  function stableSerialize(value) {
    if (Array.isArray(value)) {
      return '[' + value.map(stableSerialize).join(',') + ']';
    }
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableSerialize(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function getStateFingerprint(state) {
    return stableSerialize(normalizeStateForFingerprint(state));
  }

  function getSnapshotUpdatedAtMs(snapshotData) {
    const raw = snapshotData && snapshotData.updatedAtMs;
    const numeric = Number(raw || 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function collectState() {
    const state = {
      items: Array.isArray(window.items) ? window.items : [],
      quickItems: Array.isArray(window.quickItems) ? window.quickItems : [],
      recipes: Array.isArray(window.recipes) ? window.recipes : [],
      categories: Array.isArray(window.categories) ? window.categories : ['MAT'],
      recipeCategories: Array.isArray(window.recipeCategories) ? window.recipeCategories : ['matlagning', 'bakverk'],
      places: Array.isArray(window.places) ? window.places : [],
      roomConfigs: window.roomConfigs && typeof window.roomConfigs === 'object' ? window.roomConfigs : {},
      roomDefs: Array.isArray(window.roomDefs) ? window.roomDefs : [],
      activeRoom: String(window.activeRoom || localStorage.getItem('matlista_active_room') || 'koket'),
      activePlaceFilter: typeof window.activePlaceFilter === 'string' ? window.activePlaceFilter : String(localStorage.getItem('matlista_active_place_filter') || ''),
      homeOpenState: window.homeOpenState || {},
      recipeIngredientChoices: window.recipeIngredientChoices || {},
      householdSize: Number(window.householdSize || 1),
      portionGrams: Math.max(1, Math.min(250, Number(window.portionGrams || localStorage.getItem('matlista_portion_grams') || 100))),
      weekPlanner: window.weekPlanner || {},
      selectedWeekDay: window.selectedWeekDay || 'mon',
      weekMealOrder: Array.isArray(window.weekMealOrder) ? window.weekMealOrder : JSON.parse(localStorage.getItem('matlista_week_meal_order') || '[]'),
      activeKitchenPage: String(window.activeKitchenPage || localStorage.getItem('activeKitchenPage') || 'home'),
      theme: localStorage.getItem('theme') || 'scifi'
    };

    const fingerprint = getStateFingerprint(state);
    return {
      ...state,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtMs: Date.now(),
      appVersion: 'cloud-sync-stable-v4',
      stateFingerprint: fingerprint
    };
  }

  function applyRemoteState(data) {
    const remoteData = data && typeof data === 'object' ? data : {};
    const incomingFingerprint = String(remoteData.stateFingerprint || getStateFingerprint(remoteData));
    const incomingUpdatedAtMs = getSnapshotUpdatedAtMs(remoteData);
    const currentFingerprint = getStateFingerprint(collectState());

    if (incomingFingerprint && incomingFingerprint === currentFingerprint) {
      lastAppliedFingerprint = incomingFingerprint;
      lastSavedFingerprint = incomingFingerprint;
      if (incomingUpdatedAtMs > lastRemoteUpdatedAtMs) lastRemoteUpdatedAtMs = incomingUpdatedAtMs;
      return false;
    }

    remoteApplying = true;
    try {
      if (safeCall('applyCloudState')) {
        window.applyCloudState(remoteData);
      } else {
        if (Array.isArray(remoteData.items)) window.items = remoteData.items;
        if (Array.isArray(remoteData.quickItems)) window.quickItems = remoteData.quickItems;
        if (Array.isArray(remoteData.recipes)) window.recipes = remoteData.recipes;
        if (Array.isArray(remoteData.categories) && remoteData.categories.length) window.categories = remoteData.categories;
        if (Array.isArray(remoteData.recipeCategories) && remoteData.recipeCategories.length) window.recipeCategories = remoteData.recipeCategories;
        if (Array.isArray(remoteData.places) && remoteData.places.length) window.places = remoteData.places;
        if (remoteData.roomConfigs && typeof remoteData.roomConfigs === 'object') window.roomConfigs = remoteData.roomConfigs;
        if (Array.isArray(remoteData.roomDefs) && remoteData.roomDefs.length) window.roomDefs = remoteData.roomDefs;
        if (typeof remoteData.activeRoom === 'string' && remoteData.activeRoom) window.activeRoom = remoteData.activeRoom;
        if (typeof remoteData.activePlaceFilter === 'string') window.activePlaceFilter = remoteData.activePlaceFilter;
        if (remoteData.homeOpenState && typeof remoteData.homeOpenState === 'object') window.homeOpenState = remoteData.homeOpenState;
        if (remoteData.recipeIngredientChoices && typeof remoteData.recipeIngredientChoices === 'object') window.recipeIngredientChoices = remoteData.recipeIngredientChoices;
        if (typeof remoteData.householdSize !== 'undefined') window.householdSize = Math.max(1, Math.min(8, Number(remoteData.householdSize || 1)));
        if (typeof remoteData.portionGrams !== 'undefined') window.portionGrams = Math.max(1, Math.min(250, Number(remoteData.portionGrams || 100)));
        if (remoteData.weekPlanner && typeof remoteData.weekPlanner === 'object') {
          window.weekPlanner = remoteData.weekPlanner;
          localStorage.setItem('matlista_weekplanner', JSON.stringify(remoteData.weekPlanner));
        }
        if (typeof remoteData.selectedWeekDay === 'string' && remoteData.selectedWeekDay) {
          window.selectedWeekDay = remoteData.selectedWeekDay;
          localStorage.setItem('matlista_weekplanner_selected', remoteData.selectedWeekDay);
        }
        if (Array.isArray(remoteData.weekMealOrder)) {
          window.weekMealOrder = remoteData.weekMealOrder;
          localStorage.setItem('matlista_week_meal_order', JSON.stringify(remoteData.weekMealOrder));
        }
        if (typeof remoteData.activeKitchenPage === 'string' && remoteData.activeKitchenPage) {
          localStorage.setItem('activeKitchenPage', remoteData.activeKitchenPage);
          if (safeCall('setActiveKitchenPage')) window.setActiveKitchenPage(remoteData.activeKitchenPage, false);
        }
        if (typeof remoteData.theme === 'string' && remoteData.theme) {
          localStorage.setItem('theme', remoteData.theme);
          if (safeCall('applyTheme')) window.applyTheme(remoteData.theme);
        }

        if (safeCall('hydrateData')) window.hydrateData();
        if (safeCall('save')) window.save();
      }

      if (typeof remoteData.theme === 'string' && remoteData.theme && safeCall('applyTheme')) {
        window.applyTheme(remoteData.theme);
      }
      if (safeCall('render')) window.render();
      if (safeCall('refreshWeekPlannerUI')) window.refreshWeekPlannerUI();

      lastAppliedFingerprint = incomingFingerprint;
      lastSavedFingerprint = incomingFingerprint;
      if (incomingUpdatedAtMs > lastRemoteUpdatedAtMs) lastRemoteUpdatedAtMs = incomingUpdatedAtMs;
      return true;
    } finally {
      remoteApplying = false;
    }
  }

  function saveToCloudNow(force = false) {
    if (!firebaseReady) return Promise.resolve(false);
    const ref = getDocRef();
    if (!ref || remoteApplying) return Promise.resolve(false);

    const payload = collectState();
    const fingerprint = String(payload.stateFingerprint || '');

    if (!force && fingerprint && fingerprint === lastSavedFingerprint) {
      return Promise.resolve(false);
    }

    lastSavedFingerprint = fingerprint;
    return ref.set(payload, { merge: true }).then(() => {
      lastRemoteUpdatedAtMs = Math.max(lastRemoteUpdatedAtMs, Number(payload.updatedAtMs || 0));
      return true;
    }).catch(error => {
      if (fingerprint === lastSavedFingerprint) lastSavedFingerprint = '';
      console.error('Cloud save error:', error);
      setAuthUi(firebase.auth().currentUser, 'Molnsynk-fel: ' + (error && error.message ? error.message : 'okänt fel'));
      return false;
    });
  }

  function saveToCloud() {
    if (!firebaseReady || remoteApplying) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveToCloudNow(false);
    }, 700);
  }

  function wrapSaveFunction() {
    if (saveWrapped || !safeCall('save')) return;
    const originalSave = window.save;
    window.save = function wrappedSave() {
      const result = originalSave.apply(this, arguments);
      saveToCloud();
      return result;
    };
    saveWrapped = true;
  }

  function startCloudSync() {
    if (!firebaseReady || !safeCall('render')) return;
    const ref = getDocRef();
    if (!ref) return;

    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }

    syncReady = true;
    setAuthUi(firebase.auth().currentUser, 'Inloggad – startar molnsynk...');

    cloudUnsubscribe = ref.onSnapshot(snapshot => {
      if (!snapshot.exists) {
        if (!pendingInitialUpload) {
          pendingInitialUpload = true;
          saveToCloudNow(true).finally(() => {
            pendingInitialUpload = false;
            setAuthUi(firebase.auth().currentUser, 'Inloggad – molnsynk aktiv');
          });
        }
        return;
      }

      const data = snapshot.data() || {};
      const incomingUpdatedAtMs = getSnapshotUpdatedAtMs(data);
      const incomingFingerprint = String(data.stateFingerprint || getStateFingerprint(data));

      if (snapshot.metadata && snapshot.metadata.hasPendingWrites) {
        lastSavedFingerprint = incomingFingerprint || lastSavedFingerprint;
        if (incomingUpdatedAtMs > lastRemoteUpdatedAtMs) lastRemoteUpdatedAtMs = incomingUpdatedAtMs;
        return;
      }

      if (incomingFingerprint && incomingFingerprint === lastAppliedFingerprint) {
        if (incomingUpdatedAtMs > lastRemoteUpdatedAtMs) lastRemoteUpdatedAtMs = incomingUpdatedAtMs;
        setAuthUi(firebase.auth().currentUser, 'Inloggad – molnsynk aktiv');
        return;
      }

      applyRemoteState(data);
      setAuthUi(firebase.auth().currentUser, 'Inloggad – molnsynk aktiv');
    }, error => {
      console.error('Cloud sync snapshot error:', error);
      setAuthUi(firebase.auth().currentUser, 'Molnsynk-fel: ' + (error && error.message ? error.message : 'okänt fel'));
    });
  }

  function stopCloudSync() {
    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }
    clearTimeout(saveTimer);
    syncReady = false;
    pendingInitialUpload = false;
    lastAppliedFingerprint = '';
    lastSavedFingerprint = '';
    lastRemoteUpdatedAtMs = 0;
  }

  window.loginWithGoogle = function loginWithGoogle() {
    if (!initFirebase()) {
      alert('Firebase är inte korrekt laddat ännu. Kontrollera firebase-config.js.');
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    firebase.auth().signInWithPopup(provider).catch(error => {
      console.error('Google login error:', error);
      const msg = error && error.message ? error.message : 'okänt fel';
      setAuthUi(null, 'Login misslyckades');
      alert('Google-login misslyckades: ' + msg);
    });
  };

  window.logoutGoogle = function logoutGoogle() {
    if (!firebaseReady) return;
    firebase.auth().signOut().catch(error => {
      console.error('Logout error:', error);
      alert('Logout misslyckades: ' + (error && error.message ? error.message : 'okänt fel'));
    });
  };

  window.saveToCloud = saveToCloud;
  window.saveToCloudNow = saveToCloudNow;
  window.setCloudStatusMessage = function setCloudStatusMessage(message) {
    try {
      const user = firebaseReady && firebase?.auth ? firebase.auth().currentUser : null;
      setAuthUi(user || null, message || (user ? 'Inloggad – molnsynk aktiv' : 'Inte inloggad'));
    } catch (error) {
      console.error('Cloud status UI error:', error);
    }
  };

  function startAuthListener() {
    if (authReady || !initFirebase()) return;
    authReady = true;

    firebase.auth().onAuthStateChanged(user => {
      wrapSaveFunction();

      if (user) {
        setAuthUi(user, 'Inloggad – ansluter...');
        try { window.dispatchEvent(new CustomEvent('cloud-auth-changed', { detail: { loggedIn: true, uid: user.uid || '' } })); } catch (e) {}
        startCloudSync();
      } else {
        stopCloudSync();
        try { window.dispatchEvent(new CustomEvent('cloud-auth-changed', { detail: { loggedIn: false, uid: '' } })); } catch (e) {}
        setAuthUi(null, 'Inte inloggad');
      }
    });
  }

  window.addEventListener('load', () => {
    initFirebase();
    wrapSaveFunction();
    startAuthListener();
    setTimeout(wrapSaveFunction, 0);
  });
})();
