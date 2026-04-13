import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
    let householdId = userSnap.exists() ? userSnap.data()?.householdId : null;

    if(householdId){
      const householdRef = doc(db, householdCollection, householdId);
      const householdSnap = await getDoc(householdRef);
      if(householdSnap.exists()){
        const data = householdSnap.data() || {};
        return { id: householdId, ...data, isOwner: data.ownerUid === currentUid };
      }
    }

    householdId = currentUid;
    const householdRef = doc(db, householdCollection, householdId);
    const householdData = {
      name: options.defaultHouseholdName || `${user.displayName || "Mitt"} hushåll`,
      ownerUid: currentUid,
      ownerName: user.displayName || user.email || "Ägare",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(householdRef, householdData, { merge: true });
    await setDoc(userRef, {
      householdId,
      householdRole: "owner",
      email: user.email || "",
      displayName: user.displayName || "",
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { id: householdId, ...householdData, isOwner: true };
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
    const roleText = currentHousehold.isOwner ? "Ditt hushåll" : "Delat hushåll";
    const ownerText = currentHousehold.isOwner ? "du är ägare" : `ägare: ${currentHousehold.ownerName || currentHousehold.ownerUid || "okänd"}`;
    const label = currentHousehold.name || "Hushåll";
    setHousehold(`Hushåll: ${label} · ${roleText} · ${ownerText}`);

    const accountBadgeClass = currentHousehold.isOwner ? "owner" : "member";
    setActions(`
      <span class="authBadge">${user.displayName || user.email || "Google-konto"}</span>
      <span class="authBadge ${accountBadgeClass}">${currentHousehold.isOwner ? "Mitt hushåll" : "Medlem"}</span>
      <button class="btn secondary" id="forceCloudSyncBtn">Synka nu</button>
      <button class="btn ghost" id="googleLogoutBtn">Logga ut</button>
    `);
    document.getElementById("forceCloudSyncBtn")?.addEventListener("click", () => uploadState().then(() => setStatus("Synkat till molnet.")));
    document.getElementById("googleLogoutBtn")?.addEventListener("click", startLogout);
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

  async function syncInitialState(){
    const localState = window.getSerializableState ? window.getSerializableState() : null;
    const remoteState = await downloadState();
    const localUpdated = Number(localState?.meta?.updatedAt || 0);
    const remoteUpdated = Number(remoteState?.meta?.updatedAt || 0);

    if(remoteState && remoteUpdated > localUpdated && window.replaceAppState){
      window.replaceAppState(remoteState);
      setStatus("Inloggad. Molndata laddad.");
    } else {
      await uploadState();
      setStatus("Inloggad. Lokal data synkad till molnet.");
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
