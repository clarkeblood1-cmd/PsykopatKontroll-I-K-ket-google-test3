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


GitHub images-mapp:
- Lägg produktbilder i /images i samma GitHub Pages-repo.
- Appen provar automatiskt:
  images/<normaliserat-namn>.png
  images/<normaliserat-namn>.jpg
  images/<normaliserat-namn>.webp
  images/<normaliserat-namn>.svg
- Exempel: "Mjölk" => images/mjolk.png eller images/mjolk.svg
- Fallback: images/default.svg
