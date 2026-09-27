#!/usr/bin/env node
// Conferência do M13 (botões próprios, foco e ícones) nos dois motores, sem
// abrir janela: o Chrome headless (o Chromium do WebView2 no Windows) e o
// WebKitGTK fora da tela (o motor do app no Linux). Usa o shot.mjs e o
// webkit-shot.mjs com as medidas __ttBotoes, __ttFoco, __ttDica,
// __ttMostrarDica, __ttSairDica, __ttIcones, __ttDesabilitados e
// __ttSabotarDica de scripts/preview/medidas.js.
//
//   node scripts/preview/botoes.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// No #/dev:
//   - nos quatro temas normais, cada botão com as medidas e as cores do tema:
//     padrão (32 px, raio 4, --tt-ctl e as bordas de cima e de baixo),
//     destaque, sutil (32 × 32, sem fundo), circular (32 e 64 px, redondo) e
//     os desabilitados (--tt-fg-disabled; o destaque em --tt-accent-disabled;
//     a borda lisa); os ícones de 16 px (24 no circular grande);
//   - os desabilitados dos componentes Fluent (caixa, chave, radio, lista e
//     item de menu) com as cores da ponte, e nunca os cinzas do bloco escuro;
//   - o anel duplo: no Chrome, com o Tab de verdade (e o clique, que não
//     mostra o anel); no WebKitGTK, com o focus() do JS;
//   - a dica dos botões de ícone: aparece depois do atraso (e não antes), em
//     cima e centrada a 4 px, com o texto do aria-label, aria-hidden; com uma
//     aberta, a do botão vizinho vem na hora; vira
//     para baixo perto do topo; some com Esc e ao sair; não aparece em botão
//     desabilitado; não fecha um menu aberto; o foco do teclado também mostra;
//   - os ícones do catálogo: os 18 da lista, 23 desenhos, cada um no tamanho
//     da grade, e nenhum pedido de rede ao @fluentui/svg-icons;
//   - controle negativo: com a âncora da dica sabotada, a posição acusa.
// Sai com 1 se alguma conferência falhar.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };
const TEMAS = ['lite', 'suave', 'light', 'dark'];
const TRANSPARENTE = 'rgba(0, 0, 0, 0)';
// Os cinzas do bloco escuro do gerado que o M12 viu nos desabilitados do Lite.
const CINZAS_DO_FLUENT = ['rgb(20, 20, 20)', 'rgb(92, 92, 92)', 'rgb(66, 66, 66)'];

const perto = (v, alvo, folga = 0.6) => typeof v === 'number' && Math.abs(v - alvo) <= folga;
const q = (s) => JSON.stringify(s);

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: botoes.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

const CORES = `(() => Object.fromEntries(['--tt-ctl','--tt-ctl-stroke-top','--tt-ctl-stroke-bottom','--tt-fg-1','--tt-accent','--tt-fg-on-accent','--tt-accent-disabled','--tt-fg-disabled','--tt-bg-card','--tt-border'].map((t) => [t, __ttCor(t)])))()`;

function montarPassos(motor, capturas) {
  const passos = [];
  const rotulos = [];
  const avaliar = (rotulo, expr) => {
    passos.push('--eval', expr);
    rotulos.push(rotulo);
  };
  const shot = (nome) => capturas && passos.push('--shot', join(capturas, `${motor}-${nome}.png`));
  for (const tema of TEMAS) {
    // A troca de tema aqui é a do DevTools, sem a classe tt-no-transition da
    // 4.6: espera a transição de 83 ms dos botões acabar antes de medir.
    avaliar(null, `__ttTema(${q(tema)})`);
    passos.push('--wait', '250');
    avaliar(`cores ${tema}`, CORES);
    avaliar(`botoes ${tema}`, '__ttBotoes()');
    avaliar(`desabilitados ${tema}`, '__ttDesabilitados()');
  }
  avaliar(null, `__ttTema('lite')`);
  avaliar('icones', '__ttIcones()');

  // Dica: pelo evento sintético (os dois motores).
  avaliar(null, `__ttPosicionar('dica-reiniciar', 'meio')`);
  avaliar(null, `(document.querySelector('[data-amostra="botoes-icone"]').scrollIntoView({ block: 'center' }), true)`);
  avaliar('dica cedo', `__ttMostrarDica('[data-botao="grande"]', { espera: 120 })`);
  avaliar('dica', `__ttMostrarDica('[data-botao="grande"]', { espera: 300 })`);
  shot('dica');
  // Com a dica aberta, a do botão vizinho vem sem o atraso.
  avaliar('dica vizinha', `__ttMostrarDica('[data-botao="grande-destaque"]', { espera: 60 })`);
  avaliar('dica saiu', `__ttSairDica('[data-botao="grande-destaque"]')`);
  avaliar('dica desabilitado', `__ttMostrarDica('[data-botao="grande-desabilitado"]', { espera: 450 })`);
  // Perto do topo da área que rola, vira para baixo.
  avaliar(
    null,
    `(async () => { const r = document.querySelector('.tt-rolagem'); const b = document.querySelector('[data-botao="sutil"]'); r.scrollTop += b.getBoundingClientRect().top - r.getBoundingClientRect().top - 4; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); return b.getBoundingClientRect().top; })()`,
  );
  avaliar('dica no topo', `__ttMostrarDica('[data-botao="sutil"]', { espera: 450 })`);
  shot('dica-topo');
  avaliar(null, `__ttSairDica('[data-botao="sutil"]')`);
  // Com um menu aberto, a dica não o fecha.
  avaliar(null, `__ttPosicionar('menu-sessao', 'meio')`);
  avaliar('menu antes', `__ttAbrir('menu-sessao')`);
  avaliar(
    'dica com menu',
    `(async () => { const b = document.querySelector('[data-botao="grande"]'); b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); await new Promise((r) => setTimeout(r, 450)); return { dica: __ttDica(), menu: __ttMedirPopover('menu-sessao').aberto }; })()`,
  );
  avaliar(null, `(__ttSairDica('[data-botao="grande"]'), __ttFecharPopovers())`);
  // Foco do teclado mostra a dica; no WebKitGTK, também o anel (pelo focus()).
  avaliar(null, `(document.querySelector('[data-amostra="botoes-icone"]').scrollIntoView({ block: 'center' }), true)`);
  // O focus() do JS não casa :focus-visible em nenhum dos dois (e o
  // focus({ focusVisible: true }) não vale no Chrome headless nem existe no
  // WebKitGTK): o anel e a dica pelo teclado usam o Tab de verdade, no Chrome
  // aqui e no WebKitGTK no teste aninhado.

  if (motor === 'chrome') {
    // Mouse e teclado de verdade: hover e clique nos botões, Tab para o anel.
    avaliar(null, `(document.querySelector('.tt-rolagem').scrollTop = 0)`);
    passos.push('--hover', '[data-botao="padrao"]', '--wait', '150');
    avaliar('hover padrao', `__ttBotoes().padrao`);
    passos.push('--press', '[data-botao="padrao"]', '--wait', '150');
    avaliar('clique padrao', `__ttBotoes().padrao`);
    passos.push('--click', '[data-botao="padrao"]', '--wait', '150');
    avaliar('foco depois do clique', '__ttFoco()');
    passos.push('--hover', '[data-botao="sutil"]', '--wait', '150');
    avaliar('hover sutil', `__ttBotoes().sutil`);
    passos.push('--press', '[data-botao="sutil"]', '--wait', '150');
    avaliar('clique sutil', `__ttBotoes().sutil`);
    passos.push('--click', '.tt-amostra-topo h1', '--key', 'Tab', '--wait', '150');
    avaliar('foco pelo tab', '__ttFoco()');
    shot('foco-tab');
    // Cancelar, e o próximo é o "Mais opções": os dois desabilitados ficam fora do Tab.
    passos.push('--key', 'Tab', '--key', 'Tab', '--wait', '450');
    avaliar('foco no sutil pelo tab', '({ foco: __ttFoco(), dica: __ttDica() })');
    passos.push('--key', 'Escape', '--wait', '100');
    avaliar('esc', '__ttDica()');
    // Editar, Adicionar tarefa, Remover, (Salvar, desabilitado), Iniciar e Reiniciar.
    passos.push('--key', 'Tab', '--key', 'Tab', '--key', 'Tab', '--key', 'Tab', '--key', 'Tab', '--wait', '450');
    avaliar('foco no circular pelo tab', '({ foco: __ttFoco(), dica: __ttDica() })');
    shot('foco-circular');
    passos.push('--hover', '[data-botao="grande"]', '--wait', '450');
    avaliar('dica mouse', '__ttDica()');
    passos.push('--press', '[data-botao="grande"]', '--wait', '100');
    avaliar('dica clique', '__ttDica()');
    passos.push('--click', '.tt-amostra-topo h1');
  }
  avaliar(null, '__ttSabotarDica()');
  avaliar(null, `(document.querySelector('[data-amostra="botoes-icone"]').scrollIntoView({ block: 'center' }), true)`);
  if (motor === 'chrome') {
    // Com o mouse de verdade: um pointerover sintético seria cancelado pelo
    // que o Chrome manda para o ponteiro parado depois da rolagem.
    passos.push('--hover', '[data-botao="grande"]', '--wait', '450');
    avaliar('dica sabotada', '__ttDica()');
  } else {
    avaliar('dica sabotada', `__ttMostrarDica('[data-botao="grande"]', { espera: 450 })`);
  }
  return { passos, rotulos };
}

function rodar(motor, capturas) {
  const { passos, rotulos } = montarPassos(motor, capturas);
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
  const args = [script, '--size', '1000x700', '--path', '/?plataforma=linux#/dev', ...passos];
  return new Promise((res, rej) => {
    const filho = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erros = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (erros += d));
    filho.on('error', rej);
    filho.on('exit', (codigo) => {
      const linhas = saida.split('\n').filter((l) => l.includes(' => ') && !/^(tecla|mouse|clique|botão|captura)/.test(l));
      const valores = linhas.map((l) => JSON.parse(l.slice(l.lastIndexOf(' => ') + 4)));
      const medidas = {};
      rotulos.forEach((r, i) => r && (medidas[r] = valores[i]));
      res({ codigo, esperadas: rotulos.length, recebidas: valores.length, medidas, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

/** Confere os botões de um tema contra as cores dos tokens. Devolve as falhas. */
export function conferirBotoes(b, c) {
  const f = [];
  const igual = (oque, v, alvo) => v !== alvo && f.push(`${oque}: ${v}, esperado ${alvo}`);
  const tam = (nome, w, h) => {
    const x = b[nome]?.caixa;
    if (!x || !perto(x[2], w) || !perto(x[3], h)) f.push(`${nome} com ${x?.[2]} × ${x?.[3]}, esperado ${w} × ${h}`);
  };
  for (const nome of ['destaque', 'padrao', 'destaque-desabilitado', 'padrao-desabilitado', 'sutil', 'sutil-desabilitado', 'circular', 'circular-destaque', 'circular-desabilitado', 'grande', 'grande-destaque', 'grande-desabilitado']) {
    if (!b[nome]) f.push(`falta o botão ${nome}`);
  }
  if (f.length) return f;
  for (const nome of ['destaque', 'padrao']) if (!perto(b[nome].caixa[3], 32)) f.push(`${nome} com ${b[nome].caixa[3]} px de altura`);
  igual('raio do padrão', b.padrao.raio, '4px');
  tam('sutil', 32, 32);
  tam('circular', 32, 32);
  tam('grande', 64, 64);
  for (const nome of ['circular', 'grande']) igual(`raio do ${nome}`, b[nome].raio, '50%');
  igual('fundo do padrão', b.padrao.fundo, c['--tt-ctl']);
  igual('texto do padrão', b.padrao.cor, c['--tt-fg-1']);
  igual('borda de cima do padrão', b.padrao.bordaCima, c['--tt-ctl-stroke-top']);
  igual('borda de baixo do padrão', b.padrao.bordaBaixo, c['--tt-ctl-stroke-bottom']);
  igual('fundo do destaque', b.destaque.fundo, c['--tt-accent']);
  igual('texto do destaque', b.destaque.cor, c['--tt-fg-on-accent']);
  igual('fundo do sutil', b.sutil.fundo, TRANSPARENTE);
  igual('borda do sutil', b.sutil.bordaCima, TRANSPARENTE);
  igual('fundo do circular de destaque', b['circular-destaque'].fundo, c['--tt-accent']);
  igual('fundo do grande de destaque', b['grande-destaque'].fundo, c['--tt-accent']);
  // Desabilitados.
  for (const nome of ['destaque-desabilitado', 'padrao-desabilitado', 'sutil-desabilitado', 'circular-desabilitado', 'grande-desabilitado']) {
    igual(`texto do ${nome}`, b[nome].cor, c['--tt-fg-disabled']);
    if (!b[nome].desabilitado) f.push(`${nome} não está desabilitado`);
  }
  igual('fundo do destaque desabilitado', b['destaque-desabilitado'].fundo, c['--tt-accent-disabled']);
  igual('fundo do grande de destaque desabilitado', b['grande-desabilitado'].fundo, c['--tt-accent-disabled']);
  igual('fundo do padrão desabilitado', b['padrao-desabilitado'].fundo, c['--tt-ctl']);
  igual('borda de baixo do padrão desabilitado (lisa)', b['padrao-desabilitado'].bordaBaixo, c['--tt-ctl-stroke-top']);
  igual('fundo do sutil desabilitado', b['sutil-desabilitado'].fundo, TRANSPARENTE);
  // Ícones: 16 px, 24 no grande, na cor do texto.
  for (const nome of ['destaque', 'sutil', 'circular', 'circular-destaque']) {
    const i = b[nome].icone;
    if (!i || !perto(i.tamanho[0], 16) || !perto(i.tamanho[1], 16)) f.push(`ícone do ${nome}: ${JSON.stringify(i?.tamanho)}`);
  }
  for (const nome of ['grande', 'grande-destaque']) {
    const i = b[nome].icone;
    if (!i || !perto(i.tamanho[0], 24)) f.push(`ícone do ${nome}: ${JSON.stringify(i?.tamanho)}`);
  }
  igual('ícone do destaque na cor do texto', b.destaque.icone?.cor, b.destaque.cor);
  igual('ícone do sutil desabilitado', b['sutil-desabilitado'].icone?.cor, c['--tt-fg-disabled']);
  // Os só de ícone têm nome e dica.
  for (const nome of ['sutil', 'circular', 'grande', 'grande-destaque']) if (!b[nome].dica || !b[nome].nome) f.push(`${nome} sem nome ou sem data-dica`);
  return f;
}

export function conferirDesabilitados(d) {
  const f = [];
  const { controle, desabilitado } = d.esperado;
  const cinza = (v) => CINZAS_DO_FLUENT.includes(v);
  for (const c of d.caixas) {
    if (c.fundo !== controle) f.push(`caixa ${c.marcada ? 'marcada' : 'desmarcada'}: fundo ${c.fundo}, esperado ${controle}`);
    if (c.borda !== desabilitado) f.push(`caixa: borda ${c.borda}`);
    if (c.marcada && c.glifo !== desabilitado) f.push(`caixa marcada: glifo ${c.glifo}`);
    if (c.rotulo !== desabilitado) f.push(`rótulo da caixa: ${c.rotulo}`);
  }
  for (const c of d.chaves) {
    if (c.borda !== desabilitado) f.push(`chave: borda ${c.borda}`);
    if (c.bolinha !== desabilitado) f.push(`chave: bolinha ${c.bolinha}`);
    if (c.ligada && c.fundo !== controle) f.push(`chave ligada: fundo ${c.fundo}`);
    if (c.rotulo !== desabilitado) f.push(`rótulo da chave: ${c.rotulo}`);
  }
  for (const c of d.radios) {
    if (c.borda !== desabilitado) f.push(`radio: borda ${c.borda}`);
    if (c.rotulo !== desabilitado) f.push(`rótulo do radio: ${c.rotulo}`);
  }
  if (d.lista.fundo !== TRANSPARENTE) f.push(`lista desabilitada: fundo ${d.lista.fundo}`);
  if (d.lista.texto !== desabilitado) f.push(`lista desabilitada: texto ${d.lista.texto}`);
  if (d.lista.rotulo !== desabilitado) f.push(`lista desabilitada: rótulo ${d.lista.rotulo}`);
  if (d.menu.fundo !== TRANSPARENTE) f.push(`item de menu desabilitado: fundo ${d.menu.fundo}`);
  if (d.menu.texto !== desabilitado) f.push(`item de menu desabilitado: texto ${d.menu.texto}`);
  const todas = JSON.stringify(d);
  for (const c of CINZAS_DO_FLUENT) if (todas.includes(c)) f.push(`cinza do Fluent ${c} num desabilitado`);
  if (!d.caixas.length || !d.chaves.length || !d.radios.length) f.push('faltam desabilitados no catálogo');
  void cinza;
  return f;
}

export function conferirDica(m, { lado = 'acima', texto }) {
  const f = [];
  if (!m?.aberta) return ['não abriu'];
  if (m.lado !== lado) f.push(`abriu ${m.lado}, esperado ${lado}`);
  if (!perto(m.vao, 4)) f.push(`vão de ${m.vao} px, esperado 4`);
  if (!perto(m.centro, 0)) f.push(`centro desviado ${m.centro} px`);
  if (!m.dentro) f.push(`fora da janela: ${JSON.stringify(m.dica)}`);
  if (texto && m.texto !== texto) f.push(`texto "${m.texto}", esperado "${texto}"`);
  if (m.popover !== 'manual' || m.ariaHidden !== 'true' || m.quantas !== 1) f.push(`popover ${m.popover}, aria-hidden ${m.ariaHidden}, ${m.quantas} dica(s)`);
  if (m.fonte !== '12px') f.push(`fonte ${m.fonte}`);
  return f;
}

export function conferirAnel(m, { visivel = true } = {}) {
  const f = [];
  if (!visivel) {
    if (m.visivel) f.push('casa :focus-visible depois do clique');
    if (m.contorno?.[0] !== 'none' && m.contorno?.[1] !== '0px') f.push(`contorno ${JSON.stringify(m.contorno)} depois do clique`);
    return f;
  }
  if (!m.visivel) f.push(`sem :focus-visible em ${m.elemento}`);
  const [estilo, largura, cor, recuo] = m.contorno ?? [];
  if (estilo !== 'solid' || largura !== '2px' || cor !== m.esperado.fora || recuo !== '1px') f.push(`contorno ${JSON.stringify(m.contorno)}, esperado solid 2px ${m.esperado.fora} com recuo de 1px`);
  if (!m.sombra?.includes(m.esperado.dentro) || !/0px 0px 0px 1px/.test(m.sombra)) f.push(`sombra ${m.sombra}, esperado 1px de ${m.esperado.dentro}`);
  return f;
}

async function main() {
  const opts = lerArgs(process.argv.slice(2));
  const motores = opts.motor === 'todos' ? ['chrome', 'webkit'] : [opts.motor];
  let falhou = false;
  const linha = (ok, texto, falhas = []) => {
    if (!ok) falhou = true;
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}${falhas.length ? `\n        ${falhas.join('\n        ')}` : ''}`);
  };
  for (const motor of motores) {
    const r = await rodar(motor, opts.capturas && resolve(opts.capturas));
    console.log(`\n${NOMES[motor]}: ${r.recebidas} medidas`);
    if (r.codigo !== 0 || r.recebidas !== r.esperadas) {
      falhou = true;
      console.log(`FALHA: o ${motor} saiu com ${r.codigo} e ${r.recebidas} de ${r.esperadas} medidas`);
      for (const l of r.erros) console.log(`  ${l}`);
      continue;
    }
    for (const l of r.erros) console.log(`  aviso do ${motor}: ${l}`);
    const M = r.medidas;
    for (const tema of TEMAS) {
      const f = conferirBotoes(M[`botoes ${tema}`], M[`cores ${tema}`]);
      const b = M[`botoes ${tema}`];
      linha(!f.length, `botões no ${tema}: padrão ${b?.padrao?.fundo}, destaque ${b?.destaque?.fundo}, desabilitados ${b?.['padrao-desabilitado']?.cor} / ${b?.['destaque-desabilitado']?.fundo}`, f);
      const fd = conferirDesabilitados(M[`desabilitados ${tema}`]);
      const d = M[`desabilitados ${tema}`];
      linha(!fd.length, `desabilitados do Fluent no ${tema}: caixa ${d?.caixas?.[0]?.fundo} / ${d?.caixas?.[0]?.borda}, item de menu ${d?.menu?.fundo} / ${d?.menu?.texto}`, fd);
    }
    const ic = M.icones;
    const fi = [];
    if (ic.celulas.length !== 18 || ic.svgs !== 23) fi.push(`${ic.celulas.length} ícones e ${ic.svgs} desenhos, esperado 18 e 23`);
    for (const c of ic.celulas) {
      for (const g of c.grades) {
        if (!perto(g.tamanho[0], g.grade) || !perto(g.tamanho[1], g.grade) || g.desenho < 1) fi.push(`${c.nome} ${g.grade}: ${JSON.stringify(g.tamanho)}, ${g.desenho} path(s)`);
        if (g.fill !== ic.corDoTexto) fi.push(`${c.nome} ${g.grade}: fill ${g.fill}, esperado a cor do texto ${ic.corDoTexto}`);
      }
    }
    if (ic.noPacote.length) fi.push(`pedidos ao pacote: ${ic.noPacote.join(', ')}`);
    linha(!fi.length, `ícones do catálogo: ${ic.celulas.length} nomes, ${ic.svgs} desenhos, ${ic.noPacote.length} pedido(s) ao @fluentui/svg-icons`, fi);

    const cedo = M['dica cedo'];
    linha(!cedo?.aberta, `dica ainda fechada 120 ms depois do mouse chegar (atraso de 250 ms): ${cedo?.aberta}`);
    const fd = conferirDica(M.dica, { texto: 'Marcar volta' });
    linha(!fd.length, `dica do "Marcar volta": ${M.dica?.lado}, vão ${M.dica?.vao}, centro ${M.dica?.centro}, fundo ${M.dica?.fundo}`, fd);
    const viz = M['dica vizinha'];
    const fv = conferirDica(viz, { texto: 'Pausar' });
    linha(!fv.length, `com a dica aberta, a do botão vizinho aparece em 60 ms (sem o atraso): "${viz?.texto}", ${viz?.lado}, centro ${viz?.centro}`, fv);
    linha(M['dica saiu']?.aberta === false, `a dica some quando o mouse sai: ${M['dica saiu']?.aberta}`);
    linha(M['dica desabilitado']?.aberta === false, `botão desabilitado não mostra dica: ${M['dica desabilitado']?.aberta}`);
    const ft = conferirDica(M['dica no topo'], { lado: 'abaixo', texto: 'Mais opções' });
    linha(!ft.length, `perto do topo, a dica vira para baixo: ${M['dica no topo']?.lado}, vão ${M['dica no topo']?.vao}`, ft);
    const dm = M['dica com menu'];
    linha(M['menu antes']?.aberto && dm?.menu === true && dm?.dica?.aberta, `a dica aparece sem fechar o menu aberto: menu ${dm?.menu}, dica ${dm?.dica?.aberta}`);
    if (motor === 'chrome') {
      const c = M['cores lite'];
      const hv = M['hover padrao'];
      const cl = M['clique padrao'];
      const hs = M['hover sutil'];
      const cs = M['clique sutil'];
      const fm = [];
      // O hover e o clique pelos tokens do Lite, como o getComputedStyle os escreve.
      if (hv?.fundo !== 'rgba(255, 255, 255, 0.1)') fm.push(`hover do padrão ${hv?.fundo}`);
      if (cl?.fundo !== 'rgba(255, 255, 255, 0.05)' || cl?.bordaBaixo !== c['--tt-ctl-stroke-top']) fm.push(`clique do padrão ${cl?.fundo} / borda de baixo ${cl?.bordaBaixo}`);
      if (hs?.fundo !== 'rgba(255, 255, 255, 0.06)') fm.push(`hover do sutil ${hs?.fundo}`);
      if (cs?.fundo !== 'rgba(255, 255, 255, 0.06)' || cs?.cor !== c['--tt-fg-1']) fm.push(`clique do sutil ${cs?.fundo} / ${cs?.cor}`);
      linha(!fm.length, `mouse de verdade no Lite: hover ${hv?.fundo}, clique ${cl?.fundo}; sutil ${hs?.fundo} / ${cs?.fundo}`, fm);
      const fc = conferirAnel(M['foco depois do clique'], { visivel: false });
      linha(!fc.length, `o clique não mostra o anel: ${M['foco depois do clique']?.elemento}, :focus-visible ${M['foco depois do clique']?.visivel}`, fc);
      const ft2 = conferirAnel(M['foco pelo tab']);
      linha(!ft2.length && /Iniciar sessão de foco/.test(M['foco pelo tab']?.elemento), `Tab: anel duplo em ${M['foco pelo tab']?.elemento}: ${JSON.stringify(M['foco pelo tab']?.contorno)} + ${M['foco pelo tab']?.sombra}`, ft2);
      const fs = M['foco no sutil pelo tab'];
      const fs2 = [...conferirAnel(fs.foco), ...conferirDica(fs.dica, { texto: 'Mais opções' })];
      if (fs.foco?.raio !== '4px') fs2.push(`raio ${fs.foco?.raio}`);
      linha(!fs2.length, `Tab até o sutil "Mais opções" (o desabilitado fica fora do Tab): anel e dica ${fs.dica?.lado}`, fs2);
      linha(M.esc?.aberta === false, `Esc fecha a dica sem mover o foco: ${M.esc?.aberta}`);
      const fcirc = M['foco no circular pelo tab'];
      const fc2 = [...conferirAnel(fcirc.foco), ...conferirDica(fcirc.dica, { texto: 'Reiniciar' })];
      if (!/Reiniciar/.test(fcirc.foco?.elemento) || fcirc.foco?.raio !== '50%') fc2.push(`foco em ${fcirc.foco?.elemento}, raio ${fcirc.foco?.raio}`);
      linha(!fc2.length, `Tab até o circular "Reiniciar": anel redondo (raio ${fcirc.foco?.raio}) e a dica ${fcirc.dica?.lado}`, fc2);
      const fmouse = conferirDica(M['dica mouse'], { texto: 'Marcar volta' });
      linha(!fmouse.length, `mouse de verdade parado no "Marcar volta": ${M['dica mouse']?.lado}, vão ${M['dica mouse']?.vao}`, fmouse);
      linha(M['dica clique']?.aberta === false, `apertar o botão fecha a dica: ${M['dica clique']?.aberta}`);
    }
    const sab = conferirDica(M['dica sabotada'], { texto: 'Marcar volta' });
    linha(
      M['dica sabotada']?.aberta && sab.length > 0,
      `controle negativo: com a âncora da dica sabotada, a dica abre e a posição acusa (${sab.join('; ') || 'nada'})`,
    );
  }
  console.log(falhou ? '\nFALHOU' : '\nTudo ok.');
  process.exitCode = falhou ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
