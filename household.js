(function () {
  'use strict';

  const state = {
    householdId: null,
    householdData: null,
    members: [],
    inviteCode: '',
    unsubscribeMembers: null,
    unsubscribeHousehold: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function panelReady() {
    return !!$('householdPanel');
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function setStatus(message, isError) {
    const el = $('householdStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'household-status' + (isError ? ' error' : ' ok');
  }

  function randomCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function activeUser() {
    try {
      return firebase.auth().currentUser;
    } catch (error) {
      return null;
    }
  }

  async function ensureUserProfile(uid) {
    const ref = firebase.firestore().collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        uid,
        householdId: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { uid, householdId: null };
    }
    return snap.data() || { uid, householdId: null };
  }

  async function saveUserHousehold(uid, householdId) {
    await firebase.firestore().collection('users').doc(uid).set({
      uid,
      householdId: householdId || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  function getMemberLabel(uid) {
    if (!uid) return 'Okänd medlem';
    if (uid === activeUser()?.uid) return 'Du';
    return uid.slice(0, 6) + '…' + uid.slice(-4);
  }

  function renderMembers() {
    const wrap = $('householdMembers');
    if (!wrap) return;
    const members = Array.isArray(state.members) ? state.members : [];
    if (!members.length) {
      wrap.innerHTML = '<div class="household-empty">Inga medlemmar ännu.</div>';
      return;
    }
    wrap.innerHTML = members.map(uid => {
      const isOwner = uid && uid === state.householdData?.ownerUid;
      return '<span class="household-member-chip">' + getMemberLabel(uid) + (isOwner ? ' 👑' : '') + '</span>';
    }).join('');
  }

  function renderHouseholdCard() {
    const user = activeUser();
    const hasUser = !!user;
    const hasHousehold = !!state.householdId;

    const createBtn = $('createHouseholdBtn');
    const joinBtn = $('joinHouseholdBtn');
    const inviteBtn = $('createInviteBtn');
    const leaveBtn = $('leaveHouseholdBtn');
    const copyBtn = $('copyInviteBtn');
    const joinCode = $('joinCode');
    const householdName = $('householdName');

    setText('householdAccountInfo', hasUser ? (user.displayName || user.email || 'Inloggad') : 'Inte inloggad');
    setText('householdInfo', hasHousehold ? (state.householdData?.name || 'Hushåll') : 'Inget household valt ännu');
    setText('householdMeta', hasHousehold ? ('ID: ' + state.householdId) : 'Skapa eller gå med i ett household för delad sync');
    setText('inviteCode', state.inviteCode || '—');

    if (householdName) householdName.disabled = !hasUser || hasHousehold;
    if (joinCode) joinCode.disabled = !hasUser;
    if (createBtn) createBtn.disabled = !hasUser || hasHousehold;
    if (joinBtn) joinBtn.disabled = !hasUser;
    if (inviteBtn) inviteBtn.disabled = !hasUser || !hasHousehold;
    if (leaveBtn) leaveBtn.disabled = !hasUser || !hasHousehold;
    if (copyBtn) copyBtn.disabled = !state.inviteCode;

    const inviteWrap = $('householdInviteWrap');
    const membersWrap = $('householdMembersWrap');
    if (inviteWrap) inviteWrap.style.display = hasHousehold ? '' : 'none';
    if (membersWrap) membersWrap.style.display = hasHousehold ? '' : 'none';

    renderMembers();
  }

  function dispatchHouseholdChanged() {
    try {
      window.dispatchEvent(new CustomEvent('household-changed', {
        detail: {
          householdId: state.householdId || '',
          householdName: state.householdData?.name || '',
        }
      }));
    } catch (error) {
      console.error('household-changed dispatch error:', error);
    }
  }

  function stopSubscriptions() {
    if (typeof state.unsubscribeHousehold === 'function') state.unsubscribeHousehold();
    if (typeof state.unsubscribeMembers === 'function') state.unsubscribeMembers();
    state.unsubscribeHousehold = null;
    state.unsubscribeMembers = null;
  }

  async function loadInviteCodeForHousehold() {
    state.inviteCode = '';
    if (!state.householdId) {
      renderHouseholdCard();
      return;
    }

    try {
      const snap = await firebase.firestore()
        .collection('inviteCodes')
        .where('householdId', '==', state.householdId)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (!snap.empty) state.inviteCode = snap.docs[0].id;
    } catch (error) {
      console.error('invite code load error:', error);
    }

    renderHouseholdCard();
  }

  function subscribeToHousehold() {
    stopSubscriptions();

    if (!state.householdId) {
      state.householdData = null;
      state.members = [];
      state.inviteCode = '';
      renderHouseholdCard();
      dispatchHouseholdChanged();
      return;
    }

    const ref = firebase.firestore().collection('households').doc(state.householdId);

    state.unsubscribeHousehold = ref.onSnapshot(async (snap) => {
      if (!snap.exists) {
        state.householdData = null;
        state.members = [];
        setStatus('Household hittades inte.', true);
        renderHouseholdCard();
        dispatchHouseholdChanged();
        return;
      }

      state.householdData = snap.data() || {};
      state.members = Array.isArray(state.householdData.memberUids) ? state.householdData.memberUids.slice() : [];
      renderHouseholdCard();
      dispatchHouseholdChanged();
      await loadInviteCodeForHousehold();
    }, (error) => {
      console.error('household snapshot error:', error);
      setStatus('Kunde inte läsa household: ' + (error?.message || 'okänt fel'), true);
    });
  }

  async function refreshStateFromProfile() {
    const user = activeUser();
    if (!user) {
      state.householdId = null;
      state.householdData = null;
      state.members = [];
      state.inviteCode = '';
      stopSubscriptions();
      renderHouseholdCard();
      dispatchHouseholdChanged();
      return;
    }

    const profile = await ensureUserProfile(user.uid);
    state.householdId = profile.householdId || null;
    subscribeToHousehold();
    if (!state.householdId) {
      setStatus('Logga in och skapa eller gå med i ett household.', false);
    } else {
      setStatus('Household aktivt.', false);
    }
  }

  async function createHousehold() {
    const user = activeUser();
    if (!user) return setStatus('Logga in med Google först.', true);
    if (state.householdId) return setStatus('Du har redan ett household.', true);

    try {
      const db = firebase.firestore();
      const name = String($('householdName')?.value || 'Mitt household').trim() || 'Mitt household';
      const ref = db.collection('households').doc();
      await ref.set({
        name,
        ownerUid: user.uid,
        memberUids: [user.uid],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await saveUserHousehold(user.uid, ref.id);
      setStatus('Household skapat.', false);
      await refreshStateFromProfile();
    } catch (error) {
      console.error('create household error:', error);
      setStatus('Kunde inte skapa household: ' + (error?.message || 'okänt fel'), true);
    }
  }

  async function createInviteCode() {
    const user = activeUser();
    if (!user || !state.householdId) return setStatus('Skapa eller gå med i household först.', true);

    try {
      const db = firebase.firestore();
      let code = '';
      for (let i = 0; i < 5; i++) {
        const candidate = randomCode();
        const existing = await db.collection('inviteCodes').doc(candidate).get();
        if (!existing.exists) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error('Kunde inte skapa unik kod. Försök igen.');

      await db.collection('inviteCodes').doc(code).set({
        code,
        householdId: state.householdId,
        createdBy: user.uid,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      state.inviteCode = code;
      renderHouseholdCard();
      setStatus('Invite-kod skapad.', false);
    } catch (error) {
      console.error('create invite error:', error);
      setStatus('Kunde inte skapa invite-kod: ' + (error?.message || 'okänt fel'), true);
    }
  }

  async function joinHouseholdByCode() {
    const user = activeUser();
    const code = String($('joinCode')?.value || '').trim().toUpperCase();
    if (!user) return setStatus('Logga in med Google först.', true);
    if (!code) return setStatus('Skriv in en invite-kod.', true);

    try {
      const db = firebase.firestore();
      const inviteRef = db.collection('inviteCodes').doc(code);
      const inviteSnap = await inviteRef.get();
      if (!inviteSnap.exists) throw new Error('Koden finns inte.');
      const invite = inviteSnap.data() || {};
      if (!invite.active) throw new Error('Koden är inte aktiv.');
      if (!invite.householdId) throw new Error('Koden saknar household.');

      const householdRef = db.collection('households').doc(invite.householdId);
      await db.runTransaction(async (tx) => {
        const householdSnap = await tx.get(householdRef);
        if (!householdSnap.exists) throw new Error('Household hittades inte.');
        const data = householdSnap.data() || {};
        const memberUids = Array.isArray(data.memberUids) ? data.memberUids.slice() : [];
        if (!memberUids.includes(user.uid)) memberUids.push(user.uid);
        tx.set(householdRef, {
          memberUids,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      await saveUserHousehold(user.uid, invite.householdId);
      if ($('joinCode')) $('joinCode').value = '';
      setStatus('Du gick med i household.', false);
      await refreshStateFromProfile();
    } catch (error) {
      console.error('join household error:', error);
      setStatus('Kunde inte gå med: ' + (error?.message || 'okänt fel'), true);
    }
  }

  async function leaveHousehold() {
    const user = activeUser();
    if (!user || !state.householdId) return setStatus('Inget household att lämna.', true);

    try {
      const db = firebase.firestore();
      const householdId = state.householdId;
      const ref = db.collection('households').doc(householdId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data() || {};
        const memberUids = (Array.isArray(data.memberUids) ? data.memberUids : []).filter(uid => uid !== user.uid);
        tx.set(ref, {
          memberUids,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      await saveUserHousehold(user.uid, null);
      setStatus('Du lämnade household.', false);
      await refreshStateFromProfile();
    } catch (error) {
      console.error('leave household error:', error);
      setStatus('Kunde inte lämna household: ' + (error?.message || 'okänt fel'), true);
    }
  }

  async function copyInviteCode() {
    if (!state.inviteCode) return;
    try {
      await navigator.clipboard.writeText(state.inviteCode);
      setStatus('Koden kopierad.', false);
    } catch (error) {
      console.error('copy invite error:', error);
      setStatus('Kunde inte kopiera koden.', true);
    }
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',');
    const match = /^data:(.*?);base64$/.exec(parts[0] || '');
    const mime = match ? match[1] : 'image/png';
    const binary = atob(parts[1] || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function uploadDataUrlImage(dataUrl, name) {
    const user = activeUser();
    if (!user || !state.householdId) throw new Error('Ingen aktiv household-upload.');
    if (!firebase.storage) throw new Error('Firebase Storage är inte laddat.');

    const extension = ((String(dataUrl).match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/) || [])[1] || 'png').replace('jpeg', 'jpg');
    const safeName = String(name || 'bild').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'bild';
    const path = 'households/' + state.householdId + '/item-images/' + Date.now() + '-' + safeName + '.' + extension;
    const ref = firebase.storage().ref().child(path);
    const blob = dataUrlToBlob(dataUrl);
    const snapshot = await ref.put(blob, { contentType: blob.type || 'image/png' });
    return snapshot.ref.getDownloadURL();
  }

  function isReady() {
    return !!activeUser() && !!state.householdId;
  }

  function bindUi() {
    if (!panelReady()) return;
    $('createHouseholdBtn')?.addEventListener('click', createHousehold);
    $('joinHouseholdBtn')?.addEventListener('click', joinHouseholdByCode);
    $('createInviteBtn')?.addEventListener('click', createInviteCode);
    $('copyInviteBtn')?.addEventListener('click', copyInviteCode);
    $('leaveHouseholdBtn')?.addEventListener('click', leaveHousehold);
  }

  function init() {
    if (!window.firebase || !panelReady()) return;
    bindUi();
    renderHouseholdCard();
    firebase.auth().onAuthStateChanged(() => {
      refreshStateFromProfile().catch(error => {
        console.error('refresh household error:', error);
        setStatus('Kunde inte läsa household: ' + (error?.message || 'okänt fel'), true);
      });
    });
  }

  window.cloudHousehold = window.cloudHousehold || {};
  window.cloudHousehold.getHouseholdId = function () {
    return state.householdId || null;
  };
  window.cloudHousehold.getHouseholdName = function () {
    return state.householdData?.name || '';
  };
  window.cloudHousehold.isReady = isReady;
  window.cloudHousehold.uploadDataUrlImage = uploadDataUrlImage;
  window.cloudHousehold.refresh = refreshStateFromProfile;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
