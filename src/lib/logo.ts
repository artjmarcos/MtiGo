// Logotipo de MtiGo! — "Dos que se ayudan": dos pins (quien pregunta, verde,
// y quien ayuda, naranja) que se inclinan uno hacia el otro y forman un
// corazón; el punto blanco es el lugar donde se encuentran.
// Fuente de verdad: resources/symbol.svg.
import { raw, type Raw } from './dom';

const PIN = 'M512 210c-150 0-262 112-262 258 0 190 262 412 262 412s262-222 262-412c0-146-112-258-262-258z';

export function logoMark(opts: { size?: number; title?: boolean } = {}): Raw {
  const { size = 72, title = false } = opts;
  return raw(`<svg class="logo-mark" width="${size}" height="${Math.round(size * 0.85)}" viewBox="60 150 904 770" role="img" aria-label="MtiGo!"${title ? '' : ' aria-hidden="true"'}>
    <path d="${PIN}" fill="#43A047" transform="rotate(-26 512 880)"/>
    <path d="${PIN}" fill="#FF8A00" opacity=".9" transform="rotate(26 512 880)"/>
    <circle cx="512" cy="560" r="46" fill="#fff"/>
  </svg>`);
}

/** Logotipo completo. `dark` = sobre fondo de color (el símbolo va en una insignia clara). */
export function logo(opts: { size?: number; dark?: boolean } = {}): Raw {
  const { size = 72, dark = true } = opts;
  const mark = logoMark({ size });
  return raw(`<div class="brand ${dark ? 'brand-dark' : 'brand-light'}">
    ${dark ? `<span class="logo-badge" style="--s:${size}px">${mark.value}</span>` : mark.value}
    <span class="brand-name">Mti<span class="brand-go">Go</span><span class="brand-bang">!</span></span></div>`);
}
