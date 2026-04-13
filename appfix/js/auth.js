import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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


function generateJoinCode(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for(let i=0;i<6;i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function normalizeJoinCode(value){
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function renderNoConfig(){
  setStatus("Google-login är förberedd men inte aktiverad ännu. Lägg in din Firebase-config i js/firebase-config.js.");
  setHousehold("Hushåll: lokalt läge");
  setActions(`
    <span class="authBadge warn">Firebase config saknas</span>
  `);
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
  let currentUid = null;
  let syncTimer = null;
  let initialSyncDone = false;
  let stateRef = null;
  let currentHousehold = null;
  let userProfile = null;
  let currentUser = null;
  let householdMembers = [];

  function getStateRef(){
    if(useHouseholds && currentHousehold?.id){
      return doc(db, householdCollection, currentHousehold.id, "app", "state");
    }
    return doc(db, userCollection, currentUid, "app", "state");
  }

  async function ensureHousehold(user){
    if(!useHouseholds || !currentUid) return null;
    const userRef = doc(db, userCollection, currentUid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? (userSnap.data() || {}) : {};
    userProfile = userData;
    let householdId = userData.householdId || null;

    async function ensureHouseholdJoinCode(id, data = {}, fallbackCode = ""){
      const existingCode = normalizeJoinCode(data.joinCode);
      if(existingCode){
        if(data.joinCodeNormalized !== existingCode){
          await setDoc(doc(db, householdCollection, id), {
            joinCode: existingCode,
            joinCodeNormalized: existingCode,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
        return { ...data, joinCode: existingCode, joinCodeNormalized: existingCode };
      }

      const nextCode = normalizeJoinCode(fallbackCode) || generateJoinCode();
      await setDoc(doc(db, householdCollection, id), {
        joinCode: nextCode,
        joinCodeNormalized: nextCode,
        updatedAt: serverTimestamp()
      }, { merge: true });
      return { ...data, joinCode: nextCode, joinCodeNormalized: nextCode };
    }

    async function buildHouseholdInfo(id){
      const householdRef = doc(db, householdCollection, id);
      const householdSnap = await getDoc(householdRef);
      if(!householdSnap.exists()) return null;
      let data = householdSnap.data() || {};
      data = await ensureHouseholdJoinCode(id, data, id === currentUid ? (userData.personalJoinCode || "") : "");
      return { id, ...data, isOwner: data.ownerUid === currentUid };
    }

    async function ensurePersonalHousehold(){
      const personalId = currentUid;
      const householdRef = doc(db, householdCollection, personalId);
      const personalJoinCode = userProfile?.personalJoinCode || generateJoinCode();
      const householdData = {
        name: options.defaultHouseholdName || `${user.displayName || "Mitt"} hushåll`,
        ownerUid: currentUid,
        ownerName: user.displayName || user.email || "Ägare",
        joinCode: personalJoinCode,
        joinCodeNormalized: normalizeJoinCode(personalJoinCode),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(householdRef, householdData, { merge: true });
      await setDoc(userRef, {
        householdId: personalId,
        personalHouseholdId: personalId,
        personalJoinCode,
        householdRole: "owner",
        email: user.email || "",
        displayName: user.displayName || "",
        updatedAt: serverTimestamp()
      }, { merge: true });
      userProfile = { ...userProfile, householdId: personalId, personalHouseholdId: personalId, personalJoinCode, householdRole: "owner", email: user.email || "", displayName: user.displayName || "" };
      return { id: personalId, ...householdData, isOwner: true };
    }

    if(householdId){
      const existing = await buildHouseholdInfo(householdId);
      if(existing){
        if(!userData.personalHouseholdId){
          await setDoc(userRef, { personalHouseholdId: currentUid, updatedAt: serverTimestamp() }, { merge: true });
          userProfile = { ...userProfile, personalHouseholdId: currentUid };
        }
        return existing;
      }
    }

    return await ensurePersonalHousehold();
  }

  async function switchHousehold(targetHouseholdId, meta = {}){
    if(!useHouseholds || !currentUid || !targetHouseholdId) return;
    const userRef = doc(db, userCollection, currentUid);
    const previousHousehold = currentHousehold;
    const leavingShared = previousHousehold && previousHousehold.id !== currentUid && targetHouseholdId === currentUid;
    const updates = {
      householdId: targetHouseholdId,
      personalHouseholdId: currentUid,
      updatedAt: serverTimestamp()
    };

    if(leavingShared && previousHousehold?.id){
      updates.lastJoinedHouseholdId = previousHousehold.id;
      updates.lastJoinedHouseholdName = previousHousehold.name || "Delat hushåll";
    }

    if(meta.clearLastJoined){
      updates.lastJoinedHouseholdId = "";
      updates.lastJoinedHouseholdName = "";
    }

    await setDoc(userRef, updates, { merge: true });
    userProfile = { ...(userProfile || {}), ...Object.fromEntries(Object.entries(updates).filter(([_,v]) => typeof v !== 'object')) };

    currentHousehold = await ensureHousehold(currentUser);
    stateRef = getStateRef();
    await loadHouseholdMembers();
    renderHousehold(currentUser);
    await syncInitialState({ preferRemoteOnHouseholdSwitch: true });
  }

  async function switchToPersonalHousehold(){
    if(!currentUid) return;
    try{
      setStatus("Byter till ditt hushåll...");
      await switchHousehold(currentUid);
      setStatus("Du är tillbaka i ditt hushåll. Senaste delade hushåll är sparat.");
    }catch(err){
      console.error(err);
      setStatus("Det gick inte att byta tillbaka till ditt hushåll just nu.");
    }
  }

  async function switchToLastJoinedHousehold(){
    const targetId = userProfile?.lastJoinedHouseholdId;
    if(!targetId || !currentUid) return;
    try{
      setStatus("Öppnar ditt sparade delade hushåll...");
      await switchHousehold(targetId);
      setStatus("Du är nu inne i ditt sparade delade hushåll igen.");
    }catch(err){
      console.error(err);
      setStatus("Det gick inte att öppna ditt sparade delade hushåll. Kontrollera att det fortfarande finns kvar.");
    }
  }

  async function getOrCreateJoinCodeForHousehold(){
    if(!currentHousehold?.id) return "";
    const householdRef = doc(db, householdCollection, currentHousehold.id);
    const householdSnap = await getDoc(householdRef);
    const data = householdSnap.exists() ? (householdSnap.data() || {}) : {};
    let code = normalizeJoinCode(data.joinCode || userProfile?.personalJoinCode || "");

    if(!code){
      code = generateJoinCode();
      await setDoc(householdRef, {
        joinCode: code,
        joinCodeNormalized: code,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else if(data.joinCodeNormalized !== code){
      await setDoc(householdRef, {
        joinCode: code,
        joinCodeNormalized: code,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    currentHousehold = { ...currentHousehold, joinCode: code, joinCodeNormalized: code };
    if(currentHousehold.id === currentUid){
      await setDoc(doc(db, userCollection, currentUid), {
        personalJoinCode: code,
        updatedAt: serverTimestamp()
      }, { merge: true });
      userProfile = { ...(userProfile || {}), personalJoinCode: code };
    }
    return code;
  }

  async function copyJoinCode(){
    if(!currentHousehold?.id) return;
    try{
      const code = await getOrCreateJoinCodeForHousehold();
      if(!code){
        setStatus("Det finns ingen hushållskod att kopiera ännu.");
        return;
      }
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(code);
        setStatus(`Hushållskoden ${code} kopierades.`);
      } else {
        window.prompt("Kopiera hushållskoden här:", code);
        setStatus(`Hushållskoden visas så att du kan kopiera den: ${code}`);
      }
    }catch(err){
      console.error(err);
      setStatus("Det gick inte att kopiera hushållskoden just nu.");
    }
  }

  async function renameCurrentHousehold(){
    if(!currentHousehold?.id || !currentHousehold?.isOwner) return;
    const currentName = currentHousehold.name || "Mitt hushåll";
    const nextName = String(window.prompt("Nytt namn på hushållet:", currentName) || "").trim().slice(0, 60);
    if(!nextName || nextName === currentName) return;
    try{
      await setDoc(doc(db, householdCollection, currentHousehold.id), {
        name: nextName,
        updatedAt: serverTimestamp()
      }, { merge: true });
      currentHousehold = { ...currentHousehold, name: nextName };
      if(userProfile?.lastJoinedHouseholdId === currentHousehold.id){
        userProfile = { ...userProfile, lastJoinedHouseholdName: nextName };
      }
      renderHousehold(currentUser);
      setStatus(`Hushållet heter nu ${nextName}.`);
    }catch(err){
      console.error(err);
      setStatus("Det gick inte att byta namn på hushållet just nu.");
    }
  }

  async function loadHouseholdMembers(){
    if(!useHouseholds || !currentHousehold?.id) return [];
    try{
      const q = query(collection(db, userCollection), where("householdId", "==", currentHousehold.id), limit(12));
      const snap = await getDocs(q);
      householdMembers = snap.docs.map((memberDoc) => {
        const data = memberDoc.data() || {};
        const name = data.displayName || data.email || memberDoc.id;
        const isOwner = memberDoc.id === currentHousehold.ownerUid;
        const isMe = memberDoc.id === currentUid;
        return {
          id: memberDoc.id,
          name,
          isOwner,
          isMe
        };
      }).sort((a, b) => {
        if(a.isOwner && !b.isOwner) return -1;
        if(!a.isOwner && b.isOwner) return 1;
        if(a.isMe && !b.isMe) return -1;
        if(!a.isMe && b.isMe) return 1;
        return a.name.localeCompare(b.name, "sv");
      });
      return householdMembers;
    }catch(err){
      console.error(err);
      householdMembers = [];
      return [];
    }
  }

  async function showMembers(){
    if(!currentHousehold?.id) return;
    try{
      setStatus("Läser in medlemmar...");
      const members = await loadHouseholdMembers();
      if(!members.length){
        setStatus("Inga medlemmar hittades ännu i hushållet.");
        return;
      }
      const lines = members.map((member) => {
        const tags = [];
        if(member.isOwner) tags.push("ägare");
        if(member.isMe) tags.push("du");
        return `• ${member.name}${tags.length ? ` (${tags.join(", ")})` : ""}`;
      });
      window.alert(`Medlemmar i ${currentHousehold.name || "hushållet"}:\n\n${lines.join("\n")}`);
      setStatus(`Visar ${members.length} medlem${members.length === 1 ? "" : "mar"} i hushållet.`);
    }catch(err){
      console.error(err);
      setStatus("Det gick inte att läsa hushållets medlemmar just nu.");
    }
  }

  async function leaveSharedHousehold(){
    if(!currentUid || !currentHousehold?.id) return;
    if(currentHousehold.id === currentUid){
      setStatus("Du är redan i ditt eget hushåll.");
      return;
    }
    const ok = window.confirm(`Lämna hushållet ${currentHousehold.name || currentHousehold.id} och gå tillbaka till ditt eget hushåll?`);
    if(!ok) return;
    try{
      setStatus("Lämnar delat hushåll...");
      await switchHousehold(currentUid);
      setStatus("Du lämnade det delade hushållet och kan öppna det igen senare via sparat hushåll.");
    }catch(err){
      console.error(err);
      setStatus("Det gick inte att lämna hushållet just nu.");
    }
  }

  async function showJoinCode(){
    if(!currentHousehold?.id) return;
    try{
      const code = await getOrCreateJoinCodeForHousehold();
      window.alert(`Din hushållskod: ${code || "saknas"}`);
      setStatus(`Hushållskoden visades: ${code || "saknas"}`);
    }catch(err){
      console.error(err);
      setStatus("Det gick inte att läsa hushållskoden just nu.");
    }
  }

  async function joinHouseholdByCode(){
    if(!currentUid) return;
    const raw = window.prompt("Skriv hushållskoden du vill gå med i:", "");
    const code = normalizeJoinCode(raw);
    if(!code) return;
    try{
      setStatus("Söker efter hushållskoden...");
      const q = query(collection(db, householdCollection), where("joinCodeNormalized", "==", code));
      const snap = await getDocs(q);
      if(snap.empty){
        setStatus("Ingen hushållskod hittades. Kontrollera koden och försök igen.");
        return;
      }
      const householdDoc = snap.docs[0];
      const householdData = householdDoc.data() || {};
      if(householdDoc.id === currentHousehold?.id){
        setStatus("Du är redan inne i det hushållet.");
        return;
      }
      await switchHousehold(householdDoc.id);
      setStatus(`Du gick med i hushållet ${householdData.name || householdDoc.id}.`);
    }catch(err){
      console.error(err);
      setStatus("Det gick inte att gå med i hushåll via kod just nu.");
    }
  }

  function renderHousehold(user){
    if(!useHouseholds){
      setHousehold("Hushåll: avstängt, endast personligt molnläge");
      return;
    }
    if(!currentHousehold?.id){
      setHousehold("Hushåll: inte kopplat ännu");
      return;
    }
    const isPersonalHousehold = currentHousehold.id === currentUid;
    const roleText = currentHousehold.isOwner ? (isPersonalHousehold ? "Mitt hushåll" : "Ägare") : "Delat hushåll";
    const ownerText = currentHousehold.isOwner
      ? (isPersonalHousehold ? "detta är ditt eget hushåll" : "du äger detta hushåll")
      : `ägare: ${currentHousehold.ownerName || currentHousehold.ownerUid || "okänd"}`;
    const label = currentHousehold.name || "Hushåll";
    const savedSharedName = userProfile?.lastJoinedHouseholdName || "senaste delade hushåll";
    setHousehold(`Hushåll: ${label} · ${roleText} · ${ownerText}`);

    const accountBadgeClass = currentHousehold.isOwner ? "owner" : "member";
    const buttons = [];
    if(!isPersonalHousehold){
      buttons.push('<button class="btn secondary" id="switchToMineBtn">Till mitt hushåll</button>');
    }
    if(isPersonalHousehold && userProfile?.lastJoinedHouseholdId){
      buttons.push(`<button class="btn secondary" id="switchToSavedHouseholdBtn">Öppna sparat hushåll</button>`);
    }
    if(!isPersonalHousehold){
      buttons.push('<button class="btn secondary" id="leaveSharedHouseholdBtn">Lämna hushåll</button>');
    }
    buttons.push('<button class="btn secondary" id="joinHouseholdByCodeBtn">Gå med via kod</button>');
    buttons.push('<button class="btn secondary" id="showMembersBtn">Medlemmar</button>');
    if(currentHousehold.isOwner){
      buttons.push('<button class="btn secondary" id="showJoinCodeBtn">Visa hushållskod</button>');
      buttons.push('<button class="btn secondary" id="copyJoinCodeBtn">Kopiera kod</button>');
      buttons.push('<button class="btn secondary" id="renameHouseholdBtn">Byt hushållsnamn</button>');
    }
    buttons.push('<button class="btn secondary" id="forceCloudSyncBtn">Synka nu</button>');
    buttons.push('<button class="btn ghost" id="googleLogoutBtn">Logga ut</button>');

    const memberSummary = householdMembers.length
      ? householdMembers.slice(0, 4).map((member) => {
          if(member.isOwner) return `${member.name} (ägare)`;
          if(member.isMe) return `${member.name} (du)`;
          return member.name;
        }).join(" · ")
      : "Läser in medlemmar...";

    setActions(`
      <span class="authBadge">${user.displayName || user.email || "Google-konto"}</span>
      <span class="authBadge ${accountBadgeClass}">${currentHousehold.isOwner ? (isPersonalHousehold ? "Mitt hushåll" : "Ägare") : "Medlem"}</span>
      <span class="authMini">Medlemmar: ${memberSummary}</span>
      ${userProfile?.lastJoinedHouseholdId && isPersonalHousehold ? `<span class="authMini">Sparat delat hushåll: ${savedSharedName}</span>` : ""}
      ${buttons.join("")}
    `);
    document.getElementById("forceCloudSyncBtn")?.addEventListener("click", () => uploadState().then(() => setStatus("Synkat till molnet.")));
    document.getElementById("googleLogoutBtn")?.addEventListener("click", startLogout);
    document.getElementById("switchToMineBtn")?.addEventListener("click", switchToPersonalHousehold);
    document.getElementById("switchToSavedHouseholdBtn")?.addEventListener("click", switchToLastJoinedHousehold);
    document.getElementById("leaveSharedHouseholdBtn")?.addEventListener("click", leaveSharedHousehold);
    document.getElementById("joinHouseholdByCodeBtn")?.addEventListener("click", joinHouseholdByCode);
    document.getElementById("showJoinCodeBtn")?.addEventListener("click", showJoinCode);
    document.getElementById("copyJoinCodeBtn")?.addEventListener("click", copyJoinCode);
    document.getElementById("renameHouseholdBtn")?.addEventListener("click", renameCurrentHousehold);
    document.getElementById("showMembersBtn")?.addEventListener("click", showMembers);
  }

  async function uploadState(){
    if(!currentUid || !options.enableCloudSync || !window.getSerializableState) return;
    const payload = window.getSerializableState();
    payload.meta ||= {};
    payload.meta.updatedAt = Date.now();
    payload.meta.cloudEnabled = true;
    if(currentHousehold?.id){
      payload.meta.householdId = currentHousehold.id;
      payload.meta.householdOwnerUid = currentHousehold.ownerUid || null;
      payload.meta.householdIsOwner = !!currentHousehold.isOwner;
    }
    await setDoc(stateRef || getStateRef(), payload, { merge: true });
  }

  async function downloadState(){
    if(!currentUid) return null;
    const snap = await getDoc(stateRef || getStateRef());
    return snap.exists() ? snap.data() : null;
  }

  async function syncInitialState(optionsArg = {}){
    const localState = window.getSerializableState ? window.getSerializableState() : null;
    const remoteState = await downloadState();
    const localUpdated = Number(localState?.meta?.updatedAt || 0);
    const remoteUpdated = Number(remoteState?.meta?.updatedAt || 0);

    const preferRemote = !!optionsArg.preferRemoteOnHouseholdSwitch;

    if(remoteState && (preferRemote || remoteUpdated > localUpdated) && window.replaceAppState){
      window.replaceAppState(remoteState);
      setStatus(preferRemote ? "Hushåll bytt. Molndata laddad." : "Inloggad. Molndata laddad.");
    } else {
      await uploadState();
      setStatus(preferRemote ? "Hushåll bytt. Lokal data synkad till valt hushåll." : "Inloggad. Lokal data synkad till molnet.");
    }
    initialSyncDone = true;
  }

  function scheduleSync(){
    if(!currentUid || !initialSyncDone || !options.enableCloudSync) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      uploadState().catch(err => {
        console.error("Cloud sync failed", err);
        setStatus("Inloggad, men synk misslyckades tillfälligt.");
      });
    }, 700);
  }

  async function startLogin(){
    try{
      setStatus("Öppnar Google-login...");
      if(options.popupRedirectFallback){
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    }catch(err){
      console.error(err);
      setStatus("Google-login misslyckades. Kontrollera tillåtna domäner i Firebase.");
    }
  }

  async function startLogout(){
    try{
      await signOut(auth);
    }catch(err){
      console.error(err);
      setStatus("Det gick inte att logga ut just nu.");
    }
  }

  window.matlistCloud = { scheduleSync, uploadState };

  onAuthStateChanged(auth, async (user) => {
    if(!user){
      currentUid = null;
      currentUser = null;
      userProfile = null;
      initialSyncDone = false;
      currentHousehold = null;
      stateRef = null;
      updateMetaCloudEnabled(false);
      setStatus("Inte inloggad. Appen fungerar fortfarande lokalt.");
      setHousehold(useHouseholds ? "Hushåll: logga in för att se om det är ditt hushåll" : "Hushåll: avstängt");
      setActions(`
        <button class="btn primary" id="googleLoginBtn">Logga in med Google</button>
        <span class="authMini">Molnsynk aktiveras efter login</span>
      `);
      document.getElementById("googleLoginBtn")?.addEventListener("click", startLogin);
      return;
    }

    currentUid = user.uid;
    currentUser = user;
    updateMetaCloudEnabled(true);

    try{
      currentHousehold = await ensureHousehold(user);
      stateRef = getStateRef();
      await loadHouseholdMembers();
      renderHousehold(user);
      await syncInitialState();
    }catch(err){
      console.error(err);
      setStatus("Inloggad, men hushåll eller första molnsynken misslyckades. Kontrollera Firestore-regler och config.");
      setHousehold("Hushåll: kunde inte läsas in just nu");
      setActions(`
        <span class="authBadge">${user.displayName || user.email || "Google-konto"}</span>
        <button class="btn ghost" id="googleLogoutBtn">Logga ut</button>
      `);
      document.getElementById("googleLogoutBtn")?.addEventListener("click", startLogout);
    }
  });
}
