#!/usr/bin/env node
// Resume uma rodada do roteiro regiao (M54): as checagens do roteiro e, pelo
// app.log (WAYLAND_DEBUG=client, mais as linhas "[tomatito] região do tomate"
// do build de debug), o que o app pediu ao compositor para a superfície do
// tomate. Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-regiao.mjs <pasta da rodada>
//
// Serve também para um log da sessão de verdade (docs/verificacao-manual.md,
// M54), sem o resultado.json:
//   WAYLAND_DEBUG=client npm run dev:app 2>&1 | tee /tmp/tt.log | grep set_input_region
//   node scripts/gnome-aninhado/resumo-regiao.mjs --log /tmp/tt.log
//
// O cairo (pixman) guarda a região em bandas horizontais, então os retângulos
// que chegam ao compositor não são os mesmos que a página mandou (o número
// muda); o que se compara é a área coberta, pixel a pixel.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// As contagens da página em cada lado, com escala 1 (docs/decisoes.md, M53,
// item 4): o log só traz os retângulos.
const LADO_POR_CONTAGEM = { 125: 240, 146: 280, 162: 320 };

/** Chave da área coberta por uma lista de retângulos: as linhas com os intervalos. */
export function area(retangulos) {
  const linhas = new Map();
  for (const [x, y, w, h] of retangulos)
    for (let yy = y; yy < y + h; yy++) {
      const l = linhas.get(yy) ?? [];
      l.push([x, x + w]);
      linhas.set(yy, l);
    }
  const partes = [];
  for (const y of [...linhas.keys()].sort((a, b) => a - b)) {
    const l = linhas.get(y).sort((a, b) => a[0] - b[0]);
    const juntos = [];
    for (const [a, b] of l) {
      const u = juntos.at(-1);
      if (u && a <= u[1]) u[1] = Math.max(u[1], b);
      else juntos.push([a, b]);
    }
    partes.push(`${y}:${juntos.map((i) => i.join('-')).join(',')}`);
  }
  return partes.join(';');
}

/** Lê o log em ordem: as regiões mandadas pela página e os set_input_region. */
export function lerLog(log) {
  const conteudo = {};
  const calculadas = [];
  const envios = [];
  const toplevels = [];
  const primeiroAttach = {};
  const commits = {};
  let ultimoXdg = null;
  log.split('\n').forEach((l, i) => {
    const linha = i + 1;
    let m;
    if ((m = l.match(/\[tomatito\] região do tomate: (\d+) retângulos: (\[.*\])/))) {
      const r = JSON.parse(m[2]);
      calculadas.push({ linha, n: r.length, lado: LADO_POR_CONTAGEM[r.length] ?? `? (${r.length})`, area: area(r) });
    } else if ((m = l.match(/create_region\(new id wl_region#(\d+)\)/))) conteudo[m[1]] = [];
    else if ((m = l.match(/-> wl_region#(\d+)\.add\((-?\d+), (-?\d+), (-?\d+), (-?\d+)\)/))) conteudo[m[1]]?.push(m.slice(2).map(Number));
    else if ((m = l.match(/-> wl_surface#(\d+)\.set_input_region\((?:wl_region#(\d+)|nil)\)/))) {
      const r = m[2] ? [...(conteudo[m[2]] ?? [])] : null;
      envios.push({ linha, superficie: m[1], n: r?.length ?? 0, area: r ? area(r) : null });
    } else if ((m = l.match(/get_xdg_surface\(new id xdg_surface#\d+, wl_surface#(\d+)\)/))) ultimoXdg = m[1];
    else if ((m = l.match(/get_toplevel\(new id xdg_toplevel#\d+\)/)) && ultimoXdg) toplevels.push({ linha, superficie: ultimoXdg });
    else if ((m = l.match(/-> wl_surface#(\d+)\.attach\(wl_buffer#/))) (primeiroAttach[m[1]] ??= []).push(linha);
    else if ((m = l.match(/-> wl_surface#(\d+)\.commit\(\)/))) (commits[m[1]] ??= []).push(linha);
  });
  return { calculadas, envios, toplevels, primeiroAttach, commits };
}

/**
 * As checagens do M54 sobre o log. A superfície do tomate é a que recebe a
 * área de uma região calculada. Os ids das superfícies são reaproveitados
 * depois de destruídas; um tomate por rodada (o roteiro não sai do Full).
 */
export function checarLog(log) {
  const { calculadas, envios, toplevels, primeiroAttach, commits } = lerLog(log);
  const areas = new Set(calculadas.map((c) => c.area));
  const doTomate = envios.filter((e) => e.area && areas.has(e.area));
  const sup = doTomate[0]?.superficie;
  // O show do tomate é o último get_toplevel dessa superfície antes do
  // primeiro envio com a área da página (o id pode ter sido de outra janela antes).
  const show = toplevels.filter((t) => t.superficie === sup && t.linha < doTomate[0].linha).at(-1);
  const daSup = envios.filter((e) => e.superficie === sup && e.linha > (show?.linha ?? Infinity));
  const attach = (primeiroAttach[sup] ?? []).find((a) => a > (show?.linha ?? Infinity));
  const primeiroQuadro = (commits[sup] ?? []).find((c) => c > (attach ?? Infinity));
  // Para cada região da página, o primeiro set_input_region do tomate com a mesma área, depois dela.
  const entregas = calculadas.map((c) => {
    const e = daSup.find((x) => x.linha > c.linha && x.area === c.area);
    return { lado: c.lado, retangulosDaPagina: c.n, linhaDaPagina: c.linha, retangulosNoWayland: e?.n ?? null, linhaNoWayland: e?.linha ?? null };
  });
  const ultima = calculadas.at(-1);
  const res = {
    superficie: sup ? `wl_surface#${sup}` : null,
    entregas,
    envios: daSup.length,
    showNaLinha: show?.linha ?? null,
    primeiroEnvio: daSup[0]?.linha ?? null,
    primeiroQuadro: primeiroQuadro ?? null,
    diferentes: daSup.filter((e) => !areas.has(e.area)).length,
  };
  const checagens = {
    'a página mandou a região (linha "[tomatito] região do tomate")': calculadas.length > 0,
    'toda região da página chegou ao compositor (wl_surface.set_input_region com a mesma área)': entregas.length > 0 && entregas.every((e) => e.linhaNoWayland),
    'a primeira região veio da página antes do show (get_toplevel do tomate)': Boolean(show) && calculadas[0].linha < show.linha,
    'o primeiro set_input_region do tomate vem depois do show e antes do primeiro quadro': Boolean(show) && res.primeiroEnvio > show.linha && res.primeiroEnvio < (primeiroQuadro ?? 0),
    'o último set_input_region do tomate é a última região da página': Boolean(ultima) && daSup.at(-1)?.area === ultima.area,
    'sem erro de protocolo': !/wl_display[^\n]*\.error\(/.test(log),
    'o app não entrou em pânico': !/panicked at/.test(log),
  };
  return { res, checagens };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const soLog = process.argv[2] === '--log';
  const pasta = soLog ? null : process.argv[2];
  const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
  const log = soLog ? readFileSync(process.argv[3], 'utf8') : readFileSync(`${pasta}/app.log`, 'utf8');
  const r = soLog ? { checagens: { _: { ok: true } } } : JSON.parse(ler('resultado.json') || '{}');
  if (pasta) console.log(`rodada: ${pasta}`);
  if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
  const { res, checagens: doLog } = checarLog(log);
  console.log(`  superfície do tomate: ${res.superficie}; ${res.envios} set_input_region nela (${res.diferentes} com outra área, os reenvios do GTK no meio de uma troca)`);
  console.log(`  show (get_toplevel) na linha ${res.showNaLinha}; primeiro set_input_region na ${res.primeiroEnvio}; primeiro quadro na ${res.primeiroQuadro}`);
  for (const e of res.entregas)
    console.log(`  ${e.lado} px: a página mandou ${e.retangulosDaPagina} retângulos (linha ${e.linhaDaPagina}); set_input_region com ${e.retangulosNoWayland} retângulos (linha ${e.linhaNoWayland})`);
  for (const [k, v] of Object.entries(r.medidas ?? {}).filter(([k]) => k.startsWith('tamanho-'))) console.log(`  ${k}: ${JSON.stringify(v)}`);
  const checagens = { ...Object.fromEntries(Object.entries(r.checagens ?? {}).filter(([k]) => k !== '_').map(([k, v]) => [k, v.ok])), ...doLog };
  if (!soLog) {
    const lados = res.entregas.map((e) => e.lado).join(' → ');
    checagens['regiões do M, do P e do G, nessa ordem (280 → 240 → 320)'] = lados === '280 → 240 → 320';
  }
  let falhou = false;
  for (const [nome, ok] of Object.entries(checagens)) {
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
    if (!ok) falhou = true;
  }
  process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
}
