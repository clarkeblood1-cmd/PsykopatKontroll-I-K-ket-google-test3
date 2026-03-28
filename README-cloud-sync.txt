PsykopatKontroll – hushållssynk paket (fixad direktversion)

Ladda upp alla filer i denna ZIP till samma mapp i GitHub Pages.

I Firebase:
1. Authentication -> aktivera Google
2. Firestore Database -> klistra in firestore.rules
3. Storage -> klistra in storage.rules
4. Authorized domains -> lägg till din GitHub Pages-domän

Vad som är fixat:
- Delat hushåll via kod/länk
- Flera användare i samma hushåll
- Säker Firestore-struktur (state i household, inte öppet)
- Molnsynk mellan mobil och dator
- Ikoner 192 + 512 med i paketet

Obs:
- Delad hushållsbild i Storage är avstängd i rules just nu
- Vanlig data syncar via Firestore
