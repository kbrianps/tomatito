// Validador da ficha da Play (PLANO-ANDROID 8.1 e 8.4; A24).
//
//   node scripts/android/ficha.mjs
//
// Confere: nome ≤ 30, descrição curta ≤ 80 e completa ≤ 4 000 caracteres;
// nenhuma palavra proibida na ficha; cada permissão do pacote (a lista do
// conferir-aab.mjs) tem justificativa no permissoes.md e aparece na política
// de privacidade; a ficha e a política dizem "sem internet" (o pacote não pede
// INTERNET); os gráficos e as seis capturas existem. Sai 1 se algo falhar.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = (arq) => fileURLToPath(new URL(`../../${arq}`, import.meta.url));
const ler = (arq) => readFileSync(raiz(arq), 'utf8');
const PERMISSOES = ['POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM'];
const ficha = ler('docs/android/play/ficha.md');
const bloco = (titulo) => new RegExp(`## ${titulo}\\n\\n\`\`\`\\n([\\s\\S]*?)\\n\`\`\``).exec(ficha)?.[1] ?? null;
const nome = bloco('Nome do app');
const curta = bloco('Descrição curta');
const completa = bloco('Descrição completa');
const permissoes = ler('docs/android/play/permissoes.md');
const politica = ler('src/platform/web/publico/privacidade.html');
const naPolitica = { POST_NOTIFICATIONS: /Notificações/, USE_EXACT_ALARM: /Alarmes exatos/, SCHEDULE_EXACT_ALARM: /Alarmes exatos/, RECEIVE_BOOT_COMPLETED: /Iniciar com o aparelho/ };
const capturas = existsSync(raiz('docs/android/play/capturas')) ? readdirSync(raiz('docs/android/play/capturas')).filter((f) => f.endsWith('.png')) : [];

const itens = [
  ['nome com até 30 caracteres', nome && [...nome].length <= 30, nome && [...nome].length],
  ['descrição curta com até 80 caracteres', curta && [...curta].length <= 80, curta && [...curta].length],
  ['descrição completa com até 4 000 caracteres', completa && [...completa].length <= 4000, completa && [...completa].length],
  ['nenhuma palavra proibida na ficha ("Pomodoro", "melhor", "nº 1", "grátis")', !/pomodoro|\bmelhor\b|n[ºo°] ?1|\bgr[aá]tis\b/i.test(`${nome}\n${curta}\n${completa}`)],
  ['cada permissão tem justificativa no permissoes.md', PERMISSOES.every((p) => permissoes.includes(`android.permission.${p}`))],
  ['cada permissão aparece na política de privacidade', PERMISSOES.every((p) => naPolitica[p].test(politica))],
  ['a ficha e a política dizem que o app não acessa a internet', /Não acessa a internet/.test(completa ?? '') && /não tem permissão de acesso à internet/.test(politica)],
  ['a ficha aponta para a política publicada', ficha.includes('https://tomatito.kbrianps.workers.dev/privacidade')],
  ['ícone 512, gráfico de destaque e seis capturas', existsSync(raiz('docs/android/play/icone-512.png')) && existsSync(raiz('docs/android/play/destaque-1024x500.png')) && capturas.length === 6, capturas.length],
];
const falhas = itens.filter(([, ok]) => !ok);
console.log(JSON.stringify({ ok: falhas.length === 0, itens: itens.map(([n, ok, d]) => ({ nome: n, ok: Boolean(ok), detalhe: d })) }, null, 2));
process.exit(falhas.length ? 1 : 0);
