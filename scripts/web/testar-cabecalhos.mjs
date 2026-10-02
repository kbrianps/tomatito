// W40a: o _headers do Cloudflare Pages (PLANO-WEB-V1, 4.2). Roda sobre o
// dist-web já construído; fica fora da descoberta do `node --test` do desktop
// (o nome não casa com a descoberta; a regra 3 do regras-do-repo confere):
//
//   npm run build:web && node --test scripts/web/testar-cabecalhos.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const raiz = new URL('../../dist-web/', import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), 'utf8');

/** `{ caminho: { cabeçalho: valor } }` de um arquivo _headers. */
function analisar(texto) {
  const regras = {};
  let atual = null;
  for (const linha of texto.split('\n')) {
    if (!linha.trim()) continue;
    if (!/^\s/.test(linha)) {
      atual = linha.trim();
      regras[atual] = {};
    } else {
      const i = linha.indexOf(':');
      regras[atual][linha.slice(0, i).trim().toLowerCase()] = linha.slice(i + 1).trim();
    }
  }
  return regras;
}

test('_headers: limites do Pages, sem Content-Type, e a CSP com o hash do boot do index.html', () => {
  const texto = ler('_headers');
  const regras = analisar(texto);
  assert.ok(Object.keys(regras).length <= 100, 'no máximo 100 regras');
  for (const linha of texto.split('\n')) assert.ok(linha.length <= 2000, 'nenhuma linha acima de 2 000 caracteres');
  assert.doesNotMatch(texto, /^\s*content-type:/im, 'sem regras de Content-Type');

  const csp = regras['/*']['content-security-policy'];
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(ler('index.html'))[1];
  const hash = (s) => /'sha256-[^']+'/.exec(s)[0];
  assert.equal(hash(csp), hash(meta), 'o sha256 do boot é o da <meta>');
  assert.ok(csp.startsWith(meta), 'a política do cabeçalho começa pela da <meta>');
  assert.match(csp, /frame-ancestors 'none'/);

  assert.match(regras['/assets/*']['cache-control'], /immutable/);
  for (const caminho of ['/', '/sw.js', '/manifest.webmanifest']) assert.equal(regras[caminho]['cache-control'], 'no-cache');
});

test('publico/: a página de privacidade sai no build e fica fora do precache', () => {
  assert.ok(existsSync(new URL('privacidade.html', raiz)));
  const sw = ler('sw.js');
  const precache = /const PRECACHE = (\[[^\]]*\])/.exec(sw)[1];
  assert.doesNotMatch(precache, /privacidade|_headers/, 'vão sempre à rede');
  assert.doesNotMatch(precache, /index\.html/, 'a página entra como ./ (o Pages redireciona /index.html)');
  assert.match(precache, /"\.\/"/);
});
