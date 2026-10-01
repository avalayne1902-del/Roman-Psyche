# PsycheAI · Roman-Psyche

Eine deutschsprachige Beta für strukturierte Selbstreflexion. Sie unterstützt den Ablauf **Situation → Gedanke → Emotion → Verhalten → Gegenprüfung → kleines Experiment**. Die App ist kein Arzt, Therapeut, Diagnosesystem oder Krisendienst.

## Lokal starten

Voraussetzung: **Node.js 24** (siehe `.nvmrc`). Es ist kein Build und kein API-Schlüssel erforderlich.

```sh
npm ci
cp .env.example .env
npm start
```

Danach **http://localhost:3000** öffnen und ein Konto mit einem Passwort von mindestens 12 Zeichen erstellen. Der geführte Modus funktioniert vollständig ohne externe Dienste. Er nutzt feste Reflexionshilfen, kein Sprachmodell. Das Konto und abgeschlossene Reflexionen bleiben in `data/psyche.sqlite` über Neustarts erhalten.

```sh
npm test                 # API-, Sicherheits- und Provider-Vertragstests
npm run test:e2e          # Browserabläufe; vorher npx playwright install chromium
npm run format:check
npm run format
```

## Enthalten

- Fünf responsive Ansichten: Start, Gespräch, Reflexionen, Profil und Entwicklung.
- Registrierung, Anmeldung und Abmeldung; gehashte Passwörter, widerrufbare Cookie-Sitzungen, Origin-/CSRF-Prüfung und Anfragelimits.
- Geführte Fragen vor einer Interpretation; lokale Sicherheitsprüfung vor jeder Analyse und Speicherung.
- Optionale KI-Reflexion mit Zustimmung pro Reflexion; bei Provider-Ausfällen gekennzeichneter geführter Modus.
- SQLite mit kontogetrennten Reflexionen, Stimmungseinträgen und ausdrücklich übernommenen Profil-Erkenntnissen.
- Änderbare Erkenntniszustände: `hypothesis`, `confirmed`, `partially_confirmed`, `rejected`. Bestätigung bedeutet ausschließlich die persönliche Einschätzung des Nutzers.
- Datenexport, einzelne Löschungen und Kontolöschung inklusive Sitzungen, Reflexionen und Erkenntnissen.
- Docker, Railway-Konfiguration, Healthcheck und eine GitHub-Actions-Vorlage (`docs/ci-workflow.yml`).

## Optionale KI

`OPENAI_API_KEY` und `OPENAI_MODEL` serverseitig konfigurieren. Die Modell-ID muss für das verwendete OpenAI-Projekt freigeschaltet sein und die Responses API mit Structured Outputs unterstützen. Ohne beide Werte zeigt die App nur den geführten Modus. API-Schlüssel gehören niemals ins Frontend oder ins Repository.

Nur bei ausdrücklicher Auswahl werden die aktuellen Reflexionsfelder zuerst an die Moderations-API und dann an die Responses API gesendet. E-Mail, Name, frühere Reflexionen und Profil bleiben außerhalb dieser Anfragen. `store: false` deaktiviert die Responses-Speicherung; es ist **keine Zusage zur vollständigen Aufbewahrungsfreiheit beim Anbieter**. Die Datenschutzbedingungen und Aufbewahrungseinstellungen des Betreiberkontos sind vor dem Einsatz mit echten Nutzern zu prüfen.

Die Implementierung folgt den offiziellen Dokumentationen zu [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) und [Moderation](https://platform.openai.com/docs/guides/moderation). Live-KI-Zugriffe werden in Tests durch kontrollierte Antworten ersetzt; ein echter Schlüssel wird dafür nicht benötigt.

## Bereitstellung

Siehe [Deployment-Anleitung](docs/deployment.md). In Produktion sind HTTPS, `PUBLIC_ORIGIN`, persistenter Speicher und ein getestetes Backup-/Löschverfahren erforderlich. Die App startet in Produktion ohne HTTPS-Origin nicht.

## Orientierung im Code

| Bereich                                  | Dateien                                                         |
| ---------------------------------------- | --------------------------------------------------------------- |
| Oberfläche und Navigation                | `frontend/index.html`, `frontend/app.js`, `frontend/styles.css` |
| API, Authentifizierung und Kontotrennung | `backend/app.js`                                                |
| Start, Healthcheck, Shutdown             | `backend/server.js`                                             |
| Persistenz und Fremdschlüssel            | `database/store.js`                                             |
| KI-Ausgabevertrag                        | `database/schema.json`                                          |
| Geführter Ablauf und optionale KI        | `ai/reflection.js`                                              |
| Lokale Krisenindikatoren                 | `safety/check.js`                                               |
| Sicherheits- und Produktvorgaben         | `safety_rules.md`, `system_prompt.md`                           |
| Betrieb und Grenzen                      | `docs/deployment.md`, `docs/privacy-and-safety.md`              |
| Tests                                    | `tests/`                                                        |

Die ursprünglichen Konzeptdateien `README (1).md` und `README (2).md` bleiben als historische Planung erhalten. Dort genannte Make-/Google-Sheets-Integrationen waren nicht implementiert. Die Beta verwendet stattdessen eine direkt ausführbare API und SQLite; sie benötigt keinen Make-Account und speichert persönliche Reflexionen nicht in Google Sheets.

## Grenzen dieser Beta

Die lokale Krisenerkennung ist regelbasiert und kann Hinweise übersehen oder harmlose Beiträge stoppen. Sie ist **keine klinisch validierte Sicherheitsprüfung**. Die App überwacht niemanden, ruft keine Hilfe und eignet sich nicht für Notfälle. Vor einem öffentlichen Mental-Health-Angebot sind eine fachliche Sicherheitsbewertung und ein belastbares Betriebskonzept erforderlich.

Es gibt noch keinen E-Mail-Versand, keine verifizierten E-Mail-Adressen und keinen Passwort-Reset. Eine eingegebene E-Mail ist nur eine Anmeldekennung; es darf daraus keine bestätigte Identität abgeleitet werden. Die Beta ist für einen kontrollierten Pilotbetrieb auf einer einzelnen Instanz ausgelegt, nicht für horizontale Skalierung. Sie wurde hier nicht auf Railway veröffentlicht.
