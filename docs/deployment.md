# Deployment und Betrieb

## Railway

1. Repository mit einem Railway-Service verbinden und das enthaltene Dockerfile verwenden.
2. Ein persistentes Volume nach `/app/data` mounten. Es muss für den Container-Nutzer `node` (UID 1000) schreibbar sein. Der Healthcheck muss vor Freigabe erfolgreich sein; bei Berechtigungsfehlern den Mount entsprechend vorbereiten.
3. Eine HTTPS-Domain erzeugen und `PUBLIC_ORIGIN=https://<deine-domain>` **ohne abschließenden Slash** setzen.
4. `NODE_ENV=production`, `DATABASE_PATH=/app/data/psyche.sqlite` und `TRUST_PROXY=1` setzen. `TRUST_PROXY=1` setzt genau einen vertrauenswürdigen Proxy vor dem Dienst voraus. Nicht für einen direkt öffentlich erreichbaren Node-Prozess übernehmen.
5. Optional `OPENAI_API_KEY` und `OPENAI_MODEL` als serverseitige Variablen setzen. Ohne diese bleibt die App im geführten Modus nutzbar.
6. Eine Instanz betreiben. SQLite-Datei und In-Memory-Anfragelimits sind auf diesen Betrieb ausgelegt.
7. Nach Deployment `/api/health`, Registrierung, Abmeldung, erneute Anmeldung, Reflexion, Export und Löschung prüfen. Einen Neustart auslösen und Persistenz mit einem Testkonto bestätigen.

`PORT` wird von Railway vorgegeben; der Dienst bindet an `0.0.0.0`. `railway.json` legt den Docker-Build, Healthcheck und Neustartverhalten fest. Das Repository erzeugt keine Domain und provisioniert kein Volume selbst.

## Docker lokal

```sh
docker build -t roman-psyche .
docker volume create psyche-data
docker run --rm -p 3000:3000 \
  -e NODE_ENV=development \
  -e PUBLIC_ORIGIN=http://localhost:3000 \
  -v psyche-data:/app/data roman-psyche
```

Für Produktion `NODE_ENV=production`, HTTPS-Origin und einen HTTPS-Reverse-Proxy verwenden. Produktionscookies sind `Secure`, `HttpOnly`, `SameSite=Strict` und hostgebunden. Ohne HTTPS kann der Browser diese Sitzung nicht verwenden.

## Backup, Löschung und Logs

- Datenbank, WAL-Dateien und Backups enthalten sensible Klartext-Reflexionen. Restriktive Dateirechte, verschlüsselte Volumes/Backups und begrenzter Betreiberzugriff sind erforderlich. Die App liefert keine eigene Verschlüsselung ruhender Daten.
- Konsistente SQLite-Backups per SQLite-Backup-API oder Volume-Snapshot bei gestopptem Dienst erstellen. Eine einzelne laufende `.sqlite`-Datei ohne ihr WAL ist kein verlässliches Backup.
- Backup-Retention, Wiederherstellung und Löschfristen vor der Nutzerfreigabe definieren. Löschen in der App entfernt die Datensätze aus der aktiven Datenbank, nicht automatisch aus bereits erstellten Backups. Wiederherstellungen müssen Löschentscheidungen berücksichtigen.
- Der Server protokolliert keine Reflexionsinhalte, Passwörter oder Provider-Fehlerantworten. Reverse-Proxy- und Infrastruktur-Logs entsprechend konfigurieren.
- Healthchecks prüfen den Datenbankzugriff, nicht die optionale KI. Bei Provider-Problemen zeigt die Reflexion den geführten Ersatzmodus an.
- Bei kompromittierten Sitzungen alle Einträge der Tabelle `sessions` im administrativen Wartungsfenster löschen. Das meldet alle Nutzer ab.
- Bei Versionswechseln vollständiges Backup erstellen und Tests ausführen. Diese erste Version legt ihr Schema idempotent an; spätere Schemaänderungen benötigen explizite Migrationen.

## Noch durch den Betreiber zu erledigen

Öffentliche Domain, Infrastrukturzugriff, Backups, Verantwortlichen-/Kontaktangaben und eine passende Datenschutzerklärung werden nicht aus dem Quellcode erfunden. Es wurde kein öffentliches Deployment durchgeführt. E-Mail-Verifikation und Wiederherstellung sind nicht enthalten; vor größerer Freigabe implementieren oder den begrenzten Pilotbetrieb transparent erklären.

## Automatische Tests in GitHub aktivieren

`docs/ci-workflow.yml` ist eine fertige Vorlage für Formatprüfung, API-/Datenbanktests und Desktop-/Mobil-Browsertests. Sie liegt bewusst außerhalb von `.github/workflows/`: Der hier verwendete GitHub-App-Zugang darf Workflow-Dateien nicht anlegen. Eine berechtigte Person kann sie nach `.github/workflows/ci.yml` kopieren und committen. Bis dahin laufen keine automatischen GitHub-Checks; die genannten Prüfungen wurden lokal ausgeführt.
