(function () {
  'use strict';

  const state = {
    user: null,
    profile: null,
    householdId: null,
    household: null,
    members: [],
    householdUnsubscribe: null,
  };

  const $ = (id) => document.getElementById(id);

  function getVisibleFlowSection() {
    const gate = $('flowGate');
    if (!gate) return null;
    return gate.querySelector(`[data-flow-view="${gate.dataset.view}"]`) || null;
  }

  function getFlowField(id) {
    const visible = getVisibleFlowSection();
    if (visible) {
      const found = visible.querySelector(`#${id}`);
      if (found) return found;
    }
    return document.getElementById(id);
  }

  function safeText(value, fallback = '') {
    return String(value == null ? fallback : value);
  }

  function setStatus(message, isError = false) {
    const el = getFlowField('hhStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'flow-status' + (isError ? ' is-error' : '');
  }

  function setFlowView(view) {
    const gate = $('flowGate');
    if (!gate) return;
    gate.dataset.view = view;
    gate.classList.add('is-transitioning');
    const sections = gate.querySelectorAll('[data-flow-view]');
    sections.forEach((section) => {
      const active = section.getAttribute('data-flow-view') === view;
      section.style.display = active ? '' : 'none';
      section.classList.toggle('is-active', active);
    });
    const appShell = $('mainAppShell');
    if (appShell) appShell.classList.toggle('app-shell-locked', view !== 'app');
    gate.style.display = view === 'app' ? 'none' : 'flex';
    document.body.classList.toggle('flow-gate-open', view !== 'app');
    window.clearTimeout(setFlowView._timer);
    setFlowView._timer = window.setTimeout(() => gate.classList.remove('is-transitioning'), 220);
  }

  function randomCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  async function ensureUserProfile(uid) {
    const ref = firebase.firestore().collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      const profile = {
        uid,
        householdId: null,
        personalHouseholdId: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(profile, { merge: true });
      state.profile = { uid, householdId: null, personalHouseholdId: null };
      return state.profile;
    }
    state.profile = snap.data() || { uid, householdId: null, personalHouseholdId: null };
    return state.profile;
  }

  async function saveUserProfile(uid, patch) {
    await firebase.firestore().collection('users').doc(uid).set({
      uid,
      ...patch,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    state.profile = Object.assign({}, state.profile || {}, patch);
    if (Object.prototype.hasOwnProperty.call(patch, 'householdId')) {
      state.householdId = patch.householdId || null;
    }
  }

  async function createPersonalHousehold(name) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Inte inloggad.');
    const db = firebase.firestore();
    const householdRef = db.collection('households').doc();
    const householdName = safeText(name, '').trim() || 'Mitt hushåll';
    await householdRef.set({
      name: householdName,
      ownerUid: user.uid,
      memberUids: [user.uid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await saveUserProfile(user.uid, {
      householdId: householdRef.id,
      personalHouseholdId: householdRef.id,
    });
    return householdRef.id;
  }

  async function ensurePersonalHousehold() {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Inte inloggad.');
    const profile = state.profile || await ensureUserProfile(user.uid);
    if (profile.personalHouseholdId) return profile.personalHouseholdId;
    const householdId = await createPersonalHousehold('Mitt hushåll');
    return householdId;
  }

  async function removeUserFromHousehold(householdId, uid) {
    if (!householdId) return;
    const ref = firebase.firestore().collection('households').doc(householdId);
    await firebase.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data() || {};
      const current = Array.isArray(data.memberUids) ? data.memberUids.slice() : [];
      if (!current.includes(uid)) return;
      const next = current.filter((value) => value !== uid);
      tx.update(ref, {
        memberUids: next,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
  }

  async function switchActiveHousehold(nextHouseholdId, options = {}) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Inte inloggad.');
    const keepOldMembership = !!options.keepOldMembership;
    const previous = state.householdId || state.profile?.householdId || null;
    if (!nextHouseholdId) throw new Error('Saknar hushåll.');

    await saveUserProfile(user.uid, { householdId: nextHouseholdId });

    if (!keepOldMembership && previous && previous !== nextHouseholdId) {
      const personal = state.profile?.personalHouseholdId || null;
      if (previous !== personal) {
        await removeUserFromHousehold(previous, user.uid).catch(() => {});
      }
    }

    await refreshCurrentHousehold();
    if (typeof window.initCloudSync === 'function') {
      window.initCloudSync();
    }
  }

  async function goToMyHousehold() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    setStatus('Öppnar ditt hushåll...');
    try {
      const personalId = await ensurePersonalHousehold();
      await switchActiveHousehold(personalId, { keepOldMembership: false });
      setStatus('Nu är du i ditt eget hushåll.');
      setFlowView('app');
    } catch (error) {
      console.error(error);
      setStatus('Kunde inte öppna ditt hushåll: ' + (error?.message || 'okänt fel'), true);
      setFlowView('choice');
    }
  }

  async function joinHouseholdByCode() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const codeInput = $('joinCodeInput');
    const code = safeText(codeInput?.value, '').trim().toUpperCase();
    if (!code) {
      setStatus('Skriv in en kod först.', true);
      return;
    }

    setStatus('Går med i hushåll...');
    try {
      await ensurePersonalHousehold();
      const db = firebase.firestore();
      const inviteRef = db.collection('inviteCodes').doc(code);
      const inviteSnap = await inviteRef.get();
      if (!inviteSnap.exists) throw new Error('Koden finns inte.');

      const invite = inviteSnap.data() || {};
      if (!invite.active) throw new Error('Koden är inte aktiv.');
      if (!invite.householdId) throw new Error('Koden saknar hushåll.');

      const householdRef = db.collection('households').doc(invite.householdId);
      await db.runTransaction(async (tx) => {
        const householdSnap = await tx.get(householdRef);
        if (!householdSnap.exists) throw new Error('Hushållet finns inte.');
        const household = householdSnap.data() || {};
        const memberUids = Array.isArray(household.memberUids) ? household.memberUids.slice() : [];
        if (!memberUids.includes(user.uid)) {
          memberUids.push(user.uid);
          tx.update(householdRef, {
            memberUids,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      await switchActiveHousehold(invite.householdId, { keepOldMembership: false });
      if (codeInput) codeInput.value = '';
      setStatus('Du gick med i hushållet.');
      setFlowView('app');
    } catch (error) {
      console.error(error);
      setStatus('Kunde inte gå med: ' + (error?.message || 'okänt fel'), true);
      setFlowView('join');
    }
  }

  async function createInviteCode() {
    const user = firebase.auth().currentUser;
    if (!user || !state.householdId) return;
    setStatus('Skapar kod...');
    try {
      const code = randomCode();
      await firebase.firestore().collection('inviteCodes').doc(code).set({
        code,
        householdId: state.householdId,
        createdBy: user.uid,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      const inviteOut = $('inviteCodeOutput');
      if (inviteOut) inviteOut.textContent = code;
      const copyBtn = $('copyInviteBtn');
      if (copyBtn) copyBtn.disabled = false;
      setStatus('Kod skapad.');
    } catch (error) {
      console.error(error);
      setStatus('Kunde inte skapa kod: ' + (error?.message || 'okänt fel'), true);
    }
  }

  async function copyInviteCode() {
    const code = safeText($('inviteCodeOutput')?.textContent, '').trim();
    if (!code || code === '—') return;
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Koden kopierad.');
    } catch (error) {
      setStatus('Kunde inte kopiera koden.', true);
    }
  }

  async function leaveCurrentHousehold() {
    const user = firebase.auth().currentUser;
    if (!user || !state.householdId) return;
    const personal = state.profile?.personalHouseholdId || null;
    if (!personal) {
      setStatus('Du har inget eget hushåll ännu.', true);
      return;
    }
    if (!confirm('Vill du lämna hushållet?\n\nDu flyttas tillbaka till ditt eget hushåll.')) return;
    try {
      const current = state.householdId;
      if (current !== personal) {
        await removeUserFromHousehold(current, user.uid);
      }
      await saveUserProfile(user.uid, { householdId: personal });
      await refreshCurrentHousehold();
      if (typeof window.initCloudSync === 'function') window.initCloudSync();
      setStatus('Du är tillbaka i ditt eget hushåll.');
      setFlowView('app');
    } catch (error) {
      console.error(error);
      setStatus('Kunde inte lämna hushållet: ' + (error?.message || 'okänt fel'), true);
    }
  }

  async function kickMember(uid) {
    const user = firebase.auth().currentUser;
    if (!user || !state.householdId || !uid) return;
    if (!state.household || state.household.ownerUid !== user.uid) {
      setStatus('Bara ägaren kan ta bort medlemmar.', true);
      return;
    }
    if (uid === user.uid) {
      setStatus('Du kan inte kicka dig själv här. Använd Lämna hushåll.', true);
      return;
    }
    if (!confirm('Vill du ta bort denna medlem från hushållet?')) return;
    try {
      await removeUserFromHousehold(state.householdId, uid);
      await saveUserProfile(uid, { householdId: null });
      setStatus('Medlem borttagen.');
    } catch (error) {
      console.error(error);
      setStatus('Kunde inte ta bort medlem: ' + (error?.message || 'okänt fel'), true);
    }
  }

  async function refreshCurrentHousehold() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const profile = await ensureUserProfile(user.uid);
    state.householdId = profile.householdId || null;

    const account = getFlowField('flowAccountInfo');
    if (account) account.textContent = user.displayName || user.email || 'Google-konto';

    const personalBadge = getFlowField('personalHouseholdBadge');
    if (personalBadge) {
      personalBadge.textContent = profile.personalHouseholdId ? 'Eget hushåll klart' : 'Eget hushåll saknas';
    }

    if (state.householdUnsubscribe) {
      state.householdUnsubscribe();
      state.householdUnsubscribe = null;
    }

    if (!state.householdId) {
      state.household = null;
      state.members = [];
      renderHouseholdPanel();
      return;
    }

    state.householdUnsubscribe = firebase.firestore().collection('households').doc(state.householdId)
      .onSnapshot(async (snapshot) => {
        if (!snapshot.exists) {
          state.household = null;
          state.members = [];
          renderHouseholdPanel();
          return;
        }
        state.household = Object.assign({ id: snapshot.id }, snapshot.data() || {});
        const memberUids = Array.isArray(state.household.memberUids) ? state.household.memberUids : [];
        const docs = await Promise.all(memberUids.map(async (uid) => {
          try {
            const snap = await firebase.firestore().collection('users').doc(uid).get();
            return snap.exists ? snap.data() : { uid };
          } catch (_) {
            return { uid };
          }
        }));
        state.members = docs;
        renderHouseholdPanel();
      }, (error) => {
        console.error(error);
        setStatus('Kunde inte läsa hushåll: ' + (error?.message || 'okänt fel'), true);
      });
  }

  function renderMemberRow(member, isOwner, currentUid) {
    const wrap = document.createElement('div');
    wrap.className = 'household-member-row';
    const memberUid = member.uid || '';
    const label = member.displayName || member.email || memberUid || 'Medlem';
    const ownerTag = memberUid && state.household?.ownerUid === memberUid ? '<span class="household-chip">Ägare</span>' : '';
    const meTag = memberUid === currentUid ? '<span class="household-chip household-chip-soft">Du</span>' : '';
    wrap.innerHTML = `
      <div class="household-member-main">
        <strong>${label}</strong>
        <div class="household-member-meta">${memberUid || 'okänd uid'}</div>
      </div>
      <div class="household-member-actions">
        ${ownerTag}
        ${meTag}
      </div>
    `;
    if (isOwner && memberUid && memberUid !== currentUid) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost-btn household-kick-btn';
      btn.textContent = 'Kick';
      btn.addEventListener('click', () => kickMember(memberUid));
      wrap.querySelector('.household-member-actions').appendChild(btn);
    }
    return wrap;
  }

  function renderHouseholdPanel() {
    const nameEl = $('currentHouseholdName');
    const metaEl = $('currentHouseholdMeta');
    const membersEl = $('householdMembers');
    const leaveBtn = $('leaveHouseholdBtn');
    const myBtn = $('myHouseholdBtn');
    const inviteTools = $('inviteTools');
    const ownerInviteBtn = $('createInviteBtn');

    const user = firebase.auth().currentUser;
    const currentUid = user?.uid || '';

    if (!state.household) {
      if (nameEl) nameEl.textContent = 'Inget hushåll valt';
      if (metaEl) metaEl.textContent = 'Logga in och välj hushåll för att öppna appen.';
      if (membersEl) membersEl.innerHTML = '<div class="household-empty">Inga medlemmar att visa ännu.</div>';
      if (leaveBtn) leaveBtn.style.display = 'none';
      if (myBtn) myBtn.style.display = '';
      if (inviteTools) inviteTools.style.display = 'none';
      if (ownerInviteBtn) ownerInviteBtn.disabled = true;
      return;
    }

    const personalId = state.profile?.personalHouseholdId || null;
    const isPersonal = personalId && state.householdId === personalId;
    const isOwner = currentUid && state.household.ownerUid === currentUid;

    if (nameEl) nameEl.textContent = state.household.name || 'Hushåll';
    if (metaEl) {
      metaEl.textContent = `${isPersonal ? 'Ditt hushåll' : 'Delat hushåll'} • ${state.members.length} medlem${state.members.length === 1 ? '' : 'mar'}`;
    }

    if (membersEl) {
      membersEl.innerHTML = '';
      state.members.forEach((member) => membersEl.appendChild(renderMemberRow(member, isOwner, currentUid)));
    }

    if (leaveBtn) leaveBtn.style.display = isPersonal ? 'none' : '';
    if (myBtn) myBtn.style.display = isPersonal ? 'none' : '';
    if (inviteTools) inviteTools.style.display = isOwner ? '' : 'none';
    if (ownerInviteBtn) ownerInviteBtn.disabled = !isOwner;
  }

  function updateScreenFromState() {
    const user = firebase.auth().currentUser;
    const continueBtn = $('flowContinueBtn');
    const switchBtn = $('switchHouseholdBtn');
    const hasHousehold = !!state.profile?.householdId;

    if (!user) {
      if (continueBtn) continueBtn.style.display = 'none';
      if (switchBtn) switchBtn.style.display = 'none';
      setFlowView('login');
      setStatus('Logga in med Google för att fortsätta.');
      return;
    }

    if (continueBtn) continueBtn.style.display = hasHousehold ? '' : 'none';
    if (switchBtn) switchBtn.style.display = hasHousehold ? '' : 'none';

    if (hasHousehold) {
      setFlowView('app');
      setStatus('Öppnar ditt valda hushåll.');
      return;
    }

    setFlowView('choice');
    setStatus('Välj hur du vill fortsätta.');
  }

  function bindUi() {
    $('flowGoogleLoginBtn')?.addEventListener('click', () => {
      if (typeof window.loginWithGoogle === 'function') window.loginWithGoogle();
    });
    $('flowGoToMineBtn')?.addEventListener('click', goToMyHousehold);
    $('flowContinueBtn')?.addEventListener('click', () => { setFlowView('app'); setStatus('Öppnar ditt valda hushåll.'); });
    $('flowLogoutBtn')?.addEventListener('click', () => {
      if (typeof window.logoutGoogle === 'function') window.logoutGoogle();
    });
    $('flowGoToJoinBtn')?.addEventListener('click', () => {
      setStatus('Skriv in en inbjudningskod för att gå med i ett hushåll.');
      setFlowView('join');
    });
    $('joinBackBtn')?.addEventListener('click', () => {
      setStatus('Välj hur du vill fortsätta.');
      setFlowView('choice');
    });
    $('joinSubmitBtn')?.addEventListener('click', joinHouseholdByCode);
    $('myHouseholdBtn')?.addEventListener('click', goToMyHousehold);
    $('leaveHouseholdBtn')?.addEventListener('click', leaveCurrentHousehold);
    $('createInviteBtn')?.addEventListener('click', createInviteCode);
    $('copyInviteBtn')?.addEventListener('click', copyInviteCode);
    $('switchHouseholdBtn')?.addEventListener('click', () => {
      setFlowView('choice');
      setStatus(state.profile?.householdId ? 'Välj om du vill fortsätta i nuvarande hushåll, gå med i ett nytt eller gå till ditt eget.' : 'Välj hur du vill fortsätta.');
    });
  }

  async function handleAuthChanged(user) {
    state.user = user || null;
    state.profile = null;
    state.householdId = null;
    state.household = null;
    state.members = [];
    renderHouseholdPanel();

    if (!user) {
      if (state.householdUnsubscribe) {
        state.householdUnsubscribe();
        state.householdUnsubscribe = null;
      }
      setFlowView('login');
      setStatus('Logga in med Google för att fortsätta.');
      return;
    }

    setFlowView('loading');
    setStatus('Läser konto...');
    try {
      await ensureUserProfile(user.uid);
      await refreshCurrentHousehold();
      updateScreenFromState();
    } catch (error) {
      console.error(error);
      setStatus('Kunde inte läsa ditt konto: ' + (error?.message || 'okänt fel'), true);
      setFlowView('choice');
    }
  }

  async function uploadDataUrlImage(dataUrl, fileName) {
    const user = firebase.auth().currentUser;
    const householdId = state.householdId;
    if (!user || !householdId) throw new Error('Ingen aktiv hushållssynk.');
    if (!firebase.storage) throw new Error('Firebase Storage saknas.');
    const safeName = safeText(fileName, 'bild').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60) || 'bild';
    const path = `households/${householdId}/images/${Date.now()}-${safeName}`;
    const ref = firebase.storage().ref().child(path);
    await ref.putString(dataUrl, 'data_url');
    return await ref.getDownloadURL();
  }

  window.cloudHousehold = {
    isReady() {
      return !!(firebase?.auth?.().currentUser && state.householdId);
    },
    getHouseholdId() {
      return state.householdId || null;
    },
    getPersonalHouseholdId() {
      return state.profile?.personalHouseholdId || null;
    },
    getActiveHousehold() {
      return state.household || null;
    },
    refreshCurrentHousehold,
    uploadDataUrlImage,
    goToMyHousehold,
    joinHouseholdByCode,
    showChoiceScreen() {
      setFlowView('choice');
      setStatus(state.profile?.householdId ? 'Välj om du vill fortsätta i nuvarande hushåll, gå med i ett nytt eller gå till ditt eget.' : 'Välj hur du vill fortsätta.');
    },
  };

  window.addEventListener('load', () => {
    bindUi();
    if (!window.firebase || !window.firebase.auth) {
      setFlowView('login');
      setStatus('Firebase laddas...');
      return;
    }
    firebase.auth().onAuthStateChanged((user) => {
      handleAuthChanged(user);
    });
  });
})();
