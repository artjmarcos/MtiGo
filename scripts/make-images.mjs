// Genera las imágenes base (icono, splash, gráficos de tienda) desde los SVG de resources/.
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
mkdirSync('public', { recursive: true });
mkdirSync('store', { recursive: true });
const r = (f) => `resources/${f}`;
await sharp(r('icon.svg')).resize(1024, 1024).png().toFile(r('icon-only.png'));
await sharp(r('icon-foreground.svg')).resize(1024, 1024).png().toFile(r('icon-foreground.png'));
await sharp(r('icon-background.svg')).resize(1024, 1024).png().toFile(r('icon-background.png'));
await sharp(r('splash.svg')).resize(2732, 2732).png().toFile(r('splash.png'));
await sharp(r('splash.svg')).resize(2732, 2732).png().toFile(r('splash-dark.png'));
await sharp(r('icon.svg')).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(r('icon.svg')).resize(512, 512).png().toFile('public/icon-512.png');
// Google Play: icono 512x512 y gráfico destacado 1024x500.
await sharp(r('icon.svg')).resize(512, 512).png().toFile('store/play-icon-512.png');
const symbol = readFileSync('resources/symbol.svg', 'utf8');
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="#FFF8F0"/>
  <circle cx="230" cy="250" r="190" fill="#FFE0B2" opacity=".55"/>
  <svg x="70" y="70" width="320" height="320" viewBox="60 150 904 770">${symbol.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>
  <text x="440" y="225" font-family="Poppins, Montserrat, DejaVu Sans, Arial" font-weight="800" font-size="110" fill="#263238" letter-spacing="-3">Mti<tspan fill="#00897B">Go</tspan><tspan fill="#FF8A00">!</tspan></text>
  <text x="446" y="290" font-family="Poppins, DejaVu Sans, Arial" font-weight="700" font-size="28" fill="#455a64">Información real del lugar, antes de ir.</text>
  <text x="446" y="340" font-family="Poppins, DejaVu Sans, Arial" font-size="24" fill="#00897B">Una comunidad que presta sus ojos a otros 💚</text>
</svg>`;
await sharp(Buffer.from(feature)).png().toFile('store/play-feature-1024x500.png');
console.log('Imágenes generadas');
await sharp(r('logo-horizontal.svg')).resize(1600, 520).png().toFile('store/logo-horizontal.png');
