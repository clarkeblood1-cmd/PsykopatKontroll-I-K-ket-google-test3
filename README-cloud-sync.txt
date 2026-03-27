PsykopatKontroll – household + cloud sync paket

Filer:
- index.html
- script.js
- cloud-sync.js
- style.css
- firebase-config.js
- firestore.rules
- storage.rules

Nytt:
- delat hushåll med kod
- create / join / leave household
- hushållets data sparas i households/{householdId}/appData/main
- personliga gamla data ligger kvar under users/{uid}/appData/main tills man går med i hushåll
- bilder laddas upp till Firebase Storage under households/{householdId}/images/ när man är med i hushåll

Gör så här:
1. Ladda upp alla filer till samma mapp i repo:t.
2. I Firebase Authentication: aktivera Google.
3. I Firestore Database: skapa databas och klistra in firestore.rules.
4. I Firebase Storage: skapa bucket och klistra in storage.rules.
5. Lägg till din GitHub Pages-domän under Authorized domains.
6. Commit + vänta på GitHub Pages.
