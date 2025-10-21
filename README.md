# telegram-web-client

Statisches, rein clientseitiges Beispiel für einen Telegram‑Client (TDLib/WASM) mit Docker Compose + Caddy für HTTPS auf https://localhost/.

Wichtig
- Dieses Projekt läuft komplett im Browser. API_ID/API_HASH und Telefonnummer/Codes verbleiben lokal.
- Caddy verwendet `tls internal` für localhost; du musst das Root‑Zertifikat der Caddy-CA in deinem System vertrauen, damit der Browser das Zertifikat für https://localhost/ akzeptiert.

Inhalt
- index.html
- app.js
- styles.css
- docker-compose.yml
- Caddyfile

Aufsetzen (lokal)
1) Dateien in ein Verzeichnis kopieren.

2) Mit Docker Compose starten:
   docker-compose up -d

3) Seite öffnen:
   https://localhost/

CA exportieren und vertrauen (falls Browser warnt)
1) Root-CA aus Container kopieren:
   docker cp telegram-caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt

2) Root-CA ins System importieren (Beispiele):

   macOS:
     sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ./caddy-root.crt

   Debian/Ubuntu:
     sudo cp ./caddy-root.crt /usr/local/share/ca-certificates/caddy-root.crt
     sudo update-ca-certificates

   Fedora/CentOS:
     sudo cp ./caddy-root.crt /etc/pki/ca-trust/source/anchors/
     sudo update-ca-trust

   Windows (PowerShell als Administrator):
     certutil -addstore -f "Root" .\caddy-root.crt

3) Browser neu starten (falls nötig).

tdweb per CDN
- index.html lädt tdweb via jsDelivr:
  https://cdn.jsdelivr.net/gh/tdlight-team/tdweb@latest/tdweb.js
- Empfehlenswert: feste Version angeben statt @latest, falls du reproduzierbare Builds willst.
- Einige tdweb-Builds erwarten die .wasm-Datei relativ zum Script-Pfad. Falls Probleme auftreten, lade tdweb.js + tdweb.wasm lokal in das Projektverzeichnis und passe index.html an.

GitHub Repository erstellen & Dateien pushen
Option A: Mit gh CLI (wenn du es nutzt)
1) git init
2) git checkout -b main
3) git add .
4) git commit -m "Initial commit"
5) gh repo create nobodyfrm/telegram-web-client --private --source=. --remote=origin --push

Option B: Manuell (Web UI + git)
1) Erstelle ein neues privaten Repository auf github.com (Name: telegram-web-client) falls noch nicht vorhanden.
2) Lokal:
   git init
   git checkout -b main
   git add .
   git commit -m "Initial commit"
   git remote add origin git@github.com:nobodyfrm/telegram-web-client.git
   git push -u origin main

HTTPS remote (statt SSH):
   git remote add origin https://github.com/nobodyfrm/telegram-web-client.git
   git push -u origin main

Starten & testen lokal mit Docker
- docker-compose up -d
- Öffne https://localhost/
- Wenn Browser warnt: exportiere caddy-root.crt (siehe README) und importiere/vertrau es in deinem OS.

Hinweise & Erweiterungen
- Session/Persistenz: TDLib speichert DB; in WASM-Builds kann das in IndexedDB landen, je nach Build. Wenn du Persistenz brauchst, passe TDLib-Parameter oder die WASM-Build an.
- Sicherer Einsatz: Für produktive/öffentliche Nutzung ist ein Backend und Sicherheitskonzept erforderlich.
- Wenn du möchtest, pinne ich die tdweb-Version auf eine konkrete Release‑URL oder lade die tdweb-Dateien lokal in das Projektverzeichnis.

Viel Erfolg!