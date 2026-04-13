MATLIST MED GOOGLE-LOGIN (FIREBASE)

Den här versionen fungerar fortfarande lokalt/offline.
Google-login och molnsynk aktiveras när du fyller i:
js/firebase-config.js

Gör så här:
1. Skapa ett Firebase-projekt
2. Aktivera Authentication -> Google
3. Aktivera Firestore Database
4. Lägg till din domän i Authentication -> Settings -> Authorized domains
5. Fyll i js/firebase-config.js

Filer som lagts till:
- js/firebase-config.js
- js/auth.js

OBS:
- Utan Firebase-config fungerar appen lokalt som vanligt
- Med config kan användaren logga in med Google och synka state till Firestore
