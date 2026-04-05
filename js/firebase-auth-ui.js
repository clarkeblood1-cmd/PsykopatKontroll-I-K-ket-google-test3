
(function(){
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

        this.ready = true;

        firebase.auth().onAuthStateChanged((user) => {
          this.currentUser = user || null;
          this.renderManageLoginPanel();
        });

        this.renderManageLoginPanel();
      }catch(err){
        console.error("Auth init error", err);
        this.renderStatus("Google login kunde inte starta", "error");
      }
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

      try{
        await firebase.auth().signInWithPopup(provider);
      }catch(err){
        console.warn("Popup login failed, trying redirect", err);
        try{
          await firebase.auth().signInWithRedirect(provider);
        }catch(err2){
          console.error("Google login failed", err2);
          this.renderStatus("Inloggning misslyckades", "error");
        }
      }
    },

    async signOut(){
      try{
        this.renderStatus("Loggar ut…", "working");
        await firebase.auth().signOut();
        this.renderStatus("Utloggad", "off");
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
            <div class="googleLoginGuestTitle">Logga in med Google</div>
            <div class="googleLoginGuestSub">Använd ditt Google-konto för att koppla din Matlist till Firebase.</div>
          </div>
          <div class="googleLoginActions">
            <button class="btn primary googleLoginBtn" type="button" onclick="GoogleLoginUI.signIn()">Fortsätt med Google</button>
          </div>
        </div>
      `;

      this.renderStatus(user ? "Inloggad med Google" : "Inte inloggad", user ? "ready" : "off");
    }
  };

  window.GoogleLoginUI = AuthUI;

  document.addEventListener("DOMContentLoaded", function(){
    AuthUI.init();
  });
})();
