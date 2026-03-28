PsykopatKontroll – hushåll + molnsynk paket

Filer:
- index.html
- script.js
- cloud-sync.js
- style.css
- firebase-config.js
- firestore.rules
- storage.rules

Nytt i denna version:
- Delning av hushåll via kod eller länk
- Flera användare i samma hushåll
- Säkrade Firestore rules
- Delad sync mellan mobil och dator

Gör så här:
1. Ladda upp alla filer till samma mapp i repo:t.
2. I Firebase:
   - Authentication -> aktivera Google
   - Firestore Database -> skapa databas
   - Firestore Rules -> klistra in firestore.rules
   - Storage Rules -> klistra in storage.rules
3. Lägg till din GitHub Pages-domän under Authorized domains.
4. Commit + vänta på GitHub Pages.
5. Logga in med Google. Första användaren får ett eget hushåll automatiskt.
6. Kopiera kod eller länk och öppna den på mobil/dator för att gå med i samma hushåll.
