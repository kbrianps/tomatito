// W36: as Configurações no celular (PLANO-WEB-V1, 5.4).
//
//   node scripts/web/verificar.mjs celular-configuracoes
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const CAPTURAS = fileURLToPath(new URL('../../../docs/capturas/', import.meta.url));
const TEMAS = { lite: 'lite', suave: 'suave', claro: 'light', escuro: 'dark' };
const pausa = (ms) => `new Promise((ok) => setTimeout(ok, ${ms}))`;

async function tocarEm(p, expressao, nome, espera = 400) {
  const achou = await p.avaliar(`(() => { const b = ${expressao}; if (b) { b.dataset.alvoDoTeste = '1'; b.scrollIntoView({ block: 'center' }); } return !!b; })()`);
  if (!achou) throw new Error('sem o alvo: ' + nome);
  await p.avaliar(pausa(150));
  await p.tocar('[data-alvo-do-teste]');
  await p.avaliar(`(document.querySelector('[data-alvo-do-teste]')?.removeAttribute('data-alvo-do-teste'), ${pausa(espera)})`);
}
const config = (p, chave) => p.avaliar(`JSON.parse(localStorage.getItem('tomatito:config') || '{}')[${JSON.stringify(chave)}] ?? null`);

export default async function celularConfiguracoes(t) {
  const p = await t.novaAba({ celular: 'p', caminho: '/#/configuracoes' });
  await p.avaliar(pausa(1200));

  // Tema por toque numa prévia.
  const antes = await p.avaliar(`({ tema: document.documentElement.dataset.theme, cor: document.querySelector('meta[name="theme-color"]').content })`);
  await tocarEm(p, `document.querySelector('.tt-tema[data-tema="dark"] .tt-previa-moldura')`, 'prévia do Escuro', 600);
  const depois = await p.avaliar(`({ tema: document.documentElement.dataset.theme, cor: document.querySelector('meta[name="theme-color"]').content })`);
  t.conferir(
    'tocar numa prévia troca o data-theme e o theme-color',
    antes.tema === 'lite' && depois.tema === 'dark' && depois.cor.toUpperCase() === '#202020' && depois.cor !== antes.cor,
    { antes, depois },
  );
  const colunas = await p.avaliar(`new Set([...document.querySelectorAll('.tt-tema')].map((e) => Math.round(e.getBoundingClientRect().left))).size`);
  t.conferir('as prévias dos temas em 2 colunas', colunas === 2, colunas);
  await tocarEm(p, `document.querySelector('.tt-tema[data-tema="lite"] .tt-previa-moldura')`, 'prévia do Lite', 600);

  // Expansores por toque.
  const botao = `document.querySelector('.tt-expansor-botao')`;
  const e0 = await p.avaliar(`${botao}.getAttribute('aria-expanded')`);
  await tocarEm(p, botao, 'expansor');
  const e1 = await p.avaliar(`${botao}.getAttribute('aria-expanded')`);
  await tocarEm(p, botao, 'expansor');
  const e2 = await p.avaliar(`${botao}.getAttribute('aria-expanded')`);
  t.conferir('abrir e fechar um expansor por toque', e1 !== e0 && e2 === e0, { e0, e1, e2 });
  await p.avaliar(`(document.querySelectorAll('.tt-expansor-botao[aria-expanded="false"]').forEach((b) => b.click()), ${pausa(500)})`);

  // Lista (fluent-dropdown) por toque.
  const lista = `document.querySelector('fluent-dropdown[data-config]')`;
  const chave = await p.avaliar(`${lista}.dataset.config`);
  const v0 = await config(p, chave);
  await tocarEm(p, lista, 'lista', 500);
  await tocarEm(p, `[...${lista}.querySelectorAll('fluent-option')].find((o) => !o.selected && o.getBoundingClientRect().width)`, 'opção da lista', 600);
  const v1 = await config(p, chave);
  t.conferir(`a lista "${chave}" abre e escolhe um item por toque`, v1 !== null && v1 !== v0, { v0, v1 });

  // Volume por arraste.
  await p.avaliar(`(document.querySelector('input.tt-deslizante').scrollIntoView({ block: 'center' }), ${pausa(300)})`);
  const largura = await p.avaliar(`document.querySelector('input.tt-deslizante').getBoundingClientRect().width`);
  const vol0 = Number(await p.avaliar(`document.querySelector('input.tt-deslizante').value`));
  await p.arrastar('input.tt-deslizante', -Math.round(largura * 0.1));
  await p.avaliar(pausa(600));
  const vol1 = Number(await p.avaliar(`document.querySelector('input.tt-deslizante').value`));
  const gravado = await config(p, 'volume');
  t.conferir('arrastar o polegar do volume de 80 para cerca de 40 grava um valor entre 35 e 45', vol0 === 80 && vol1 >= 35 && vol1 <= 45 && gravado === vol1, { vol0, vol1, gravado });

  const cortes = await p.avaliar(`[...document.querySelectorAll('.tt-config-textos')].filter((e) => e.getBoundingClientRect().width && e.scrollWidth > e.clientWidth).map((e) => e.textContent.trim().slice(0, 40))`);
  const h = await p.avaliar(`(() => { const h = document.documentElement, r = document.querySelector('.tt-rolagem'); return h.scrollWidth === h.clientWidth && r.scrollWidth === r.clientWidth; })()`);
  t.conferir('perfil p: nenhum texto das linhas corta, e não há rolagem horizontal', cortes.length === 0 && h, { cortes, h });

  for (const [nome, tema] of Object.entries(TEMAS)) {
    await p.avaliar(`(document.documentElement.dataset.theme = ${JSON.stringify(tema)}, document.querySelector('.tt-rolagem').scrollTop = 0, ${pausa(300)})`);
    const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURAS}web-cel-configuracoes-${nome}.png`, Buffer.from(data, 'base64'));
  }
  await p.avaliar(`(document.documentElement.dataset.theme = 'lite', document.querySelector('.tt-temas').scrollIntoView({ block: 'center' }), ${pausa(300)})`);
  const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${CAPTURAS}web-cel-configuracoes-temas.png`, Buffer.from(data, 'base64'));
  t.conferir('capturas web-cel-configuracoes-{lite,suave,claro,escuro}.png', true);
  await p.fechar();
}
