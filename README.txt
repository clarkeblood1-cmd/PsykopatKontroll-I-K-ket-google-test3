Matlist Firebase Realtime v2

Detta är en ren ZIP-version byggd från appfix med tydligare Firebase-struktur.

Ny struktur:
- users/{uid}
- households/{householdId}
- households/{householdId}/state/main

Vad som är förbättrat:
- tydligare hushållsmodell
- aktivt hushåll sparas som activeHouseholdId
- sparade hushåll i savedHouseholds
- hushållsmedlemmar läses från household-dokumentet
- state sparas i state/main i stället för app/state
- lokal cache + realtime-sync finns kvar

Filer i denna ZIP:
- FIRESTORE_RULES.txt
- STORAGE_RULES.txt
- FIREBASE_STRUCTURE_EXAMPLE.json

Viktigt:
- kör via webbserver eller GitHub Pages, inte file://
- kontrollera Authorized domains i Firebase Authentication
- om äldre data redan finns i Firestore kan du behöva flytta state från app/state till state/main
