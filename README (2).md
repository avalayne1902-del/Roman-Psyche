# PsycheAI

Eine KI-gestützte Plattform für strukturierte Selbstreflexion.

> „PsycheAI soll nicht behaupten, den Menschen vollständig zu kennen.
> Es soll ihm helfen, sich selbst besser zu verstehen.“

PsycheAI ist **kein** Arzt, Therapeut, Diagnosesystem oder Ersatz für professionelle Hilfe.

## Produktkern

```
Situation → Gedanken → Emotionen → Verhalten
→ mögliche Muster → Gegenprüfung → Strategie → Entwicklung
```

Goldenes Prinzip: **Erst verstehen → dann interpretieren → dann gegenprüfen → dann handeln.**

## Ordnerstruktur

| Ordner | Inhalt |
|---|---|
| `frontend/` | App-/Web-Oberfläche (5 Screens: Home, Conversation, Reflection, Profile, Development) |
| `backend/` | API-Endpunkte, Businesslogik |
| `ai/` | Anbindung an das Sprachmodell, Pipeline-Layer |
| `database/` | Datenmodell / JSON-Schemas |
| `prompts/` | System-Prompt(s) für PsycheAI |
| `safety/` | Sicherheitsregeln, Krisenerkennung |
| `docs/` | Konzept- und Planungsdokumente |
| `tests/` | Tests für Conversation-Flow, Safety, Pattern-Logik |

## Beta v0.1 – die 5 Kernfunktionen

1. **PsycheAI Conversation** – strukturierte Rückfragen statt sofortiger Erklärung
2. **Pattern Detector** – Hypothesen statt absoluter Aussagen
3. **Counter-Check** – alternative Erklärungen aktiv gegenprüfen
4. **Action Strategy** – konkrete Experimente statt vager Ratschläge
5. **Personal Psyche Profile** – transparent, evidenzbasiert, korrigierbar

## Bewusst NICHT in v0.1

Diagnose-System · KI-Therapeut · Medikamentenempfehlungen · klinische Behandlung ·
künstliche emotionale Bindung · manipulative Push-Nachrichten · endlose Chat-Schleifen ·
Social Network · komplizierte Gamification · riesiges Dashboard.

## Tech-Stack

- **GitHub** — Code & Versionierung
- **Make** — Automationen / erster AI-Flow
- **Railway** — Backend, Deployment
- **Google Sheets** — frühe Datenbank (bis zur echten DB)

## Nächste Bauschritte

1. GitHub-Struktur anlegen ✅
2. System-Prompt implementieren ✅ → siehe `prompts/system_prompt.md`
3. JSON-Schema implementieren ✅ → siehe `database/schema.json`
4. Safety Layer implementieren ✅ → siehe `safety/safety_rules.md`
5. Backend erstellen → `backend/`
6. AI-Anbindung herstellen → `ai/`
7. Make verbinden
8. Railway deployen
9. Ersten funktionierenden Conversation-Flow testen
10. Erste 5–20 Beta-Tester gewinnen

## Leitsatz

„Du musst dich nicht sofort verändern. Vielleicht musst du dich zuerst verstehen.“
**PSYCHEAI — Understand yourself. Change what matters.**
