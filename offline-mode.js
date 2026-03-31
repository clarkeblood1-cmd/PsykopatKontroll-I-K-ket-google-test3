(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function applyOfflineUi() {
    const status = byId('authStatus');
    const help = byId('firebaseHelp');
    const info = byId('offlineInfo');
    const loginBtn = byId('googleLoginBtn');
    const logoutBtn = byId('googleLogoutBtn');
    const offlineBtn = byId('offlineModeBtn');
    const exitOfflineBtn = byId('exitOfflineModeBtn');

    if (status) status.textContent = 'Offline-läge aktivt';
    if (help) help.style.display = 'none';
    if (info) info.style.display = '';
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (offlineBtn) offlineBtn.style.display = 'none';
    if (exitOfflineBtn) exitOfflineBtn.style.display = '';

    try { document.body.classList.add('offline-mode'); } catch (e) {}
    try { if (typeof window.render === 'function') window.render(); } catch (e) {}
  }

  function clearOfflineUi() {
    const info = byId('offlineInfo');
    const offlineBtn = byId('offlineModeBtn');
    const exitOfflineBtn = byId('exitOfflineModeBtn');
    if (info) info.style.display = 'none';
    if (offlineBtn) offlineBtn.style.display = '';
    if (exitOfflineBtn) exitOfflineBtn.style.display = 'none';
    try { document.body.classList.remove('offline-mode'); } catch (e) {}
  }

  window.cloudSyncDisabled = localStorage.getItem('offline_mode') === '1';

  window.startOfflineMode = function startOfflineMode() {
    localStorage.setItem('offline_mode', '1');
    window.cloudSyncDisabled = true;
    applyOfflineUi();
  };

  window.exitOfflineMode = function exitOfflineMode() {
    localStorage.removeItem('offline_mode');
    window.cloudSyncDisabled = false;
    clearOfflineUi();
    window.location.reload();
  };

  window.addEventListener('DOMContentLoaded', function () {
    if (window.cloudSyncDisabled) applyOfflineUi();
  });
})();
