PsykopatKontroll – cloud sync paket

Filer:
- index.html
- script.js
- cloud-sync.js
- style.css
- firebase-config.js
- firestore.rules

Gör så här:
1. Ladda upp alla filer till samma mapp i repo:t.
2. I Firebase:
   - Authentication -> aktivera Google
   - Firestore Database -> skapa databas
   - Firestore Rules -> klistra in firestore.rules
3. Lägg till domänen clarkeblood1-cmd.github.io under Authorized domains.
4. Commit + vänta på GitHub Pages.

5. I Firebase Storage:
   - skapa bucket
   - Storage Rules -> klistra in storage.rules
6. Bilder som laddas upp i appen sparas nu i Firebase Storage under users/{uid}/images/.
