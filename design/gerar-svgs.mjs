// Gera logo, ícones e marcadores do BR ALERTA em SVG
import opentype from 'opentype.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2]; // pasta public/ do projeto
const C = { navy: '#142238', coral: '#F04E45', laranja: '#F4A340', branco: '#FFFFFF' };
for (const d of ['brand', 'icones']) mkdirSync(`${OUT}/${d}`, { recursive: true });

const buf = readFileSync('node_modules/@fontsource/manrope/files/manrope-latin-800-normal.woff');
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// Símbolo "Radar": pino de contorno aberto, com um ponto e uma onda saindo dele
// (o aviso partindo do lugar exato do problema). Desenhado num quadro 64x80 e reduzido para 32x40.
const contorno = 'M50.39 14.57 A24 24 0 0 0 11.53 42.52 L32 76 L52.47 42.52 A24 24 0 0 0 55.64 25.83';
const simbolo = (cor = C.coral) => `<g transform="scale(.5)" fill="none" stroke="${cor}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
  <path d="${contorno}"/>
  <path d="M41 23 A12.7 12.7 0 0 1 41 41" transform="rotate(-40 32 32)"/>
  <circle cx="32" cy="32" r="5.6" fill="${cor}" stroke="none"/>
</g>`;

function logo(corBR) {
  const size = 30, base = 31, x0 = 44;
  const br = font.getPath('BR', x0, base, size);
  const wBR = font.getAdvanceWidth('BR ', size);
  const alerta = font.getPath('ALERTA', x0 + wBR, base, size);
  const w = Math.ceil(x0 + wBR + font.getAdvanceWidth('ALERTA', size) + 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 40" width="${w * 2}" height="80" role="img" aria-label="BR ALERTA">
${simbolo()}
<path d="${br.toPathData(2)}" fill="${corBR}"/>
<path d="${alerta.toPathData(2)}" fill="${C.coral}"/>
</svg>\n`;
}

writeFileSync(`${OUT}/brand/logo.svg`, logo(C.navy));
writeFileSync(`${OUT}/brand/logo-branco.svg`, logo(C.branco));
const svgSimbolo = (cor) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="64" height="80" role="img" aria-label="BR ALERTA">\n${simbolo(cor)}\n</svg>\n`;
writeFileSync(`${OUT}/brand/simbolo.svg`, svgSimbolo(C.coral));
writeFileSync(`${OUT}/brand/simbolo-branco.svg`, svgSimbolo(C.branco));
writeFileSync(`${OUT}/favicon.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 0 40 40">\n${simbolo()}\n</svg>\n`);

// Ícones das categorias (traço, 24x24, herdam a cor do texto)
const icones = {
  // Base: Lucide "lightbulb-off" (licença ISC)
  'poste-apagado': ['M16.8 11.2c.8-.9 1.2-2 1.2-3.2a6 6 0 0 0-9.3-5', 'm2 2 20 20',
    'M6.3 6.3a4.67 4.67 0 0 0 1.2 5.2c.7.7 1.3 1.5 1.5 2.5', 'M9 18h6', 'M10 22h4'],
  // Base: Lucide "traffic-cone" (licença ISC) — cone de obra, igual ao do modelo 3D
  buraco: ['M16.05 10.966a5 2.5 0 0 1-8.1 0',
    'm16.923 14.049 4.48 2.04a1 1 0 0 1 .001 1.831l-8.574 3.9a2 2 0 0 1-1.66 0l-8.574-3.91a1 1 0 0 1 0-1.83l4.484-2.04',
    'M16.949 14.14a5 2.5 0 1 1-9.9 0L10.063 3.5a2 2 0 0 1 3.874 0z', 'M9.194 6.57a5 2.5 0 0 0 5.61 0'],
};
const svgIcone = (paths) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${paths.map((d) => `  <path d="${d}"/>`).join('\n')}
</svg>\n`;
for (const [nome, paths] of Object.entries(icones)) writeFileSync(`${OUT}/icones/${nome}.svg`, svgIcone(paths));

// Marcadores do mapa (pino colorido + ícone branco). Âncora: ponta de baixo.
const marcador = (cor, paths) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 60" width="48" height="60">
  <ellipse cx="24" cy="57.5" rx="7" ry="2.2" fill="${C.navy}" opacity=".25"/>
  <path d="M24 2.5C12.1 2.5 2.5 12 2.5 23.7 2.5 39.4 24 56 24 56s21.5-16.6 21.5-32.3C45.5 12 35.9 2.5 24 2.5z" fill="${cor}" stroke="${C.branco}" stroke-width="3"/>
  <g transform="translate(11.4 9.6) scale(1.05)" fill="none" stroke="${C.branco}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
${paths.map((d) => `    <path d="${d}"/>`).join('\n')}
  </g>
</svg>\n`;
writeFileSync(`${OUT}/icones/marcador-poste.svg`, marcador(C.laranja, icones['poste-apagado']));
writeFileSync(`${OUT}/icones/marcador-buraco.svg`, marcador(C.coral, icones.buraco));
console.log('SVGs gerados em', OUT);
