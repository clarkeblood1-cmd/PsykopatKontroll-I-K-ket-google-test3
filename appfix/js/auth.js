import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

    async function buildHouseholdInfo(id){
      const householdRef = doc(db, householdCollection, id);
      const householdSnap = await getDoc(householdRef);
      if(!householdSnap.exists()) return null;
      const data = householdSnap.data() || {};
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

  async function showJoinCode(){
    if(!currentHousehold?.id) return;
    try{
      const householdSnap = await getDoc(doc(db, householdCollection, currentHousehold.id));
      const data = householdSnap.exists() ? (householdSnap.data() || {}) : {};
      const code = data.joinCode || userProfile?.personalJoinCode || "saknas";
      window.alert(`Din hushållskod: ${code}`);
      setStatus(`Hushållskoden visades: ${code}`);
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
    buttons.push('<button class="btn secondary" id="joinHouseholdByCodeBtn">Gå med via kod</button>');
    if(currentHousehold.isOwner){
      buttons.push('<button class="btn secondary" id="showJoinCodeBtn">Visa hushållskod</button>');
    }
    buttons.push('<button class="btn secondary" id="forceCloudSyncBtn">Synka nu</button>');
    buttons.push('<button class="btn ghost" id="googleLogoutBtn">Logga ut</button>');

    setActions(`
      <span class="authBadge">${user.displayName || user.email || "Google-konto"}</span>
      <span class="authBadge ${accountBadgeClass}">${currentHousehold.isOwner ? (isPersonalHousehold ? "Mitt hushåll" : "Ägare") : "Medlem"}</span>
      ${userProfile?.lastJoinedHouseholdId && isPersonalHousehold ? `<span class="authMini">Sparat delat hushåll: ${savedSharedName}</span>` : ""}
      ${buttons.join("")}
    `);
    document.getElementById("forceCloudSyncBtn")?.addEventListener("click", () => uploadState().then(() => setStatus("Synkat till molnet.")));
    document.getElementById("googleLogoutBtn")?.addEventListener("click", startLogout);
    document.getElementById("switchToMineBtn")?.addEventListener("click", switchToPersonalHousehold);
    document.getElementById("switchToSavedHouseholdBtn")?.addEventListener("click", switchToLastJoinedHousehold);
    document.getElementById("joinHouseholdByCodeBtn")?.addEventListener("click", joinHouseholdByCode);
    document.getElementById("showJoinCodeBtn")?.addEventListener("click", showJoinCode);
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
