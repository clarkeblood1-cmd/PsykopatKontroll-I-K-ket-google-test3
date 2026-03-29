(function () {
  const state = {
    user: null,
    householdId: null,
    unsubscribeItems: null,
  };

  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const accountEl = $('accountInfo');
  const householdEl = $('householdInfo');
  const itemListEl = $('itemList');
  const inviteCodeEl = $('inviteCode');

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.className = isError ? 'status error' : 'status ok';
  }

  function randomCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  async function signInAnon() {
    try {
      await firebase.auth().signInAnonymously();
    } catch (err) {
      setStatus('Kunde inte logga in: ' + err.message, true);
    }
  }

  async function loadUserProfile(uid) {
    const ref = firebase.firestore().collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        householdId: null,
      }, { merge: true });
      return { householdId: null };
    }
    return snap.data();
  }

  async function saveUserHousehold(uid, householdId) {
    return firebase.firestore().collection('users').doc(uid).set({
      uid,
      householdId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  async function createHousehold() {
    const user = firebase.auth().currentUser;
    if (!user) return setStatus('Inte inloggad.', true);

    try {
      const db = firebase.firestore();
      const householdRef = db.collection('households').doc();
      const name = ($('householdName').value || 'Mitt hushåll').trim();

      await householdRef.set({
        name,
        ownerUid: user.uid,
        memberUids: [user.uid],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await saveUserHousehold(user.uid, householdRef.id);
      setStatus('Hushåll skapat.');
      await loadCurrentHousehold();
    } catch (err) {
      setStatus('Kunde inte skapa hushåll: ' + err.message, true);
    }
  }

  async function createInviteCode() {
    const user = firebase.auth().currentUser;
    if (!user || !state.householdId) return setStatus('Du måste ha ett hushåll först.', true);

    try {
      const db = firebase.firestore();
      const code = randomCode();
      await db.collection('inviteCodes').doc(code).set({
        code,
        householdId: state.householdId,
        createdBy: user.uid,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      inviteCodeEl.textContent = code;
      setStatus('Inbjudningskod skapad.');
    } catch (err) {
      setStatus('Kunde inte skapa kod: ' + err.message, true);
    }
  }

  async function joinHouseholdByCode() {
    const code = ($('joinCode').value || '').trim().toUpperCase();
    const user = firebase.auth().currentUser;
    if (!user) return setStatus('Inte inloggad.', true);
    if (!code) return setStatus('Skriv in en kod.', true);

    try {
      const db = firebase.firestore();
      const inviteRef = db.collection('inviteCodes').doc(code);
      const inviteSnap = await inviteRef.get();
      if (!inviteSnap.exists) throw new Error('Koden finns inte.');

      const invite = inviteSnap.data();
      if (!invite.active) throw new Error('Koden är inte aktiv.');

      const householdRef = db.collection('households').doc(invite.householdId);

      await db.runTransaction(async (tx) => {
        const householdSnap = await tx.get(householdRef);
        if (!householdSnap.exists) throw new Error('Hushållet finns inte.');

        const data = householdSnap.data();
        const memberUids = Array.isArray(data.memberUids) ? data.memberUids.slice() : [];
        if (!memberUids.includes(user.uid)) {
          memberUids.push(user.uid);
          tx.update(householdRef, {
            memberUids,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      await saveUserHousehold(user.uid, invite.householdId);
      setStatus('Du gick med i hushållet.');
      await loadCurrentHousehold();
    } catch (err) {
      setStatus('Kunde inte gå med: ' + err.message, true);
    }
  }

  async function addItem() {
    const user = firebase.auth().currentUser;
    if (!user || !state.householdId) return setStatus('Skapa eller gå med i hushåll först.', true);

    const name = ($('itemName').value || '').trim();
    if (!name) return setStatus('Skriv namn på vara.', true);

    try {
      const db = firebase.firestore();
      await db.collection('households').doc(state.householdId).collection('items').add({
        name,
        addedBy: user.uid,
        done: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      $('itemName').value = '';
      setStatus('Vara tillagd.');
    } catch (err) {
      setStatus('Kunde inte lägga till vara: ' + err.message, true);
    }
  }

  async function toggleItem(itemId, done) {
    try {
      await firebase.firestore()
        .collection('households').doc(state.householdId)
        .collection('items').doc(itemId)
        .update({ done: !done });
    } catch (err) {
      setStatus('Kunde inte uppdatera vara: ' + err.message, true);
    }
  }

  async function removeItem(itemId) {
    try {
      await firebase.firestore()
        .collection('households').doc(state.householdId)
        .collection('items').doc(itemId)
        .delete();
    } catch (err) {
      setStatus('Kunde inte ta bort vara: ' + err.message, true);
    }
  }

  function renderItems(docs) {
    itemListEl.innerHTML = '';
    if (!docs.length) {
      itemListEl.innerHTML = '<div class="empty">Inga varor ännu.</div>';
      return;
    }

    docs.forEach((doc) => {
      const item = doc.data();
      const row = document.createElement('div');
      row.className = 'item-row' + (item.done ? ' done' : '');
      row.innerHTML = `
        <label>
          <input type="checkbox" ${item.done ? 'checked' : ''} />
          <span>${escapeHtml(item.name)}</span>
        </label>
        <button class="danger">Ta bort</button>
      `;
      row.querySelector('input').addEventListener('change', () => toggleItem(doc.id, item.done));
      row.querySelector('button').addEventListener('click', () => removeItem(doc.id));
      itemListEl.appendChild(row);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function loadCurrentHousehold() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const profile = await loadUserProfile(user.uid);
    state.householdId = profile.householdId || null;

    accountEl.textContent = `UID: ${user.uid}`;

    if (!state.householdId) {
      householdEl.textContent = 'Inget hushåll kopplat ännu.';
      itemListEl.innerHTML = '<div class="empty">Skapa eller gå med i hushåll först.</div>';
      inviteCodeEl.textContent = '-';
      if (state.unsubscribeItems) state.unsubscribeItems();
      return;
    }

    const householdSnap = await firebase.firestore().collection('households').doc(state.householdId).get();
    if (!householdSnap.exists) {
      householdEl.textContent = 'Hushållet hittades inte.';
      return;
    }

    const household = householdSnap.data();
    householdEl.textContent = `${household.name} · Medlemmar: ${(household.memberUids || []).length}`;

    if (state.unsubscribeItems) state.unsubscribeItems();
    state.unsubscribeItems = firebase.firestore()
      .collection('households').doc(state.householdId)
      .collection('items')
      .orderBy('createdAt', 'desc')
      .onSnapshot((snapshot) => {
        renderItems(snapshot.docs);
      }, (err) => {
        setStatus('Kunde inte läsa varor: ' + err.message, true);
      });
  }

  function bindUi() {
    $('createHouseholdBtn').addEventListener('click', createHousehold);
    $('createInviteBtn').addEventListener('click', createInviteCode);
    $('joinBtn').addEventListener('click', joinHouseholdByCode);
    $('addItemBtn').addEventListener('click', addItem);
    $('loginBtn').addEventListener('click', signInAnon);
  }

  window.addEventListener('load', function () {
    bindUi();

    firebase.auth().onAuthStateChanged(async (user) => {
      state.user = user;
      if (!user) {
        accountEl.textContent = 'Inte inloggad';
        return;
      }
      setStatus('Inloggad.');
      await loadCurrentHousehold();
    });
  });
})();
