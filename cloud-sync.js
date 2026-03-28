(function () {
  'use strict';

  let firebaseReady = false;
  let cloudUnsubscribe = null;
  let householdUnsubscribe = null;
  let membersUnsubscribe = null;
  let saveWrapped = false;
  let remoteApplying = false;
  let saveTimer = null;
  let pendingInitialUpload = false;
  let currentHouseholdId = '';
  let currentHousehold = null;
  let currentMembers = [];
  let currentInviteCode = '';
  let authUser = null;

  function byId(id) { return document.getElementById(id); }
  function safeCall(fnName) { return typeof window[fnName] === 'function'; }
  function db() { return firebase.firestore(); }

  function fixEncoding(text) {
    return String(text || '')
      .replace(/â/g, '–')
      .replace(/Ã¥/g, 'å')
      .replace(/Ã¤/g, 'ä')
      .replace(/Ã¶/g, 'ö');
  }

  function statusMessage(text) {
    const status = byId('authStatus');
    if (status) status.textContent = text || '';
  }

  function setAuthUi(user, message) {
    const loginBtn = byId('googleLoginBtn');
    const logoutBtn = byId('googleLogoutBtn');
    const help = byId('firebaseHelp');
    authUser = user || null;

    if (message) statusMessage(message);
    else if (user) {
      const label = currentHouseholdId ? `Inloggad – hushåll ${currentHouseholdId.slice(0, 6)} aktivt` : 'Inloggad – inget hushåll valt';
      statusMessage(label);
    } else {
      statusMessage('Inte inloggad');
    }

    if (loginBtn) loginBtn.style.display = user ? 'none' : '';
    if (logoutBtn) logoutBtn.style.display = user ? '' : 'none';
    if (help) help.style.display = firebaseReady ? 'none' : '';
    renderHouseholdUi();
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

  function getJoinTokenFromValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return url.searchParams.get('join') || raw;
    } catch (e) {
      return raw;
    }
  }

  function getJoinToken() {
    try {
      const url = new URL(window.location.href);
      return getJoinTokenFromValue(url.searchParams.get('join') || localStorage.getItem('matlista_pending_join') || '');
    } catch (e) {
      return getJoinTokenFromValue(localStorage.getItem('matlista_pending_join') || '');
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

  function setJoinMessage(text, isError) {
    const el = byId('householdJoinMessage');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#fca5a5' : '#cbd5e1';
  }

  function randomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function householdStateRef(householdId = currentHouseholdId) {
    if (!householdId) return null;
    return db().collection('households').doc(householdId).collection('state').doc('main');
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
      appVersion: 'household-ui-members-v1'
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

  async function resolveInviteToken(token) {
    const raw = getJoinTokenFromValue(token);
    if (!raw) return '';
    const directDoc = await db().collection('households').doc(raw).get().catch(() => null);
    if (directDoc && directDoc.exists) return directDoc.id;
    const upper = raw.toUpperCase();
    const inviteDoc = await db().collection('inviteCodes').doc(upper).get().catch(() => null);
    if (inviteDoc && inviteDoc.exists) {
      const data = inviteDoc.data() || {};
      if (data.householdId) return String(data.householdId);
    }
    return '';
  }

  async function ensureInviteCodeDoc(forceNew) {
    if (!authUser || !currentHouseholdId) return '';
    const householdRef = db().collection('households').doc(currentHouseholdId);
    let code = forceNew ? '' : String((currentHousehold && currentHousehold.inviteCode) || currentInviteCode || '').toUpperCase();
    if (!code) {
      for (let i = 0; i < 5 && !code; i += 1) {
        const candidate = randomCode();
        const snap = await db().collection('inviteCodes').doc(candidate).get().catch(() => null);
        if (!snap || !snap.exists) code = candidate;
      }
      if (!code) code = randomCode();
    }

    await householdRef.set({
      inviteCode: code,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await db().collection('inviteCodes').doc(code).set({
      code,
      householdId: currentHouseholdId,
      householdName: (currentHousehold && currentHousehold.name) || 'Mitt hushåll',
      createdBy: authUser.uid,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    currentInviteCode = code;
    renderHouseholdUi();
    return code;
  }

  function getInviteLink(code = currentInviteCode) {
    if (!code) return '';
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('join', code);
      url.hash = '#home';
      return url.toString();
    } catch (e) {
      return `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(code)}#home`;
    }
  }

  async function createHouseholdNow() {
    if (!authUser) {
      alert('Logga in först.');
      return;
    }
    if (currentHouseholdId) {
      alert('Du är redan i ett hushåll. Lämna det först om du vill skapa ett nytt.');
      return;
    }
    try {
      setJoinMessage('Skapar hushåll...', false);
      const householdRef = db().collection('households').doc();
      const nameBase = authUser.displayName ? `${authUser.displayName.split(' ')[0]}s hushåll` : 'Mitt hushåll';
      const batch = db().batch();
      batch.set(householdRef, {
        ownerUid: authUser.uid,
        name: nameBase,
        memberUids: [authUser.uid],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.set(householdRef.collection('members').doc(authUser.uid), {
        uid: authUser.uid,
        role: 'owner',
        displayName: authUser.displayName || '',
        email: authUser.email || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      batch.set(db().collection('users').doc(authUser.uid), {
        uid: authUser.uid,
        displayName: authUser.displayName || '',
        email: authUser.email || '',
        activeHouseholdId: householdRef.id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await batch.commit();
      currentHouseholdId = householdRef.id;
      localStorage.setItem('matlista_active_household_id', currentHouseholdId);
      await ensureInviteCodeDoc(false);
      startHouseholdListeners();
      startCloudSync();
      setAuthUi(authUser, `Inloggad – hushåll ${currentHouseholdId.slice(0, 6)} aktivt`);
      setJoinMessage('Hushåll skapat.', false);
    } catch (error) {
      console.error('create household error', error);
      setJoinMessage('Kunde inte skapa hushåll: ' + fixEncoding(error && error.message ? error.message : 'okänt fel'), true);
    }
  }

  async function joinHouseholdByToken(token) {
    if (!authUser) {
      alert('Logga in först.');
      return;
    }
    const householdId = await resolveInviteToken(token);
    if (!householdId) {
      setJoinMessage('Kunde inte hitta något hushåll med den koden.', true);
      return;
    }
    if (currentHouseholdId && currentHouseholdId === householdId) {
      setJoinMessage('Du är redan i det hushållet.', false);
      clearJoinToken();
      return;
    }
    if (currentHouseholdId && currentHouseholdId !== householdId) {
      setJoinMessage('Lämna ditt nuvarande hushåll först och prova igen.', true);
      return;
    }
    try {
      setJoinMessage('Går med i hushåll...', false);
      const householdRef = db().collection('households').doc(householdId);
      const batch = db().batch();
      batch.set(householdRef.collection('members').doc(authUser.uid), {
        uid: authUser.uid,
        role: 'member',
        displayName: authUser.displayName || '',
        email: authUser.email || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      batch.set(householdRef, {
        memberUids: firebase.firestore.FieldValue.arrayUnion(authUser.uid),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      batch.set(db().collection('users').doc(authUser.uid), {
        uid: authUser.uid,
        displayName: authUser.displayName || '',
        email: authUser.email || '',
        activeHouseholdId: householdId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await batch.commit();
      clearJoinToken();
      currentHouseholdId = householdId;
      localStorage.setItem('matlista_active_household_id', currentHouseholdId);
      startHouseholdListeners();
      startCloudSync();
      setAuthUi(authUser, `Inloggad – hushåll ${currentHouseholdId.slice(0, 6)} aktivt`);
      setJoinMessage('Nu är du med i hushållet.', false);
    } catch (error) {
      console.error('join household error', error);
      setJoinMessage('Kunde inte gå med: ' + fixEncoding(error && error.message ? error.message : 'okänt fel'), true);
    }
  }

  async function leaveCurrentHousehold() {
    if (!authUser || !currentHouseholdId) return;
    if (!window.confirm('Lämna hushållet?')) return;
    try {
      const householdId = currentHouseholdId;
      const householdRef = db().collection('households').doc(householdId);
      const memberDocs = await householdRef.collection('members').get();
      const members = memberDocs.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
      const isOwner = currentHousehold && currentHousehold.ownerUid === authUser.uid;
      const others = members.filter(member => member.uid !== authUser.uid);
      const batch = db().batch();

      if (isOwner && others.length) {
        const nextOwner = others[0];
        batch.set(householdRef, {
          ownerUid: nextOwner.uid,
          memberUids: firebase.firestore.FieldValue.arrayRemove(authUser.uid),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        batch.set(householdRef.collection('members').doc(nextOwner.uid), {
          role: 'owner',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        batch.set(householdRef, {
          memberUids: firebase.firestore.FieldValue.arrayRemove(authUser.uid),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      batch.delete(householdRef.collection('members').doc(authUser.uid));
      batch.set(db().collection('users').doc(authUser.uid), {
        activeHouseholdId: '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await batch.commit();

      stopCloudSync();
      stopHouseholdListeners();
      currentHouseholdId = '';
      currentHousehold = null;
      currentMembers = [];
      currentInviteCode = '';
      localStorage.removeItem('matlista_active_household_id');
      setAuthUi(authUser, 'Inloggad – inget hushåll valt');
      setJoinMessage('Du har lämnat hushållet.', false);
      renderHouseholdUi();
    } catch (error) {
      console.error('leave household error', error);
      alert('Kunde inte lämna hushållet: ' + fixEncoding(error && error.message ? error.message : 'okänt fel'));
    }
  }

  function stopHouseholdListeners() {
    if (householdUnsubscribe) householdUnsubscribe();
    if (membersUnsubscribe) membersUnsubscribe();
    householdUnsubscribe = null;
    membersUnsubscribe = null;
  }

  function startHouseholdListeners() {
    stopHouseholdListeners();
    if (!currentHouseholdId) {
      renderHouseholdUi();
      return;
    }
    const householdRef = db().collection('households').doc(currentHouseholdId);
    householdUnsubscribe = householdRef.onSnapshot(async snap => {
      currentHousehold = snap.exists ? (snap.data() || {}) : null;
      currentInviteCode = String((currentHousehold && currentHousehold.inviteCode) || currentInviteCode || '').toUpperCase();
      renderHouseholdUi();
      if (currentHouseholdId && !currentInviteCode) {
        try { await ensureInviteCodeDoc(false); } catch (e) {}
      }
    });
    membersUnsubscribe = householdRef.collection('members').onSnapshot(snap => {
      currentMembers = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
      renderHouseholdUi();
    });
  }

  function ownerMember() {
    if (!currentHousehold) return null;
    return currentMembers.find(member => member.uid === currentHousehold.ownerUid) || null;
  }

  function displayNameForMember(member) {
    if (!member) return 'Okänd medlem';
    return member.displayName || member.email || member.uid || 'Okänd medlem';
  }

  function renderHouseholdUi() {
    const statusEl = byId('householdStatus');
    const metaEl = byId('householdMeta');
    const ownerLine = byId('householdOwnerLine');
    const list = byId('householdMembersList');
    const codeEl = byId('householdInviteCode');
    const linkEl = byId('householdInviteLink');
    const createBtn = byId('createHouseholdBtn');
    const leaveBtn = byId('leaveHouseholdBtn');

    if (!statusEl || !metaEl || !ownerLine || !list) return;

    if (!authUser) {
      statusEl.textContent = 'Inte ansluten';
      metaEl.textContent = 'Logga in för att skapa eller gå med i ett hushåll.';
      ownerLine.textContent = 'Ägare: -';
      list.innerHTML = '<div class="household-empty">Logga in för att se hushållsmedlemmar.</div>';
      if (codeEl) codeEl.value = '';
      if (linkEl) linkEl.value = '';
      if (createBtn) createBtn.style.display = '';
      if (leaveBtn) leaveBtn.style.display = 'none';
      return;
    }

    if (!currentHouseholdId) {
      const joinToken = getJoinToken();
      statusEl.textContent = joinToken ? 'Ansluter hushåll...' : 'Inget hushåll valt';
      metaEl.textContent = joinToken ? 'Join-länk hittad. Logga in och klicka Gå med om hushållet inte kopplas direkt.' : 'Skapa eget hushåll eller gå med via kod/länk.';
      ownerLine.textContent = 'Ägare: -';
      list.innerHTML = '<div class="household-empty">Du är inte med i något hushåll ännu.</div>';
      if (codeEl) codeEl.value = '';
      if (linkEl) linkEl.value = '';
      if (createBtn) createBtn.style.display = '';
      if (leaveBtn) leaveBtn.style.display = 'none';
      return;
    }

    const owner = ownerMember();
    const ownerName = displayNameForMember(owner) || (currentHousehold && currentHousehold.ownerUid) || '-';
    statusEl.textContent = `${(currentHousehold && currentHousehold.name) || 'Hushåll'} • ${currentHouseholdId.slice(0, 6)}`;
    metaEl.textContent = `${currentMembers.length || 0} medlem${currentMembers.length === 1 ? '' : 'mar'} • ${currentHouseholdId}`;
    ownerLine.textContent = `Ägare: ${ownerName}`;

    list.innerHTML = currentMembers.length ? currentMembers.map(member => {
      const roleOwner = member.uid === (currentHousehold && currentHousehold.ownerUid);
      return `<div class="household-member"><div class="household-member-main"><div class="household-member-name">${escapeHtml(displayNameForMember(member))}</div><div class="household-member-sub">${escapeHtml(member.email || member.uid || '')}</div></div><div class="household-role-badge ${roleOwner ? 'household-role-owner' : ''}">${roleOwner ? 'Ägare' : 'Medlem'}</div></div>`;
    }).join('') : '<div class="household-empty">Inga medlemmar ännu.</div>';

    if (codeEl) codeEl.value = currentInviteCode || '';
    if (linkEl) linkEl.value = currentInviteCode ? getInviteLink(currentInviteCode) : '';
    if (createBtn) createBtn.style.display = 'none';
    if (leaveBtn) leaveBtn.style.display = '';
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stopCloudSync() {
    if (cloudUnsubscribe) cloudUnsubscribe();
    cloudUnsubscribe = null;
  }

  function startCloudSync() {
    if (!firebaseReady || !currentHouseholdId || !safeCall('render')) return;
    const ref = householdStateRef();
    if (!ref) return;
    if (cloudUnsubscribe) cloudUnsubscribe();
    setAuthUi(authUser, `Inloggad – hushåll ${currentHouseholdId.slice(0, 6)} aktivt`);

    cloudUnsubscribe = ref.onSnapshot(snapshot => {
      if (!snapshot.exists) {
        if (!pendingInitialUpload) {
          pendingInitialUpload = true;
          saveToCloudNow().finally(() => {
            pendingInitialUpload = false;
            setAuthUi(authUser, `Inloggad – hushåll ${currentHouseholdId.slice(0, 6)} aktivt`);
          });
        }
        return;
      }
      const data = snapshot.data() || {};
      applyRemoteState(data);
      setAuthUi(authUser, `Inloggad – hushåll ${currentHouseholdId.slice(0, 6)} aktivt`);
    }, error => {
      console.error('Cloud sync snapshot error:', error);
      setAuthUi(authUser, 'Molnsynk-fel: ' + fixEncoding(error && error.message ? error.message : 'okänt fel'));
    });
  }

  function saveToCloudNow() {
    if (!firebaseReady || !currentHouseholdId) return Promise.resolve(false);
    const ref = householdStateRef();
    if (!ref || remoteApplying) return Promise.resolve(false);
    return ref.set(collectState(), { merge: true }).then(() => true).catch(error => {
      console.error('Cloud save error:', error);
      setAuthUi(authUser, 'Molnsynk-fel: ' + fixEncoding(error && error.message ? error.message : 'okänt fel'));
      return false;
    });
  }

  function saveToCloud() {
    if (!firebaseReady || remoteApplying || !currentHouseholdId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveToCloudNow(), 350);
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

  async function uploadDataUrlImage(dataUrl, originalName) {
    if (!firebaseReady || !currentHouseholdId || !firebase.storage) throw new Error('Storage ej redo');
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
    return snapshot.ref.getDownloadURL();
  }

  window.cloudHousehold = {
    getHouseholdId: () => currentHouseholdId,
    isReady: () => !!currentHouseholdId,
    uploadDataUrlImage,
    saveNow: saveToCloudNow
  };

  window.createHouseholdNow = createHouseholdNow;
  window.leaveCurrentHousehold = leaveCurrentHousehold;
  window.joinHouseholdFromInput = function () {
    const value = byId('householdJoinInput') ? byId('householdJoinInput').value : '';
    joinHouseholdByToken(value);
  };
  window.copyHouseholdCode = async function () {
    if (!currentInviteCode) await ensureInviteCodeDoc(false);
    if (!currentInviteCode) return;
    await navigator.clipboard.writeText(currentInviteCode).catch(() => {});
    setJoinMessage('Kod kopierad.', false);
  };
  window.copyHouseholdLink = async function () {
    if (!currentInviteCode) await ensureInviteCodeDoc(false);
    const link = getInviteLink(currentInviteCode);
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => {});
    setJoinMessage('Länk kopierad.', false);
  };
  window.generateNewInviteCode = async function () {
    if (!currentHouseholdId) {
      setJoinMessage('Skapa eller gå med i ett hushåll först.', true);
      return;
    }
    try {
      await ensureInviteCodeDoc(true);
      setJoinMessage('Ny kod skapad.', false);
    } catch (error) {
      setJoinMessage('Kunde inte skapa ny kod.', true);
    }
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
    renderHouseholdUi();

    firebase.auth().onAuthStateChanged(async user => {
      stopCloudSync();
      stopHouseholdListeners();
      currentHouseholdId = '';
      currentHousehold = null;
      currentMembers = [];
      currentInviteCode = '';
      authUser = user || null;

      if (!user) {
        setAuthUi(null, 'Inte inloggad');
        return;
      }

      try {
        const userRef = db().collection('users').doc(user.uid);
        const userSnap = await userRef.get().catch(() => null);
        const userData = userSnap && userSnap.exists ? (userSnap.data() || {}) : {};
        const joinToken = getJoinToken();
        const joinTarget = joinToken ? await resolveInviteToken(joinToken) : '';

        await userRef.set({
          uid: user.uid,
          displayName: user.displayName || '',
          email: user.email || '',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (userData.activeHouseholdId) {
          currentHouseholdId = String(userData.activeHouseholdId);
          clearJoinToken();
        } else if (joinTarget) {
          await joinHouseholdByToken(joinTarget);
          return;
        } else {
          setAuthUi(user, 'Inloggad – inget hushåll valt');
          renderHouseholdUi();
          return;
        }

        localStorage.setItem('matlista_active_household_id', currentHouseholdId);
        startHouseholdListeners();
        startCloudSync();
      } catch (error) {
        console.error('Auth sync error:', error);
        setAuthUi(user, 'Molnsynk-fel: ' + fixEncoding(error && error.message ? error.message : 'okänt fel'));
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
