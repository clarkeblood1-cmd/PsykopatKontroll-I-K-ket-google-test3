import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const config = window.MATLIST_FIREBASE_CONFIG || {};
const options = window.MATLIST_FIREBASE_OPTIONS || {};
const statusEl = document.getElementById("authStatus");
const actionsEl = document.getElementById("authActions");
const householdEl = document.getElementById("authHousehold");
const hasConfig = !!(config.apiKey && config.authDomain && config.projectId && config.appId);

function setStatus(text){ if(statusEl) statusEl.textContent = text; }
function setActions(html){ if(actionsEl) actionsEl.innerHTML = html; }
function setHousehold(text){ if(householdEl) householdEl.textContent = text; }
function updateMetaCloudEnabled(enabled){
  if(window.state){
    window.state.meta ||= {};
    window.state.meta.cloudEnabled = !!enabled;
    localStorage.setItem(window.STORAGE_KEY, JSON.stringify(window.state));
  }
}
function normalizeJoinCode(value){
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}
function generateJoinCode(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for(let i=0;i<6;i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function renderNoConfig(){
  setStatus("Google-login är förberedd men inte aktiverad ännu. Lägg in din Firebase-config i js/firebase-config.js.");
  setHousehold("Hushåll: lokalt läge");
  setActions('<span class="authBadge warn">Firebase config saknas</span>');
}

if(!hasConfig){
  renderNoConfig();
} else {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  const useHouseholds = !!options.useHouseholds;
  const householdCollection = options.householdCollection || "households";
  const userCollection = options.userCollection || "users";
  const stateDocId = options.stateDocumentId || "main";
  const stateSubcollection = options.stateSubcollection || "state";
  let currentUid = null;
  let currentUser = null;
  let userProfile = null;
  let currentHousehold = null;
  let householdMembers = [];
  let stateRef = null;
  let unsubscribeStateListener = null;
  let syncTimer = null;
  let retryTimer = null;
  let retryDelay = 1200;
  let initialSyncDone = false;
  let remoteApplyInProgress = false;
  let lastAppliedRemoteAt = 0;
  let pendingSyncRequested = false;
  let syncInFlight = false;
  let isOnline = navigator.onLine !== false;

  function getSyncState(){
    const meta = window.state?.meta || {};
    return {
      isOnline,
      pendingSync: !!meta.pendingSync,
      syncError: String(meta.syncError || ""),
      lastCloudAckAt: Number(meta.lastCloudAckAt || 0),
      lastLocalChangeAt: Number(meta.lastLocalChangeAt || 0)
    };
  }
  function formatTime(ts){
    if(!ts) return "";
    try{ return new Date(ts).toLocaleTimeString("sv-SE", { hour:"2-digit", minute:"2-digit", second:"2-digit" }); }
    catch(e){ return ""; }
  }
  function updateSyncMeta(patch = {}){
    if(!window.state) return;
    window.state.meta ||= {};
    Object.assign(window.state.meta, patch);
    if(typeof window.persistStateMeta === "function") window.persistStateMeta();
  }
  function syncSummaryText(){
    const syncState = getSyncState();
    if(!syncState.isOnline) return syncState.pendingSync ? "Offline · ändringar sparade lokalt" : "Offline · bara lokal data";
    if(syncState.pendingSync) return "Synkar… lokala ändringar väntar";
    if(syncState.syncError) return "Molnsynk väntar på nytt försök";
    if(syncState.lastCloudAckAt) return `Moln sparat ${formatTime(syncState.lastCloudAckAt)}`;
    return "Molnsynk redo";
  }
  function stopRetryTimer(){ if(retryTimer){ clearTimeout(retryTimer); retryTimer = null; } }
  function scheduleRetry(){ stopRetryTimer(); retryTimer = setTimeout(() => flushSyncQueue(), retryDelay); retryDelay = Math.min(retryDelay * 2, 20000); }
  function refreshHouseholdPanel(){ if(currentUser) renderHousehold(currentUser); }
  function getUserRef(uid = currentUid){ return doc(db, userCollection, uid); }
  function getHouseholdRef(householdId){ return doc(db, householdCollection, householdId); }
  function getStateRef(){
    if(useHouseholds && currentHousehold?.id) return doc(db, householdCollection, currentHousehold.id, stateSubcollection, stateDocId);
    return doc(db, userCollection, currentUid, "app", "state");
  }
  async function readUserProfile(uid = currentUid){
    const snap = await getDoc(getUserRef(uid));
    return snap.exists() ? (snap.data() || {}) : {};
  }
  async function readHousehold(householdId){
    const snap = await getDoc(getHouseholdRef(householdId));
    if(!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() || {}) };
  }
  async function saveUserProfile(patch){
    await setDoc(getUserRef(), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    userProfile = { ...(userProfile || {}), ...patch };
  }
  async function saveHousehold(householdId, patch){
    await setDoc(getHouseholdRef(householdId), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  }
  function dedupe(arr){ return Array.from(new Set((arr || []).filter(Boolean))); }
  function householdInfoFromData(data){
    const members = dedupe(data.members || []);
    return {
      ...data,
      members,
      isOwner: (data.createdBy || data.ownerUid || "") === currentUid || data.id === currentUid,
      ownerUid: data.createdBy || data.ownerUid || null,
      ownerName: data.ownerName || data.memberProfiles?.[data.createdBy || data.ownerUid || ""]?.name || null
    };
  }
  async function ensureUserAndHousehold(user){
    const profile = await readUserProfile(user.uid);
    userProfile = profile;
    const displayName = user.displayName || profile.displayName || user.email || "Användare";
    const personalHouseholdId = profile.personalHouseholdId || user.uid;
    const activeHouseholdId = profile.activeHouseholdId || profile.householdId || personalHouseholdId;
    const personalJoinCode = normalizeJoinCode(profile.personalJoinCode) || generateJoinCode();

    let personal = await readHousehold(personalHouseholdId);
    if(!personal){
      personal = {
        id: personalHouseholdId,
        name: options.defaultHouseholdName || `${displayName}s hushåll`,
        joinCode: personalJoinCode,
        joinCodeNormalized: personalJoinCode,
        members: [user.uid],
        memberProfiles: { [user.uid]: { name: displayName, role: "owner" } },
        createdBy: user.uid,
        ownerUid: user.uid,
        ownerName: displayName,
        createdAt: serverTimestamp()
      };
      await setDoc(getHouseholdRef(personalHouseholdId), personal, { merge: true });
    } else {
      const nextMembers = dedupe([...(personal.members || []), user.uid]);
      const nextProfiles = { ...(personal.memberProfiles || {}), [user.uid]: { name: displayName, role: personalHouseholdId === user.uid ? "owner" : ((personal.memberProfiles || {})[user.uid]?.role || "member") } };
      await saveHousehold(personalHouseholdId, {
        members: nextMembers,
        memberProfiles: nextProfiles,
        ownerUid: personal.createdBy || personal.ownerUid || user.uid,
        ownerName: personal.ownerName || displayName,
        joinCode: normalizeJoinCode(personal.joinCode) || personalJoinCode,
        joinCodeNormalized: normalizeJoinCode(personal.joinCodeNormalized || personal.joinCode) || personalJoinCode
      });
      personal = { ...personal, members: nextMembers, memberProfiles: nextProfiles };
    }

    await saveUserProfile({
      email: user.email || "",
      displayName,
      personalHouseholdId,
      personalJoinCode,
      activeHouseholdId,
      householdId: activeHouseholdId,
      savedHouseholds: dedupe([...(profile.savedHouseholds || []), personalHouseholdId])
    });

    let active = await readHousehold(activeHouseholdId);
    if(!active) active = await readHousehold(personalHouseholdId);
    if(!active) active = personal;
    currentHousehold = householdInfoFromData(active);
    stateRef = getStateRef();
  }
  async function persistCurrentHouseholdMembership(displayName){
    if(!currentHousehold?.id || !currentUid) return;
    const nextMembers = dedupe([...(currentHousehold.members || []), currentUid]);
    const nextProfiles = { ...(currentHousehold.memberProfiles || {}), [currentUid]: { name: displayName || currentUser?.displayName || currentUser?.email || "Medlem", role: currentHousehold.id === currentUid ? "owner" : ((currentHousehold.memberProfiles || {})[currentUid]?.role || "member") } };
    await saveHousehold(currentHousehold.id, { members: nextMembers, memberProfiles: nextProfiles });
    currentHousehold = householdInfoFromData({ ...currentHousehold, members: nextMembers, memberProfiles: nextProfiles });
  }
  async function switchHousehold(targetHouseholdId, meta = {}){
    if(!useHouseholds || !currentUid || !targetHouseholdId) return;
    const previousHousehold = currentHousehold;
    const target = await readHousehold(targetHouseholdId);
    if(!target) throw new Error("household_not_found");
    const displayName = currentUser?.displayName || currentUser?.email || userProfile?.displayName || "Medlem";
    const nextMembers = dedupe([...(target.members || []), currentUid]);
    const nextProfiles = { ...(target.memberProfiles || {}), [currentUid]: { name: displayName, role: targetHouseholdId === currentUid ? "owner" : ((target.memberProfiles || {})[currentUid]?.role || "member") } };
    await saveHousehold(targetHouseholdId, { members: nextMembers, memberProfiles: nextProfiles });

    const savedHouseholds = dedupe([...(userProfile?.savedHouseholds || []), targetHouseholdId, currentUid]);
    const updates = {
      activeHouseholdId: targetHouseholdId,
      householdId: targetHouseholdId,
      personalHouseholdId: currentUid,
      savedHouseholds
    };
    if(previousHousehold && previousHousehold.id !== currentUid && targetHouseholdId === currentUid){
      updates.lastJoinedHouseholdId = previousHousehold.id;
      updates.lastJoinedHouseholdName = previousHousehold.name || "Delat hushåll";
    }
    if(meta.clearLastJoined){
      updates.lastJoinedHouseholdId = "";
      updates.lastJoinedHouseholdName = "";
    }
    await saveUserProfile(updates);
    currentHousehold = householdInfoFromData({ ...target, members: nextMembers, memberProfiles: nextProfiles });
    stateRef = getStateRef();
    householdMembers = [];
    renderHousehold(currentUser);
    startStateListener();
    setStatus("Byter hushåll...");
    setTimeout(async () => {
      try{ await syncInitialState({ preferRemoteOnHouseholdSwitch: true }); }
      catch(err){ console.error(err); setStatus("Hushåll bytt, men molnsynken tog längre tid än väntat."); }
    }, 30);
  }
  async function switchToPersonalHousehold(){
    if(!currentUid) return;
    try{ setStatus("Byter till ditt hushåll..."); await switchHousehold(currentUid); setStatus("Du är tillbaka i ditt hushåll. Senaste delade hushåll är sparat."); }
    catch(err){ console.error(err); setStatus("Det gick inte att byta tillbaka till ditt hushåll just nu."); }
  }
  async function switchToLastJoinedHousehold(){
    const targetId = userProfile?.lastJoinedHouseholdId;
    if(!targetId || !currentUid) return;
    try{ setStatus("Öppnar ditt sparade delade hushåll..."); await switchHousehold(targetId); setStatus("Du är nu inne i ditt sparade delade hushåll igen."); }
    catch(err){ console.error(err); setStatus("Det gick inte att öppna ditt sparade delade hushåll."); }
  }
  async function getOrCreateJoinCodeForHousehold(){
    if(!currentHousehold?.id) return "";
    const fresh = await readHousehold(currentHousehold.id);
    let code = normalizeJoinCode(fresh?.joinCode || fresh?.joinCodeNormalized || (currentHousehold.id === currentUid ? userProfile?.personalJoinCode : ""));
    if(!code) code = generateJoinCode();
    await saveHousehold(currentHousehold.id, { joinCode: code, joinCodeNormalized: code });
    currentHousehold = householdInfoFromData({ ...(fresh || currentHousehold), joinCode: code, joinCodeNormalized: code });
    if(currentHousehold.id === currentUid){
      await saveUserProfile({ personalJoinCode: code });
    }
    return code;
  }
  async function copyJoinCode(){
    if(!currentHousehold?.id) return;
    try{
      const code = await getOrCreateJoinCodeForHousehold();
      if(!code){ setStatus("Det finns ingen hushållskod att kopiera ännu."); return; }
      if(navigator.clipboard?.writeText){ await navigator.clipboard.writeText(code); setStatus(`Hushållskoden ${code} kopierades.`); }
      else { window.prompt("Kopiera hushållskoden här:", code); setStatus(`Hushållskoden visas så att du kan kopiera den: ${code}`); }
    }catch(err){ console.error(err); setStatus("Det gick inte att kopiera hushållskoden just nu."); }
  }
  async function renameCurrentHousehold(){
    if(!currentHousehold?.id || !currentHousehold?.isOwner) return;
    const currentName = currentHousehold.name || "Mitt hushåll";
    const nextName = String(window.prompt("Nytt namn på hushållet:", currentName) || "").trim().slice(0, 60);
    if(!nextName || nextName === currentName) return;
    try{ await saveHousehold(currentHousehold.id, { name: nextName }); currentHousehold = { ...currentHousehold, name: nextName }; if(userProfile?.lastJoinedHouseholdId === currentHousehold.id) userProfile = { ...userProfile, lastJoinedHouseholdName: nextName }; renderHousehold(currentUser); setStatus(`Hushållet heter nu ${nextName}.`); }
    catch(err){ console.error(err); setStatus("Det gick inte att byta namn på hushållet just nu."); }
  }
  async function loadHouseholdMembers(){
    if(!useHouseholds || !currentHousehold?.id) return [];
    try{
      const household = await readHousehold(currentHousehold.id);
      const profiles = household?.memberProfiles || {};
      const members = dedupe(household?.members || Object.keys(profiles));
      householdMembers = members.map((memberId) => {
        const profile = profiles[memberId] || {};
        const isOwner = memberId === (household?.createdBy || household?.ownerUid || currentHousehold.ownerUid);
        const isMe = memberId === currentUid;
        return { id: memberId, name: profile.name || memberId, isOwner, isMe };
      }).sort((a, b) => {
        if(a.isOwner && !b.isOwner) return -1;
        if(!a.isOwner && b.isOwner) return 1;
        if(a.isMe && !b.isMe) return -1;
        if(!a.isMe && b.isMe) return 1;
        return a.name.localeCompare(b.name, 'sv');
      });
      return householdMembers;
    }catch(err){ console.error(err); householdMembers = []; return []; }
  }
  async function showMembers(){
    if(!currentHousehold?.id) return;
    try{
      setStatus("Läser in medlemmar...");
      const members = await loadHouseholdMembers();
      if(!members.length){ setStatus("Inga medlemmar hittades ännu i hushållet."); return; }
      const lines = members.map((member) => { const tags = []; if(member.isOwner) tags.push('ägare'); if(member.isMe) tags.push('du'); return `• ${member.name}${tags.length ? ` (${tags.join(', ')})` : ''}`; });
      window.alert(`Medlemmar i ${currentHousehold.name || 'hushållet'}:

${lines.join('
')}`);
      setStatus(`Visar ${members.length} medlem${members.length === 1 ? '' : 'mar'} i hushållet.`);
    }catch(err){ console.error(err); setStatus("Det gick inte att läsa hushållets medlemmar just nu."); }
  }
  async function leaveSharedHousehold(){
    if(!currentUid || !currentHousehold?.id) return;
    if(currentHousehold.id === currentUid){ setStatus("Du är redan i ditt eget hushåll."); return; }
    const ok = window.confirm(`Lämna hushållet ${currentHousehold.name || currentHousehold.id} och gå tillbaka till ditt eget hushåll?`);
    if(!ok) return;
    try{ setStatus("Lämnar delat hushåll..."); await switchHousehold(currentUid); setStatus("Du lämnade det delade hushållet och kan öppna det igen senare via sparat hushåll."); }
    catch(err){ console.error(err); setStatus("Det gick inte att lämna hushållet just nu."); }
  }
  async function showJoinCode(){
    if(!currentHousehold?.id) return;
    try{ const code = await getOrCreateJoinCodeForHousehold(); window.alert(`Din hushållskod: ${code || 'saknas'}`); setStatus(`Hushållskoden visades: ${code || 'saknas'}`); }
    catch(err){ console.error(err); setStatus("Det gick inte att läsa hushållskoden just nu."); }
  }
  async function joinHouseholdByCode(){
    if(!currentUid) return;
    const raw = window.prompt("Skriv hushållskoden du vill gå med i:", "");
    const code = normalizeJoinCode(raw);
    if(!code) return;
    try{
      setStatus("Söker efter hushållskoden...");
      const q = query(collection(db, householdCollection), where("joinCodeNormalized", "==", code), limit(1));
      const snap = await getDocs(q);
      if(snap.empty){ setStatus("Ingen hushållskod hittades. Kontrollera koden och försök igen."); return; }
      const householdDoc = snap.docs[0];
      if(householdDoc.id === currentHousehold?.id){ setStatus("Du är redan inne i det hushållet."); return; }
      await switchHousehold(householdDoc.id);
      setStatus(`Du gick med i hushållet ${(householdDoc.data() || {}).name || householdDoc.id}.`);
    }catch(err){ console.error(err); setStatus("Det gick inte att gå med i hushåll via kod just nu."); }
  }
  function renderHousehold(user){
    if(!useHouseholds){ setHousehold("Hushåll: avstängt, endast personligt molnläge"); return; }
    if(!currentHousehold?.id){ setHousehold("Hushåll: inte kopplat ännu"); return; }
    const isPersonalHousehold = currentHousehold.id === currentUid;
    const roleText = currentHousehold.isOwner ? (isPersonalHousehold ? "Mitt hushåll" : "Ägare") : "Delat hushåll";
    const ownerText = currentHousehold.isOwner ? (isPersonalHousehold ? "detta är ditt eget hushåll" : "du äger detta hushåll") : `ägare: ${currentHousehold.ownerName || currentHousehold.ownerUid || 'okänd'}`;
    const label = currentHousehold.name || 'Hushåll';
    const savedSharedName = userProfile?.lastJoinedHouseholdName || 'senaste delade hushåll';
    setHousehold(`Hushåll: ${label} · ${roleText} · ${ownerText}`);
    const accountBadgeClass = currentHousehold.isOwner ? 'owner' : 'member';
    const buttons = [];
    if(!isPersonalHousehold) buttons.push('<button class="btn secondary" id="switchToMineBtn">Till mitt hushåll</button>');
    if(isPersonalHousehold && userProfile?.lastJoinedHouseholdId) buttons.push('<button class="btn secondary" id="switchToSavedHouseholdBtn">Öppna sparat hushåll</button>');
    if(!isPersonalHousehold) buttons.push('<button class="btn secondary" id="leaveSharedHouseholdBtn">Lämna hushåll</button>');
    buttons.push('<button class="btn secondary" id="joinHouseholdByCodeBtn">Gå med via kod</button>');
    buttons.push('<button class="btn secondary" id="showMembersBtn">Medlemmar</button>');
    if(currentHousehold.isOwner){ buttons.push('<button class="btn secondary" id="showJoinCodeBtn">Visa hushållskod</button>'); buttons.push('<button class="btn secondary" id="copyJoinCodeBtn">Kopiera kod</button>'); buttons.push('<button class="btn secondary" id="renameHouseholdBtn">Byt hushållsnamn</button>'); }
    buttons.push('<button class="btn secondary" id="forceCloudSyncBtn">Synka nu</button>');
    buttons.push('<button class="btn ghost" id="googleLogoutBtn">Logga ut</button>');
    const syncState = getSyncState();
    const syncBadgeClass = !syncState.isOnline ? 'warn' : (syncState.pendingSync || syncState.syncError ? 'member' : 'owner');
    const memberSummary = householdMembers.length ? householdMembers.slice(0,4).map((member) => member.isOwner ? `${member.name} (ägare)` : (member.isMe ? `${member.name} (du)` : member.name)).join(' · ') : 'Tryck Medlemmar';
    setActions(`
      <span class="authBadge">${user.displayName || user.email || 'Google-konto'}</span>
      <span class="authBadge ${accountBadgeClass}">${currentHousehold.isOwner ? (isPersonalHousehold ? 'Mitt hushåll' : 'Ägare') : 'Medlem'}</span>
      <span class="authMini">Medlemmar: ${memberSummary}</span>
      <span class="authBadge ${syncBadgeClass}">${!syncState.isOnline ? 'Offline' : (syncState.pendingSync ? 'Väntar på sync' : (syncState.syncError ? 'Återförsök' : 'Synkad'))}</span>
      <span class="authMini">${syncSummaryText()}</span>
      ${userProfile?.lastJoinedHouseholdId && isPersonalHousehold ? `<span class="authMini">Sparat delat hushåll: ${savedSharedName}</span>` : ''}
      ${buttons.join('')}
    `);
    document.getElementById('forceCloudSyncBtn')?.addEventListener('click', () => uploadState().then(() => setStatus('Synkat till molnet.')));
    document.getElementById('googleLogoutBtn')?.addEventListener('click', startLogout);
    document.getElementById('switchToMineBtn')?.addEventListener('click', switchToPersonalHousehold);
    document.getElementById('switchToSavedHouseholdBtn')?.addEventListener('click', switchToLastJoinedHousehold);
    document.getElementById('leaveSharedHouseholdBtn')?.addEventListener('click', leaveSharedHousehold);
    document.getElementById('joinHouseholdByCodeBtn')?.addEventListener('click', joinHouseholdByCode);
    document.getElementById('showJoinCodeBtn')?.addEventListener('click', showJoinCode);
    document.getElementById('copyJoinCodeBtn')?.addEventListener('click', copyJoinCode);
    document.getElementById('renameHouseholdBtn')?.addEventListener('click', renameCurrentHousehold);
    document.getElementById('showMembersBtn')?.addEventListener('click', showMembers);
  }
  async function uploadState(){
    if(!currentUid || !options.enableCloudSync || !window.getSerializableState) return;
    if(!isOnline) throw new Error('offline');
    const payload = window.getSerializableState();
    payload.meta ||= {};
    payload.meta.updatedAt = Date.now();
    payload.meta.cloudEnabled = true;
    payload.meta.schemaVersion = 'users-households-state-main-v2';
    if(currentHousehold?.id){
      payload.meta.householdId = currentHousehold.id;
      payload.meta.householdOwnerUid = currentHousehold.ownerUid || null;
      payload.meta.householdIsOwner = !!currentHousehold.isOwner;
    }
    payload.meta.clientId = payload.meta.clientId || window.getSerializableState?.()?.meta?.clientId || '';
    await setDoc(stateRef || getStateRef(), payload, { merge: true });
  }
  async function downloadState(){ if(!currentUid || !isOnline) return null; const snap = await getDoc(stateRef || getStateRef()); return snap.exists() ? snap.data() : null; }
  async function syncInitialState(optionsArg = {}){
    const localState = window.getSerializableState ? window.getSerializableState() : null;
    if(!isOnline){ updateSyncMeta({ pendingSync: !!window.state?.meta?.pendingSync, syncError: 'offline' }); setStatus('Offline-läge: lokal data används direkt. Molnsynk fortsätter när nät finns igen.'); refreshHouseholdPanel(); initialSyncDone = true; return; }
    const remoteState = await downloadState();
    const localUpdated = Number(localState?.meta?.updatedAt || 0);
    const remoteUpdated = Number(remoteState?.meta?.updatedAt || 0);
    const preferRemote = !!optionsArg.preferRemoteOnHouseholdSwitch;
    if(remoteState && (preferRemote || remoteUpdated > localUpdated) && window.replaceAppState){
      window.replaceAppState(remoteState);
      updateSyncMeta({ pendingSync:false, syncError:'', lastCloudAckAt: remoteUpdated || Date.now() });
      setStatus(preferRemote ? 'Hushåll bytt. Molndata laddad.' : 'Inloggad. Molndata laddad.');
    } else {
      await uploadState();
      updateSyncMeta({ pendingSync:false, syncError:'', lastCloudAckAt: Number(window.state?.meta?.updatedAt || Date.now()) });
      setStatus(preferRemote ? 'Hushåll bytt. Lokal data synkad till valt hushåll.' : 'Inloggad. Lokal data synkad till molnet.');
    }
    initialSyncDone = true;
  }
  function stopStateListener(){ if(typeof unsubscribeStateListener === 'function'){ unsubscribeStateListener(); unsubscribeStateListener = null; } }
  function startStateListener(){
    if(!currentUid || !options.enableCloudSync) return;
    const ref = stateRef || getStateRef();
    stopStateListener();
    unsubscribeStateListener = onSnapshot(ref, (snap) => {
      if(!snap.exists() || !window.replaceAppState || !window.getSerializableState) return;
      const remoteState = snap.data() || {};
      const remoteUpdated = Number(remoteState?.meta?.updatedAt || 0);
      const remoteClientId = String(remoteState?.meta?.clientId || '');
      const localState = window.getSerializableState();
      const localUpdated = Number(localState?.meta?.updatedAt || 0);
      const localClientId = String(localState?.meta?.clientId || '');
      const localPending = !!(window.state?.meta?.pendingSync);
      if(remoteApplyInProgress) return;
      if(remoteClientId && remoteClientId === localClientId && remoteUpdated <= localUpdated) return;
      if(localPending && localUpdated > remoteUpdated) return;
      if(remoteUpdated && remoteUpdated <= Math.max(localUpdated, lastAppliedRemoteAt)) return;
      remoteApplyInProgress = true;
      lastAppliedRemoteAt = remoteUpdated || Date.now();
      try{ window.replaceAppState(remoteState, { skipSave:true }); updateSyncMeta({ pendingSync:false, syncError:'', lastCloudAckAt: remoteUpdated || Date.now() }); setStatus('Live-sync: ändringar från annan enhet laddades in.'); refreshHouseholdPanel(); }
      finally { remoteApplyInProgress = false; }
    }, (err) => { console.error('Realtime listener failed', err); setStatus('Live-sync tappade kontakten tillfälligt.'); });
  }
  async function flushSyncQueue(force = false){
    if(!currentUid || !initialSyncDone || !options.enableCloudSync) return;
    if(syncInFlight) return;
    const meta = window.state?.meta || {};
    const hasPending = !!meta.pendingSync || pendingSyncRequested || force;
    if(!hasPending) return;
    if(!isOnline){ updateSyncMeta({ pendingSync:true, syncError:'offline' }); refreshHouseholdPanel(); return; }
    syncInFlight = true;
    pendingSyncRequested = false;
    stopRetryTimer();
    try{ await uploadState(); retryDelay = 1200; updateSyncMeta({ pendingSync:false, syncError:'', lastCloudAckAt: Number(window.state?.meta?.updatedAt || Date.now()) }); refreshHouseholdPanel(); }
    catch(err){ console.error('Cloud sync failed', err); pendingSyncRequested = true; updateSyncMeta({ pendingSync:true, syncError: err?.message || 'sync_failed' }); refreshHouseholdPanel(); scheduleRetry(); }
    finally { syncInFlight = false; }
  }
  function scheduleSync(){
    if(!currentUid || !initialSyncDone || !options.enableCloudSync) return;
    pendingSyncRequested = true;
    updateSyncMeta({ pendingSync:true, syncError: isOnline ? '' : 'offline' });
    refreshHouseholdPanel();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { if(remoteApplyInProgress) return; flushSyncQueue(); }, 160);
  }
  async function startLogin(){
    try{ setStatus('Öppnar Google-login...'); if(options.popupRedirectFallback) await signInWithRedirect(auth, provider); else await signInWithPopup(auth, provider); }
    catch(err){ console.error(err); setStatus('Google-login misslyckades. Kontrollera tillåtna domäner i Firebase.'); }
  }
  async function startLogout(){ try{ await signOut(auth); } catch(err){ console.error(err); setStatus('Det gick inte att logga ut just nu.'); } }
  function handleConnectionChange(nextOnline){
    isOnline = !!nextOnline;
    if(isOnline){ setStatus('Nät tillbaka. Fortsätter sync i bakgrunden...'); updateSyncMeta({ syncError:'' }); flushSyncQueue(true); }
    else { setStatus('Offline-läge aktivt. Ändringar sparas lokalt och skickas senare.'); updateSyncMeta({ pendingSync: !!window.state?.meta?.pendingSync, syncError:'offline' }); }
    refreshHouseholdPanel();
  }
  window.addEventListener('online', () => handleConnectionChange(true));
  window.addEventListener('offline', () => handleConnectionChange(false));
  window.matlistCloud = { scheduleSync, uploadState, flushSyncQueue, getSyncState };
  onAuthStateChanged(auth, async (user) => {
    if(!user){
      currentUid = null; currentUser = null; userProfile = null; initialSyncDone = false; pendingSyncRequested = false; stopRetryTimer(); currentHousehold = null; stateRef = null; stopStateListener(); updateMetaCloudEnabled(false);
      setStatus('Inte inloggad. Appen fungerar fortfarande lokalt.');
      setHousehold(useHouseholds ? 'Hushåll: logga in för att se om det är ditt hushåll' : 'Hushåll: avstängt');
      setActions('<button class="btn primary" id="googleLoginBtn">Logga in med Google</button><span class="authMini">Molnsynk aktiveras efter login</span>');
      document.getElementById('googleLoginBtn')?.addEventListener('click', startLogin);
      return;
    }
    currentUid = user.uid; currentUser = user; updateMetaCloudEnabled(true);
    try{
      await ensureUserAndHousehold(user);
      await persistCurrentHouseholdMembership(user.displayName || user.email || 'Medlem');
      stateRef = getStateRef(); householdMembers = []; renderHousehold(user); startStateListener();
      setStatus(isOnline ? 'Inloggad. Appen är klar. Synk körs i bakgrunden...' : 'Inloggad offline. Lokal data används tills nät finns igen.');
      setTimeout(async () => { try{ await syncInitialState(); } catch(err){ console.error(err); setStatus('Inloggad. Appen fungerar, men första molnsynken tog längre tid än väntat.'); } }, 30);
    }catch(err){
      console.error(err);
      setStatus('Inloggad, men hushåll eller första molnsynken misslyckades. Kontrollera Firestore-regler och config.');
      setHousehold('Hushåll: kunde inte läsas in just nu');
      setActions(`<span class="authBadge">${user.displayName || user.email || 'Google-konto'}</span><button class="btn ghost" id="googleLogoutBtn">Logga ut</button>`);
      document.getElementById('googleLogoutBtn')?.addEventListener('click', startLogout);
    }
  });
}
