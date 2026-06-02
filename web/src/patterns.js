// Knihovna cajon rytmů pro začátečníky.
//
// Model rytmu:
//   id            – unikátní identifikátor
//   name          – název (CZ)
//   description   – krátký popis pro začátečníka (CZ)
//   level         – 'zacatecnik' | 'mirne-pokrocily'
//   recommendedBpm – doporučené cvičební tempo
//   beatsPerBar   – počet hlavních dob v taktu (vždy 4 = počítáme "1 2 3 4")
//   subdivisions  – počet buněk v taktu (16 = šestnáctiny, 12 = trioly/shuffle)
//   steps         – pole úderů: { i, hit, hand }
//                     i    – index buňky 0..subdivisions-1
//                     hit  – 'bass' | 'tone' | 'ghost'
//                     hand – 'R' | 'L' (doporučená ruka)
//
// Typy úderů na cajon:
//   bass  – dlaní doprostřed přední desky, hluboký zvuk
//   tone  – prsty na horní hranu, vyšší "slap" zvuk
//   ghost – tichý dotek/tap, vyplňuje rytmus (pro pocit groovu)

export const PATTERNS = [
  {
    id: 'rock-basic',
    name: 'Základní rockový beat',
    description:
      'Úplný základ. Bass dlaní na "1" a "3", tón (slap) na horní hranu na "2" a "4". ' +
      'Hraj pomalu a počítej nahlas "1 2 3 4".',
    level: 'zacatecnik',
    recommendedBpm: 70,
    beatsPerBar: 4,
    subdivisions: 16,
    steps: [
      { i: 0, hit: 'bass', hand: 'R' },
      { i: 4, hit: 'tone', hand: 'L' },
      { i: 8, hit: 'bass', hand: 'R' },
      { i: 12, hit: 'tone', hand: 'L' },
    ],
  },
  {
    id: 'eighth-groove',
    name: 'Osmičkový groove',
    description:
      'Pravá ruka drží stálé osminy. Bass na "1" a "3", tón na "2" a "4", mezi tím ' +
      'tiché ghost údery. Drží to puls jako u bicích.',
    level: 'zacatecnik',
    recommendedBpm: 80,
    beatsPerBar: 4,
    subdivisions: 16,
    steps: [
      { i: 0, hit: 'bass', hand: 'R' },
      { i: 2, hit: 'ghost', hand: 'L' },
      { i: 4, hit: 'tone', hand: 'R' },
      { i: 6, hit: 'ghost', hand: 'L' },
      { i: 8, hit: 'bass', hand: 'R' },
      { i: 10, hit: 'ghost', hand: 'L' },
      { i: 12, hit: 'tone', hand: 'R' },
      { i: 14, hit: 'ghost', hand: 'L' },
    ],
  },
  {
    id: 'ghost-groove',
    name: 'Groove s ghost notami',
    description:
      'Funkovější pocit. Hlavní údery bass/tón doplněné tichými ghost notami na ' +
      'šestnáctinách. Nejdřív zvládni rockový beat, pak přidej tichounké tapy.',
    level: 'mirne-pokrocily',
    recommendedBpm: 75,
    beatsPerBar: 4,
    subdivisions: 16,
    steps: [
      { i: 0, hit: 'bass', hand: 'R' },
      { i: 3, hit: 'ghost', hand: 'L' },
      { i: 4, hit: 'tone', hand: 'R' },
      { i: 6, hit: 'ghost', hand: 'L' },
      { i: 8, hit: 'bass', hand: 'R' },
      { i: 10, hit: 'bass', hand: 'L' },
      { i: 11, hit: 'ghost', hand: 'L' },
      { i: 12, hit: 'tone', hand: 'R' },
      { i: 14, hit: 'ghost', hand: 'L' },
    ],
  },
  {
    id: 'shuffle',
    name: 'Shuffle (trioly)',
    description:
      'Houpavý rytmus v triolách (cítíš "ta-ki-ta"). Bass na začátku doby, tón na ' +
      'poslední triole. Skvělé na blues a pomalejší songy.',
    level: 'mirne-pokrocily',
    recommendedBpm: 75,
    beatsPerBar: 4,
    subdivisions: 12, // 3 trioly na každou ze 4 dob
    steps: [
      { i: 0, hit: 'bass', hand: 'R' },
      { i: 2, hit: 'ghost', hand: 'L' },
      { i: 3, hit: 'tone', hand: 'R' },
      { i: 5, hit: 'ghost', hand: 'L' },
      { i: 6, hit: 'bass', hand: 'R' },
      { i: 8, hit: 'ghost', hand: 'L' },
      { i: 9, hit: 'tone', hand: 'R' },
      { i: 11, hit: 'ghost', hand: 'L' },
    ],
  },
];

export function getPattern(id) {
  return PATTERNS.find((p) => p.id === id) || PATTERNS[0];
}

// Vrátí mapu index buňky -> úder pro rychlé vykreslování a přehrávání.
export function stepMap(pattern) {
  const map = new Map();
  for (const s of pattern.steps) map.set(s.i, s);
  return map;
}

// Doporučí vhodný groove podle detekovaného tempa (pro auto-detekci z YouTube).
export function suggestPatternForBpm(bpm) {
  if (bpm < 80) return 'rock-basic';
  if (bpm < 110) return 'eighth-groove';
  return 'rock-basic';
}
