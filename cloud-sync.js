
(function () {
  'use strict';

  let firebaseReady = false;
  let cloudUnsubscribe = null;
  let saveWrapped = false;
  let remoteApplying = false;
  let saveTimer = null;
  let pendingInitialUpload = false;
  let currentHouseholdId = '';
  let currentUserProfile = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function safeCall(fnName) {
    return typeof window[fnName] === 'function';
  }

  function statusMessage(text) {
    const status = byId('authStatus');
    if (status) status.textContent = text || '';
  }

  function setAuthUi(user, message) {
    const loginBtn = byId('googleLoginBtn');
    const logoutBtn = byId('googleLogoutBtn');
    const help = byId('firebaseHelp');

    if (message) statusMessage(message);
    else if (user) {
      const name = user.displayName || user.email || 'Google-konto';
      statusMessage(currentHouseholdId ? `Inloggad: ${name} • Hushåll ${currentHouseholdId.slice(0, 6)}` : `Inloggad: ${name}`);
    } else {
      statusMessage('Inte inloggad');
    }

    if (loginBtn) loginBtn.style.display = user ? 'none' : '';
    if (logoutBtn) logoutBtn.style.display = user ? '' : 'none';
    if (help) help.style.display = firebaseReady ? 'none' : '';
  }

  function fixEncoding(text) {
    return String(text || '')
      .replace(/â/g, '–')
      .replace(/Ã¥/g, 'å')
      .replace(/Ã¤/g, 'ä')
      .replace(/Ã¶/g, 'ö');
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

  function getDb() {
    return firebase.firestore();
  }

  function getHouseholdStateRef(householdId = currentHouseholdId) {
    if (!householdId) return null;
    return getDb().collection('households').doc(householdId).collection('state').doc('main');
  }

  function collectState() {
    return {
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
      theme: localStorage.getItem('theme') || 'scifi',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtMs: Date.now(),
      appVersion: 'household-auto-v1'
    };
  }

  function applyRemoteState(data) {
    remoteApplying = true;
    try {
      if (safeCall('applyCloudState')) {
        window.applyCloudState(data || {});
      } else {
        if (Array.isArray(data.items)) window.items = data.items;
        if (Array.isArray(data.quickItems)) window.quickItems = data.quickItems;
        if (Array.isArray(data.recipes)) window.recipes = data.recipes;
        if (Array.isArray(data.categories) && data.categories.length) window.categories = data.categories;
        if (Array.isArray(data.recipeCategories) && data.recipeCategories.length) window.recipeCategories = data.recipeCategories;
        if (Array.isArray(data.places) && data.places.length) window.places = data.places;
        if (data.roomConfigs && typeof data.roomConfigs === 'object') window.roomConfigs = data.roomConfigs;
        if (Array.isArray(data.roomDefs) && data.roomDefs.length) window.roomDefs = data.roomDefs;
        if (typeof data.activeRoom === 'string' && data.activeRoom) window.activeRoom = data.activeRoom;
        if (typeof data.activePlaceFilter === 'string') window.activePlaceFilter = data.activePlaceFilter;
        if (data.homeOpenState && typeof data.homeOpenState === 'object') window.homeOpenState = data.homeOpenState;
        if (data.recipeIngredientChoices && typeof data.recipeIngredientChoices === 'object') window.recipeIngredientChoices = data.recipeIngredientChoices;
        if (typeof data.householdSize !== 'undefined') window.householdSize = Math.max(1, Math.min(8, Number(data.householdSize || 1)));
        if (typeof data.portionGrams !== 'undefined') window.portionGrams = Math.max(1, Math.min(250, Number(data.portionGrams || 100)));
        if (data.weekPlanner && typeof data.weekPlanner === 'object') {
          window.weekPlanner = data.weekPlanner;
          localStorage.setItem('matlista_weekplanner', JSON.stringify(data.weekPlanner));
        }
        if (typeof data.selectedWeekDay === 'string' && data.selectedWeekDay) {
          window.selectedWeekDay = data.selectedWeekDay;
          localStorage.setItem('matlista_weekplanner_selected', data.selectedWeekDay);
        }
        if (Array.isArray(data.weekMealOrder)) {
          window.weekMealOrder = data.weekMealOrder;
          localStorage.setItem('matlista_week_meal_order', JSON.stringify(data.weekMealOrder));
        }
        if (typeof data.activeKitchenPage === 'string' && data.activeKitchenPage) {
          localStorage.setItem('activeKitchenPage', data.activeKitchenPage);
          if (safeCall('setActiveKitchenPage')) window.setActiveKitchenPage(data.activeKitchenPage, false);
        }
        if (typeof data.theme === 'string' && data.theme) {
          localStorage.setItem('theme', data.theme);
          if (safeCall('applyTheme')) window.applyTheme(data.theme);
        }
        if (safeCall('hydrateData')) window.hydrateData();
        if (safeCall('save')) window.save();
      }

      if (typeof data.theme === 'string' && data.theme && safeCall('applyTheme')) {
        window.applyTheme(data.theme);
      }
      if (safeCall('render')) window.render();
      if (safeCall('refreshWeekPlannerUI')) window.refreshWeekPlannerUI();
    } finally {
      remoteApplying = false;
    }
  }

  async function ensureMemberDoc(householdId, user, role) {
    const db = getDb();
    await db.collection('households').doc(householdId).collection('members').doc(user.uid).set({
      uid: user.uid,
      role: role || 'member',
      displayName: user.displayName || '',
      email: user.email || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await db.collection('households').doc(householdId).set({
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      memberUids: firebase.firestore.FieldValue.arrayUnion(user.uid)
    }, { merge: true });
  }

  async function resolveInviteToken(token) {
    if (!token) return '';
    const db = getDb();
    const raw = String(token || '').trim();
    if (!raw) return '';

    const directDoc = await db.collection('households').doc(raw).get().catch(() => null);
    if (directDoc && directDoc.exists) return directDoc.id;

    const upper = raw.toUpperCase();
    const inviteDoc = await db.collection('inviteCodes').doc(upper).get().catch(() => null);
    if (inviteDoc && inviteDoc.exists) {
      const data = inviteDoc.data() || {};
      if (data.householdId) return String(data.householdId);
    }
    return '';
  }

  function getJoinToken() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('join') || localStorage.getItem('matlista_pending_join') || '';
    } catch (e) {
      return localStorage.getItem('matlista_pending_join') || '';
    }
  }

  function clearJoinToken() {
    localStorage.removeItem('matlista_pending_join');
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('join')) {
        url.searchParams.delete('join');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (e) {}
  }

  async function createOwnHousehold(user) {
    const db = getDb();
    const householdRef = db.collection('households').doc();
    const batch = db.batch();
    batch.set(householdRef, {
      ownerUid: user.uid,
      name: (user.displayName ? `${user.displayName.split(' ')[0]}s hushåll` : 'Mitt hushåll'),
      memberUids: [user.uid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(householdRef.collection('members').doc(user.uid), {
      uid: user.uid,
      role: 'owner',
      displayName: user.displayName || '',
      email: user.email || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(db.collection('users').doc(user.uid), {
      uid: user.uid,
      activeHouseholdId: householdRef.id,
      displayName: user.displayName || '',
      email: user.email || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await batch.commit();
    return householdRef.id;
  }

  async function joinExistingHousehold(user, householdId) {
    const db = getDb();
    const batch = db.batch();
    batch.set(db.collection('households').doc(householdId).collection('members').doc(user.uid), {
      uid: user.uid,
      role: 'member',
      displayName: user.displayName || '',
      email: user.email || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(db.collection('households').doc(householdId), {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      memberUids: firebase.firestore.FieldValue.arrayUnion(user.uid)
    }, { merge: true });
    batch.set(db.collection('users').doc(user.uid), {
      uid: user.uid,
      activeHouseholdId: householdId,
      displayName: user.displayName || '',
      email: user.email || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await batch.commit();
    clearJoinToken();
    return householdId;
  }

  async function ensureHouseholdForUser(user) {
    const db = getDb();
    const userRef = db.collection('users').doc(user.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const inviteTarget = await resolveInviteToken(getJoinToken());

    if (inviteTarget) {
      const current = String(userData.activeHouseholdId || '');
      if (current !== inviteTarget) {
        currentHouseholdId = await joinExistingHousehold(user, inviteTarget);
      } else {
        currentHouseholdId = current;
        await ensureMemberDoc(currentHouseholdId, user, currentHouseholdId && currentHouseholdId === userData.activeHouseholdId ? undefined : 'member');
      }
    } else if (userData.activeHouseholdId) {
      currentHouseholdId = String(userData.activeHouseholdId);
      await ensureMemberDoc(currentHouseholdId, user, undefined);
    } else {
      currentHouseholdId = await createOwnHousehold(user);
    }

    currentUserProfile = userData;
    localStorage.setItem('matlista_active_household_id', currentHouseholdId);
    return currentHouseholdId;
  }

  function saveToCloudNow() {
    if (!firebaseReady || !currentHouseholdId) return Promise.resolve(false);
    const ref = getHouseholdStateRef();
    if (!ref || remoteApplying) return Promise.resolve(false);
    return ref.set(collectState(), { merge: true }).then(() => true).catch(error => {
      console.error('Cloud save error:', error);
      setAuthUi(firebase.auth().currentUser, 'Molnsynk-fel: ' + fixEncoding(error && error.message ? error.message : 'okänt fel'));
      return false;
    });
  }

  function saveToCloud() {
    if (!firebaseReady || remoteApplying || !currentHouseholdId) return;
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

  function stopCloudSync() {
    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }
    currentHouseholdId = '';
  }

  function startCloudSync() {
    if (!firebaseReady || !currentHouseholdId || !safeCall('render')) return;
    const ref = getHouseholdStateRef();
    if (!ref) return;

    if (cloudUnsubscribe) cloudUnsubscribe();

    setAuthUi(firebase.auth().currentUser, `Inloggad – hushåll ${currentHouseholdId.slice(0, 6)} aktivt`);

    cloudUnsubscribe = ref.onSnapshot(snapshot => {
      if (!snapshot.exists) {
        if (!pendingInitialUpload) {
          pendingInitialUpload = true;
          saveToCloudNow().finally(() => {
            pendingInitialUpload = false;
            setAuthUi(firebase.auth().currentUser, `Inloggad – hushåll ${currentHouseholdId.slice(0, 6)} aktivt`);
          });
        }
        return;
      }

      const data = snapshot.data() || {};
      applyRemoteState(data);
      setAuthUi(firebase.auth().currentUser, `Inloggad – hushåll ${currentHouseholdId.slice(0, 6)} aktivt`);
    }, error => {
      console.error('Cloud sync snapshot error:', error);
      setAuthUi(firebase.auth().currentUser, 'Molnsynk-fel: ' + fixEncoding(error && error.message ? error.message : 'okänt fel'));
    });
  }

  async function uploadDataUrlImage(dataUrl, originalName) {
    if (!firebaseReady || !currentHouseholdId || !firebase.storage) {
      throw new Error('Storage ej redo');
    }
    const storage = firebase.storage();
    const blob = await (await fetch(dataUrl)).blob();
    const cleanName = String(originalName || 'bild').replace(/[^\w.\-]+/g, '-').slice(0, 80) || 'bild';
    const ext = (blob.type && blob.type.includes('png')) ? 'png' : 'jpg';
    const fileName = `${Date.now()}-${cleanName.replace(/\.[a-z0-9]+$/i, '')}.${ext}`;
    const ref = storage.ref().child(`households/${currentHouseholdId}/images/${fileName}`);
    const snapshot = await ref.put(blob, {
      contentType: blob.type || (ext === 'png' ? 'image/png' : 'image/jpeg'),
      cacheControl: 'public,max-age=31536000'
    });
    return await snapshot.ref.getDownloadURL();
  }

  window.cloudHousehold = {
    getHouseholdId: function () { return currentHouseholdId; },
    isReady: function () { return !!currentHouseholdId; },
    uploadDataUrlImage,
    saveNow: saveToCloudNow
  };

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
      alert('Google-login misslyckades: ' + fixEncoding(msg));
    });
  };

  window.logoutGoogle = function logoutGoogle() {
    if (!initFirebase()) return;
    firebase.auth().signOut().catch(error => {
      console.error('Logout error:', error);
      alert('Kunde inte logga ut: ' + (error && error.message ? fixEncoding(error.message) : 'okänt fel'));
    });
  };

  async function boot() {
    if (!initFirebase()) return;
    wrapSaveFunction();

    firebase.auth().onAuthStateChanged(async user => {
      stopCloudSync();

      if (!user) {
        setAuthUi(null, 'Inte inloggad');
        return;
      }

      try {
        setAuthUi(user, 'Inloggad – skapar hushåll...');
        await ensureHouseholdForUser(user);
        startCloudSync();
      } catch (error) {
        console.error('Auth sync error:', error);
        setAuthUi(user, 'Molnsynk-fel: ' + fixEncoding(error && error.message ? error.message : 'okänt fel'));
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
