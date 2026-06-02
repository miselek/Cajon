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

// Nákres cajonu se dvěma zónami: BASS (střed) a TÓN (horní hrana).
export function renderCajon(container) {
  container.innerHTML = `
    <svg viewBox="0 0 200 260" class="cajon-svg" aria-label="cajon">
      <rect x="20" y="10" width="160" height="240" rx="10"
            fill="#caa472" stroke="#8a6a3b" stroke-width="3"/>
      <!-- horní hrana = TÓN / slap -->
      <rect class="zone zone-tone" data-zone="tone"
            x="32" y="22" width="136" height="46" rx="6"/>
      <text x="100" y="50" class="zone-label">TÓN (slap)</text>
      <!-- střed = BASS -->
      <circle class="zone zone-bass" data-zone="bass" cx="100" cy="150" r="46"/>
      <text x="100" y="155" class="zone-label">BASS</text>
    </svg>
  `;
}

// Krátce rozsvítí zónu cajonu podle typu úderu.
export function flashCajon(container, hitType) {
  if (hitType === 'ghost') return; // ghost neukazujeme na nákresu
  const zone = container.querySelector(`.zone-${hitType}`);
  if (!zone) return;
  zone.classList.remove('flash');
  // restart CSS animace
  void zone.offsetWidth;
  zone.classList.add('flash');
}

export function hitLabel(type) {
  return HIT_LABEL[type] || type;
}
