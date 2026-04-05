// Fyll i dina Firebase-uppgifter här.
// Om du lämnar allt tomt fortsätter appen använda bara localStorage.
window.MATLIST_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBXqoG8ZaDbuY-KJwS5ClMovgy8Pb3vw54",
  authDomain: "psykopatkontroll.firebaseapp.com",
  projectId: "psykopatkontroll",
  storageBucket: "psykopatkontroll.firebasestorage.app",
  messagingSenderId: "89089537506",
  appId: "1:89089537506:web:573383e0e2ebf4ded035bb"
};

// Valfri egen sökväg i Firestore.
// Tips: byt familyId till något eget om flera ska dela samma lista.
window.MATLIST_FIREBASE_OPTIONS = {
  collectionName: "matlistApps",
  familyId: "default-family",
  documentId: "sharedState"
};
