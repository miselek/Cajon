// Vykreslení cajon notace (časová mřížka) a nákresu cajonu.
// Pracuje nad DOM – snadno responzivní a stylovatelné přes CSS.

import { stepMap } from './patterns.js';

const HIT_LABEL = { bass: 'Bass', tone: 'Tón', ghost: 'Ghost' };

// Vytvoří mřížku buněk pro daný pattern uvnitř `container`.
export function renderGrid(container, pattern) {
  container.innerHTML = '';
  container.style.setProperty('--cols', pattern.subdivisions);
  const cellsPerBeat = pattern.subdivisions / pattern.beatsPerBar;
  const lookup = stepMap(pattern);

  for (let i = 0; i < pattern.subdivisions; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.step = String(i);

    const isBeat = i % cellsPerBeat === 0;
    if (isBeat) {
      cell.classList.add('beat');
      const label = document.createElement('span');
      label.className = 'beat-num';
      label.textContent = String(i / cellsPerBeat + 1); // 1..4
      cell.appendChild(label);
    }

    const hit = lookup.get(i);
    if (hit) {
      cell.classList.add('hit', `hit-${hit.hit}`);
      const sym = document.createElement('span');
      sym.className = 'symbol';
      sym.dataset.hit = hit.hit;
      cell.appendChild(sym);

      const hand = document.createElement('span');
      hand.className = 'hand';
      hand.textContent = hit.hand;
      cell.appendChild(hand);
    }

    container.appendChild(cell);
  }
}

// Zvýrazní aktivní buňku (playhead). step = -1 zruší zvýraznění.
export function highlightStep(container, step) {
  const cells = container.children;
  for (let i = 0; i < cells.length; i++) {
    cells[i].classList.toggle('active', i === step);
  }
}

// Nákres cajonu se zónami (BASS uprostřed, TÓN po krajích horní hrany)
// a dvěma rukama (L/R), které „bouchnou" do správného místa.
const HAND_REST = { L: { x: 62, y: 232 }, R: { x: 138, y: 232 } };

function handTarget(hand, hit) {
  if (hit === 'tone') return hand === 'L' ? { x: 64, y: 46 } : { x: 136, y: 46 };
  return { x: 100, y: 150 }; // bass i ghost = střed
}

export function renderCajon(container) {
  const hand = (h) => `
    <g class="hand-puck" id="hand-${h}" data-hand="${h}">
      <circle cx="${HAND_REST[h].x}" cy="${HAND_REST[h].y}" r="15"
              fill="#f3eefb" stroke="#1c1530" stroke-width="2"/>
      <text x="${HAND_REST[h].x}" y="${HAND_REST[h].y + 1}" class="hand-letter">${h}</text>
    </g>`;
  container.innerHTML = `
    <svg viewBox="0 0 200 260" class="cajon-svg" aria-label="cajon">
      <rect x="20" y="10" width="160" height="240" rx="10"
            fill="#caa472" stroke="#8a6a3b" stroke-width="3"/>
      <!-- horní hrana = TÓN / slap (vlevo / vpravo) -->
      <rect class="zone zone-tone-left"  data-zone="tone" x="32"  y="24" width="66" height="42" rx="6"/>
      <rect class="zone zone-tone-right" data-zone="tone" x="102" y="24" width="66" height="42" rx="6"/>
      <text x="65"  y="50" class="zone-label">TÓN</text>
      <text x="135" y="50" class="zone-label">TÓN</text>
      <!-- střed = BASS -->
      <circle class="zone zone-bass" data-zone="bass" cx="100" cy="150" r="44"/>
      <text x="100" y="155" class="zone-label">BASS</text>
      ${hand('L')}
      ${hand('R')}
    </svg>
  `;
}

// Pohne rukou na cílové místo a rozsvítí zónu (krátce, pak ruka zpět).
export function cajonStrike(container, hand, hit) {
  const puck = container.querySelector(`#hand-${hand}`);
  if (!puck) return;
  const rest = HAND_REST[hand];
  const t = handTarget(hand, hit);
  puck.style.transform = `translate(${t.x - rest.x}px, ${t.y - rest.y}px)`;
  puck.classList.add('striking');
  setTimeout(() => {
    puck.style.transform = '';
    puck.classList.remove('striking');
  }, 150);

  let zoneSel = null;
  if (hit === 'bass') zoneSel = '.zone-bass';
  else if (hit === 'tone') zoneSel = hand === 'L' ? '.zone-tone-left' : '.zone-tone-right';
  if (zoneSel) {
    const zone = container.querySelector(zoneSel);
    if (zone) {
      zone.classList.remove('flash');
      void zone.offsetWidth;
      zone.classList.add('flash');
    }
  }
}

export function hitLabel(type) {
  return HIT_LABEL[type] || type;
}
