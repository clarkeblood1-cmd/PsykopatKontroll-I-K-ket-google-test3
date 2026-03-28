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
  let currentHouseholdId = '';
  let currentHouseholdData = null;
  let currentRole = 'member';
  let householdUiReady = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function safeCall(fnName) {
    return typeof window[fnName] === 'function';
  }

  function randomCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function normalizeCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  }

  function getJoinCodeFromUrl() {
    try {
      const url = new URL(window.location.href);
      return normalizeCode(url.searchParams.get('household') || url.searchParams.get('invite') || '');
    } catch (error) {
      return '';
    }
  }

  function clearJoinCodeFromUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('household');
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
    } catch (error) {}
  }

  function householdLink(code) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('household', code);
      return url.toString();
    } catch (error) {
      return String(window.location.href || '').split('?')[0] + '?household=' + encodeURIComponent(code);
    }
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

  function ensureHouseholdUi() {
    if (householdUiReady) return;
    const authPanel = document.querySelector('.auth-panel');
    if (!authPanel || !authPanel.parentNode) return;

    const wrap = document.createElement('section');
    wrap.className = 'auth-panel household-panel';
    wrap.innerHTML = `
      <div class="auth-panel-left">
        <div class="auth-title">👨‍👩‍👧 Hushåll</div>
        <div id="householdStatus" class="auth-status">Inte ansluten</div>
        <div id="householdMeta" class="auth-help">Skapa eget hushåll eller gå med via kod/länk.</div>
      </div>
      <div class="auth-actions">
        <button type="button" id="createHouseholdBtn">Skapa hushåll</button>
        <button type="button" id="joinHouseholdBtn" class="ghost-btn">Gå med via kod</button>
        <button type="button" id="copyHouseholdCodeBtn" class="ghost-btn" style="display:none;">Kopiera kod</button>
        <button type="button" id="copyHouseholdLinkBtn" class="ghost-btn" style="display:none;">Kopiera länk</button>
      </div>
    `;
    authPanel.insertAdjacentElement('afterend', wrap);
    byId('createHouseholdBtn')?.addEventListener('click', () => window.createOwnHousehold && window.createOwnHousehold());
    byId('joinHouseholdBtn')?.addEventListener('click', () => window.joinHouseholdPrompt && window.joinHouseholdPrompt());
    byId('copyHouseholdCodeBtn')?.addEventListener('click', () => window.copyHouseholdCode && window.copyHouseholdCode());
    byId('copyHouseholdLinkBtn')?.addEventListener('click', () => window.copyHouseholdLink && window.copyHouseholdLink());
    householdUiReady = true;
  }

  function updateHouseholdUi() {
    ensureHouseholdUi();
    const status = byId('householdStatus');
    const meta = byId('householdMeta');
    const copyCodeBtn = byId('copyHouseholdCodeBtn');
    const copyLinkBtn = byId('copyHouseholdLinkBtn');

    if (!firebaseReady || !firebase.auth().currentUser) {
      if (status) status.textContent = 'Inte ansluten';
      if (meta) meta.textContent = 'Logga in för att skapa eller gå med i ett hushåll.';
      if (copyCodeBtn) copyCodeBtn.style.display = 'none';
      if (copyLinkBtn) copyLinkBtn.style.display = 'none';
      return;
    }

    if (!currentHouseholdId) {
      if (status) status.textContent = 'Inget hushåll valt';
      if (meta) meta.textContent = 'Skapa eget hushåll eller gå med via kod/länk.';
      if (copyCodeBtn) copyCodeBtn.style.display = 'none';
      if (copyLinkBtn) copyLinkBtn.style.display = 'none';
      return;
    }

    const memberCount = Array.isArray(currentHouseholdData?.memberUids) ? currentHouseholdData.memberUids.length : null;
    const roleLabel = currentRole === 'owner' ? 'ägare' : 'medlem';
    if (status) status.textContent = `Hushåll aktivt • kod ${currentHouseholdId}`;
    if (meta) meta.textContent = `${roleLabel}${memberCount ? ` • ${memberCount} medlem${memberCount === 1 ? '' : 'mar'}` : ''} • länk: ${householdLink(currentHouseholdId)}`;
    if (copyCodeBtn) copyCodeBtn.style.display = '';
    if (copyLinkBtn) copyLinkBtn.style.display = '';
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
      ensureHouseholdUi();
      updateHouseholdUi();
      return true;
    } catch (error) {
      console.error('Firebase init error:', error);
      setAuthUi(null, 'Firebase-fel: ' + (error && error.message ? error.message : 'okänt fel'));
      return false;
    }
  }

  function userRef(uid) {
    return firebase.firestore().collection('users').doc(uid);
  }

  function householdRef(householdId) {
    return firebase.firestore().collection('households').doc(householdId);
  }

  function memberRef(householdId, uid) {
    return householdRef(householdId).collection('members').doc(uid);
  }

  function stateRef(householdId) {
    return householdRef(householdId).collection('state').doc('main');
  }

  function legacyDocRef(uid) {
    return firebase.firestore().collection('users').doc(uid).collection('appData').doc('main');
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
      appVersion: 'household-sync-v1'
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
      if (typeof data.theme === 'string' && data.theme && safeCall('applyTheme')) window.applyTheme(data.theme);
      if (safeCall('render')) window.render();
      if (safeCall('refreshWeekPlannerUI')) window.refreshWeekPlannerUI();
    } finally {
      remoteApplying = false;
    }
  }

  async function copyText(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
      alert(okMessage);
    } catch (error) {
      window.prompt('Kopiera manuellt:', text);
    }
  }

  async function createHouseholdForUser(user, seedState) {
    const db = firebase.firestore();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const householdId = randomCode(6);
      const rootRef = householdRef(householdId);
      const snap = await rootRef.get();
      if (snap.exists) continue;
      await rootRef.set({
        ownerUid: user.uid,
        code: householdId,
        memberUids: [user.uid],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdByName: user.displayName || user.email || 'Google-konto'
      });
      await memberRef(householdId, user.uid).set({
        uid: user.uid,
        role: 'owner',
        displayName: user.displayName || '',
        email: user.email || '',
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await userRef(user.uid).set({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        activeHouseholdId: householdId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      if (seedState) {
        await stateRef(householdId).set(seedState, { merge: true });
      }
      return householdId;
    }
    throw new Error('Kunde inte skapa hushållskod. Försök igen.');
  }

  async function getLegacySeedState(uid) {
    try {
      const snap = await legacyDocRef(uid).get();
      if (snap.exists) return snap.data() || null;
    } catch (error) {
      console.warn('Legacy state read failed:', error);
    }
    return null;
  }

  async function ensureMembership(householdId, user, role = 'member') {
    const memberSnap = await memberRef(householdId, user.uid).get();
    if (!memberSnap.exists) {
      await memberRef(householdId, user.uid).set({
        uid: user.uid,
        role,
        displayName: user.displayName || '',
        email: user.email || '',
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await householdRef(householdId).set({
      memberUids: firebase.firestore.FieldValue.arrayUnion(user.uid),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await userRef(user.uid).set({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      activeHouseholdId: householdId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async function ensureUserAndHousehold(user) {
    await userRef(user.uid).set({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const requestedJoinCode = getJoinCodeFromUrl();
    const userSnap = await userRef(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    let householdId = normalizeCode(userData.activeHouseholdId || '');

    if (requestedJoinCode) {
      const joinSnap = await householdRef(requestedJoinCode).get();
      if (joinSnap.exists && householdId !== requestedJoinCode) {
        await ensureMembership(requestedJoinCode, user, 'member');
        householdId = requestedJoinCode;
      }
      clearJoinCodeFromUrl();
    }

    if (!householdId) {
      const seedState = await getLegacySeedState(user.uid) || collectState();
      householdId = await createHouseholdForUser(user, seedState);
    } else {
      const rootSnap = await householdRef(householdId).get();
      if (!rootSnap.exists) {
        const seedState = await getLegacySeedState(user.uid) || collectState();
        householdId = await createHouseholdForUser(user, seedState);
      } else {
        const role = rootSnap.data()?.ownerUid === user.uid ? 'owner' : 'member';
        await ensureMembership(householdId, user, role);
        const stateSnap = await stateRef(householdId).get();
        if (!stateSnap.exists) {
          const seedState = await getLegacySeedState(user.uid) || collectState();
          await stateRef(householdId).set(seedState, { merge: true });
        }
      }
    }

    currentHouseholdId = householdId;
    const householdSnap = await householdRef(householdId).get();
    currentHouseholdData = householdSnap.exists ? (householdSnap.data() || {}) : null;
    currentRole = currentHouseholdData?.ownerUid === user.uid ? 'owner' : 'member';
    updateHouseholdUi();
    return householdId;
  }

  function getStateDocRef() {
    if (!currentHouseholdId) return null;
    return stateRef(currentHouseholdId);
  }

  function saveToCloudNow() {
    if (!firebaseReady) return Promise.resolve(false);
    const ref = getStateDocRef();
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

  async function startCloudSync() {
    if (!firebaseReady || !safeCall('render')) return;
    const user = firebase.auth().currentUser;
    if (!user) return;
    const householdId = await ensureUserAndHousehold(user);
    const ref = stateRef(householdId);

    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }

    syncReady = true;
    setAuthUi(user, 'Inloggad – ansluter hushåll...');
    updateHouseholdUi();

    cloudUnsubscribe = ref.onSnapshot(async snapshot => {
      if (!snapshot.exists) {
        if (!pendingInitialUpload) {
          pendingInitialUpload = true;
          await saveToCloudNow();
          pendingInitialUpload = false;
          setAuthUi(firebase.auth().currentUser, 'Hushåll aktivt – molnsynk aktiv');
        }
        return;
      }

      const data = snapshot.data() || {};
      applyRemoteState(data);
      const householdSnap = await householdRef(householdId).get().catch(() => null);
      currentHouseholdData = householdSnap?.exists ? (householdSnap.data() || {}) : currentHouseholdData;
      currentRole = currentHouseholdData?.ownerUid === user.uid ? 'owner' : 'member';
      updateHouseholdUi();
      setAuthUi(firebase.auth().currentUser, 'Hushåll aktivt – molnsynk aktiv');
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
    currentHouseholdId = '';
    currentHouseholdData = null;
    currentRole = 'member';
    updateHouseholdUi();
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

  window.createOwnHousehold = async function createOwnHousehold() {
    if (!initFirebase()) return;
    const user = firebase.auth().currentUser;
    if (!user) {
      alert('Logga in först.');
      return;
    }
    try {
      const seedState = collectState();
      const householdId = await createHouseholdForUser(user, seedState);
      currentHouseholdId = householdId;
      currentHouseholdData = (await householdRef(householdId).get()).data() || null;
      currentRole = 'owner';
      updateHouseholdUi();
      await startCloudSync();
      alert('Nytt hushåll skapat: ' + householdId);
    } catch (error) {
      console.error('Create household error:', error);
      alert('Kunde inte skapa hushåll: ' + (error && error.message ? error.message : 'okänt fel'));
    }
  };

  window.joinHouseholdByCode = async function joinHouseholdByCode(rawCode) {
    if (!initFirebase()) return;
    const user = firebase.auth().currentUser;
    if (!user) {
      alert('Logga in först.');
      return;
    }
    const code = normalizeCode(rawCode);
    if (!code) {
      alert('Skriv en giltig hushållskod.');
      return;
    }
    try {
      const snap = await householdRef(code).get();
      if (!snap.exists) {
        alert('Hushållskoden hittades inte.');
        return;
      }
      await ensureMembership(code, user, snap.data()?.ownerUid === user.uid ? 'owner' : 'member');
      currentHouseholdId = code;
      currentHouseholdData = (await householdRef(code).get()).data() || null;
      currentRole = currentHouseholdData?.ownerUid === user.uid ? 'owner' : 'member';
      updateHouseholdUi();
      await startCloudSync();
      alert('Du gick med i hushåll ' + code);
    } catch (error) {
      console.error('Join household error:', error);
      alert('Kunde inte gå med i hushåll: ' + (error && error.message ? error.message : 'okänt fel'));
    }
  };

  window.joinHouseholdPrompt = function joinHouseholdPrompt() {
    const code = window.prompt('Skriv hushållskod:');
    if (!code) return;
    window.joinHouseholdByCode(code);
  };

  window.copyHouseholdCode = function copyHouseholdCode() {
    if (!currentHouseholdId) return;
    copyText(currentHouseholdId, 'Hushållskod kopierad.');
  };

  window.copyHouseholdLink = function copyHouseholdLink() {
    if (!currentHouseholdId) return;
    copyText(householdLink(currentHouseholdId), 'Hushållslänk kopierad.');
  };

  window.getActiveHouseholdInfo = function getActiveHouseholdInfo() {
    return {
      householdId: currentHouseholdId,
      household: currentHouseholdData,
      role: currentRole,
      syncReady
    };
  };

  window.uploadItemImageToCloud = async function uploadItemImageToCloud(file, itemName) {
    if (!initFirebase()) throw new Error('Firebase ej redo');
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Logga in först');
    if (!currentHouseholdId) await ensureUserAndHousehold(user);
    const storage = firebase.storage();
    const safeName = String(itemName || 'bild')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'bild';
    const ext = (String(file?.type || '').includes('png') ? 'png' : 'jpg');
    const path = `households/${currentHouseholdId}/images/${Date.now()}-${safeName}.${ext}`;
    const ref = storage.ref().child(path);
    await ref.put(file, { contentType: file.type || (ext === 'png' ? 'image/png' : 'image/jpeg') });
    return ref.getDownloadURL();
  };

  window.saveToCloud = saveToCloud;
  window.saveToCloudNow = saveToCloudNow;

  function startAuthListener() {
    if (authReady || !initFirebase()) return;
    authReady = true;
    firebase.auth().onAuthStateChanged(async user => {
      wrapSaveFunction();
      if (user) {
        setAuthUi(user, 'Inloggad – ansluter...');
        try {
          await startCloudSync();
        } catch (error) {
          console.error('Auth sync error:', error);
          setAuthUi(user, 'Molnsynk-fel: ' + (error && error.message ? error.message : 'okänt fel'));
        }
      } else {
        stopCloudSync();
        setAuthUi(null, 'Inte inloggad');
      }
    });
  }

  window.addEventListener('load', () => {
    initFirebase();
    ensureHouseholdUi();
    wrapSaveFunction();
    startAuthListener();
    setTimeout(wrapSaveFunction, 0);
  });
})();
