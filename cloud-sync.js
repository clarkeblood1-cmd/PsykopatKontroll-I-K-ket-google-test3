(function () {
  'use strict';

  let firebaseReady = false;
  let authReady = false;
  let syncReady = false;
  let cloudUnsubscribe = null;
  let userUnsubscribe = null;
  let membershipUnsubscribe = null;
  let saveWrapped = false;
  let remoteApplying = false;
  let saveTimer = null;
  let pendingInitialUpload = false;
  let householdReady = false;
  let currentHouseholdId = null;
  let currentInviteCode = '';
  let currentInviteLink = '';
  let lastStateSignature = '';
  let householdMembers = [];
  let bootstrapPromise = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function safeCall(fnName) {
    return typeof window[fnName] === 'function';
  }

  function randomString(length) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  function normalizeCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function parseInviteValue(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    try {
      const url = new URL(text);
      return normalizeCode(url.searchParams.get('join') || url.searchParams.get('code') || '');
    } catch (error) {
      return normalizeCode(text);
    }
  }

  function stateSignature(data) {
    try {
      return JSON.stringify({
        items: Array.isArray(data?.items) ? data.items : [],
        quickItems: Array.isArray(data?.quickItems) ? data.quickItems : [],
        recipes: Array.isArray(data?.recipes) ? data.recipes : [],
        categories: Array.isArray(data?.categories) ? data.categories : [],
        recipeCategories: Array.isArray(data?.recipeCategories) ? data.recipeCategories : [],
        places: Array.isArray(data?.places) ? data.places : [],
        roomConfigs: data?.roomConfigs || {},
        roomDefs: Array.isArray(data?.roomDefs) ? data.roomDefs : [],
        activeRoom: String(data?.activeRoom || ''),
        activePlaceFilter: String(data?.activePlaceFilter || ''),
        homeOpenState: data?.homeOpenState || {},
        recipeIngredientChoices: data?.recipeIngredientChoices || {},
        householdSize: Number(data?.householdSize || 1),
        portionGrams: Number(data?.portionGrams || 100),
        weekPlanner: data?.weekPlanner || {},
        selectedWeekDay: String(data?.selectedWeekDay || ''),
        weekMealOrder: Array.isArray(data?.weekMealOrder) ? data.weekMealOrder : [],
        activeKitchenPage: String(data?.activeKitchenPage || ''),
        theme: String(data?.theme || '')
      });
    } catch (error) {
      return '';
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

  function setHouseholdUi(message, meta) {
    const status = byId('householdStatus');
    const metaEl = byId('householdMeta');
    const codeEl = byId('householdInviteCode');
    const linkEl = byId('householdInviteLink');

    if (status) status.textContent = message || 'Inte redo';
    if (metaEl) metaEl.textContent = meta || '';
    if (codeEl) codeEl.value = currentInviteCode || '';
    if (linkEl) linkEl.value = currentInviteLink || '';
  }

  function initFirebase() {
    try {
      if (!window.firebase || !window.firebaseConfig) {
        setAuthUi(null, 'Firebase ej redo');
        setHouseholdUi('Firebase ej redo', 'Kontrollera firebase-config.js.');
        return false;
      }

      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(window.firebaseConfig);
      }

      firebaseReady = true;
      return true;
    } catch (error) {
      console.error('Firebase init error:', error);
      const msg = error && error.message ? error.message : 'okÃ¤nt fel';
      setAuthUi(null, 'Firebase-fel: ' + msg);
      setHouseholdUi('Firebase-fel', msg);
      return false;
    }
  }

  function getUserRef() {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    return firebase.firestore().collection('users').doc(user.uid);
  }

  function getHouseholdRef(householdId = currentHouseholdId) {
    if (!householdId) return null;
    return firebase.firestore().collection('households').doc(householdId);
  }

  function getStateRef(householdId = currentHouseholdId) {
    const ref = getHouseholdRef(householdId);
    return ref ? ref.collection('state').doc('main') : null;
  }

  function buildInviteLink(code) {
    const url = new URL(window.location.href);
    url.searchParams.set('join', code);
    return url.toString();
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
      lastStateSignature = stateSignature(data);
    } finally {
      remoteApplying = false;
    }
  }

  async function saveToCloudNow(force = false) {
    if (!firebaseReady || !householdReady) return false;
    const ref = getStateRef();
    if (!ref || remoteApplying) return false;
    const state = collectState();
    const signature = stateSignature(state);
    if (!force && signature && signature === lastStateSignature) return true;
    try {
      await ref.set(state, { merge: true });
      lastStateSignature = signature;
      return true;
    } catch (error) {
      console.error('Cloud save error:', error);
      const msg = error && error.message ? error.message : 'okÃ¤nt fel';
      setAuthUi(firebase.auth().currentUser, 'Molnsynk-fel: ' + msg);
      setHouseholdUi('Molnsynk-fel', msg);
      return false;
    }
  }

  function saveToCloud() {
    if (!firebaseReady || !householdReady || remoteApplying) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveToCloudNow(false);
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

  async function ensureInviteCode(householdId) {
    const ref = getHouseholdRef(householdId);
    if (!ref) return '';
    const snap = await ref.get();
    const data = snap.data() || {};
    let code = normalizeCode(data.inviteCode || '');
    if (!code) {
      code = randomString(6);
      await ref.set({ inviteCode: code, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    currentInviteCode = code;
    currentInviteLink = buildInviteLink(code);
    setHouseholdUi(
      `HushÃ¥ll aktivt${householdMembers.length ? ` â¢ ${householdMembers.length} medlem${householdMembers.length === 1 ? '' : 'mar'}` : ''}`,
      `Kod: ${code}${householdId ? ` â¢ ID: ${householdId}` : ''}`
    );
    return code;
  }

  async function createHouseholdForUser(user, nameHint = '') {
    const db = firebase.firestore();
    const householdRef = db.collection('households').doc();
    const householdId = householdRef.id;
    const inviteCode = randomString(6);
    const batch = db.batch();
    const userRef = db.collection('users').doc(user.uid);

    batch.set(householdRef, {
      ownerUid: user.uid,
      name: nameHint || `${user.displayName || 'Mitt'} hushÃ¥ll`,
      inviteCode,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    batch.set(householdRef.collection('members').doc(user.uid), {
      uid: user.uid,
      role: 'owner',
      displayName: user.displayName || '',
      email: user.email || '',
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    batch.set(userRef, {
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
      activeHouseholdId: householdId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    batch.set(householdRef.collection('state').doc('main'), collectState(), { merge: true });
    await batch.commit();
    return householdId;
  }

  async function ensureActiveHousehold(user) {
    const userRef = getUserRef();
    if (!userRef) return null;
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    let householdId = userData.activeHouseholdId || '';

    await userRef.set({
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (householdId) {
      const memberSnap = await firebase.firestore().collection('households').doc(householdId).collection('members').doc(user.uid).get();
      if (!memberSnap.exists) householdId = '';
    }

    if (!householdId) {
      householdId = await createHouseholdForUser(user);
    }

    currentHouseholdId = householdId;
    householdReady = true;
    return householdId;
  }

  function stopCloudSync() {
    if (cloudUnsubscribe) { cloudUnsubscribe(); cloudUnsubscribe = null; }
    if (membershipUnsubscribe) { membershipUnsubscribe(); membershipUnsubscribe = null; }
    if (userUnsubscribe) { userUnsubscribe(); userUnsubscribe = null; }
    householdMembers = [];
    householdReady = false;
    syncReady = false;
    currentHouseholdId = null;
    currentInviteCode = '';
    currentInviteLink = '';
    lastStateSignature = '';
    setHouseholdUi('Logga in fÃ¶r att skapa eller gÃ¥ med i ett hushÃ¥ll.', 'Eget hushÃ¥ll + sÃ¤ker molnsynk mellan mobil och dator.');
  }

  function startMemberListener(householdId) {
    if (membershipUnsubscribe) membershipUnsubscribe();
    membershipUnsubscribe = firebase.firestore()
      .collection('households').doc(householdId)
      .collection('members')
      .onSnapshot(snapshot => {
        householdMembers = snapshot.docs.map(doc => doc.data() || {});
        const names = householdMembers
          .map(member => member.displayName || member.email || member.uid)
          .filter(Boolean)
          .slice(0, 4)
          .join(', ');
        setHouseholdUi(
          `HushÃ¥ll aktivt â¢ ${householdMembers.length} medlem${householdMembers.length === 1 ? '' : 'mar'}`,
          names || 'Delat hushÃ¥ll aktivt'
        );
        ensureInviteCode(householdId).catch(() => {});
      }, error => {
        console.error('Member sync error:', error);
      });
  }

  function startUserListener(user) {
    const ref = getUserRef();
    if (!ref) return;
    if (userUnsubscribe) userUnsubscribe();
    userUnsubscribe = ref.onSnapshot(snapshot => {
      const data = snapshot.data() || {};
      const nextHouseholdId = data.activeHouseholdId || '';
      if (nextHouseholdId && nextHouseholdId !== currentHouseholdId) {
        currentHouseholdId = nextHouseholdId;
        startCloudSync(true).catch(error => console.error('Restart sync failed:', error));
      }
    }, error => console.error('User sync error:', error));
  }

  async function startCloudSync(forceRestart = false) {
    if (!firebaseReady || !safeCall('render')) return;
    const user = firebase.auth().currentUser;
    if (!user) return;

    if (bootstrapPromise && !forceRestart) {
      await bootstrapPromise;
      return;
    }

    bootstrapPromise = (async () => {
      const householdId = await ensureActiveHousehold(user);
      if (!householdId) return;

      const ref = getStateRef(householdId);
      if (!ref) return;

      if (cloudUnsubscribe) {
        cloudUnsubscribe();
        cloudUnsubscribe = null;
      }

      startUserListener(user);
      startMemberListener(householdId);

      syncReady = true;
      setAuthUi(user, 'Inloggad â startar molnsynk...');
      await ensureInviteCode(householdId);

      cloudUnsubscribe = ref.onSnapshot(snapshot => {
        if (!snapshot.exists) {
          if (!pendingInitialUpload) {
            pendingInitialUpload = true;
            saveToCloudNow(true).finally(() => {
              pendingInitialUpload = false;
              setAuthUi(firebase.auth().currentUser, 'Inloggad â molnsynk aktiv');
            });
          }
          return;
        }

        const data = snapshot.data() || {};
        const incomingSignature = stateSignature(data);
        if (incomingSignature && incomingSignature === lastStateSignature) {
          setAuthUi(firebase.auth().currentUser, 'Inloggad â molnsynk aktiv');
          return;
        }

        applyRemoteState(data);
        setAuthUi(firebase.auth().currentUser, 'Inloggad â molnsynk aktiv');
      }, error => {
        console.error('Cloud sync snapshot error:', error);
        const msg = error && error.message ? error.message : 'okÃ¤nt fel';
        setAuthUi(firebase.auth().currentUser, 'Molnsynk-fel: ' + msg);
        setHouseholdUi('Molnsynk-fel', msg);
      });
    })();

    try {
      await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  }

  async function joinHouseholdByCode(rawValue) {
    if (!initFirebase()) {
      alert('Firebase Ã¤r inte korrekt laddat Ã¤nnu. Kontrollera firebase-config.js.');
      return;
    }
    const user = firebase.auth().currentUser;
    if (!user) {
      alert('Logga in med Google fÃ¶rst.');
      return;
    }

    const code = parseInviteValue(rawValue || byId('joinHouseholdInput')?.value || '');
    if (!code) {
      alert('Skriv in en giltig kod eller lÃ¤nk.');
      return;
    }

    const query = await firebase.firestore().collection('households').where('inviteCode', '==', code).limit(1).get();
    if (query.empty) {
      alert('HushÃ¥llet hittades inte. Kontrollera koden.');
      return;
    }

    const householdDoc = query.docs[0];
    const householdId = householdDoc.id;
    const batch = firebase.firestore().batch();
    const userRef = firebase.firestore().collection('users').doc(user.uid);
    const memberRef = firebase.firestore().collection('households').doc(householdId).collection('members').doc(user.uid);

    batch.set(memberRef, {
      uid: user.uid,
      role: 'member',
      displayName: user.displayName || '',
      email: user.email || '',
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    batch.set(userRef, {
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
      activeHouseholdId: householdId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
    currentHouseholdId = householdId;
    householdReady = true;

    const input = byId('joinHouseholdInput');
    if (input) input.value = '';
    await startCloudSync(true);
    alert('Nu Ã¤r du med i hushÃ¥llet.');
  }

  async function refreshHouseholdInvite() {
    if (!firebaseReady || !currentHouseholdId) {
      alert('Logga in fÃ¶rst.');
      return;
    }
    const code = randomString(6);
    await getHouseholdRef(currentHouseholdId).set({
      inviteCode: code,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    currentInviteCode = code;
    currentInviteLink = buildInviteLink(code);
    setHouseholdUi(
      `HushÃ¥ll aktivt â¢ ${householdMembers.length} medlem${householdMembers.length === 1 ? '' : 'mar'}`,
      `Ny kod skapad: ${code}`
    );
  }

  function copyText(value, okMessage) {
    const text = String(value || '');
    if (!text) {
      alert('Det finns inget att kopiera Ã¤nnu.');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      alert(okMessage);
    }).catch(() => {
      alert('Kunde inte kopiera automatiskt. Markera texten och kopiera manuellt.');
    });
  }

  window.loginWithGoogle = function loginWithGoogle() {
    if (!initFirebase()) {
      alert('Firebase Ã¤r inte korrekt laddat Ã¤nnu. Kontrollera firebase-config.js.');
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    firebase.auth().signInWithPopup(provider).catch(error => {
      console.error('Google login error:', error);
      const msg = error && error.message ? error.message : 'okÃ¤nt fel';
      setAuthUi(null, 'Login misslyckades');
      alert('Google-login misslyckades: ' + msg);
    });
  };

  window.logoutGoogle = function logoutGoogle() {
    if (!firebaseReady) return;
    firebase.auth().signOut().catch(error => {
      console.error('Logout error:', error);
      alert('Logout misslyckades: ' + (error && error.message ? error.message : 'okÃ¤nt fel'));
    });
  };

  window.saveToCloud = saveToCloud;
  window.saveToCloudNow = saveToCloudNow;
  window.joinHouseholdFromInput = function joinHouseholdFromInput() {
    return joinHouseholdByCode(byId('joinHouseholdInput')?.value || '');
  };
  window.copyHouseholdCode = function copyHouseholdCode() {
    copyText(currentInviteCode, 'HushÃ¥llskoden Ã¤r kopierad.');
  };
  window.copyHouseholdLink = function copyHouseholdLink() {
    copyText(currentInviteLink, 'HushÃ¥llslÃ¤nken Ã¤r kopierad.');
  };
  window.refreshHouseholdInvite = function refreshInviteWrapper() {
    return refreshHouseholdInvite().catch(error => {
      console.error('Refresh invite error:', error);
      alert('Kunde inte skapa ny kod.');
    });
  };

  function startAuthListener() {
    if (authReady || !initFirebase()) return;
    authReady = true;

    firebase.auth().onAuthStateChanged(user => {
      wrapSaveFunction();

      if (user) {
        setAuthUi(user, 'Inloggad â ansluter...');
        setHouseholdUi('Ansluter hushÃ¥ll...', 'HÃ¤mtar delad data...');
        startCloudSync(true).then(() => {
          const inviteFromUrl = new URL(window.location.href).searchParams.get('join') || '';
          const inviteCode = parseInviteValue(inviteFromUrl);
          if (inviteCode && inviteCode !== currentInviteCode) {
            joinHouseholdByCode(inviteCode).catch(error => console.error('Auto join failed:', error));
          }
        }).catch(error => {
          console.error('Start sync failed:', error);
        });
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
