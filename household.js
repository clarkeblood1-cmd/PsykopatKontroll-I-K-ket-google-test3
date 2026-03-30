(function () {
  'use strict';

  const state = {
    user: null,
    householdId: null,
    household: null,
    ready: false
  };

  const $ = (id) => document.getElementById(id);

  function setStatus(message, isError = false) {
    const el = $('householdStatus');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#fecaca' : '#bfdbfe';
  }

  function getAccountLabel(user) {
    if (!user) return 'Inte inloggad';
    return user.displayName || user.email || 'Google-konto';
  }

  function randomCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function setHouseholdId(householdId) {
    const id = String(householdId || '').trim();
    state.householdId = id || null;
    window.activeHouseholdId = state.householdId || '';
    window.householdId = state.householdId || '';
    window.currentHouseholdId = state.householdId || '';

    ['activeHouseholdId', 'householdId', 'matlista_household_id', 'cloudHouseholdId'].forEach(key => {
      if (state.householdId) localStorage.setItem(key, state.householdId);
      else localStorage.removeItem(key);
    });
  }

  function fireHouseholdChanged() {
    try {
      window.dispatchEvent(new CustomEvent('household-changed', {
        detail: {
          householdId: state.householdId || '',
          household: state.household || null,
          ready: !!state.householdId
        }
      }));
    } catch (error) {}

    if (typeof window.initCloudSync === 'function') {
      window.initCloudSync();
    }
  }

  function renderMembers(memberUids = [], ownerUid = '') {
    const wrap = $('householdMembers');
    if (!wrap) return;

    if (!Array.isArray(memberUids) || !memberUids.length) {
      wrap.innerHTML = '<span class="household-member-chip is-empty">Inga medlemmar ännu</span>';
      return;
    }

    const me = state.user && state.user.uid ? state.user.uid : '';
    wrap.innerHTML = memberUids.map(uid => {
      const classes = ['household-member-chip'];
      if (uid === ownerUid) classes.push('is-owner');
      if (uid === me) classes.push('is-me');

      const parts = [];
      parts.push(uid === me ? 'Du' : `Medlem ${uid.slice(0, 6)}`);
      if (uid === ownerUid) parts.push('ägare');

      return `<span class="${classes.join(' ')}">${parts.join(' • ')}</span>`;
    }).join('');
  }

  async function loadUserProfile(uid) {
    const ref = firebase.firestore().collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        householdId: null
      }, { merge: true });
      return { householdId: null };
    }
    return snap.data() || { householdId: null };
  }

  async function saveUserHousehold(uid, householdId) {
    return firebase.firestore().collection('users').doc(uid).set({
      uid,
      householdId: householdId || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async function loadCurrentHousehold() {
    const user = firebase.auth().currentUser;
    state.user = user || null;

    const accountEl = $('accountInfo');
    if (accountEl) accountEl.textContent = getAccountLabel(user);

    if (!user) {
      state.household = null;
      state.ready = false;
      setHouseholdId('');
      if ($('householdInfo')) $('householdInfo').textContent = 'Inget household kopplat ännu.';
      if ($('inviteCode')) $('inviteCode').textContent = '-';
      renderMembers([]);
      setStatus('Logga in med Google för att skapa eller gå med i ett household.');
      fireHouseholdChanged();
      return;
    }

    try {
      const profile = await loadUserProfile(user.uid);
      setHouseholdId(profile.householdId || '');

      if (!state.householdId) {
        state.household = null;
        state.ready = false;
        if ($('householdInfo')) $('householdInfo').textContent = 'Inget household kopplat ännu.';
        if ($('inviteCode')) $('inviteCode').textContent = '-';
        renderMembers([]);
        setStatus('Skapa ett nytt household eller gå med via invite code.');
        fireHouseholdChanged();
        return;
      }

      const snap = await firebase.firestore().collection('households').doc(state.householdId).get();
      if (!snap.exists) {
        await saveUserHousehold(user.uid, null);
        state.household = null;
        state.ready = false;
        setHouseholdId('');
        if ($('householdInfo')) $('householdInfo').textContent = 'Household hittades inte längre.';
        if ($('inviteCode')) $('inviteCode').textContent = '-';
        renderMembers([]);
        setStatus('Det gamla householdet finns inte längre. Skapa ett nytt eller gå med igen.', true);
        fireHouseholdChanged();
        return;
      }

      const household = snap.data() || {};
      state.household = household;
      state.ready = true;

      if ($('householdInfo')) {
        const count = Array.isArray(household.memberUids) ? household.memberUids.length : 0;
        $('householdInfo').textContent = `${household.name || 'Mitt household'} · ${count} medlem${count === 1 ? '' : 'mar'}`;
      }

      renderMembers(household.memberUids || [], household.ownerUid || '');
      setStatus(`Household aktivt: ${household.name || 'Mitt household'}`);
      fireHouseholdChanged();
    } catch (error) {
      console.error('loadCurrentHousehold error:', error);
      setStatus('Kunde inte läsa household: ' + (error && error.message ? error.message : 'okänt fel'), true);
    }
  }

  async function createHousehold() {
    const user = firebase.auth().currentUser;
    if (!user) return setStatus('Logga in med Google först.', true);

    const name = String($('householdName')?.value || 'Mitt household').trim() || 'Mitt household';

    try {
      const db = firebase.firestore();
      const householdRef = db.collection('households').doc();
      await householdRef.set({
        name,
        ownerUid: user.uid,
        memberUids: [user.uid],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await saveUserHousehold(user.uid, householdRef.id);
      if ($('householdName')) $('householdName').value = name;
      setStatus('Household skapat.');
      await loadCurrentHousehold();
    } catch (error) {
      console.error('createHousehold error:', error);
      setStatus('Kunde inte skapa household: ' + (error && error.message ? error.message : 'okänt fel'), true);
    }
  }

  async function createInviteCode() {
    const user = firebase.auth().currentUser;
    if (!user || !state.householdId) return setStatus('Skapa eller gå med i ett household först.', true);

    try {
      const db = firebase.firestore();
      const code = randomCode();
      await db.collection('inviteCodes').doc(code).set({
        code,
        householdId: state.householdId,
        createdBy: user.uid,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if ($('inviteCode')) $('inviteCode').textContent = code;
      setStatus('Invite code skapad.');
    } catch (error) {
      console.error('createInviteCode error:', error);
      setStatus('Kunde inte skapa invite code: ' + (error && error.message ? error.message : 'okänt fel'), true);
    }
  }

  async function joinHouseholdByCode() {
    const user = firebase.auth().currentUser;
    if (!user) return setStatus('Logga in med Google först.', true);

    const code = String($('joinCode')?.value || '').trim().toUpperCase();
    if (!code) return setStatus('Skriv in en invite code först.', true);

    try {
      const db = firebase.firestore();
      const inviteRef = db.collection('inviteCodes').doc(code);
      const inviteSnap = await inviteRef.get();
      if (!inviteSnap.exists) throw new Error('Koden finns inte');

      const invite = inviteSnap.data() || {};
      if (!invite.active) throw new Error('Koden är inte aktiv');

      const householdRef = db.collection('households').doc(invite.householdId);
      await db.runTransaction(async tx => {
        const householdSnap = await tx.get(householdRef);
        if (!householdSnap.exists) throw new Error('Household finns inte');

        const data = householdSnap.data() || {};
        const memberUids = Array.isArray(data.memberUids) ? data.memberUids.slice() : [];
        if (!memberUids.includes(user.uid)) memberUids.push(user.uid);

        tx.set(householdRef, {
          memberUids,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });

      await saveUserHousehold(user.uid, invite.householdId);
      if ($('joinCode')) $('joinCode').value = '';
      setStatus('Du gick med i householdet.');
      await loadCurrentHousehold();
    } catch (error) {
      console.error('joinHouseholdByCode error:', error);
      setStatus('Kunde inte gå med: ' + (error && error.message ? error.message : 'okänt fel'), true);
    }
  }

  async function copyInviteCode() {
    const code = String($('inviteCode')?.textContent || '').trim();
    if (!code || code === '-') return setStatus('Skapa en invite code först.', true);

    try {
      await navigator.clipboard.writeText(code);
      setStatus('Invite code kopierad.');
    } catch (error) {
      setStatus('Kunde inte kopiera koden automatiskt.', true);
    }
  }

  function isReady() {
    return !!(window.firebase && firebase.auth && firebase.auth().currentUser && state.householdId);
  }

  function uploadDataUrlImage(dataUrl, itemName) {
    if (typeof window.uploadItemImageToCloud === 'function') {
      return window.uploadItemImageToCloud(dataUrl, itemName);
    }
    return Promise.resolve(String(dataUrl || ''));
  }

  function bindUi() {
    $('createHouseholdBtn')?.addEventListener('click', createHousehold);
    $('createInviteBtn')?.addEventListener('click', createInviteCode);
    $('copyInviteBtn')?.addEventListener('click', copyInviteCode);
    $('joinBtn')?.addEventListener('click', joinHouseholdByCode);

    $('householdName')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        createHousehold();
      }
    });

    $('joinCode')?.addEventListener('input', event => {
      event.target.value = String(event.target.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    $('joinCode')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        joinHouseholdByCode();
      }
    });
  }

  window.cloudHousehold = window.cloudHousehold || {};
  window.cloudHousehold.getHouseholdId = () => state.householdId || '';
  window.cloudHousehold.getState = () => ({ ...state });
  window.cloudHousehold.isReady = isReady;
  window.cloudHousehold.uploadDataUrlImage = uploadDataUrlImage;
  window.cloudHousehold.refresh = loadCurrentHousehold;

  window.addEventListener('load', function () {
    bindUi();

    if (!window.firebase || !firebase.auth) {
      setStatus('Firebase ej redo ännu.', true);
      return;
    }

    firebase.auth().onAuthStateChanged(async user => {
      state.user = user || null;
      await loadCurrentHousehold();
    });
  });
})();
