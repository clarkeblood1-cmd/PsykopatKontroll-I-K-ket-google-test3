// Din config
window.firebaseConfig = {
  apiKey: "AIzaSyBXqoG8ZaDbuY-KJwS5ClMovgy8Pb3vw54",
  authDomain: "psykopatkontroll.firebaseapp.com",
  projectId: "psykopatkontroll",
  storageBucket: "psykopatkontroll.appspot.com",
  messagingSenderId: "89089537506",
  appId: "1:89089537506:web:573383e0e2ebf4ded035bb",
  measurementId: "G-Z8XRTGK419"
};

// 🔥 STARTA FIREBASE (detta saknas hos dig)
firebase.initializeApp(window.firebaseConfig);

// 🔑 Gör global access
window.auth = firebase.auth();
window.db = firebase.firestore();

console.log("✅ Firebase init klart");
