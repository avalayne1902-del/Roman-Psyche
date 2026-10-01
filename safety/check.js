// A conservative, local guard, not a clinical assessment or complete crisis detector.
// Run before provider calls, analysis, and persistence. Deliberately includes third-person concerns.
const crisisIndicators = [
  /suizid|selbstmord|selbstverletz|selbstgef[aä]hrd|fremdgef[aä]hrd/iu,
  /(?:mich|sich)\s+(?:selbst\s+)?(?:umbringen|t[oö]ten|verletzen|ritzen|erh[aä]ngen)/iu,
  /(?:nicht mehr|nimmer)\s+(?:weiter\s+)?leben|leben\s+(?:beenden|nehmen)|sterben\s+(?:will|m[oö]chte)|(?:will|m[oö]chte)\s+sterben/iu,
  /(?:jemanden|ihn|sie|dich|euch|alle)\s+(?:umbringen|t[oö]ten|erstechen|erschie[ßs]en)/iu,
  /(?:kill|hurt|harm|cut|hang)\s+(?:myself|yourself|himself|herself|someone|them|him|her)|suicid|self[ -]?harm|end my life|want to die/iu,
  /[uü]berdosis|overdose|(?:alle|viele)\s+tabletten\s+(?:genommen|geschluckt)/iu,
];

export function safetyResult(active = false) {
  return active
    ? {
        active: true,
        message:
          'Deine Nachricht enthält einen möglichen Hinweis auf Gefahr. Die Reflexion pausiert; dieser Beitrag wird nicht gespeichert. Wenn du oder jemand anderes unmittelbar gefährdet ist, rufe den örtlichen Notruf (in der EU: 112) oder gehe in die nächste Notaufnahme. Bitte wende dich jetzt auch an eine vertraute Person. Diese App kann keine Notfallhilfe leisten.',
        resources: [
          { label: 'Notruf 112 (EU)', url: 'tel:112' },
          {
            label: 'TelefonSeelsorge Deutschland: 116 123, rund um die Uhr',
            url: 'tel:116123',
          },
          {
            label: 'TelefonSeelsorge: Telefon, Chat und Mail',
            url: 'https://www.telefonseelsorge.de/telefon/',
          },
        ],
      }
    : { active: false };
}

export function checkSafety(text) {
  const normalized = String(text)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
  return safetyResult(
    crisisIndicators.some((pattern) => pattern.test(normalized)),
  );
}
