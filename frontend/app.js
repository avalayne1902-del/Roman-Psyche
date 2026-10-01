'use strict';

const state = {
  user: null,
  csrfToken: null,
  aiAvailable: false,
  screen: 'home',
  authMode: 'login',
  reflections: [],
  patterns: [],
  selected: null,
  step: 0,
  draft: {},
  safety: null,
  busy: false,
  error: '',
  ready: false,
};
const steps = [
  [
    'situation',
    'Die Situation',
    'Was ist passiert?',
    'Beschreibe eine konkrete Situation, die dich beschäftigt. Was hast du beobachtet – ohne es schon zu bewerten?',
    'Zum Beispiel: Eine Nachricht blieb unbeantwortet …',
  ],
  [
    'thought',
    'Deine Gedanken',
    'Was ging dir durch den Kopf?',
    'Welche Gedanken oder Annahmen sind in diesem Moment aufgetaucht? Ein Gedanke muss noch kein Fakt sein.',
    'Ich habe gedacht …',
  ],
  [
    'emotion',
    'Deine Gefühle',
    'Wie hat sich das angefühlt?',
    'Welche Gefühle hast du bemerkt? Du kannst auch beschreiben, wo du sie im Körper gespürt hast.',
    'Ich habe mich … gefühlt.',
  ],
  [
    'behavior',
    'Dein Verhalten',
    'Wie hast du reagiert?',
    'Was hast du getan oder vermieden? Beschreibe es so wertfrei wie möglich.',
    'Ich habe dann …',
  ],
  [
    'consequence',
    'Die Wirkung',
    'Was ist daraus entstanden?',
    'Was hat deine Reaktion kurzfristig verändert? Und wie ging es dir danach?',
    'Danach …',
  ],
  [
    'counterCheck',
    'Die Gegenprüfung',
    'Welche andere Erklärung ist möglich?',
    'Was spricht für deine erste Deutung, was dagegen? Welche Erklärung würdest du einer anderen Person anbieten?',
    'Eine andere Möglichkeit wäre …',
  ],
  [
    'strategy',
    'Dein kleiner Schritt',
    'Was möchtest du ausprobieren?',
    'Wähle ein kleines, machbares Experiment für die nächsten sieben Tage. Was tust du, wann und woran merkst du einen Unterschied?',
    'Wenn …, dann probiere ich …',
  ],
];
const statuses = {
  hypothesis: 'Hypothese',
  confirmed: 'Bestätigt',
  partially_confirmed: 'Teilweise passend',
  rejected: 'Verworfen',
};
const app = document.querySelector('#app');
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const date = (value) =>
  new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  conversation:
    '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/><path d="M8 10h8M8 14h5"/>',
  reflection: '<path d="M5 3h14v18H5Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  profile:
    '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  development: '<path d="M4 20V4M4 20h17M8 15l4-5 4 2 5-7"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  leaf: '<path d="M20 3C9 2 3 8 5 14s14 6 15-11Z"/><path d="M4 21 15 9"/>',
  shield:
    '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
const btn = (text, action, cls = 'button', attrs = '') =>
  `<button class="${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const errorBlock = () =>
  state.error
    ? `<div class="error" role="alert">${esc(state.error)}</div>`
    : '';

async function api(path, options = {}) {
  const { method = 'GET', body } = options;
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}),
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.user && path !== '/api/account') {
      state.user = null;
      state.authMode = 'login';
      state.csrfToken = null;
      state.reflections = [];
      state.patterns = [];
      state.draft = {};
      state.selected = null;
      state.step = 0;
      state.safety = null;
    }
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : data.error?.message ||
            data.message ||
            'Das hat nicht geklappt. Bitte versuche es erneut.',
    );
  }
  return data;
}
function notify(message) {
  document.querySelector('#notice').textContent = message;
  setTimeout(() => {
    document.querySelector('#notice').textContent = '';
  }, 5000);
}
async function refresh() {
  const [reflections, patterns] = await Promise.all([
    api('/api/reflections'),
    api('/api/patterns'),
  ]);
  state.reflections = reflections.reflections;
  state.patterns = patterns.patterns;
}
function help() {
  return `<aside class="help-panel"><span class="help-icon">${icon('shield')}</span><div><strong>Du musst damit nicht allein bleiben.</strong><p>Bei akuter Gefahr: <a href="tel:112">112</a> (EU) oder den örtlichen Notruf wählen. In Deutschland erreichst du die TelefonSeelsorge rund um die Uhr unter <a href="tel:116123">116 123</a> – kostenlos und anonym. <a href="https://www.telefonseelsorge.de/telefon/" target="_blank" rel="noopener noreferrer">Weitere Hilfe ↗</a></p></div></aside>`;
}
function privacy() {
  return `<div class="privacy-copy"><h3>Deine Daten. Deine Entscheidung.</h3><p>Abgeschlossene Reflexionen werden in deinem Konto gespeichert, damit du später darauf zurückblicken kannst – bis du sie oder dein Konto löschst. Unfertige Eingaben bleiben nur im Arbeitsspeicher dieses Browserfensters und gehen beim Neuladen verloren.</p><p>Muster landen erst nach deiner ausdrücklichen Auswahl im Profil. Nur wenn du die optionale KI aktivierst, werden deine Eingaben zur Verarbeitung an den konfigurierten KI-Anbieter gesendet. Der App-Betreiber verwaltet den Server und kann technisch auf gespeicherte Daten zugreifen. Diese App verwendet sie nicht selbst für Modelltraining; für den KI-Anbieter gelten dessen Bedingungen. Vermeide Namen und andere identifizierende Details.</p><p>PsycheAI ist eine Software für Selbstreflexion, kein Mensch und kein Ersatz für Therapie, Diagnostik oder professionelle Hilfe.</p></div>`;
}
function renderAuth() {
  const register = state.authMode === 'register';
  app.innerHTML = `<div class="auth-layout"><section class="auth-story"><a class="brand" href="#" aria-label="PsycheAI Startseite"><span class="brand-mark">p</span><span>psyche<span class="brand-light">ai</span></span></a><div class="auth-story-main"><span class="eyebrow">RAUM FÜR DEINE GEDANKEN</span><h1>Manchmal beginnt<br>Veränderung mit<br><em>Verstehen.</em></h1><p>Sortiere, was dich beschäftigt. Entdecke neue Perspektiven. Finde deinen nächsten kleinen Schritt.</p><div class="orbit-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit orbit-three"></div><span class="orbit-center">${icon('leaf')}</span><span class="art-label">In deinem Tempo.</span></div></div><p class="auth-footnote">Strukturierte Selbstreflexion. Keine Diagnose. Kein Leistungsdruck.</p></section><main id="main" class="auth-main"><div class="auth-card"><span class="eyebrow">DEIN PERSÖNLICHER RAUM</span><h2>${register ? 'Ein Anfang für dich.' : 'Schön, dass du da bist.'}</h2><p class="muted">${register ? 'Erstelle dein Konto und beginne mit einem Gedanken.' : 'Melde dich an und nimm dir einen Moment für dich.'}</p><div class="auth-tabs" aria-label="Konto-Zugang">${btn('Anmelden', 'auth-login', register ? '' : 'selected')}${btn('Konto erstellen', 'auth-register', register ? 'selected' : '')}</div>${errorBlock()}<form id="auth-form">${register ? '<label for="name">Dein Name</label><input id="name" name="name" autocomplete="name" maxlength="80" required>' : ''}<label for="email">E-Mail-Adresse</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" required><label for="password">Passwort</label><input id="password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="12" maxlength="128" required>${register ? '<p class="field-hint">Mindestens 12 Zeichen. Nutze ein eigenes, langes Passwort.</p><label class="check"><input type="checkbox" name="consent" required><span>Ich habe die Datenschutzhinweise unten gelesen und verstehe, dass PsycheAI keine Therapie ersetzt.</span></label>' : ''}<button class="button full" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Einen Moment …' : register ? 'Konto erstellen' : 'Anmelden'} ${icon('arrow')}</button></form><details class="privacy-details"><summary>Datenschutz & Grenzen</summary>${privacy()}</details></div>${help()}</main></div>`;
}
function render() {
  if (!state.ready) return;
  if (!state.user) {
    renderAuth();
    return;
  }
  const nav = [
    ['home', 'Überblick'],
    ['conversation', 'Reflektieren'],
    ['reflection', 'Reflexionen'],
    ['profile', 'Mein Profil'],
    ['development', 'Entwicklung'],
  ];
  const title = nav.find(([key]) => key === state.screen)?.[1] || 'Überblick';
  app.innerHTML = `<div class="app-layout"><aside class="sidebar"><a class="brand" href="#home" data-action="nav" data-screen="home"><span class="brand-mark">p</span><span>psyche<span class="brand-light">ai</span></span></a><span class="sidebar-label">DEIN RAUM</span><nav aria-label="Hauptnavigation">${nav.map(([key, label]) => `<button class="nav-item ${state.screen === key ? 'active' : ''}" data-action="nav" data-screen="${key}" ${state.screen === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${label}</span>${state.screen === key ? '<span class="nav-dot"></span>' : ''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="small-note">${icon('leaf')}<p>Kein richtig. Kein falsch.<br>Nur ein bisschen mehr Klarheit.</p></div><button class="user-button" data-action="nav" data-screen="profile"><span class="avatar">${esc(state.user.name.slice(0, 1).toUpperCase())}</span><span><strong>${esc(state.user.name)}</strong><small>Dein persönlicher Raum</small></span></button></div></aside><div class="main-wrap"><header class="topbar"><span>${title}</span><span class="private-pill">${icon('shield')} In deinem Tempo</span></header><main id="main" tabindex="-1">${errorBlock()}${state.safety ? renderSafety() : ({ home: renderHome, conversation: renderConversation, reflection: renderReflections, profile: renderProfile, development: renderDevelopment }[state.screen] || renderHome)()}<footer class="main-footer"><span>PsycheAI unterstützt Selbstreflexion und ersetzt keine professionelle Hilfe.</span><button data-action="help" class="text-button">Hilfe in einer Krise</button></footer></main></div></div>`;
}
function renderHome() {
  const hour = new Date().getHours();
  const greeting =
    hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  return `<section class="page-heading"><span class="eyebrow">EIN MOMENT FÜR DICH</span><h1>${greeting}, ${esc(state.user.name.split(' ')[0])}<span class="heading-dot">.</span></h1><p>Du musst nicht alles sofort lösen. Fang damit an, es zu verstehen.</p></section><section class="hero-card"><div class="hero-copy"><span class="tag">DEIN NÄCHSTER SCHRITT</span><h2>Was geht dir gerade<br>durch den Kopf?</h2><p>Ein Gespräch, ein Gefühl, ein Gedanke, der bleibt.<br>Gib ihm einen Moment Raum.</p>${btn(`Reflexion beginnen ${icon('arrow')}`, 'start')}</div><div class="hero-art" aria-hidden="true"><div class="art-sun"></div><div class="art-hill hill-back"></div><div class="art-hill hill-front"></div><div class="art-stem"></div><div class="art-leaf leaf-one"></div><div class="art-leaf leaf-two"></div><div class="art-leaf leaf-three"></div><span>Ein Gedanke nach dem anderen.</span></div></section><div class="section-title"><h2>Mehr Klarheit, Schritt für Schritt</h2><span class="muted">Dein Weg zur Selbstreflexion</span></div><section class="step-cards"><article class="card"><span class="number">01</span><h3>Verstehen</h3><p>Halte fest, was passiert ist und was es in dir ausgelöst hat.</p></article><article class="card"><span class="number">02</span><h3>Hinterfragen</h3><p>Trenne Beobachtungen von Annahmen. Lass andere Erklärungen zu.</p></article><article class="card"><span class="number">03</span><h3>Ausprobieren</h3><p>Finde ein kleines Experiment, das in deinen Alltag passt.</p></article></section><div class="section-title"><h2>Deine letzten Gedanken</h2>${btn('Alle ansehen →', 'nav', 'text-button', 'data-screen="reflection"')}</div>${state.reflections.length ? `<div class="reflection-list">${state.reflections.slice(0, 2).map(reflectionCard).join('')}</div>` : `<div class="empty-inline">${icon('reflection')}<div><strong>Hier entsteht dein Rückblick.</strong><p>Nach deiner ersten Reflexion findest du hier deine Gedanken und nächsten Schritte.</p></div></div>`}`;
}
function renderConversation() {
  const [key, name, question, description, placeholder] = steps[state.step];
  return `<section class="page-heading narrow"><span class="eyebrow">DEINE REFLEXION</span><h1>Ein Gedanke nach dem anderen.</h1><p>Hier gibt es keine perfekten Antworten. Nur deine Perspektive.</p></section><section class="conversation-card"><div class="progress-top"><span>Schritt ${state.step + 1} von ${steps.length}</span><span>${name}</span></div><div class="progress-track"><div class="progress-step-${state.step + 1}"></div></div><form id="reflection-form"><div class="question-mark">${String(state.step + 1).padStart(2, '0')}</div><h2><label for="reflection-input">${question}</label></h2><p class="question-description" id="question-description">${description}</p><textarea id="reflection-input" name="answer" maxlength="4000" rows="6" placeholder="${placeholder}" aria-describedby="question-description draft-note" required>${esc(state.draft[key] || '')}</textarea>${state.step === 0 ? `<fieldset class="mood-field"><legend>Wie fühlst du dich gerade?</legend><div class="mood-options">${['Sehr belastet', 'Belastet', 'Gemischt', 'Eher gut', 'Gut'].map((label, i) => `<label><input type="radio" name="mood" value="${i + 1}" ${Number(state.draft.mood || 3) === i + 1 ? 'checked' : ''}><span>${i + 1}<small>${label}</small></span></label>`).join('')}</div></fieldset>` : ''}${state.step === steps.length - 1 ? `<div class="ai-choice"><strong>${state.aiAvailable ? 'Optionale KI-Unterstützung' : 'Geführter Modus'}</strong><p>${state.aiAvailable ? 'Standardmäßig wird deine Reflexion mit festen Fragen strukturiert. Für individuelle KI-Hypothesen kannst du die Übermittlung aller Antworten an den konfigurierten KI-Anbieter erlauben. Auch KI-Aussagen sind nur Hypothesen.' : 'Du arbeitest mit strukturierten Fragen und deinen eigenen Antworten. Es ist keine KI verbunden; es findet keine KI-Analyse statt.'}</p>${state.aiAvailable ? `<label class="check"><input type="checkbox" name="useAi" ${state.draft.useAi ? 'checked' : ''}><span>KI nutzen und meine Antworten dafür an den KI-Anbieter senden.</span></label>` : ''}</div>` : ''}<div class="form-actions">${state.step ? btn('← Zurück', 'back', 'button secondary', state.busy ? 'disabled' : '') : btn('Abbrechen', 'cancel', 'text-button', state.busy ? 'disabled' : '')}<button type="submit" class="button" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Wird geprüft …' : state.step === steps.length - 1 ? 'Reflexion abschließen' : 'Weiter'} ${icon('arrow')}</button></div><p class="draft-note" id="draft-note">${state.step === steps.length - 1 ? 'Mit „Reflexion abschließen“ speicherst du deine Antworten in deinem Konto, bis du sie löschst.' : 'Unfertige Antworten werden nicht gespeichert und gehen beim Neuladen verloren.'}</p></form></section>`;
}
function reflectionCard(reflection) {
  return `<button class="reflection-card" data-action="detail" data-id="${esc(reflection.id)}"><span class="reflection-icon">${icon('reflection')}</span><span class="reflection-preview"><span class="card-date">${esc(date(reflection.createdAt))}</span><strong>${esc(reflection.situation)}</strong><span class="muted">${esc(reflection.emotion)}</span></span><span class="round-arrow">${icon('arrow')}</span></button>`;
}
function renderReflections() {
  const reflection = state.reflections.find((r) => r.id === state.selected);
  if (reflection) return renderDetail(reflection);
  return `<section class="page-heading"><span class="eyebrow">DEIN RÜCKBLICK</span><h1>Gedanken, die bleiben.</h1><p>Ein Ort für das, was dich beschäftigt hat – und was du daraus mitnimmst.</p></section><div class="section-title"><h2>${state.reflections.length} ${state.reflections.length === 1 ? 'Reflexion' : 'Reflexionen'}</h2>${btn('Neue Reflexion +', 'start')}</div>${state.reflections.length ? `<div class="reflection-list">${state.reflections.map(reflectionCard).join('')}</div>` : `<section class="empty-state">${icon('reflection')}<h2>Dein Rückblick beginnt mit einem Gedanken.</h2><p>Nach deiner ersten Reflexion kannst du hier jederzeit nachlesen.</p>${btn('Erste Reflexion beginnen', 'start')}</section>`}`;
}
function renderDetail(reflection) {
  const result = reflection.result;
  return `${btn('← Alle Reflexionen', 'all-reflections', 'text-button')}<section class="page-heading"><span class="eyebrow">${esc(date(reflection.createdAt))} · ${result.source === 'ai' ? 'MIT KI-UNTERSTÜTZUNG' : 'GEFÜHRTE REFLEXION'}</span><h1>Ein Stück mehr Klarheit.</h1><p>${esc(result.response)}</p></section>${result.aiFallback ? '<div class="info-note">Die KI war nicht verfügbar. Deine Antworten wurden im geführten Modus strukturiert.</div>' : ''}<div class="detail-grid"><section class="card"><h2>Was du beschrieben hast</h2><dl class="analysis-list">${steps
    .slice(0, 5)
    .map(([key, name]) => `<dt>${name}</dt><dd>${esc(reflection[key])}</dd>`)
    .join(
      '',
    )}</dl></section><section class="card strategy-card"><span class="eyebrow">DEIN EXPERIMENT · ${Number(result.strategy.duration_days) || 7} TAGE</span><h2>${esc(result.strategy.title)}</h2><ol>${result.strategy.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol><p class="muted">Ein Experiment ist kein Versprechen. Beobachte, was für dich passt, und passe es an.</p></section></div><section class="card detail-section"><h2>Hypothesen, keine Wahrheiten</h2><p class="muted">Eine mögliche Deutung darfst du hinterfragen, ändern oder verwerfen.</p>${result.hypotheses.map((h) => `<div class="hypothesis"><span class="tag">HYPOTHESE · ${result.source === 'ai' ? `${Math.round(h.confidence * 100)} % KI-SCHÄTZUNG · NICHT KLINISCH` : 'NICHT BEWERTET'}</span><p>${esc(h.text)}</p></div>`).join('') || '<p>Im geführten Modus wird keine persönliche Diagnose oder gesicherte Mustererkennung vorgenommen.</p>'}<h3>Andere Erklärungen</h3><ul>${result.alternative_explanations.map((a) => `<li>${esc(a)}</li>`).join('')}</ul><h3>Deine Gegenprüfung</h3><p class="preserve">${esc(reflection.counterCheck)}</p>${result.questions?.length ? `<h3>Zum Weiterdenken</h3><ul>${result.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}</section>${result.memory_candidates
    .map((candidate, i) => {
      const saved = state.patterns.some(
        (p) => p.reflectionId === reflection.id && p.text === candidate.text,
      );
      return `<section class="card memory-card"><div><span class="eyebrow">DU ENTSCHEIDEST</span><h3>Als mögliche Erkenntnis behalten?</h3><p>${esc(candidate.text)}</p><p class="muted">Wird nur nach deiner Auswahl als Hypothese im Profil gespeichert. Du kannst sie später korrigieren oder löschen.</p></div>${btn(saved ? 'Im Profil gespeichert' : 'Im Profil merken', 'save-pattern', 'button secondary', `data-id="${esc(reflection.id)}" data-index="${i}" ${saved || state.busy ? 'disabled' : ''}`)}</section>`;
    })
    .join(
      '',
    )}<div class="section-title">${btn('Neue Reflexion beginnen', 'start')}${btn('Reflexion löschen', 'delete-reflection', 'text-button danger', `data-id="${esc(reflection.id)}" ${state.busy ? 'disabled' : ''}`)}</div>`;
}
function renderProfile() {
  return `<section class="page-heading"><span class="eyebrow">DEIN PERSÖNLICHES PROFIL</span><h1>Du bist mehr als ein Muster.</h1><p>Hier steht nur, was du bewusst behalten möchtest. Und nichts ist in Stein gemeißelt.</p></section><section><div class="section-title"><h2>Deine gespeicherten Erkenntnisse</h2><span class="tag">${state.patterns.length} GESPEICHERT</span></div>${
    state.patterns.length
      ? state.patterns
          .map(
            (p) =>
              `<article class="card pattern-card"><span class="tag">${esc(statuses[p.status] || p.status)} · ${p.confidence > 0 ? `${Math.round(p.confidence * 100)} % SCHÄTZUNG · NICHT KLINISCH` : 'NICHT BEWERTET'}</span><p>${esc(p.text)}</p><div class="pattern-actions"><label for="status-${esc(p.id)}">Passt das zu deiner Erfahrung?</label><select id="status-${esc(p.id)}" data-pattern="${esc(p.id)}" ${state.busy ? 'disabled' : ''}>${Object.entries(
                statuses,
              )
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${p.status === value ? 'selected' : ''}>${label}</option>`,
                )
                .join(
                  '',
                )}</select>${btn('Löschen', 'delete-pattern', 'text-button danger', `data-id="${esc(p.id)}" ${state.busy ? 'disabled' : ''}`)}</div></article>`,
          )
          .join('')
      : '<div class="empty-inline"><span class="reflection-icon">◇</span><div><strong>Dein Profil bleibt in deiner Hand.</strong><p>Du kannst nach einer Reflexion selbst entscheiden, ob du eine mögliche Erkenntnis hier behalten möchtest.</p></div></div>'
  }</section><section class="card detail-section account-card"><h2>Dein Konto</h2><p><strong>${esc(state.user.name)}</strong><br><span class="muted">${esc(state.user.email)}</span></p><div class="account-actions">${btn('Daten herunterladen', 'export', 'button secondary')}${btn('Abmelden', 'logout', 'button secondary')}</div><details class="privacy-details"><summary>Datenschutz & Datenspeicherung</summary>${privacy()}</details><details class="delete-account"><summary>Konto und alle Daten löschen</summary><p>Das entfernt deine Reflexionen, Muster und dein Konto dauerhaft. Dieser Schritt kann nicht rückgängig gemacht werden.</p><form id="delete-account-form"><label for="delete-password">Mit deinem Passwort bestätigen</label><input type="password" id="delete-password" name="password" autocomplete="current-password" required><button type="submit" class="button danger-button" ${state.busy ? 'disabled' : ''}>Konto endgültig löschen</button></form></details></section>`;
}
function renderDevelopment() {
  const ordered = [...state.reflections].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  );
  return `<section class="page-heading"><span class="eyebrow">DEINE ENTWICKLUNG</span><h1>Veränderung hat ihr eigenes Tempo.</h1><p>Ein Rückblick auf deine Momente der Selbstreflexion. Keine Bewertung deiner Person.</p></section><div class="stat-grid"><article class="card"><span class="stat-number">${state.reflections.length}</span><h3>Momente der Reflexion</h3><p>Bewusst innegehalten.</p></article><article class="card"><span class="stat-number">${state.patterns.length}</span><h3>Festgehaltene Erkenntnisse</h3><p>Von dir ausgewählt.</p></article><article class="card"><span class="stat-number">${state.patterns.filter((p) => p.status === 'confirmed').length}</span><h3>Passende Hypothesen</h3><p>Von dir bestätigt.</p></article></div><section class="card detail-section"><h2>So hast du dich gefühlt</h2><p class="muted">Deine Selbsteinschätzung zu Beginn jeder Reflexion (1 = sehr belastet, 5 = gut). Das ist keine klinische Messung und zeigt keinen Therapieerfolg.</p>${
    ordered.length
      ? `<div class="mood-chart" role="img" aria-label="Stimmungsrückblick: ${esc(
          ordered
            .slice(-12)
            .map((r) => `${date(r.createdAt)}: ${r.mood} von 5`)
            .join('; '),
        )}">${ordered
          .slice(-12)
          .map(
            (r) =>
              `<div class="chart-column"><span>${r.mood}</span><div class="chart-bar" data-mood="${Number(r.mood)}"></div><small>${esc(new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' }).format(new Date(r.createdAt)))}</small></div>`,
          )
          .join('')}</div>`
      : '<div class="empty-inline"><p>Wenn du reflektierst, wächst hier dein persönlicher Rückblick.</p></div>'
  }</section><section class="card detail-section"><h2>Deine Experimente</h2><p class="muted">Was möchtest du beibehalten? Was war unpassend? Eine neue Reflexion kann dir helfen, nach sieben Tagen Bilanz zu ziehen.</p>${
    state.reflections
      .slice(0, 5)
      .map(
        (r) =>
          `<article class="experiment"><span class="experiment-dot"></span><div><span class="card-date">${esc(date(r.createdAt))} · ${Number(r.result.strategy.duration_days) || 7}-Tage-Experiment</span><h3>${esc(r.result.strategy.title)}</h3><p>${esc(r.strategy)}</p>${btn('Reflexion öffnen →', 'detail', 'text-button', `data-id="${esc(r.id)}"`)}</div></article>`,
      )
      .join('') ||
    '<p>Dein erstes kleines Experiment beginnt mit einer Reflexion.</p>'
  }</section>`;
}
function renderSafety() {
  return `<section class="page-heading"><span class="eyebrow">JETZT ZÄHLT DEINE SICHERHEIT</span><h1>Bitte hole dir menschliche Unterstützung.</h1></section><section class="card safety-card"><h2>${state.safety.manual ? 'Unterstützung ist erreichbar.' : 'Die Reflexion ist angehalten.'}</h2><p>${esc(state.safety.message || 'Wenn du gerade in Gefahr bist oder befürchtest, dir oder jemand anderem etwas anzutun, wende dich bitte jetzt an den örtlichen Notruf oder an eine Person in deiner Nähe.')}</p><p>${state.safety.manual ? '' : 'Diese Reflexion wurde nicht gespeichert. '}PsycheAI kann eine Krise nicht begleiten und keine Notfallhilfe leisten.</p>${help()}${btn('Zum Überblick', 'leave-safety', 'button secondary')}</section>`;
}
function rememberDraft() {
  const input = document.querySelector('#reflection-input');
  if (!input) return;
  state.draft[steps[state.step][0]] = input.value;
  const mood = document.querySelector('input[name="mood"]:checked');
  if (mood) state.draft.mood = Number(mood.value);
  const useAi = document.querySelector('input[name="useAi"]');
  if (useAi) state.draft.useAi = useAi.checked;
}
async function run(operation) {
  if (state.busy) return;
  state.busy = true;
  state.error = '';
  app.setAttribute('aria-busy', 'true');
  app.querySelectorAll('input, textarea, select, button').forEach((control) => {
    control.disabled = true;
  });
  document.querySelectorAll('button[type="submit"]').forEach((b) => {
    b.disabled = true;
    b.textContent = 'Einen Moment …';
  });
  try {
    await operation();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.busy = false;
    app.removeAttribute('aria-busy');
    render();
    if (state.error)
      document
        .querySelector('[role="alert"]')
        ?.scrollIntoView({ block: 'center' });
    else if (state.screen === 'conversation' && !state.safety)
      document.querySelector('#reflection-input')?.focus();
  }
}
app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || state.busy) return;
  event.preventDefault();
  const action = target.dataset.action;
  rememberDraft();
  if (action === 'auth-login' || action === 'auth-register') {
    state.authMode = action === 'auth-login' ? 'login' : 'register';
    state.error = '';
    render();
  } else if (action === 'nav') {
    state.screen = target.dataset.screen;
    state.selected = null;
    state.error = '';
    render();
    document.querySelector('#main')?.focus();
  } else if (action === 'start') {
    state.screen = 'conversation';
    state.selected = null;
    state.error = '';
    render();
    document.querySelector('#reflection-input')?.focus();
  } else if (action === 'back') {
    state.step--;
    render();
  } else if (action === 'cancel') {
    if (
      !Object.values(state.draft).some(Boolean) ||
      confirm('Unfertige Antworten verwerfen?')
    ) {
      state.draft = {};
      state.step = 0;
      state.screen = 'home';
      render();
    }
  } else if (action === 'detail') {
    state.selected = target.dataset.id;
    state.screen = 'reflection';
    render();
    document.querySelector('#main')?.focus();
  } else if (action === 'all-reflections') {
    state.selected = null;
    render();
  } else if (action === 'leave-safety') {
    state.safety = null;
    state.screen = 'home';
    render();
  } else if (action === 'help') {
    state.safety = {
      manual: true,
      message:
        'Du kannst dir jederzeit Unterstützung holen – auch wenn du nicht sicher bist, ob es schon eine Krise ist.',
    };
    render();
    document.querySelector('#main')?.focus();
  } else if (action === 'logout')
    run(async () => {
      await api('/api/auth/logout', { method: 'POST' });
      Object.assign(state, {
        user: null,
        authMode: 'login',
        csrfToken: null,
        reflections: [],
        patterns: [],
        selected: null,
        draft: {},
        step: 0,
        safety: null,
        screen: 'home',
      });
    });
  else if (
    action === 'delete-reflection' &&
    confirm('Diese Reflexion und zugehörige Muster dauerhaft löschen?')
  )
    run(async () => {
      await api(`/api/reflections/${encodeURIComponent(target.dataset.id)}`, {
        method: 'DELETE',
      });
      state.selected = null;
      await refresh();
      notify('Reflexion gelöscht.');
    });
  else if (action === 'save-pattern')
    run(async () => {
      await api('/api/patterns', {
        method: 'POST',
        body: {
          reflectionId: target.dataset.id,
          candidateIndex: Number(target.dataset.index),
        },
      });
      await refresh();
      notify('Als Hypothese in deinem Profil gespeichert.');
    });
  else if (
    action === 'delete-pattern' &&
    confirm('Diese Erkenntnis aus deinem Profil löschen?')
  )
    run(async () => {
      await api(`/api/patterns/${encodeURIComponent(target.dataset.id)}`, {
        method: 'DELETE',
      });
      await refresh();
      notify('Erkenntnis gelöscht.');
    });
  else if (action === 'export')
    run(async () => {
      const data = await api('/api/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `psycheai-daten-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Dein Datenexport wurde heruntergeladen.');
    });
});
app.addEventListener('change', (event) => {
  if (event.target.matches('[data-pattern]')) {
    const { value, dataset } = event.target;
    run(async () => {
      await api(`/api/patterns/${encodeURIComponent(dataset.pattern)}`, {
        method: 'PATCH',
        body: { status: value },
      });
      await refresh();
      notify('Einordnung aktualisiert.');
    });
  }
});
app.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'auth-form') {
    const body = Object.fromEntries(new FormData(form));
    delete body.consent;
    run(async () => {
      const data = await api(`/api/auth/${state.authMode}`, {
        method: 'POST',
        body,
      });
      Object.assign(state, {
        user: data.user,
        csrfToken: data.csrfToken,
        aiAvailable: data.aiAvailable,
        screen: 'home',
        safety: null,
      });
      await refresh();
    });
  } else if (form.id === 'reflection-form') {
    rememberDraft();
    if (!state.draft[steps[state.step][0]].trim()) {
      state.error = 'Bitte beschreibe deinen Gedanken in ein paar Worten.';
      render();
      return;
    }
    run(async () => {
      const checked = await api('/api/safety', {
        method: 'POST',
        body: { text: steps.map(([key]) => state.draft[key] || '').join('\n') },
      });
      if (checked.safety.active) {
        state.safety = checked.safety;
        state.draft = {};
        state.step = 0;
        return;
      }
      if (state.step < steps.length - 1) state.step++;
      else {
        const data = await api('/api/reflections', {
          method: 'POST',
          body: {
            ...state.draft,
            mood: Number(state.draft.mood || 3),
            useAi: Boolean(state.draft.useAi && state.aiAvailable),
          },
        });
        if (data.safety?.active) {
          state.safety = data.safety;
        } else {
          state.selected = data.reflection.id;
          state.screen = 'reflection';
          state.reflections.unshift(data.reflection);
          state.draft = {};
          state.step = 0;
          await refresh();
          notify('Deine Reflexion wurde gespeichert.');
        }
        state.draft = {};
        state.step = 0;
      }
    });
  } else if (form.id === 'delete-account-form') {
    const password = new FormData(form).get('password');
    if (confirm('Konto und ALLE gespeicherten Daten unwiderruflich löschen?'))
      run(async () => {
        await api('/api/account', { method: 'DELETE', body: { password } });
        Object.assign(state, {
          user: null,
          authMode: 'login',
          csrfToken: null,
          reflections: [],
          patterns: [],
          selected: null,
          draft: {},
          step: 0,
          safety: null,
          screen: 'home',
        });
        notify('Dein Konto und deine Daten wurden gelöscht.');
      });
  }
});
window.addEventListener('beforeunload', (event) => {
  rememberDraft();
  if (steps.some(([key]) => state.draft[key]?.trim())) {
    event.preventDefault();
    event.returnValue = '';
  }
});
(async () => {
  try {
    const session = await api('/api/session');
    Object.assign(state, session);
    if (state.user) await refresh();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.ready = true;
    render();
  }
})();
