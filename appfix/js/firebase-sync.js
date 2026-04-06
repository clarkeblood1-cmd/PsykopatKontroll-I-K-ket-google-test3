(function(){
  const emptyConfig = () => {
    const cfg = window.MATLIST_FIREBASE_CONFIG || {};
    return !cfg.apiKey || !cfg.projectId || !cfg.appId;
  };

  const stateTextEl = () => document.getElementById("firebaseStatusText");
  const dotEl = () => document.getElementById("firebaseStatusDot");
  const syncBtnEl = () => document.getElementById("firebaseSyncBtn");
  const pullBtnEl = () => document.getElementById("firebasePullBtn");

  function setStatus(text, mode){
    const el = stateTextEl();
    const dot = dotEl();
    if(el) el.textContent = text;
    if(dot){
      dot.className = "firebaseDot";
      if(mode) dot.classList.add(mode);
    }
  }

  function setButtons(disabled){
    const syncBtn = syncBtnEl();
    const pullBtn = pullBtnEl();
    if(syncBtn) syncBtn.disabled = !!disabled;
    if(pullBtn) pullBtn.disabled = !!disabled;
  }

  const api = {
    enabled: false,
    ready: false,
    db: null,
    auth: null,
    user: null,
    docRef: null,
    _saveTimer: null,

    async init(){
      if(emptyConfig()){
        setStatus("Firebase ej aktiverat", "off");
        setButtons(true);
        return;
      }
      try{
        if(typeof firebase === "undefined"){
          setStatus("Firebase SDK saknas", "error");
          setButtons(true);
          return;
        }

        const cfg = window.MATLIST_FIREBASE_CONFIG || {};
        const opts = window.MATLIST_FIREBASE_OPTIONS || {};
        if(!firebase.apps.length){
          firebase.initializeApp(cfg);
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.enabled = true;
        setStatus("Loggar in…", "working");
        setButtons(true);

        const authResult = await this.auth.signInAnonymously();
        this.user = authResult.user || this.auth.currentUser || null;

        const collectionName = opts.collectionName || "matlistApps";
        const familyId = opts.familyId || "default-family";
        const documentId = opts.documentId || "sharedState";

        this.docRef = this.db
          .collection(collectionName)
          .doc(familyId)
          .collection("states")
          .doc(documentId);

        this.ready = true;
        setStatus("Firebase klar", "ready");
        setButtons(false);
      }catch(err){
        console.error("Firebase init error:", err);
        setStatus("Firebase fel", "error");
        setButtons(true);
      }
    },

    async pullRemoteState(){
      if(!this.ready || !this.docRef) return false;
      try{
        setStatus("Hämtar molndata…", "working");
        const snap = await this.docRef.get();
        if(!snap.exists){
          setStatus("Ingen molndata än", "off");
          return false;
        }
        const data = snap.data() || {};
        if(!data.state) return false;
        if(typeof window.applyImportedState === "function"){
          window.applyImportedState(data.state, { source: "firebase" });
        }
        setStatus("Molndata hämtad", "ready");
        return true;
      }catch(err){
        console.error("Firebase pull error:", err);
        setStatus("Hämtning misslyckades", "error");
        return false;
      }
    },

    async pushState(force){
      if(!this.ready || !this.docRef || typeof window.getExportableState !== "function") return false;
      try{
        const exportState = window.getExportableState();
        setStatus(force ? "Laddar upp…" : "Synkar…", "working");
        await this.docRef.set({
          state: exportState,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: this.user ? this.user.uid : "anonymous",
          appVersion: "firebase-sync-v1"
        }, { merge: true });
        setStatus("Synkad med Firebase", "ready");
        return true;
      }catch(err){
        console.error("Firebase push error:", err);
        setStatus("Sync misslyckades", "error");
        return false;
      }
    },

    schedulePush(){
      if(!this.ready) return;
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.pushState(false), 900);
    }
  };

  window.FirebaseSync = api;

  document.addEventListener("DOMContentLoaded", function(){
    api.init().then(async function(){
      if(api.ready){
        await api.pullRemoteState();
      }
    });

    const syncBtn = syncBtnEl();
    const pullBtn = pullBtnEl();

    if(syncBtn){
      syncBtn.addEventListener("click", function(){
        api.pushState(true);
      });
    }
    if(pullBtn){
      pullBtn.addEventListener("click", function(){
        api.pullRemoteState();
      });
    }
  });
})();
