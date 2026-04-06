
(function(){
  function humanizeAuthError(err){
    const code = err && err.code ? String(err.code) : "";
    if(code.includes("popup-blocked")) return "Popup blockerad";
    if(code.includes("popup-closed-by-user")) return "Popup stängdes";
    if(code.includes("unauthorized-domain")) return "Domänen är inte godkänd i Firebase";
    if(code.includes("operation-not-allowed")) return "Google-login är inte aktiverat i Firebase";
    if(code.includes("network-request-failed")) return "Nätverksfel";
    return (err && (err.message || err.code)) ? String(err.message || err.code) : "Okänt fel";
  }

  const providerFactory = () => {
    if (typeof firebase === "undefined" || !firebase.auth) return null;
    return new firebase.auth.GoogleAuthProvider();
  };

  function escapeHtmlAuth(str){
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  const AuthUI = {
    ready: false,
    currentUser: null,

    isConfigured(){
      const cfg = window.MATLIST_FIREBASE_CONFIG || {};
      return !!(cfg.apiKey && cfg.projectId && cfg.appId && cfg.authDomain);
    },

    renderStatus(text, mode){
      const textEl = document.getElementById("googleLoginStatusText");
      const dotEl = document.getElementById("googleLoginStatusDot");
      if(textEl) textEl.textContent = text;
      if(dotEl){
        dotEl.className = "firebaseDot";
        if(mode) dotEl.classList.add(mode);
      }
    },

    async init(){
      if(typeof firebase === "undefined" || !firebase.auth){
        this.renderStatus("Firebase Auth saknas", "error");
        return;
      }

      if(!this.isConfigured()){
        this.renderStatus("Fyll i firebase-config.js först", "off");
        return;
      }

      try{
        if(!firebase.apps.length){
          firebase.initializeApp(window.MATLIST_FIREBASE_CONFIG || {});
        }

        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);

        this.ready = true;

        try{
          await firebase.auth().getRedirectResult();
        }catch(err){
          console.error("Redirect login error", err);
          this.renderStatus("Google-login fel: " + humanizeAuthError(err), "error");
        }

        if(firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous){
          await firebase.auth().signOut();
        }

        firebase.auth().onAuthStateChanged((user) => {
          const googleUser = user && !user.isAnonymous ? user : null;
          this.currentUser = googleUser;
          this.renderManageLoginPanel();
        });

        this.renderManageLoginPanel();
      }catch(err){
        console.error("Auth init error", err);
        this.renderStatus("Google-login kunde inte starta", "error");
      }
    },

    async signIn(){
      if(!this.ready){
        this.renderStatus("Firebase är inte klart", "error");
        return;
      }

      const provider = providerFactory();
      if(!provider){
        this.renderStatus("Google provider saknas", "error");
        return;
      }

      provider.setCustomParameters({ prompt: "select_account" });
      this.renderStatus("Loggar in med Google…", "working");

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
      try{
        if(isMobile){
          await firebase.auth().signInWithRedirect(provider);
          return;
        }
        await firebase.auth().signInWithPopup(provider);
      }catch(err){
        console.warn("Google popup login failed", err);
        try{
          await firebase.auth().signInWithRedirect(provider);
        }catch(err2){
          console.error("Google login failed", err2);
          this.renderStatus("Google-login fel: " + humanizeAuthError(err2 || err), "error");
        }
      }
    },

    async signOut(){
      try{
        this.renderStatus("Loggar ut…", "working");
        await firebase.auth().signOut();
        this.currentUser = null;
        this.renderManageLoginPanel();
        this.renderStatus("Alltid utloggad", "off");
      }catch(err){
        console.error("Logout failed", err);
        this.renderStatus("Kunde inte logga ut", "error");
      }
    },

    renderManageLoginPanel(){
      const root = document.getElementById("manageGoogleLoginPanel");
      if(!root) return;

      const user = this.currentUser;
      const name = user?.displayName || "Google-konto";
      const email = user?.email || "";
      const photo = user?.photoURL || "";

      root.innerHTML = user ? `
        <div class="googleLoginUserCard">
          <div class="googleLoginUserMain">
            <div class="googleLoginAvatarWrap">
              ${photo ? `<img class="googleLoginAvatar" src="${escapeHtmlAuth(photo)}" alt="${escapeHtmlAuth(name)}">` : `<div class="googleLoginAvatar googleLoginAvatarFallback">G</div>`}
            </div>
            <div class="googleLoginUserText">
              <div class="googleLoginUserName">${escapeHtmlAuth(name)}</div>
              <div class="googleLoginUserEmail">${escapeHtmlAuth(email || "Inget e-postnamn")}</div>
            </div>
          </div>
          <div class="googleLoginActions">
            <button class="btn secondary" type="button" onclick="GoogleLoginUI.signOut()">Logga ut</button>
          </div>
        </div>
      ` : `
        <div class="googleLoginGuestCard">
          <div class="googleLoginGuestText">
            <div class="googleLoginGuestTitle">Google är alltid utloggad</div>
            <div class="googleLoginGuestSub">Login sparas inte. Efter omladdning eller ny öppning blir du automatiskt utloggad.</div>
          </div>
          <div class="googleLoginActions">
            <button class="btn primary googleLoginBtn" type="button" onclick="GoogleLoginUI.signIn()">Logga in tillfälligt</button>
          </div>
        </div>
      `;

      this.renderStatus(user ? "Tillfälligt inloggad" : "Alltid utloggad", user ? "working" : "off");
    }
  };

  window.GoogleLoginUI = AuthUI;

  document.addEventListener("DOMContentLoaded", function(){
    AuthUI.init();
  });
})();
