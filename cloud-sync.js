(function () {
  const STORAGE_SCOPE = 'psykopatkontroll';
  const APP_KEYS = [
    'matlista',
    'matlista_snabb',
    'matlista_recept',
    'matlista_categories',
    'matlista_places',
    'homeOpenState',
    'matlista_recipe_choices',
    'matlista_household_size',
    'matlista_weekplanner',
    'matlista_weekplanner_selected'
  ];

  const rawGetItem = Storage.prototype.getItem;
  const rawSetItem = Storage.prototype.setItem;
  const rawRemoveItem = Storage.prototype.removeItem;

  let activeStoragePrefix = 'guest';
  let authReady = false;
  let currentUser = null;
  let cloudDb = null;
  let cloudSaveTimer = null;
  let suppressCloudSave = false;
  let ignoreNextSnapshot = false;
  let unsubscribeSnapshot = null;
  let lastAppliedCloudJson = '';
  let reloadingForAuth = false;

  const cachedUid = sessionStorage.getItem('psk_last_uid');
  if (cachedUid) activeStoragePrefix = `user:${cachedUid}`;

  function isScopedKey(key) {
    return APP_KEYS.includes(String(key || ''));
  }

  function scopedKey(key, prefix = activeStoragePrefix) {
    return `${STORAGE_SCOPE}:${prefix}:${key}`;
  }

  function getScopedRaw(key, prefix = activeStoragePrefix) {
    return rawGetItem.call(localStorage, scopedKey(key, prefix));
  }

  function setScopedRaw(key, value, prefix = activeStoragePrefix) {
    if (value === null || value === undefined) {
      rawRemoveItem.call(localStorage, scopedKey(key, prefix));
      return;
    }
    rawSetItem.call(localStorage, scopedKey(key, prefix), String(value));
  }

  function removeScopedRaw(key, prefix = activeStoragePrefix) {
    rawRemoveItem.call(localStorage, scopedKey(key, prefix));
  }

  Storage.prototype.getItem = function (key) {
    if (this === localStorage && isScopedKey(key)) {
      return getScopedRaw(key);
    }
    return rawGetItem.call(this, key);
  };

  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage && isScopedKey(key)) {
      setScopedRaw(key, value);
      if (!suppressCloudSave) scheduleCloudSave();
      return;
    }
    return rawSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function (key) {
    if (this === localStorage && isScopedKey(key)) {
      removeScopedRaw(key);
      if (!suppressCloudSave) scheduleCloudSave();
      return;
    }
    return rawRemoveItem.call(this, key);
  };

  function stableDataObject() {
    const data = {};
    APP_KEYS.forEach(key => {
      const raw = getScopedRaw(key);
      if (raw !== null) data[key] = raw;
    });
    return data;
  }

  function stableDataJson() {
    return JSON.stringify(stableDataObject());
  }

  function updateAuthUI() {
    const loginBtn = document.getElementById('googleLoginBtn');
    const logoutBtn = document.getElementById('googleLogoutBtn');
    const status = document.getElementById('authStatus');
    const help = document.getElementById('firebaseHelp');

    if (status) {
      status.textContent = currentUser
        ? `Inloggad som ${currentUser.displayName || currentUser.email || 'konto'}`
        : 'Inte inloggad';
    }

    if (loginBtn) loginBtn.style.display = currentUser ? 'none' : '';
    if (logoutBtn) logoutBtn.style.display = currentUser ? '' : 'none';

    const hasFirebase = typeof window.firebase !== 'undefined';
    const hasConfig = !!(window.firebaseConfig && window.firebaseConfig.apiKey);
    if (help) help.style.display = hasFirebase && hasConfig ? 'none' : '';
  }

  function safeReload() {
  if (reloadingForAuth) return;
  reloadingForAuth = false;
  window.location.reload();
}

  async function fetchCloudData(uid) {
    if (!cloudDb) return null;
    const ref = cloudDb.collection('users').doc(uid).collection('appData').doc('main');
    const snap = await ref.get();
    if (!snap.exists) return null;
    return snap.data() || null;
  }

  function applyCloudDataObject(data, uid) {
    suppressCloudSave = true;
    try {
      APP_KEYS.forEach(key => removeScopedRaw(key, `user:${uid}`));
      if (data && typeof data === 'object' && data.values && typeof data.values === 'object') {
        APP_KEYS.forEach(key => {
          if (Object.prototype.hasOwnProperty.call(data.values, key) && data.values[key] !== null && data.values[key] !== undefined) {
            setScopedRaw(key, data.values[key], `user:${uid}`);
          }
        });
        lastAppliedCloudJson = JSON.stringify(data.values);
      } else {
        lastAppliedCloudJson = '';
      }
    } finally {
      suppressCloudSave = false;
    }
  }

  async function saveCloudNow() {
    if (!authReady || !currentUser || !cloudDb) return;
    const values = stableDataObject();
    const asJson = JSON.stringify(values);
    lastAppliedCloudJson = asJson;
    ignoreNextSnapshot = true;
    await cloudDb.collection('users').doc(currentUser.uid).collection('appData').doc('main').set({
      values,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    setTimeout(() => { ignoreNextSnapshot = false; }, 1200);
  }

  function scheduleCloudSave() {
    if (!authReady || !currentUser || !cloudDb) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
      saveCloudNow().catch(error => {
        console.error('Cloud sync save failed:', error);
      });
    }, 500);
  }

  function startSnapshot(uid) {
    if (!cloudDb) return;
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const ref = cloudDb.collection('users').doc(uid).collection('appData').doc('main');
    unsubscribeSnapshot = ref.onSnapshot(snapshot => {
      if (!snapshot.exists) return;
      const data = snapshot.data() || {};
      const json = JSON.stringify((data && data.values) || {});
      if (ignoreNextSnapshot || json === lastAppliedCloudJson) return;
      applyCloudDataObject(data, uid);
      safeReload();
    }, error => {
      console.error('Cloud sync snapshot failed:', error);
    });
  }

  window.loginWithGoogle = async function loginWithGoogle() {
    if (typeof window.firebase === 'undefined' || !window.firebaseConfig) {
      alert('Firebase är inte konfigurerat än. Lägg till firebase-config.js först.');
      return;
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await firebase.auth().signInWithPopup(provider);
    } catch (error) {
      console.error(error);
      alert('Google-login misslyckades: ' + (error?.message || 'okänt fel'));
    }
  };

  window.logoutGoogle = async function logoutGoogle() {
    if (typeof window.firebase === 'undefined' || !firebase.auth) return;
    try {
      await firebase.auth().signOut();
    } catch (error) {
      console.error(error);
      alert('Kunde inte logga ut: ' + (error?.message || 'okänt fel'));
    }
  };

  async function handleAuthState(user) {
    authReady = true;
    currentUser = user || null;
    updateAuthUI();

    const currentUid = currentUser?.uid || '';
    const cached = sessionStorage.getItem('psk_last_uid') || '';

    if (currentUser && typeof firebase !== 'undefined' && firebase.firestore) {
      cloudDb = firebase.firestore();
    }

    if (currentUid !== cached) {
      if (currentUid) {
        try {
          const data = await fetchCloudData(currentUid);
          applyCloudDataObject(data, currentUid);
        } catch (error) {
          console.error('Cloud sync initial load failed:', error);
        }
        sessionStorage.setItem('psk_last_uid', currentUid);
      } else {
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
        sessionStorage.removeItem('psk_last_uid');
      }
      safeReload();
      return;
    }

    if (currentUid) {
      startSnapshot(currentUid);
    } else if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    updateAuthUI();

    const hasFirebase = typeof window.firebase !== 'undefined';
    const hasConfig = !!(window.firebaseConfig && window.firebaseConfig.apiKey);

    if (!hasFirebase || !hasConfig) {
      authReady = true;
      updateAuthUI();
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
      }
      if (firebase.firestore) {
        cloudDb = firebase.firestore();
      }
    } catch (error) {
      console.error('Firebase init failed:', error);
    }

          alert('Google-login misslyckades: ' + (error?.message || 'okänt fel'));
    });

    firebase.auth().onAuthStateChanged(user => {
      handleAuthState(user).catch(err => {
        console.error('Auth state error:', err);
      });
    });
  });

  window.addEventListener('beforeunload', () => {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
  });
})();
