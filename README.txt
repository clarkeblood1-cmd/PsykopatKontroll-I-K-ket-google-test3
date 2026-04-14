MATLIST MAX

Detta är en ren "max version" av projektet.

INGÅR
- Offline först
- Google-login via Firebase
- Realtidssynk mellan enheter
- Hushåll med egen kod
- Byt tillbaka till ditt hushåll
- Öppna senast sparat delat hushåll igen
- Exportera backup till JSON
- Importera backup från JSON
- Nollställ lokal data på enheten

FILER
- index.html = Hemmet
- kopa-lista.html = Köplista
- lagg-till.html = Lägg till
- recept.html = Recept
- hantera.html = Hantera

FIREBASE
Din Firebase-config är redan ifylld i js/firebase-config.js.
Om du ska köra på en egen domän måste den domänen vara godkänd i Firebase Authentication.
Firestore behöver också vara aktiverat.

TIPS
- Kör appen från en vanlig webbserver eller GitHub Pages.
- Öppna inte bara filer direkt som file:// om du vill att allt ska fungera stabilt med service worker.
- Använd Exportera backup innan större ändringar.
