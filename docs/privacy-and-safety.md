# Daten und Sicherheitsgrenzen der Beta

## Gespeicherte Daten

- Konto: Name, E-Mail als nicht verifizierte Anmeldekennung, Passwort-Hash mit zufälligem Salt und Erstellungsdatum.
- Sitzungen: SHA-256-Hash des zufälligen Sitzungstokens, CSRF-Token und Ablaufdatum. Der Browser erhält das Sitzungstoken ausschließlich als HttpOnly-Cookie. Laufzeit: sieben Tage; Abmeldung widerruft die aktuelle Sitzung sofort.
- Abgeschlossene Reflexionen: Situation, Gedanke, Emotion, Verhalten, Konsequenz, Gegenprüfung, selbst gewählter Schritt, Stimmung, Zeitpunkt und Reflexionsergebnis.
- Profil: nur vom Nutzer ausdrücklich übernommene Kandidaten und deren vom Nutzer gesetzter Status. Keine automatische Profilaufnahme.

Unfertige Eingaben bleiben im Arbeitsspeicher des Tabs. Schrittprüfungen senden Eingaben an den eigenen Server, ohne sie zu speichern. Krisenbeiträge werden in der Reflexions-API nicht gespeichert; normale bereits abgeschlossene Reflexionen bleiben bis zur Löschung bestehen.

## Zugriff und Aufbewahrung

API-Endpunkte begrenzen Datenzugriffe auf die angemeldete Person. Infrastrukturbetreiber mit Datenbank-/Backup-Zugriff können Inhalte lesen; es gibt keine Ende-zu-Ende-Verschlüsselung. Die App hat keine Werbung, Analyse-Pixel oder Trainingspipeline. Normale Daten bleiben bis zur bewussten Löschung erhalten. Einzelne Reflexionen zu löschen entfernt auch daraus übernommene Profil-Erkenntnisse. Kontolöschung entfernt alle aktiven Kontodaten und Sitzungen. Backups benötigen ein gesondertes Lösch- und Aufbewahrungskonzept.

Bei optionalem KI-Einsatz gehen nur die aktuellen Reflexionsfelder an OpenAI. Die Zustimmung ist pro Reflexion erforderlich. `store: false` wird bei Responses gesetzt. Providerseitige Aufbewahrung, Zugriff und eventuelle Datenfreigaben hängen vom Betreibervertrag und dessen Einstellungen ab; die App kann diese nicht garantieren. Ohne KI-Auswahl findet kein Provider-Aufruf statt.

## Safety vor Analyse und Memory

Die Reihenfolge ist lokale Sicherheitsprüfung → bei KI-Auswahl externe Moderation → Reflexion → Speicherung der Reflexion → optional ausdrücklich ausgelöste Profilübernahme. Krisenerkennung beendet den aktuellen Ablauf mit fest vorgegebenen Hilfehinweisen. Eine blockierende Moderationsantwort stoppt ebenfalls den Ablauf. Bei technischen KI-/Moderationsfehlern erfolgt keine weitere KI-Analyse, sondern eine gekennzeichnete lokale Reflexion nach der lokalen Sicherheitsprüfung.

Lokale Regeln decken ausgewählte deutsche und englische Formulierungen ab. Sie sind anfällig für Umschreibungen, andere Sprachen, Tippfehler und Kontextfehler. Auch externe Moderation und LLMs sind nicht verlässlich genug für Notfallentscheidungen. Die Beta ist nicht klinisch validiert. Ein KI-Ergebnis darf nicht als Diagnose verstanden werden; `confidence` ist keine klinische Wahrscheinlichkeit. Im geführten Modus ist es 0 (nicht bewertet).

Hilfehinweise nennen den örtlichen Notruf (EU: 112) und [TelefonSeelsorge Deutschland](https://www.telefonseelsorge.de/telefon/) unter 116 123. Die TelefonSeelsorge-Angaben wurden am 1. Oktober 2026 anhand ihrer Website geprüft. Außerhalb Deutschlands sind passende lokale Dienste zu verwenden. Die App löst selbst keine Notrufe aus und wird nicht von Menschen live überwacht.
