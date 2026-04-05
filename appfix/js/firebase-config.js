// Fyll i dina Firebase-uppgifter här.
// Om du lämnar allt tomt fortsätter appen använda bara localStorage.
window.MATLIST_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Valfri egen sökväg i Firestore.
// Tips: byt familyId till något eget om flera ska dela samma lista.
window.MATLIST_FIREBASE_OPTIONS = {
  collectionName: "matlistApps",
  familyId: "default-family",
  documentId: "sharedState"
};
