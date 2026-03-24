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


v8 öäå-support:
- Appen provar både originalnamn och normaliserat namn.
- Exempel: 'Mjölk' provar både images/mjölk.png och images/mjolk.png.
- Samma för ägg/agg, smör/smor, bröd/brod.
- Fortfarande fallback till images/default.svg.
