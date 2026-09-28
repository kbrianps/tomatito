// Testes dos atalhos de navegação (M09, seção 3.8 do plano).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acaoDaJanela, ligarAtalhosDaJanela, escDeListaAberta, espacoLivre, ligarAtalhosDeNavegacao, ligarEscDasListas, rotaDoAtalho } from './keys.js';

const tecla = (code, key, mods = {}) => ({ code, key, ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, ...mods });

test('Ctrl+1/2/3 e Ctrl+, abrem Foco, Temporizador, Cronômetro e Configurações', () => {
  assert.equal(rotaDoAtalho(tecla('Digit1', '1')), 'foco');
  assert.equal(rotaDoAtalho(tecla('Digit2', '2')), 'temporizador');
  assert.equal(rotaDoAtalho(tecla('Digit3', '3')), 'cronometro');
  assert.equal(rotaDoAtalho(tecla('Comma', ',')), 'configuracoes');
});

test('dígitos pela posição (AZERTY e teclado numérico) e vírgula pelo caractere', () => {
  assert.equal(rotaDoAtalho(tecla('Digit1', '&')), 'foco', 'AZERTY: a tecla do 1 dá "&"');
  assert.equal(rotaDoAtalho(tecla('Numpad3', '3')), 'cronometro');
  assert.equal(rotaDoAtalho(tecla('KeyM', ',')), 'configuracoes', 'AZERTY: a vírgula fica na tecla do M');
});

test('sem Ctrl, com outro modificador ou outra tecla, não é atalho', () => {
  assert.equal(rotaDoAtalho(tecla('Digit1', '1', { ctrlKey: false })), null);
  assert.equal(rotaDoAtalho(tecla('Digit1', '!', { shiftKey: true })), null);
  assert.equal(rotaDoAtalho(tecla('Digit2', '2', { altKey: true })), null);
  assert.equal(rotaDoAtalho(tecla('Digit3', '3', { metaKey: true })), null);
  assert.equal(rotaDoAtalho(tecla('Digit4', '4')), null);
  assert.equal(rotaDoAtalho(tecla('Digit0', '0')), null, 'Ctrl+0 é do zoom');
  assert.equal(rotaDoAtalho(tecla('Equal', '=')), null, 'Ctrl+= é do zoom');
});

test('o ouvinte navega, cancela o padrão e respeita quem já cancelou', () => {
  let ouvinte;
  const alvo = { addEventListener: (_t, fn) => (ouvinte = fn), removeEventListener: () => (ouvinte = null) };
  const rotas = [];
  const desligar = ligarAtalhosDeNavegacao((r) => rotas.push(r), alvo);
  const evento = (e) => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...e });
  const e1 = evento(tecla('Digit2', '2'));
  ouvinte(e1);
  assert.deepEqual(rotas, ['temporizador']);
  assert.equal(e1.defaultPrevented, true);
  ouvinte(evento({ ...tecla('Digit3', '3'), defaultPrevented: true }));
  const e2 = evento(tecla('KeyA', 'a'));
  ouvinte(e2);
  assert.deepEqual(rotas, ['temporizador']);
  assert.equal(e2.defaultPrevented, false);
  desligar();
  assert.equal(ouvinte, null);
});

// M12: Esc numa lista suspensa aberta é da lista, e não do diálogo em volta.
test('Esc com uma lista suspensa aberta cancela o padrão (o diálogo em volta não fecha); fechada, não', () => {
  const alvoEm = (open) => ({ closest: (s) => (s === 'fluent-dropdown' ? { open } : null) });
  assert.equal(escDeListaAberta({ key: 'Escape', target: alvoEm(true) }), true);
  assert.equal(escDeListaAberta({ key: 'Escape', target: alvoEm(false) }), false, 'lista fechada: o Esc fecha o diálogo');
  assert.equal(escDeListaAberta({ key: 'Escape', target: { closest: () => null } }), false, 'fora de uma lista');
  assert.equal(escDeListaAberta({ key: 'Enter', target: alvoEm(true) }), false);
  assert.equal(escDeListaAberta({ key: 'Escape', target: null }), false);

  let ouvinte;
  let captura;
  const alvo = {
    addEventListener: (_t, fn, c) => ((ouvinte = fn), (captura = c)),
    removeEventListener: () => (ouvinte = null),
  };
  const desligar = ligarEscDasListas(alvo);
  assert.equal(captura, true, 'na fase de captura, antes do componente');
  const evento = (e) => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...e });
  const aberta = evento({ key: 'Escape', target: alvoEm(true) });
  ouvinte(aberta);
  assert.equal(aberta.defaultPrevented, true);
  const fechada = evento({ key: 'Escape', target: alvoEm(false) });
  ouvinte(fechada);
  assert.equal(fechada.defaultPrevented, false);
  desligar();
  assert.equal(ouvinte, null);
});

// M19: o Espaço da tela Foco.
const espaco = (alvo = null, mods = {}) => ({
  key: ' ', code: 'Space', repeat: false, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
  defaultPrevented: false, target: alvo, ...mods,
});
// Um alvo cujo closest acha o seletor `dono` (se estiver na lista pedida).
const alvo = (dono = null) => ({ closest: (s) => (dono && s.split(',').includes(dono) ? {} : null) });

test('Espaço com o foco fora de botões e campos: vale', () => {
  assert.equal(espacoLivre(espaco(alvo())), true, 'no <body> ou no título da tela');
  assert.equal(espacoLivre(espaco(null)), true);
  assert.equal(espacoLivre(espaco(alvo(), { key: 'Spacebar', code: 'Space' })), true, 'pela posição da tecla');
});

test('Espaço num controle, repetido, com modificador ou já tratado: não vale', () => {
  for (const dono of ['button', 'a[href]', 'input', 'textarea', '[role="spinbutton"]', 'fluent-checkbox', 'fluent-menu-item', 'fluent-menu', 'dialog', '[tabindex]:not([tabindex^="-"])']) {
    assert.equal(espacoLivre(espaco(alvo(dono))), false, dono);
  }
  assert.equal(espacoLivre(espaco(alvo(), { repeat: true })), false);
  assert.equal(espacoLivre(espaco(alvo(), { ctrlKey: true })), false);
  assert.equal(espacoLivre(espaco(alvo(), { shiftKey: true })), false);
  assert.equal(espacoLivre(espaco(alvo(), { defaultPrevented: true })), false);
  assert.equal(espacoLivre(espaco(alvo(), { isComposing: true })), false);
  assert.equal(espacoLivre(espaco(alvo(), { key: 'Enter', code: 'Enter' })), false);
});

test('M34: teclaLivre, o L do cronômetro, com as regras do Espaço', async () => {
  const { teclaLivre } = await import('./keys.js');
  const fora = { closest: () => null };
  const botao = { closest: () => ({}) };
  const ev = (extra = {}) => ({ key: 'l', code: 'KeyL', target: fora, ...extra });
  assert.equal(teclaLivre(ev(), 'l'), true);
  assert.equal(teclaLivre(ev({ key: 'L' }), 'l'), true, 'Caps Lock');
  assert.equal(teclaLivre(ev({ key: 'k' }), 'l'), false);
  assert.equal(teclaLivre(ev({ target: botao }), 'l'), false, 'foco num botão ou campo');
  for (const m of ['ctrlKey', 'altKey', 'shiftKey', 'metaKey', 'repeat', 'defaultPrevented', 'isComposing']) {
    assert.equal(teclaLivre(ev({ [m]: true }), 'l'), false, m);
  }
  assert.equal(teclaLivre({ code: 'KeyL', target: fora }, 'l'), false, 'sem key');
});

// M37: Ctrl+W e Ctrl+Q (3.4 e 3.8).
test('Ctrl+W fecha e Ctrl+Q sai, pelo caractere, com a posição de reserva', () => {
  assert.equal(acaoDaJanela(tecla('KeyW', 'w')), 'fechar');
  assert.equal(acaoDaJanela(tecla('KeyQ', 'q')), 'sair');
  assert.equal(acaoDaJanela(tecla('KeyQ', 'Q')), 'sair', 'Caps Lock ligado');
  assert.equal(acaoDaJanela(tecla('KeyA', 'q')), 'sair', 'AZERTY: o Q fica na tecla do A');
  assert.equal(acaoDaJanela(tecla('KeyQ', 'a')), null, 'AZERTY: a tecla do Q dá A');
  assert.equal(acaoDaJanela(tecla('KeyQ', 'й')), 'sair', 'cirílico: vale a posição');
  assert.equal(acaoDaJanela(tecla('KeyW', 'ц')), 'fechar');
});

test('Ctrl+W e Ctrl+Q só com Ctrl sozinho e sem repetição', () => {
  assert.equal(acaoDaJanela(tecla('KeyQ', 'q', { ctrlKey: false })), null);
  assert.equal(acaoDaJanela(tecla('KeyQ', 'Q', { shiftKey: true })), null);
  assert.equal(acaoDaJanela(tecla('KeyW', 'w', { altKey: true })), null);
  assert.equal(acaoDaJanela(tecla('KeyW', 'w', { metaKey: true })), null);
  assert.equal(acaoDaJanela(tecla('KeyQ', 'q', { repeat: true })), null);
  assert.equal(acaoDaJanela(tecla('KeyR', 'r')), null);
});

test('ligarAtalhosDaJanela chama a ação, cancela o padrão e respeita quem já tratou', async () => {
  const alvo = new EventTarget();
  const chamadas = [];
  const desligar = ligarAtalhosDaJanela({ fechar: () => chamadas.push('fechar'), sair: () => chamadas.push('sair') }, alvo);
  const disparar = (code, key, extra = {}) => {
    const e = Object.assign(new Event('keydown', { cancelable: true }), tecla(code, key), extra);
    alvo.dispatchEvent(e);
    return e;
  };
  assert.equal(disparar('KeyQ', 'q').defaultPrevented, true);
  assert.equal(disparar('KeyW', 'w').defaultPrevented, true);
  assert.equal(disparar('KeyX', 'x').defaultPrevented, false);
  const tratado = Object.assign(new Event('keydown', { cancelable: true }), tecla('KeyQ', 'q'));
  tratado.preventDefault();
  alvo.dispatchEvent(tratado);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(chamadas, ['sair', 'fechar']);
  desligar();
  disparar('KeyQ', 'q');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(chamadas, ['sair', 'fechar']);
});
