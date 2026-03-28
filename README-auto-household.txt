PsykopatKontroll – auto skapa hushåll direkt

Det här paketet gör:
- skapar eget hushåll automatiskt direkt efter Google-inloggning
- sparar delad appdata i households/{householdId}/state/main
- laddar upp bilder till Firebase Storage under households/{householdId}/images/
- sparar bildlänken i Firestore
- använder members-subcollection för rättigheter

Gör så här:
1. Ladda upp alla filer till samma GitHub Pages-mapp.
2. Klistra in firestore.rules i Firebase Firestore Rules och publicera.
3. Klistra in storage.rules i Firebase Storage Rules och publicera.
4. Aktivera Google under Authentication.
5. Gör hård uppdatering av sidan efter uppladdning.

Obs:
- första inloggningen skapar hushåll automatiskt
- om en användare öppnar en länk med ?join=HOUSEHOLD_ID försöker appen gå med i det hushållet
