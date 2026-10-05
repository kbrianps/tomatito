// Ícone de 512 e gráfico de destaque da Play (PLANO-ANDROID 8.2; A22).
//
//   node scripts/android/graficos-loja.mjs
//
// Renderiza no Chrome headless e grava em docs/android/play/:
// - icone-512.png: o src-tauri/icons/icon.svg, 512 × 512, RGBA, até 1 024 KB;
// - destaque-1024x500.png: a marca, o nome e uma frase sobre o fundo do Lite,
//   1024 × 500, RGB sem alfa.
// Confere as medidas e o tipo de cor pelo cabeçalho do PNG e sai 1 se algo
// não bater.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const SAIDA = join(RAIZ, 'docs/android/play');
const svg = readFileSync(join(RAIZ, 'src-tauri/icons/icon.svg'), 'utf8').replace(/<\?xml[^>]*>/, '');
const tmp = mkdtempSync(join(tmpdir(), 'tomatito-graficos-'));
const chrome = (html, largura, altura, saida, transparente) => {
  const pagina = join(tmp, 'p.html');
  writeFileSync(pagina, html);
  execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(tmp, 'perfil')}`,
    ...(transparente ? ['--default-background-color=00000000'] : []),
    `--window-size=${largura},${altura}`, `--screenshot=${saida}`, pathToFileURL(pagina).href], { stdio: 'ignore' });
};
const cabecalho = (arq) => { const d = readFileSync(arq); return { largura: d.readUInt32BE(16), altura: d.readUInt32BE(20), bits: d[24], tipoDeCor: d[25], kb: Math.round(statSync(arq).size / 1024) }; };

try {
  const base = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden}</style>';
  const icone = join(SAIDA, 'icone-512.png');
  chrome(`${base}<style>html,body{background:transparent}svg{display:block;width:512px;height:512px}</style>${svg}`, 512, 512, icone, true);

  const destaque = join(SAIDA, 'destaque-1024x500.png');
  chrome(`${base}<style>
    body{width:1024px;height:500px;background:linear-gradient(180deg,#AF4135,#A5342B);display:flex;align-items:center;justify-content:center;gap:56px;
      font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#FFF8F6}
    svg{width:232px;height:232px;flex:none;filter:drop-shadow(0 8px 24px rgb(60 10 6/.35))}
    h1{margin:0 0 14px;font-size:84px;font-weight:600;letter-spacing:-1.5px;line-height:1}
    p{margin:0;font-size:30px;line-height:1.3;color:#FBE4DC;max-width:520px}
  </style>${svg}<div><h1>Tomatito</h1><p>Timer de foco simples, com intervalos na hora certa.</p></div>`, 1024, 500, destaque, false);
  // Sem alfa (a Play recusa transparência no gráfico de destaque).
  execFileSync('python3', ['-c', 'from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[1], optimize=True)', destaque]);

  const i = cabecalho(icone);
  const d = cabecalho(destaque);
  const ok = i.largura === 512 && i.altura === 512 && i.tipoDeCor === 6 && i.kb <= 1024 && d.largura === 1024 && d.altura === 500 && d.tipoDeCor === 2;
  console.log(JSON.stringify({ ok, icone: i, destaque: d }));
  process.exit(ok ? 0 : 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
