PsykopatKontroll – cloud sync paket

Filer:
- index.html
- script.js
- cloud-sync.js
- style.css
- firebase-config.js
- firestore.rules
- storage.rules

Gör så här:
1. Ladda upp alla filer till samma mapp i repo:t.
2. I Firebase:
   - Authentication -> aktivera Google
   - Firestore Database -> skapa databas
   - Firestore Rules -> klistra in firestore.rules
3. Lägg till domänen clarkeblood1-cmd.github.io under Authorized domains.
4. Commit + vänta på GitHub Pages.

5. I Firebase Storage -> Rules -> klistra in storage.rules om du vill att bilder också ska synka.
6. Kör Ctrl+F5 efter upload.
