import assert from 'node:assert/strict';
import test from 'node:test';
import t from '../lib/i18n/pt-BR.js';
import { fracao, ligarAtualizarApp, marcacao, quadro } from './atualizar-app.js';

const a = t.configuracoes.atualizarApp;

test('quadro: o texto e o botão de cada estado', () => {
  assert.deepEqual(quadro(null), { texto: a.descricao, botao: 'Procurar atualizações', acao: 'procurar', ocupado: false });
  assert.equal(quadro(null, 'deb').texto, a.descricaoDeb);
  assert.match(a.descricaoDeb, /atualizador do sistema/);
  assert.equal(quadro({ tipo: 'procurando' }).ocupado, true);
  assert.equal(quadro({ tipo: 'atual', versao: '0.3.0' }).texto, 'O Tomatito está atualizado (versão 0.3.0).');
  assert.deepEqual(quadro({ tipo: 'disponivel', versao: '0.3.1' }), {
    texto: 'Versão 0.3.1 disponível. O Tomatito reinicia ao terminar a instalação.',
    botao: 'Atualizar agora',
    acao: 'instalar',
    ocupado: false,
  });
  assert.equal(quadro({ tipo: 'baixando', fracao: null }).texto, 'Baixando…');
  assert.equal(quadro({ tipo: 'baixando', fracao: 0.416 }).texto, 'Baixando… 42%');
  assert.equal(quadro({ tipo: 'baixando', fracao: 0.4 }).ocupado, true);
  assert.equal(quadro({ tipo: 'instalando' }).ocupado, true);
  assert.equal(quadro({ tipo: 'erroDeRede' }).acao, 'procurar');
  assert.equal(quadro({ tipo: 'erroAoInstalar' }).texto, a.erroAoInstalar);
});

test('fracao: de 0 a 1, e null sem o total', () => {
  assert.equal(fracao({ downloaded: 50, total: 200 }), 0.25);
  assert.equal(fracao({ downloaded: 300, total: 200 }), 1);
  assert.equal(fracao({ downloaded: 50, total: null }), null);
  assert.equal(fracao({ downloaded: 50, total: 0 }), null);
  assert.equal(fracao(), null);
});

test('marcacao: o cartão com o botão e o da opção, desligada por padrão', () => {
  const icone = (n, g) => `<svg data-icone="${n}" data-grade="${g}"></svg>`;
  const html = marcacao({ icone });
  assert.match(html, /^<section class="tt-config-secao" aria-labelledby="config-atualizacao-app" data-secao="atualizacao-app"><h2 id="config-atualizacao-app" class="tt-t-body-strong">Atualização<\/h2>/);
  assert.match(html, /<svg data-icone="arrow_sync" data-grade="20"><\/svg>/);
  assert.match(html, /<span id="config-atualizar-app-desc" class="tt-config-descricao tt-t-caption" role="status">Consulta o GitHub em busca da versão mais recente\.<\/span>/);
  assert.match(html, /<button type="button" data-atualizar-app="procurar" aria-describedby="config-atualizar-app-desc">Procurar atualizações<\/button>/);
  assert.match(html, /<fluent-switch class="tt-config-controle" aria-labelledby="config-atualizar-auto" aria-describedby="config-atualizar-auto-desc"><\/fluent-switch>/);
  assert.match(a.auto.descricao, /só acessa a internet quando você pede/);
  const nova = marcacao({ auto: true, estado: { tipo: 'disponivel', versao: '0.3.1' } });
  assert.match(nova, /<button type="button" data-atualizar-app="instalar" aria-describedby="config-atualizar-app-desc" class="tt-accent">Atualizar agora<\/button>/);
  assert.match(nova, /<fluent-switch [^>]* checked>/);
  assert.match(marcacao({ estado: { tipo: 'procurando' } }), /data-atualizar-app="procurar"[^>]* disabled>/);
});

function falso({ info = { available: true, channel: 'appimage', pending: null }, autoUpdate = false, procurar, instalar, recusarGravar = false } = {}) {
  const chamadas = [];
  const alvo = (extra = {}) => {
    const ouvintes = {};
    return { ouvintes, addEventListener: (ev, f) => (ouvintes[ev] = f), ...extra };
  };
  const classes = new Set();
  const texto = { textContent: '' };
  const botao = alvo({ textContent: '', disabled: false, dataset: {}, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } });
  const chave = alvo({ checked: false });
  const secao = {
    removida: false,
    querySelector: (s) => ({ '#config-atualizar-app-desc': texto, '[data-atualizar-app]': botao, 'fluent-switch': chave })[s],
    remove() {
      this.removida = true;
    },
  };
  const escrever = (html) => {
    texto.textContent = /role="status">([^<]*)</.exec(html)[1];
    botao.dataset.atualizarApp = /data-atualizar-app="(\w+)"/.exec(html)[1];
    botao.textContent = />([^<]*)<\/button>/.exec(html)[1];
    chave.checked = / checked>/.test(html);
  };
  const sobre = {
    insertAdjacentHTML(onde, html) {
      assert.equal(onde, 'beforebegin');
      escrever(html);
      this.previousElementSibling = secao;
    },
  };
  const pagina = { querySelector: (s) => (s === '[aria-labelledby="config-sobre-secao"]' ? sobre : null) };
  const eventos = {};
  const ipc = async () => ({
    info: async () => info,
    obter: async () => ({ autoUpdate }),
    gravar: async (patch) => {
      chamadas.push(`gravar:${JSON.stringify(patch)}`);
      if (recusarGravar) throw { code: 'io' };
      return patch;
    },
    procurar: async () => (chamadas.push('procurar'), procurar()),
    instalar: async () => (chamadas.push('instalar'), instalar?.()),
    ouvir: async (ev, cb) => ((eventos[ev] = cb), () => delete eventos[ev]),
    EVENTOS: { atualizacaoProgresso: 'progresso', atualizacaoDisponivel: 'disponivel' },
  });
  return { pagina, secao, texto, botao, chave, classes, chamadas, eventos, ipc };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));
const calado = async (f) => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    await f();
  } finally {
    Object.assign(console, { warn, error });
  }
};

test('sem instalador (update_info), a seção não aparece', async () => {
  const f = falso({ info: { available: false, channel: null, pending: null } });
  const limpar = ligarAtualizarApp(f.pagina, { ipc: f.ipc });
  await esperar();
  assert.equal(f.texto.textContent, '');
  limpar();
});

test('procurar: já atualizado; depois, versão nova, download com progresso e instalação', async () => {
  const respostas = [{ current: '0.3.0', version: null }, { current: '0.3.0', version: '0.3.1' }];
  let terminar;
  const f = falso({ procurar: async () => respostas.shift(), instalar: () => new Promise((ok) => (terminar = ok)) });
  const limpar = ligarAtualizarApp(f.pagina, { ipc: f.ipc });
  await esperar();
  assert.equal(f.texto.textContent, a.descricao);

  f.botao.ouvintes.click();
  assert.equal(f.texto.textContent, 'Procurando…');
  assert.equal(f.botao.disabled, true);
  await esperar();
  assert.equal(f.texto.textContent, 'O Tomatito está atualizado (versão 0.3.0).');
  assert.equal(f.botao.disabled, false);

  f.botao.ouvintes.click();
  await esperar();
  assert.equal(f.botao.dataset.atualizarApp, 'instalar');
  assert.equal(f.botao.textContent, 'Atualizar agora');
  assert.ok(f.classes.has('tt-accent'));

  f.botao.ouvintes.click();
  await esperar();
  assert.equal(f.texto.textContent, 'Baixando…');
  assert.equal(f.botao.disabled, true);
  f.eventos.progresso({ downloaded: 250, total: 1000 });
  assert.equal(f.texto.textContent, 'Baixando… 25%');
  f.eventos.progresso({ downloaded: 1000, total: 1000 });
  assert.equal(f.texto.textContent, a.instalando);
  terminar();
  await esperar();
  assert.equal(f.texto.textContent, a.instalando);
  assert.deepEqual(f.chamadas, ['procurar', 'procurar', 'instalar']);

  limpar();
  assert.equal(f.secao.removida, true);
  assert.deepEqual(Object.keys(f.eventos), []);
});

test('a versão já achada (pending) abre com "Atualizar agora"; a procura ao abrir chega pelo evento', async () => {
  const f = falso({ info: { available: true, channel: 'deb', pending: '0.3.1' }, autoUpdate: true });
  const limpar = ligarAtualizarApp(f.pagina, { ipc: f.ipc });
  await esperar();
  assert.equal(f.botao.dataset.atualizarApp, 'instalar');
  assert.equal(f.chave.checked, true);
  limpar();

  const g = falso();
  const limpar2 = ligarAtualizarApp(g.pagina, { ipc: g.ipc });
  await esperar();
  g.eventos.disponivel({ version: '0.4.0' });
  assert.equal(g.texto.textContent, a.disponivel('0.4.0'));
  limpar2();
});

test('erros: sem rede na procura; falha na instalação; a opção volta se a gravação falhar', async () => {
  await calado(async () => {
    const f = falso({
      procurar: async () => {
        throw { code: 'network', message: 'sem rede' };
      },
    });
    ligarAtualizarApp(f.pagina, { ipc: f.ipc });
    await esperar();
    f.botao.ouvintes.click();
    await esperar();
    assert.equal(f.texto.textContent, a.erroDeRede);
    assert.equal(f.botao.disabled, false);

    const g = falso({
      info: { available: true, channel: 'nsis', pending: '0.3.1' },
      instalar: async () => {
        throw { code: 'install', message: 'assinatura' };
      },
      recusarGravar: true,
    });
    ligarAtualizarApp(g.pagina, { ipc: g.ipc });
    await esperar();
    g.botao.ouvintes.click();
    await esperar();
    assert.equal(g.texto.textContent, a.erroAoInstalar);
    assert.equal(g.botao.dataset.atualizarApp, 'procurar');

    g.chave.checked = true;
    g.chave.ouvintes.change();
    await esperar();
    assert.equal(g.chave.checked, false);
    assert.deepEqual(g.chamadas, ['instalar', 'gravar:{"autoUpdate":true}']);
  });
});
