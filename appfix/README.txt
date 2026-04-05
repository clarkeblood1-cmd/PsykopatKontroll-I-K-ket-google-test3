Matlist uppdelad version

Filer:
- index.html = Hemmet
- kopa-lista.html
- lagg-till.html
- recept.html
- hantera.html
- css/styles.css
- js/shared.js
- js/index.js
- js/kopa-lista.js
- js/lagg-till.js
- js/recept.js
- js/hantera.js

Notering:
- Hemmet behåller eget antal.
- Mallen synkar inte längre över qty vid uppstart.
Firebase:
1. Öppna js/firebase-config.js
2. Fyll i dina Firebase-uppgifter
3. Aktivera Authentication -> Anonymous i Firebase Console
4. Skapa Firestore Database
5. Ladda upp filerna igen
6. Appen kan då synca mellan enheter via Firebase


Google login i Hantera:
1. Gå till Firebase Console
2. Authentication -> Sign-in method
3. Aktivera Google
4. Lägg till din domän i Authorized domains
5. Fyll i apiKey, authDomain, projectId och appId i js/firebase-config.js
6. Öppna Hantera -> Login
