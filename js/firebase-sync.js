
(function(){
  const emptyConfig = () => {
    const cfg = window.MATLIST_FIREBASE_CONFIG || {};
    return !cfg.apiKey || !cfg.projectId || !cfg.appId;
  };

  const stateTextEl = () => document.getElementById("firebaseStatusText");
  const dotEl = () => document.getElementById("firebaseStatusDot");
  const syncBtnEl = () => document.getElementById("firebaseSyncBtn");
  const pullBtnEl = () => document.getElementById("firebasePullBtn");

  function humanizeError(err){
    const code = err && err.code ? String(err.code) : "";
    if(code.includes("permission-denied")) return "Ingen behörighet i Firestore";
    if(code.includes("operation-not-allowed")) return "Anonymous Auth är avstängd";
    if(code.includes("unauthenticated")) return "Inte inloggad";
    if(code.includes("unavailable")) return "Firebase är tillfälligt nere";
    if(code.includes("failed-precondition")) return "Firestore är inte klart";
    return (err && (err.message || err.code)) ? String(err.message || err.code) : "Okänt fel";
  }

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

    buildDocRef(householdId){
      if(!this.db || !householdId) return null;
      return this.db.collection("households").doc(householdId).collection("appData").doc("sharedState");
    },

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
        if(!firebase.apps.length){
          firebase.initializeApp(cfg);
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.enabled = true;
        setStatus("Loggar in…", "working");
        setButtons(true);

        this.user = this.auth.currentUser || null;
        if(!this.user){
          try{
            const authResult = await this.auth.signInAnonymously();
            this.user = authResult.user || this.auth.currentUser || null;
          }catch(err){
            this.user = this.auth.currentUser || null;
            if(!this.user) throw err;
          }
        }

        const householdId = (typeof window.getCurrentFamilyId === "function" ? window.getCurrentFamilyId() : "") || "";
        this.docRef = this.buildDocRef(householdId);
        this.ready = true;

        if(!householdId){
          setStatus("Välj hushåll först", "off");
          setButtons(false);
          return;
        }

        setStatus("Firebase klar", "ready");
        setButtons(false);
      }catch(err){
        console.error("Firebase init error:", err);
        setStatus("Firebase fel: " + humanizeError(err), "error");
        setButtons(true);
      }
    },

    async pullRemoteState(){
      if(!this.ready){
        return false;
      }
      if(!this.docRef){
        setStatus("Välj hushåll först", "off");
        return false;
      }
      try{
        setStatus("Hämtar molndata…", "working");
        const snap = await this.docRef.get();
        if(!snap.exists){
          setStatus("Ingen molndata än", "off");
          return false;
        }
        const data = snap.data() || {};
        if(!data.state){
          setStatus("Molndata tom", "off");
          return false;
        }
        if(typeof window.applyImportedState === "function"){
          window.applyImportedState(data.state, { source: "firebase" });
        }
        setStatus("Molndata hämtad", "ready");
        return true;
      }catch(err){
        console.error("Firebase pull error:", err);
        setStatus("Hämtning misslyckades: " + humanizeError(err), "error");
        return false;
      }
    },

    async pushState(force){
      if(!this.ready){
        return false;
      }
      if(!this.docRef || typeof window.getExportableState !== "function"){
        setStatus("Välj hushåll först", "off");
        return false;
      }
      try{
        const exportState = window.getExportableState();
        const householdId = (typeof window.getCurrentFamilyId === "function" ? window.getCurrentFamilyId() : "") || "";
        if(!householdId){
          setStatus("Välj hushåll först", "off");
          return false;
        }
        setStatus(force ? "Laddar upp…" : "Synkar…", "working");
        await this.docRef.set({
          state: exportState,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: this.user ? (this.user.uid || this.user.email || "anonymous") : "anonymous",
          householdId: householdId,
          appVersion: "firebase-household-rules-v1"
        }, { merge: true });
        setStatus("Synkad med Firebase", "ready");
        return true;
      }catch(err){
        console.error("Firebase push error:", err);
        setStatus("Sync misslyckades: " + humanizeError(err), "error");
        return false;
      }
    },

    schedulePush(){
      if(!this.ready || !this.docRef) return;
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.pushState(false), 900);
    },

    async changeFamilyId(householdId, pullAfter){
      try{
        this.docRef = this.buildDocRef(householdId || "");
        if(!householdId){
          setStatus("Inget hushåll valt", "off");
          return true;
        }
        if(pullAfter){
          await this.pullRemoteState();
        }else{
          setStatus("Bytte hushåll", "ready");
        }
        return true;
      }catch(err){
        console.error("changeFamilyId error:", err);
        setStatus("Kunde inte byta hushåll: " + humanizeError(err), "error");
        return false;
      }
    }
  };

  window.FirebaseSync = api;

  document.addEventListener("DOMContentLoaded", function(){
    api.init().then(async function(){
      if(api.ready && api.docRef){
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
