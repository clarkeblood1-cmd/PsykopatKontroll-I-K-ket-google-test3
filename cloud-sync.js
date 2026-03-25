
(function () {
  let authReady = false;
  let currentUser = null;

  function el(sel) {
    return document.querySelector(sel);
  }

  function setVisible(selector, show) {
    const node = el(selector);
    if (node) node.style.display = show ? '' : 'none';
  }

  function updateAuthUI(user) {
    currentUser = user || null;
    authReady = true;

    const authStatus = document.getElementById('authStatus');
    const help = document.getElementById('firebaseHelp');
    const loginBtn = document.getElementById('googleLoginBtn');
    const logoutBtn = document.getElementById('googleLogoutBtn');
    const appLogoutBtn = document.getElementById('appLogoutBtn');

    if (user) {
      setVisible('.auth-panel', false);
      setVisible('.page', true);

      if (authStatus) authStatus.textContent = `Inloggad som ${user.email || user.displayName || 'Google-användare'}`;
      if (help) help.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (appLogoutBtn) appLogoutBtn.style.display = 'inline-block';

      window.currentUser = user;
      window.authReady = true;
      return;
    }

    setVisible('.auth-panel', true);
    setVisible('.page', false);

    if (authStatus) authStatus.textContent = 'Inte inloggad';
    if (help) help.style.display = '';
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (appLogoutBtn) appLogoutBtn.style.display = 'none';

    window.currentUser = null;
    window.authReady = true;
  }

  function waitForFirebase(callback, tries = 0) {
    if (window.firebase && firebase.auth) {
      callback();
      return;
    }
    if (tries > 120) {
      const authStatus = document.getElementById('authStatus');
      if (authStatus) authStatus.textContent = 'Firebase saknas';
      setVisible('.auth-panel', true);
      setVisible('.page', false);
      return;
    }
    setTimeout(() => waitForFirebase(callback, tries + 1), 100);
  }

  window.loginWithGoogle = function loginWithGoogle() {
    if (!window.firebase || !firebase.auth) {
      alert('Firebase Authentication är inte laddad.');
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    firebase.auth().signInWithPopup(provider).catch((error) => {
      console.error('Google login error:', error);
      // fallback for browsers where popup is blocked
      firebase.auth().signInWithRedirect(provider).catch((redirectError) => {
        console.error('Google redirect error:', redirectError);
        alert('Google-login misslyckades.');
      });
    });
  };

  window.logoutGoogle = function logoutGoogle() {
    if (!window.firebase || !firebase.auth) return;
    firebase.auth().signOut().catch((error) => {
      console.error('Logout error:', error);
      alert('Kunde inte logga ut.');
    });
  };

  window.requireLogin = function requireLogin() {
    if (!authReady) {
      alert('Vänta lite, kontrollerar inloggning...');
      return false;
    }
    if (!currentUser) {
      alert('Du måste vara inloggad');
      return false;
    }
    return true;
  };

  document.addEventListener('DOMContentLoaded', function () {
    setVisible('.auth-panel', false);
    setVisible('.page', false);

    waitForFirebase(function () {
      firebase.auth().getRedirectResult().catch((error) => {
        console.error('Redirect login error:', error);
      });

      firebase.auth().onAuthStateChanged(function (user) {
        updateAuthUI(user);
      });
    });
  });
})();
