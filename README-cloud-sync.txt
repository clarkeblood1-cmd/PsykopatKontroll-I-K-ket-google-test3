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
   - Storage -> aktivera Firebase Storage
   - Storage Rules -> klistra in storage.rules
3. Lägg till domänen clarkeblood1-cmd.github.io under Authorized domains.
4. Commit + vänta på GitHub Pages.

5. Bilder laddas nu upp till Firebase Storage när du är inloggad. Äldre base64-bilder flyttas automatiskt till molnet första gången appen öppnas.

6. Manuellt uppladdade bilder kan nu hittas automatiskt i Firebase Storage. Appen testar bl.a. users/<uid>/item-images, users/<uid>/images, users/<uid>/auto-images, shared-images och auto-images med flera namnvarianter.
