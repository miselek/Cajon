# 🥁 Cajon Trenér

Webová aplikace na trénink hraní na cajon pro začátečníky. Běží **celá
v prohlížeči** – žádný server, funguje i offline.

## Jak to funguje

1. Pusť písničku nahlas (třeba na iPadu / tabletu vedle telefonu).
2. V appce klepni na **„Změřit tempo z mikrofonu"** – appka ~8 s poslouchá
   a odhadne tempo (BPM).
3. Nastaví se metronom a doporučený rytmus. Spusť **▶︎** a cvič podle:
   - **grafické notace** (časová mřížka s údery),
   - **nákresu cajonu**, který bliká, kam zrovna bouchnout.

Tempo můžeš kdykoliv doladit posuvníkem nebo tlačítkem **Tap tempo**
(naťukáš rytmus prstem).

### Typy úderů

| Symbol | Úder | Jak |
|--------|------|-----|
| 🔴 plný kruh | **Bass** | celou dlaní doprostřed přední desky (hluboký zvuk) |
| ⭕ prázdný kruh | **Tón / slap** | prsty na horní hranu (vyšší, ostřejší zvuk) |
| · tečka | **Ghost** | tichý dotek, jen pro pocit rytmu |

**R / L** = doporučená ruka (pravá / levá).

## Rytmy v knihovně

- **Základní rockový beat** – úplný základ (bass na 1 a 3, tón na 2 a 4)
- **Osmičkový groove** – stálé osminy s ghost notami
- **Groove s ghost notami** – funkovější pocit
- **Shuffle (trioly)** – houpavý rytmus na blues

## Spuštění (vývoj)

```bash
cd web
npm install
npm run dev
```

Otevři `http://localhost:5173`.

> **Mikrofon:** prohlížeč ho povolí jen na `localhost` nebo přes **HTTPS**.
> Pro test na telefonu spusť `npm run dev -- --host` a otevři přes HTTPS
> (např. tunel jako ngrok / cloudflared), jinak nebude tlačítko mikrofonu
> fungovat. Metronom, notace i Tap tempo fungují i bez mikrofonu.

## Build

```bash
cd web
npm run build      # výstup do web/dist
npm run preview    # lokální náhled buildu
```

`web/dist` je statická složka – nahraješ ji na jakýkoliv hosting
(Netlify, GitHub Pages, Vercel, …), který běží na HTTPS (kvůli mikrofonu).

## Architektura

- `web/src/patterns.js` – datový model a knihovna rytmů
- `web/src/metronome.js` – přesný metronom (Web Audio lookahead scheduler)
  a syntéza zvuků cajonu
- `web/src/mic.js` – detekce tempa z mikrofonu (onset envelope + autokorelace)
- `web/src/notation.js` – vykreslení notace a nákresu cajonu
- `web/src/main.js` – propojení UI
