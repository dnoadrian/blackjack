# 🎪 Live-Multiplayer & Globales Leaderboard einrichten

Um echtes Online-Matchmaking und eine globale Bestenliste mit echten Spielern freizuschalten, nutzen wir **Google Firebase** (eine kostenlose, sichere Cloud-Datenbank von Google).

Da das Spiel komplett in deinem Browser läuft, benötigst du **keinen eigenen Server** und musst **kein Node.js installieren**. Du musst lediglich ein kostenloses Firebase-Projekt erstellen und die Zugangsdaten eintragen.

Hier ist die Schritt-für-Schritt-Anleitung (Dauer: ca. 2 Minuten):

---

### Schritt 1: Firebase-Projekt erstellen
1. Gehe auf die [Firebase Console](https://console.firebase.google.com/) und melde dich mit deinem Google-Konto an.
2. Klicke auf **"Projekt hinzufügen"** (Add Project).
3. Gib dem Projekt einen Namen (z. B. `grand-royale-blackjack`) und klicke auf "Weiter".
4. Deaktiviere Google Analytics für dieses Projekt (wird nicht benötigt) und klicke auf **"Projekt erstellen"**.

---

### Schritt 2: Web-App registrieren & Config kopieren
1. Klicke im Dashboard deines neuen Projekts auf das **Web-Symbol** (`</>`), um eine Web-App hinzuzufügen.
2. Gib der Web-App einen Namen (z. B. `blackjack-client`) und klicke auf **"App registrieren"**.
3. Dir wird nun ein JavaScript-Codeblock angezeigt. Suche nach dem `firebaseConfig`-Objekt, das so aussieht:
   ```javascript
   const firebaseConfig = {
     apiKey: "DEIN_API_KEY",
     authDomain: "DEIN_PROJEKT.firebaseapp.com",
     projectId: "DEIN_PROJEKT",
     storageBucket: "DEIN_PROJEKT.appspot.com",
     messagingSenderId: "DEINE_SENDER_ID",
     appId: "DEINE_APP_ID"
   };
   ```
4. Kopiere dieses Objekt.

---

### Schritt 3: Config in `app.js` eintragen
1. Öffne die Datei [app.js](file:///C:/Users/adria/.gemini/antigravity/scratch/blackjack-casino/app.js) in einem Texteditor deiner Wahl.
2. Ganz oben in der Datei findest du den Bereich:
   ```javascript
   // --- FIREBASE CONFIGURATION ---
   const firebaseConfig = null; // Hier eintragen!
   ```
3. Ersetze `null` mit deinem kopierten Objekt, sodass es so aussieht:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     // ... restliche Daten
   };
   ```
4. Speichere die Datei.

---

### Schritt 4: Cloud Firestore Datenbank aktivieren
1. Gehe in der Firebase Console im linken Menü auf **"Firestore Database"**.
2. Klicke auf **"Datenbank erstellen"** (Create Database).
3. Wähle den Speicherort der Datenbank (z. B. `eur3 (europe-west)`) und klicke auf "Weiter".
4. Wähle **"Im Testmodus starten"** (Start in test mode) aus. Dies erlaubt es deinem Spiel, Spielstände zu lesen und zu schreiben. Klicke auf **"Erstellen"**.

---

### 🎮 Fertig! Wie spiele ich jetzt mit anderen?
1. Öffne die Datei [index.html](file:///C:/Users/adria/.gemini/antigravity/scratch/blackjack-casino/index.html) in deinem Browser.
2. Öffne dieselbe Datei in einem **zweiten, privaten Browser-Fenster** (Inkognito-Modus) oder auf einem **anderen Computer/Smartphone**, um einen zweiten Spieler zu simulieren.
3. Ändere im Profil-Editor der beiden Fenster die Namen (z. B. "Max" und "Anna").
4. Klicke in beiden Fenstern gleichzeitig beim gleichen Tisch auf **"Jetzt Spielen"**.
5. Das Matchmaking erkennt beide Spieler in Echtzeit, verbindet sie am selben Tisch und ihr spielt live gegeneinander gegen den Dealer!
