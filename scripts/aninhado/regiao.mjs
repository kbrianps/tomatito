#!/usr/bin/env node
// Região de entrada da tomato no log do WAYLAND_DEBUG=client (spike B, M05).
//
// Percorre o log em ordem, guarda o conteúdo de cada wl_region (os ids são
// reaproveitados depois do destroy) e anota cada set_input_region da
// superfície da tomato. Compara com a região que o app calculou (a linha
// "[tomato] região: ..." que o build de debug escreve no stderr).
//
// Serve também para a sessão de verdade (docs/verificacao-manual.md, M05):
//   WAYLAND_DEBUG=client npm run tauri dev 2>&1 | tee /tmp/tt.log | grep set_input_region
//   node scripts/aninhado/regiao.mjs /tmp/tt.log
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A tomato é a segunda xdg_toplevel criada (a main vem do tauri.conf.json).
export function toplevels(log) {
  return [...log.matchAll(/get_xdg_surface\(new id xdg_surface#(\d+), wl_surface#(\d+)\)[^\n]*\n[^\n]*get_toplevel\(new id xdg_toplevel#(\d+)\)/g)].map(
    ([, xdgSurface, wlSurface, xdgToplevel]) => ({ xdgSurface, wlSurface, xdgToplevel }),
  );
}

export function regiaoDaTomato(log) {
  const regiao = { envios: [], linha_do_show: -1, linha_do_primeiro_quadro: -1 };
  const doApp = log.match(/\[tomato\] regi\S+: \d+ ret\S+ em (\d+) px: (\[.*\])/);
  regiao.calculada = doApp ? JSON.parse(doApp[2]) : null;
  const tomato = toplevels(log)[1];
  if (tomato) {
    const { wlSurface: ws, xdgToplevel: xt } = tomato;
    const conteudo = {};
    let attach = -1;
    log.split('\n').forEach((l, i) => {
      let m;
      if ((m = l.match(/create_region\(new id wl_region#(\d+)\)/))) conteudo[m[1]] = [];
      else if ((m = l.match(/-> wl_region#(\d+)\.add\((-?\d+), (-?\d+), (-?\d+), (-?\d+)\)/))) conteudo[m[1]]?.push(m.slice(2).map(Number));
      else if ((m = l.match(new RegExp(`-> wl_surface#${ws}\\.set_input_region\\((?:wl_region#(\\d+)|nil)\\)`)))) {
        regiao.envios.push({ linha: i + 1, retangulos: m[1] ? [...(conteudo[m[1]] ?? [])] : null });
      } else if (regiao.linha_do_show < 0 && l.includes(`get_toplevel(new id xdg_toplevel#${xt})`)) regiao.linha_do_show = i + 1;
      else if (attach < 0 && l.includes(`-> wl_surface#${ws}.attach(wl_buffer#`)) attach = i + 1;
      // O primeiro quadro só vale no commit que vem depois do primeiro attach.
      else if (attach > 0 && regiao.linha_do_primeiro_quadro < 0 && l.includes(`-> wl_surface#${ws}.commit()`)) regiao.linha_do_primeiro_quadro = i + 1;
    });
  }
  const ordenar = (lista) => JSON.stringify([...lista].map((r) => r.join(',')).sort());
  const igual = (e) => Boolean(e.retangulos && regiao.calculada && ordenar(e.retangulos) === ordenar(regiao.calculada));
  // O GTK reenvia a região a cada configure (foco, arraste); todas precisam ser a mesma.
  regiao.todas_iguais_a_calculada = regiao.envios.length > 0 && regiao.envios.every(igual);
  regiao.depois_do_show = regiao.envios.length > 0 && regiao.envios.every((e) => e.linha > regiao.linha_do_show);
  regiao.no_primeiro_quadro = regiao.envios.length > 0 && regiao.envios[0].linha < regiao.linha_do_primeiro_quadro;
  return regiao;
}

export function descrever(regiao) {
  const qtds = [...new Set(regiao.envios.map((e) => (e.retangulos ? e.retangulos.length : 'nil')))].join(', ');
  return (
    `região: ${regiao.calculada?.length ?? '?'} retângulos calculados; ${regiao.envios.length} set_input_region na tomato ` +
    `(o primeiro na linha ${regiao.envios[0]?.linha}; quantidades de retângulos: ${qtds}); ` +
    `show (get_toplevel) na linha ${regiao.linha_do_show}, commit do primeiro quadro na linha ${regiao.linha_do_primeiro_quadro}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const regiao = regiaoDaTomato(readFileSync(process.argv[2], 'latin1'));
  console.log(descrever(regiao));
  const checagens = {
    'região enviada (set_input_region na tomato)': regiao.envios.length > 0,
    'região enviada depois do show (get_toplevel)': regiao.depois_do_show,
    'região já no commit do primeiro quadro': regiao.no_primeiro_quadro,
    'toda região enviada é a calculada no Rust': regiao.todas_iguais_a_calculada,
  };
  for (const [nome, ok] of Object.entries(checagens)) console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}`);
  process.exit(Object.values(checagens).every(Boolean) ? 0 : 1);
}
