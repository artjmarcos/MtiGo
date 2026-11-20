// Genera las imágenes base (icono, splash, gráficos de tienda) desde los SVG de resources/.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
mkdirSync('public', { recursive: true });
mkdirSync('store', { recursive: true });
const r = (f) => `resources/${f}`;
await sharp(r('icon.svg')).resize(1024, 1024).png().toFile(r('icon-only.png'));
await sharp(r('icon-foreground.svg')).resize(1024, 1024).png().toFile(r('icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#4CAF50' } }).png().toFile(r('icon-background.png'));
await sharp(r('splash.svg')).resize(2732, 2732).png().toFile(r('splash.png'));
await sharp(r('splash.svg')).resize(2732, 2732).png().toFile(r('splash-dark.png'));
await sharp(r('icon.svg')).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(r('icon.svg')).resize(512, 512).png().toFile('public/icon-512.png');
// Google Play: icono 512x512 y gráfico destacado 1024x500.
await sharp(r('icon.svg')).resize(512, 512).png().toFile('store/play-icon-512.png');
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <rect width="1024" height="500" fill="#4CAF50"/>
  <g transform="translate(220 250) scale(0.36) translate(-512 -500)">
    <path d="M512 170c-140 0-250 108-250 246 0 178 250 418 250 418s250-240 250-418c0-138-110-246-250-246z" fill="#fff" stroke="#FF9800" stroke-width="22"/>
    <rect x="478" y="290" width="68" height="200" rx="34" fill="#FF9800"/><circle cx="512" cy="560" r="40" fill="#FF9800"/>
  </g>
  <text x="400" y="230" font-family="DejaVu Sans, Arial" font-weight="bold" font-size="96" fill="#fff">MtiGo<tspan fill="#FF9800">!</tspan></text>
  <text x="402" y="300" font-family="DejaVu Sans, Arial" font-size="28" fill="#fff">Información real del lugar, antes de ir.</text>
  <text x="402" y="350" font-family="DejaVu Sans, Arial" font-size="26" fill="#e0f2f1">Villarrica · La Araucanía</text>
</svg>`;
await sharp(Buffer.from(feature)).png().toFile('store/play-feature-1024x500.png');
console.log('Imágenes generadas');
