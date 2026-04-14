Matlist Max Realtime

Detta är realtime-versionen av appen.

Nyheter i denna version:
- BroadcastChannel + storage-event för direkt sync mellan öppna flikar/fönster på samma enhet
- Firebase Firestore onSnapshot för live-sync mellan olika enheter
- Offline-cache i localStorage
- Köad molnsync när nätet försvinner och automatisk återupptagning när nätet kommer tillbaka
- Hushållsläge med personlig hushållskod och byte mellan hushåll

För bästa resultat:
- Kör via webbserver eller GitHub Pages
- Logga in med Google för molnsync
- Använd Firestore Rules och Storage Rules som matchar hushållsmodellen
