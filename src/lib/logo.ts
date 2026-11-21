// Logotipo de MtiGo! (diseño original). Pin de ubicación con "!" naranja
// y ondas de "tiempo real". Fuente de verdad: resources/icon.svg.
import { raw, type Raw } from './dom';

export function logoMark(opts: { size?: number; wave?: string; pin?: string; title?: boolean } = {}): Raw {
  const { size = 72, wave = '#FFFFFF', pin = '#FFFFFF', title = false } = opts;
  return raw(`<svg class="logo-mark" width="${size}" height="${size}" viewBox="180 90 664 820" role="img" aria-label="MtiGo!"${title ? '' : ' aria-hidden="true"'}>
    <g fill="none" stroke="${wave}" stroke-linecap="round">
      <path d="M318 318 A274 274 0 0 1 706 318" stroke-width="34" opacity=".65"/>
      <path d="M238 238 A388 388 0 0 1 786 238" stroke-width="34" opacity=".35"/>
    </g>
    <ellipse cx="512" cy="872" rx="150" ry="30" fill="#004D40" opacity=".25"/>
    <path d="M512 300c-128 0-226 98-226 222 0 160 226 344 226 344s226-184 226-344c0-124-98-222-226-222z" fill="${pin}"/>
    <circle cx="512" cy="520" r="120" fill="#FF9800" stroke="#F57C00" stroke-width="10"/>
    <rect x="490" y="440" width="44" height="104" rx="22" fill="#FFFFFF"/>
    <circle cx="512" cy="586" r="24" fill="#FFFFFF"/>
  </svg>`);
}

/** Logotipo completo: símbolo + nombre. `dark` = sobre fondo verde. */
export function logo(opts: { size?: number; dark?: boolean } = {}): Raw {
  const { size = 72, dark = true } = opts;
  const mark = dark ? logoMark({ size }) : logoMark({ size, wave: '#43A047', pin: '#43A047' });
  return raw(`<div class="brand ${dark ? 'brand-dark' : 'brand-light'}">${mark.value}
    <span class="brand-name">Mti<span class="brand-go">Go</span><span class="brand-bang">!</span></span></div>`);
}
