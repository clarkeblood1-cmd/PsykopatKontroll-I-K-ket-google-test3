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
  let currentHouseholdInfo = null;
  let currentUserProfile = null;
  let profileUnsubscribe = null;
  let householdInfoUnsubscribe = null;
  let profileLoading = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function safeCall(fnName) {
    return typeof window[fnName] === 'function';
  }

  function setText(id, text) {
    const el = byId(id);
    if (el) el.textContent = text;
  }

  function setVisible(id, visible) {
    const el = byId(id);
    if (el) el.style.display = visible ? '' : 'none';
  }

  function sanitizeFileName(name) {
    return String(name || 'bild')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'bild';
  }

  function normalizeCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i += 1) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
  }

  function initFirebase() {
    try {
      if (!window.firebase || !window.firebaseConfig) {
        setAuthUi(null, 'Firebase ej redo');
        return false;
      }

      if (!firebase.firestore || !firebase.auth || !firebase.storage) {
        setAuthUi(null, 'Firebase SDK saknar Firestore/Auth/Storage');
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

  function getUserProfileRef(user) {
    if (!user) return null;
    return firebase.firestore().collection('users').doc(user.uid).collection('private').doc('profile');
  }

  function getLegacyDocRef(user) {
    if (!user) return null;
    return firebase.firestore().collection('users').doc(user.uid).collection('appData').doc('main');
  }

  function getHouseholdDocRef(householdId) {
    if (!householdId) return null;
    return firebase.firestore().collection('households').doc(householdId);
  }

  function getHouseholdDataRef(householdId) {
    if (!householdId) return null;
    return firebase.firestore().collection('households').doc(householdId).collection('appData').doc('main');
  }

  function getDocRef() {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    return currentHouseholdId ? getHouseholdDataRef(currentHouseholdId) : getLegacyDocRef(user);
  }

  function getStorageRootRef() {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    const base = firebase.storage().ref();
    return currentHouseholdId
      ? base.child(`households/${currentHouseholdId}/images`)
      : base.child(`users/${user.uid}/images`);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Kunde inte läsa filen'));
      reader.readAsDataURL(file);
    });
  }

  function resizeToDataUrl(file, maxSize = 1200, quality = 0.88) {
    return readFileAsDataUrl(file).then(src => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas kunde inte startas'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Kunde inte läsa bilden'));
      img.src = src;
    }));
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',');
    const meta = parts[0] || '';
    const body = parts[1] || '';
    const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function uploadItemImageToCloud(file, itemName = 'bild') {
    if (!firebaseReady) return Promise.reject(new Error('Firebase ej redo'));
    const rootRef = getStorageRootRef();
    const user = firebase.auth().currentUser;
    if (!rootRef || !user) return Promise.reject(new Error('Inte inloggad'));

    return resizeToDataUrl(file).then(dataUrl => {
      const blob = dataUrlToBlob(dataUrl);
      const fileName = `${Date.now()}-${sanitizeFileName(itemName)}.jpg`;
      const fileRef = rootRef.child(fileName);
      return fileRef.put(blob, {
        contentType: 'image/jpeg',
        cacheControl: 'public,max-age=31536000,immutable',
        customMetadata: {
          ownerUid: user.uid,
          householdId: currentHouseholdId || '',
          itemName: String(itemName || 'bild')
        }
      }).then(() => fileRef.getDownloadURL());
    });
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
      appVersion: 'cloud-sync-household-v1'
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
    renderHouseholdUi(user);
  }

  function renderHouseholdUi(user) {
    const loggedIn = !!user;
    const hasHousehold = !!currentHouseholdId;
    const info = currentHouseholdInfo || {};
    const name = info.name || 'Mitt hushåll';
    const code = info.inviteCode || '';
    const count = Number(info.memberCount || Object.keys(info.memberUids || {}).length || 0);

    setVisible('householdPanel', loggedIn);
    setVisible('householdCreateBtn', loggedIn && !hasHousehold);
    setVisible('householdJoinWrap', loggedIn && !hasHousehold);
    setVisible('householdLeaveBtn', loggedIn && hasHousehold);
    setVisible('copyHouseholdCodeBtn', loggedIn && hasHousehold && !!code);

    if (!loggedIn) {
      setText('householdStatus', 'Logga in för att skapa eller gå med i ett delat hushåll.');
      setText('householdMeta', '');
      return;
    }

    if (profileLoading) {
      setText('householdStatus', 'Läser hushåll...');
      setText('householdMeta', '');
      return;
    }

    if (!hasHousehold) {
      setText('householdStatus', 'Du är i eget konto-läge. Skapa hushåll eller gå med via kod.');
      setText('householdMeta', 'Ingen delad lista ännu. Din personliga molndata finns kvar tills du går med i ett hushåll.');
      return;
    }

    setText('householdStatus', `🏠 ${name}`);
    setText('householdMeta', `Kod: ${code || 'saknas'} • Medlemmar: ${count || 1}`);
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

  function stopCloudSync() {
    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }
    syncReady = false;
  }

  function startCloudSync() {
    if (!firebaseReady || !safeCall('render')) return;
    const ref = getDocRef();
    if (!ref) return;

    stopCloudSync();

    syncReady = true;
    setAuthUi(firebase.auth().currentUser, currentHouseholdId ? 'Inloggad – ansluter till hushåll...' : 'Inloggad – ansluter...');

    cloudUnsubscribe = ref.onSnapshot(snapshot => {
      if (!snapshot.exists) {
        if (!pendingInitialUpload) {
          pendingInitialUpload = true;
          saveToCloudNow().finally(() => {
            pendingInitialUpload = false;
            setAuthUi(firebase.auth().currentUser, currentHouseholdId ? 'Inloggad – hushåll synkar' : 'Inloggad – molnsynk aktiv');
          });
        }
        return;
      }

      const data = snapshot.data() || {};
      applyRemoteState(data);
      setAuthUi(firebase.auth().currentUser, currentHouseholdId ? 'Inloggad – hushåll synkar' : 'Inloggad – molnsynk aktiv');
    }, error => {
      console.error('Cloud sync snapshot error:', error);
      setAuthUi(firebase.auth().currentUser, 'Molnsynk-fel: ' + (error && error.message ? error.message : 'okänt fel'));
    });
  }

  function syncToResolvedTarget() {
    stopCloudSync();
    pendingInitialUpload = false;
    if (firebase.auth().currentUser) startCloudSync();
  }

  function attachHouseholdDocListener(householdId) {
    if (householdInfoUnsubscribe) {
      householdInfoUnsubscribe();
      householdInfoUnsubscribe = null;
    }
    if (!householdId) {
      currentHouseholdInfo = null;
      renderHouseholdUi(firebase.auth().currentUser);
      return;
    }

    householdInfoUnsubscribe = getHouseholdDocRef(householdId).onSnapshot(snapshot => {
      currentHouseholdInfo = snapshot.exists ? (snapshot.data() || {}) : null;
      renderHouseholdUi(firebase.auth().currentUser);
    }, error => {
      console.error('Household info error:', error);
    });
  }

  function handleResolvedProfile(user, profile) {
    currentUserProfile = profile || {};
    currentHouseholdId = String(profile?.householdId || '');
    currentHouseholdInfo = null;
    profileLoading = false;
    if (currentHouseholdId) attachHouseholdDocListener(currentHouseholdId);
    renderHouseholdUi(user);
    syncToResolvedTarget();
  }

  function watchUserProfile(user) {
    if (profileUnsubscribe) {
      profileUnsubscribe();
      profileUnsubscribe = null;
    }

    const profileRef = getUserProfileRef(user);
    if (!profileRef) {
      handleResolvedProfile(user, {});
      return;
    }

    profileLoading = true;
    renderHouseholdUi(user);

    profileUnsubscribe = profileRef.onSnapshot(snapshot => {
      const data = snapshot.exists ? (snapshot.data() || {}) : {};
      handleResolvedProfile(user, data);
    }, error => {
      profileLoading = false;
      console.error('Profile load error:', error);
      setAuthUi(user, 'Kunde inte läsa hushållsprofil');
      syncToResolvedTarget();
    });
  }

  function reserveInviteCode() {
    const invites = firebase.firestore().collection('householdInvites');

    function tryCreate(attempt) {
      if (attempt > 8) return Promise.reject(new Error('Kunde inte skapa kod'));
      const code = generateInviteCode();
      const inviteRef = invites.doc(code);
      return inviteRef.get().then(snapshot => {
        if (snapshot.exists) return tryCreate(attempt + 1);
        return code;
      });
    }

    return tryCreate(0);
  }

  function createHousehold() {
    const user = firebase.auth().currentUser;
    if (!user) {
      alert('Logga in först.');
      return;
    }
    if (currentHouseholdId) {
      alert('Du är redan med i ett hushåll.');
      return;
    }

    const suggested = user.displayName ? `${user.displayName.split(' ')[0]}s hushåll` : 'Mitt hushåll';
    const name = String(prompt('Namn på hushållet:', suggested) || '').trim();
    if (!name) return;

    setAuthUi(user, 'Skapar hushåll...');

    reserveInviteCode().then(code => {
      const db = firebase.firestore();
      const householdRef = db.collection('households').doc();
      const householdId = householdRef.id;
      const profileRef = getUserProfileRef(user);
      const inviteRef = db.collection('householdInvites').doc(code);
      const batch = db.batch();

      batch.set(householdRef, {
        name,
        inviteCode: code,
        ownerUid: user.uid,
        memberUids: { [user.uid]: true },
        memberCount: 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      batch.set(getHouseholdDataRef(householdId), collectState(), { merge: true });
      batch.set(profileRef, {
        householdId,
        householdName: name,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      batch.set(inviteRef, {
        householdId,
        code,
        name,
        ownerUid: user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return batch.commit().then(() => {
        const input = byId('householdCodeInput');
        if (input) input.value = '';
        setAuthUi(user, 'Hushåll skapat – synkar...');
      });
    }).catch(error => {
      console.error('Create household error:', error);
      alert('Kunde inte skapa hushåll: ' + (error && error.message ? error.message : 'okänt fel'));
      setAuthUi(user, 'Inloggad');
    });
  }

  function joinHousehold() {
    const user = firebase.auth().currentUser;
    if (!user) {
      alert('Logga in först.');
      return;
    }
    const input = byId('householdCodeInput');
    const code = normalizeCode(input?.value || '');
    if (!code) {
      alert('Skriv hushållskoden först.');
      return;
    }
    if (currentHouseholdId) {
      alert('Du är redan med i ett hushåll.');
      return;
    }

    setAuthUi(user, 'Går med i hushåll...');

    const db = firebase.firestore();
    const inviteRef = db.collection('householdInvites').doc(code);
    inviteRef.get().then(snapshot => {
      if (!snapshot.exists) throw new Error('Koden finns inte');
      const invite = snapshot.data() || {};
      const householdId = String(invite.householdId || '');
      if (!householdId) throw new Error('Koden saknar hushåll');

      const householdRef = getHouseholdDocRef(householdId);
      const profileRef = getUserProfileRef(user);

      return db.runTransaction(async tx => {
        const householdSnap = await tx.get(householdRef);
        if (!householdSnap.exists) throw new Error('Hushållet finns inte');
        const household = householdSnap.data() || {};
        const memberUids = { ...(household.memberUids || {}) };
        memberUids[user.uid] = true;
        tx.set(householdRef, {
          memberUids,
          memberCount: Object.keys(memberUids).length,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        tx.set(profileRef, {
          householdId,
          householdName: household.name || invite.name || 'Mitt hushåll',
          joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
    }).then(() => {
      if (input) input.value = '';
      setAuthUi(user, 'Ansluten till hushåll – synkar...');
    }).catch(error => {
      console.error('Join household error:', error);
      alert('Kunde inte gå med i hushåll: ' + (error && error.message ? error.message : 'okänt fel'));
      setAuthUi(user, 'Inloggad');
    });
  }

  function leaveHousehold() {
    const user = firebase.auth().currentUser;
    if (!user || !currentHouseholdId) return;

    const info = currentHouseholdInfo || {};
    const memberUids = { ...(info.memberUids || {}) };
    const memberCount = Object.keys(memberUids).length;
    if (info.ownerUid === user.uid && memberCount > 1) {
      alert('Ägaren kan inte lämna hushållet så länge andra medlemmar är kvar.');
      return;
    }
    if (!confirm('Lämna hushållet? Därefter går du tillbaka till ditt eget konto-läge.')) return;

    const db = firebase.firestore();
    const householdRef = getHouseholdDocRef(currentHouseholdId);
    const profileRef = getUserProfileRef(user);

    db.runTransaction(async tx => {
      const householdSnap = await tx.get(householdRef);
      if (!householdSnap.exists) {
        tx.set(profileRef, { householdId: firebase.firestore.FieldValue.delete() }, { merge: true });
        return;
      }
      const household = householdSnap.data() || {};
      const nextMembers = { ...(household.memberUids || {}) };
      delete nextMembers[user.uid];
      tx.set(householdRef, {
        memberUids: nextMembers,
        memberCount: Object.keys(nextMembers).length,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        ownerUid: household.ownerUid === user.uid ? (Object.keys(nextMembers)[0] || '') : household.ownerUid
      }, { merge: true });
      tx.set(profileRef, {
        householdId: firebase.firestore.FieldValue.delete(),
        householdName: firebase.firestore.FieldValue.delete(),
        joinedAt: firebase.firestore.FieldValue.delete()
      }, { merge: true });
    }).then(() => {
      setAuthUi(user, 'Hushåll lämnat – tillbaka till eget konto-läge');
    }).catch(error => {
      console.error('Leave household error:', error);
      alert('Kunde inte lämna hushållet: ' + (error && error.message ? error.message : 'okänt fel'));
    });
  }

  function copyHouseholdCode() {
    const code = String(currentHouseholdInfo?.inviteCode || '');
    if (!code) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        setText('householdMeta', `Kod: ${code} • Kopierad!`);
        setTimeout(() => renderHouseholdUi(firebase.auth().currentUser), 1200);
      }).catch(() => alert('Kunde inte kopiera koden.'));
      return;
    }
    alert('Kod: ' + code);
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
  window.uploadItemImageToCloud = uploadItemImageToCloud;
  window.createHousehold = createHousehold;
  window.joinHousehold = joinHousehold;
  window.leaveHousehold = leaveHousehold;
  window.copyHouseholdCode = copyHouseholdCode;

  function startAuthListener() {
    if (authReady || !initFirebase()) return;
    authReady = true;

    firebase.auth().onAuthStateChanged(user => {
      wrapSaveFunction();
      stopCloudSync();
      currentHouseholdId = '';
      currentHouseholdInfo = null;
      currentUserProfile = null;
      profileLoading = false;
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }
      if (householdInfoUnsubscribe) {
        householdInfoUnsubscribe();
        householdInfoUnsubscribe = null;
      }

      if (user) {
        setAuthUi(user, 'Inloggad – läser konto...');
        watchUserProfile(user);
      } else {
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
