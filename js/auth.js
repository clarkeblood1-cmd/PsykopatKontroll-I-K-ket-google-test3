import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const config = window.MATLIST_FIREBASE_CONFIG || {};
const options = window.MATLIST_FIREBASE_OPTIONS || {};
const statusEl = document.getElementById("authStatus");
const actionsEl = document.getElementById("authActions");
const hasConfig = !!(config.apiKey && config.authDomain && config.projectId && config.appId);

function setStatus(text){ if(statusEl) statusEl.textContent = text; }
function setActions(html){ if(actionsEl) actionsEl.innerHTML = html; }
function updateMetaCloudEnabled(enabled){
  if(window.state){
    window.state.meta ||= {};
    window.state.meta.cloudEnabled = !!enabled;
    localStorage.setItem(window.STORAGE_KEY, JSON.stringify(window.state));
  }
}

function renderNoConfig(){
  setStatus("Google-login är förberedd men inte aktiverad ännu. Lägg in din Firebase-config i js/firebase-config.js.");
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
  let currentUid = null;
  let syncTimer = null;
  let initialSyncDone = false;

  async function uploadState(){
    if(!currentUid || !options.enableCloudSync || !window.getSerializableState) return;
    const payload = window.getSerializableState();
    payload.meta ||= {};
    payload.meta.updatedAt = Date.now();
    payload.meta.cloudEnabled = true;
    const stateRef = doc(db, "users", currentUid, "app", "state");
    await setDoc(stateRef, payload, { merge: true });
  }

  async function downloadState(){
    if(!currentUid) return null;
    const stateRef = doc(db, "users", currentUid, "app", "state");
    const snap = await getDoc(stateRef);
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
      updateMetaCloudEnabled(false);
      setStatus("Inte inloggad. Appen fungerar fortfarande lokalt.");
      setActions(`
        <button class="btn primary" id="googleLoginBtn">Logga in med Google</button>
        <span class="authMini">Molnsynk aktiveras efter login</span>
      `);
      document.getElementById("googleLoginBtn")?.addEventListener("click", startLogin);
      return;
    }

    currentUid = user.uid;
    updateMetaCloudEnabled(true);
    setActions(`
      <span class="authBadge">${user.displayName || user.email || "Google-konto"}</span>
      <button class="btn secondary" id="forceCloudSyncBtn">Synka nu</button>
      <button class="btn ghost" id="googleLogoutBtn">Logga ut</button>
    `);
    document.getElementById("forceCloudSyncBtn")?.addEventListener("click", () => uploadState().then(() => setStatus("Synkat till molnet.")));
    document.getElementById("googleLogoutBtn")?.addEventListener("click", startLogout);

    try{
      await syncInitialState();
    }catch(err){
      console.error(err);
      setStatus("Inloggad, men första molnsynken misslyckades. Kontrollera Firestore-regler och config.");
    }
  });
}
