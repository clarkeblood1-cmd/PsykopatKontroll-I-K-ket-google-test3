
(function () {
  'use strict';

  function patchAddItem() {
    if (typeof window.addItem !== 'function' || typeof window.buildItemFromForm !== 'function') return false;

    window.addItem = function addItem(saveToHome = false) {
      const formData = window.buildItemFromForm();
      if (!formData) return;

      const { item, file } = formData;

      const saveItem = function (imgData) {
        if (imgData) item.img = imgData;
        window.saveQuickTemplate(item);
        if (saveToHome) window.saveHomeItem(item);
        window.save();
        window.render();
        window.clearInputs(true);
        if (typeof window.setActiveKitchenPage === 'function') window.setActiveKitchenPage('quick');
      };

      if (!file) {
        saveItem('');
        return;
      }

      window.resizeImage(file, async function (imgData) {
        if (imgData && window.cloudHousehold && window.cloudHousehold.isReady()) {
          try {
            const cloudUrl = await window.cloudHousehold.uploadDataUrlImage(imgData, file.name || item.name);
            saveItem(cloudUrl);
            return;
          } catch (error) {
            console.error('Cloud image upload error:', error);
            alert('Kunde inte ladda upp bild till molnet. Sparar lokalt i stället.');
          }
        }
        saveItem(imgData);
      });
    };

    window.addItemAndUse = function addItemAndUse() {
      window.addItem(true);
    };

    return true;
  }

  function waitForFunctions() {
    if (patchAddItem()) return;
    setTimeout(waitForFunctions, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForFunctions);
  } else {
    waitForFunctions();
  }
})();
