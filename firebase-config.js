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

  function collectState() {
    return {
      items: Array.isArray(window.items) ? window.items : [],
      quickItems: Array.isArray(window.quickItems) ? window.quickItems : [],
      recipes: Array.isArray(window.recipes) ? window.recipes : [],
      categories: Array.isArray(window.categories) ? window.categories : ['MAT'],
      places: Array.isArray(window.places) ? window.places : [],
      homeOpenState: window.homeOpenState || {},
      recipeIngredientChoices: window.recipeIngredientChoices || {},
      householdSize: Number(window.householdSize || 1),
      weekPlanner: window.weekPlanner || {},
      selectedWeekDay: window.selectedWeekDay || 'mon',
      theme: localStorage.getItem('theme') || 'scifi',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtMs: Date.now(),
      appVersion: 'cloud-sync-popup-v1'
    };
  }

  function applyRemoteState(data) {
    remoteApplying = true;
    try {
      if (Array.isArray(data.items)) window.items = data.items;
      if (Array.isArray(data.quickItems)) window.quickItems = data.quickItems;
      if (Array.isArray(data.recipes)) window.recipes = data.recipes;
      if (Array.isArray(data.categories) && data.categories.length) window.categories = data.categories;
      if (Array.isArray(data.places) && data.places.length) window.places = data.places;
      if (data.homeOpenState && typeof data.homeOpenState === 'object') window.homeOpenState = data.homeOpenState;
      if (data.recipeIngredientChoices && typeof data.recipeIngredientChoices === 'object') window.recipeIngredientChoices = data.recipeIngredientChoices;
      if (typeof data.householdSize !== 'undefined') window.householdSize = Math.max(1, Math.min(8, Number(data.householdSize || 1)));
      if (data.weekPlanner && typeof data.weekPlanner === 'object') {
        window.weekPlanner = data.weekPlanner;
        localStorage.setItem('matlista_weekplanner', JSON.stringify(data.weekPlanner));
      }
      if (typeof data.selectedWeekDay === 'string' && data.selectedWeekDay) {
        window.selectedWeekDay = data.selectedWeekDay;
        localStorage.setItem('matlista_weekplanner_selected', data.selectedWeekDay);
      }
      if (typeof data.theme === 'string' && data.theme) {
        localStorage.setItem('theme', data.theme);
        if (safeCall('applyTheme')) {
          window.applyTheme(data.theme);
        }
      }

      if (safeCall('hydrateData')) window.hydrateData();
      if (safeCall('save')) window.save();
      if (safeCall('render')) window.render();
      if (safeCall('refreshWeekPlannerUI')) window.refreshWeekPlannerUI();
    } finally {
      remoteApplying = false;
    }
  }

  function saveToCloudNow() {
    if (!firebaseReady) return Promise.resolve(false);
    const ref = getDocRef();
    if (!ref || remoteApplying) return Promise.resolve(false);
    return ref.set(collectState(), { merge: true }).then(() => true).catch(error => {
      console.error('Cloud save error:', error);
      setAuthUi(firebase.auth().currentUser, 'Molnsynk-fel: ' + (error && error.message ? error.message : 'okänt fel'));
      return false;
    });
  }

  function saveToCloud() {
    if (!firebaseReady || remoteApplying) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveToCloudNow();
    }, 350);
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
          saveToCloudNow().finally(() => {
            pendingInitialUpload = false;
            setAuthUi(firebase.auth().currentUser, 'Inloggad – molnsynk aktiv');
          });
        }
        return;
      }

      const data = snapshot.data() || {};
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
    syncReady = false;
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

  function startAuthListener() {
    if (authReady || !initFirebase()) return;
    authReady = true;

    firebase.auth().onAuthStateChanged(user => {
      wrapSaveFunction();

      if (user) {
        setAuthUi(user, 'Inloggad – ansluter...');
        startCloudSync();
      } else {
        stopCloudSync();
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
