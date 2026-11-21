// Genera las imágenes base (icono, splash, gráficos de tienda) desde los SVG de resources/.
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
mkdirSync('public', { recursive: true });
mkdirSync('store', { recursive: true });
const r = (f) => `resources/${f}`;
await sharp(r('icon.svg')).resize(1024, 1024).png().toFile(r('icon-only.png'));
await sharp(r('icon-foreground.svg')).resize(1024, 1024).png().toFile(r('icon-foreground.png'));
await sharp(r("icon-background.svg")).resize(1024, 1024).png().toFile(r("icon-background.png"));
await sharp(r('splash.svg')).resize(2732, 2732).png().toFile(r('splash.png'));
await sharp(r('splash.svg')).resize(2732, 2732).png().toFile(r('splash-dark.png'));
await sharp(r('icon.svg')).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(r('icon.svg')).resize(512, 512).png().toFile('public/icon-512.png');
// Google Play: icono 512x512 y gráfico destacado 1024x500.
await sharp(r('icon.svg')).resize(512, 512).png().toFile('store/play-icon-512.png');
const symbol = readFileSync('resources/icon-foreground.svg', 'utf8').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#66BB6A"/><stop offset=".55" stop-color="#43A047"/><stop offset="1" stop-color="#00897B"/></linearGradient></defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <svg x="40" y="40" width="420" height="420" viewBox="0 0 1024 1024">${symbol}</svg>
  <text x="440" y="230" font-family="Poppins, Montserrat, DejaVu Sans, Arial" font-weight="800" font-size="110" fill="#fff" letter-spacing="-3">Mti<tspan fill="#E0F2F1">Go</tspan><tspan fill="#FF9800">!</tspan></text>
  <text x="446" y="295" font-family="DejaVu Sans, Arial" font-size="27" fill="#fff">Información real del lugar, antes de ir.</text>
  <text x="446" y="345" font-family="DejaVu Sans, Arial" font-size="24" fill="#E0F2F1">Villarrica · La Araucanía</text>
</svg>`;
await sharp(Buffer.from(feature)).png().toFile('store/play-feature-1024x500.png');
console.log('Imágenes generadas');
await sharp(r('logo-horizontal.svg')).resize(1600, 520).png().toFile('store/logo-horizontal.png');
