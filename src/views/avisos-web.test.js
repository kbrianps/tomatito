// Testes da seção Avisos da web (W14), sem DOM: os quatro estados, o botão
// de cada um e o rodapé honesto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDaSecao, ligarAvisosWeb, linhasDoRodape, marcacao, marcacaoDoBotao } from './avisos-web.js';
import t from '../lib/i18n/pt-BR.js';

const a = t.configuracoes.avisos;
const avisos = (estado) => ({ estado: () => estado });

test('estadoDaSecao: sem notificações na casca, o 4º estado; com elas, a permissão', () => {
  assert.equal(estadoDaSecao({ recursos: { notificacoes: false }, avisos: avisos('granted') }), 'sem-suporte');
  assert.equal(estadoDaSecao({ recursos: { notificacoes: true }, avisos: null }), 'sem-suporte');
  for (const e of ['default', 'granted', 'denied']) assert.equal(estadoDaSecao({ recursos: { notificacoes: true }, avisos: avisos(e) }), e);
});

test('os quatro estados: o texto do plano e o botão de cada um', () => {
  assert.match(marcacao('default'), /Mostrar um aviso quando o foco ou o intervalo terminar\./);
  assert.match(marcacaoDoBotao('default'), /<button type="button" data-permitir [^>]*>Permitir avisos<\/button>/);
  assert.match(marcacao('granted'), /Ativadas neste navegador\./);
  assert.match(marcacaoDoBotao('granted'), />Testar aviso<\/button>/);
  assert.match(marcacao('denied'), /Bloqueadas neste navegador\. Para ativar, abra as permissões do site/);
  assert.equal(marcacaoDoBotao('denied'), '');
  assert.match(marcacao('sem-suporte'), /Neste navegador não há notificações\./);
  assert.equal(marcacaoDoBotao('sem-suporte'), '');
  assert.doesNotMatch(marcacao('denied') + marcacao('sem-suporte'), /<button/);
});

test('rodapé: a aba e o celular; no 4º estado, o iPhone e o iPad', () => {
  assert.deepEqual(linhasDoRodape('default'), [a.abaAberta, a.celular]);
  assert.deepEqual(linhasDoRodape('granted'), [a.abaAberta, a.celular]);
  assert.deepEqual(linhasDoRodape('sem-suporte'), [a.iphone]);
  assert.match(a.celular, /A contagem não atrasa\.$/);
  assert.match(a.iphone, /Tela de Início/);
  const html = marcacao('default');
  assert.match(html, /^<section class="tt-config-secao" aria-labelledby="config-avisos-web" data-secao="avisos"><h2 id="config-avisos-web" class="tt-t-body-strong">Avisos<\/h2>/);
  assert.match(html, /data-estado-avisos="default"/);
});

test('ligarAvisosWeb: no desktop (casca.web falso) não põe nada na página', async () => {
  let mexeu = false;
  const pagina = {
    querySelector: () => null,
    insertAdjacentHTML: () => {
      mexeu = true;
    },
  };
  const desligar = ligarAvisosWeb(pagina, { plataforma: async () => ({ casca: { web: false }, recursosDaCasca: () => ({ notificacoes: false }), avisosDaCasca: null }) });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mexeu, false);
  desligar();
});
