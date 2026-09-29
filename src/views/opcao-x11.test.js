// Testes da opção "Compatibilidade X11" (M57; PLANO.md, 5.9, plano B2), com
// um documento falso: quando aparece, o que grava e quando pede o reinício.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ligarOpcaoX11, marcacao, marcacaoRodape, rodape } from './opcao-x11.js';
import t from '../lib/i18n/pt-BR.js';

const x = t.configuracoes.x11;
const esperar = () => new Promise((r) => setTimeout(r, 0));

test('rodape: reiniciar quando o gravado difere do que vale; aviso sem Xwayland', () => {
  const casos = [
    // ligada, { ativa, xwayland } → rodapé
    [false, { ativa: false, xwayland: true }, null],
    [true, { ativa: false, xwayland: true }, 'reiniciar'],
    [true, { ativa: true, xwayland: true }, null],
    [false, { ativa: true, xwayland: true }, 'reiniciar'],
    [true, { ativa: false, xwayland: false }, 'semXwayland'],
    [false, { ativa: false, xwayland: false }, null],
  ];
  for (const [ligada, sit, esperado] of casos) assert.equal(rodape(ligada, sit), esperado, JSON.stringify([ligada, sit]));
});

test('marcacao: seção Avançado, o interruptor rotulado e o rodapé', () => {
  const icone = (n, g) => `<svg data-icone="${n}" data-grade="${g}"></svg>`;
  const html = marcacao({ ligada: false, situacao: { disponivel: true, ativa: false, xwayland: true }, icone });
  assert.match(html, /<h2 id="config-avancado" class="tt-t-body-strong">Avançado<\/h2>/);
  assert.match(html, /<svg data-icone="window_wrench" data-grade="20"><\/svg>/);
  assert.ok(html.includes(`<span id="config-x11" class="tt-config-titulo">${x.titulo}</span>`));
  assert.match(html, /<fluent-switch class="tt-config-controle" aria-labelledby="config-x11" aria-describedby="config-x11-desc"><\/fluent-switch>/);
  assert.match(html, /<div class="tt-config-rodape" role="status" hidden><\/div>/);
  const ligada = marcacao({ ligada: true, situacao: { disponivel: true, ativa: false, xwayland: true } });
  assert.match(ligada, /<fluent-switch [^>]* checked>/);
  assert.ok(ligada.includes(`<div class="tt-config-rodape" role="status">${marcacaoRodape('reiniciar')}</div>`));
  assert.match(marcacaoRodape('reiniciar'), /<button type="button" data-reiniciar>Reiniciar agora<\/button>/);
  assert.ok(marcacaoRodape('semXwayland').includes(x.semXwayland));
  assert.equal(marcacaoRodape(null), '');
});

function falso({ plataforma = 'linux', situacao = { disponivel: true, ativa: false, xwayland: true }, linuxX11 = false, recusar = false } = {}) {
  const doc = { documentElement: { dataset: { platform: plataforma } } };
  const chamadas = [];
  const alvo = () => {
    const ouvintes = {};
    return {
      ouvintes,
      addEventListener: (ev, f) => (ouvintes[ev] = f),
    };
  };
  const chave = { ...alvo(), checked: false };
  const botao = { disabled: false };
  const pe = { ...alvo(), innerHTML: '', hidden: true };
  const secao = {
    removida: false,
    querySelector: (s) => ({ 'fluent-switch': chave, '.tt-config-rodape': pe })[s],
    remove() {
      this.removida = true;
    },
  };
  const pagina = {
    html: '',
    insertAdjacentHTML(onde, html) {
      assert.equal(onde, 'beforeend');
      this.html += html;
      chave.checked = / checked>/.test(html);
      pe.hidden = / hidden>/.test(html);
      this.lastElementChild = secao;
    },
  };
  let gravado = linuxX11;
  const ipc = async () => ({
    situacao: async () => (chamadas.push('situacao'), situacao),
    obter: async () => ({ linuxX11: gravado }),
    gravar: async (patch) => {
      chamadas.push(`gravar:${JSON.stringify(patch)}`);
      if (recusar) throw { code: 'writeFailed' };
      gravado = patch.linuxX11;
      return { linuxX11: gravado };
    },
    reiniciar: async () => chamadas.push('reiniciar'),
  });
  const clicar = (alvoDoClique) => pe.ouvintes.click({ target: { closest: (s) => (s === '[data-reiniciar]' ? alvoDoClique : null) } });
  return { doc, pagina, chave, pe, secao, botao, chamadas, ipc, clicar };
}

test('fora do Linux, nem pergunta ao Rust', async () => {
  const f = falso({ plataforma: 'windows' });
  let pediu = false;
  const limpar = ligarOpcaoX11(f.pagina, { doc: f.doc, ipc: async () => ((pediu = true), {}) });
  await esperar();
  assert.equal(pediu, false);
  assert.equal(f.pagina.html, '');
  limpar();
});

test('sem sessão Wayland (disponivel falso), não mostra nada', async () => {
  const f = falso({ situacao: { disponivel: false, ativa: false, xwayland: true } });
  ligarOpcaoX11(f.pagina, { doc: f.doc, ipc: f.ipc });
  await esperar();
  assert.equal(f.pagina.html, '');
});

test('ligar grava linuxX11 e oferece o reinício; o botão reinicia', async () => {
  const f = falso();
  const limpar = ligarOpcaoX11(f.pagina, { doc: f.doc, ipc: f.ipc });
  await esperar();
  assert.match(f.pagina.html, /data-cartao="x11"/);
  assert.equal(f.chave.checked, false);
  assert.equal(f.pe.hidden, true);
  f.chave.checked = true;
  await f.chave.ouvintes.change();
  assert.deepEqual(f.chamadas.slice(1), ['gravar:{"linuxX11":true}']);
  assert.equal(f.pe.hidden, false);
  assert.match(f.pe.innerHTML, /data-reiniciar/);
  f.clicar(f.botao);
  await esperar();
  assert.equal(f.botao.disabled, true);
  assert.deepEqual(f.chamadas.at(-1), 'reiniciar');
  // Desligar de novo (antes de reiniciar): volta a valer o que está valendo.
  f.chave.checked = false;
  await f.chave.ouvintes.change();
  assert.equal(f.pe.hidden, true);
  limpar();
  assert.equal(f.secao.removida, true);
});

test('aberto pelo Xwayland: ligada, sem rodapé; desligar pede o reinício', async () => {
  const f = falso({ situacao: { disponivel: true, ativa: true, xwayland: true }, linuxX11: true });
  ligarOpcaoX11(f.pagina, { doc: f.doc, ipc: f.ipc });
  await esperar();
  assert.equal(f.chave.checked, true);
  assert.equal(f.pe.hidden, true);
  f.chave.checked = false;
  await f.chave.ouvintes.change();
  assert.equal(f.pe.hidden, false);
  assert.match(f.pe.innerHTML, /Reiniciar agora/);
});

test('gravação recusada: o interruptor volta', async () => {
  const f = falso({ recusar: true });
  const erro = console.error;
  console.error = () => {};
  try {
    ligarOpcaoX11(f.pagina, { doc: f.doc, ipc: f.ipc });
    await esperar();
    f.chave.checked = true;
    await f.chave.ouvintes.change();
    assert.equal(f.chave.checked, false);
    assert.equal(f.pe.hidden, true);
  } finally {
    console.error = erro;
  }
});

test('sai da tela antes da resposta: não insere nada', async () => {
  const f = falso();
  const limpar = ligarOpcaoX11(f.pagina, { doc: f.doc, ipc: f.ipc });
  limpar();
  await esperar();
  assert.equal(f.pagina.html, '');
});
