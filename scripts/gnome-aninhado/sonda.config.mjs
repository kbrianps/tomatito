// Vite do teste aninhado: estende o vite.config.js do app, injeta a sonda
// (/@sonda.js) na página e grava o que ela manda em $SONDA_LOG, uma linha
// JSON por evento. Nada disto entra no build de produção.
//
// M09: o roteiro também manda comandos à página, como quem digita no console
// do DevTools (trocar o data-theme, abrir o #/dev): grava
// $TT_OUT/comando.json ({ id, js }), e a sonda busca o arquivo em
// /__sonda/comando, roda o js uma vez por id e devolve o resultado como um
// evento "comando".
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import base from '../../vite.config.js';

const LOG = process.env.SONDA_LOG;
const COMANDO = process.env.TT_OUT ? `${process.env.TT_OUT}/comando.json` : null;
// TT_CONTROLE (M08) liga um controle negativo na sonda; ver sonda.js.
const SONDA =
  `const CONTROLE = ${JSON.stringify(process.env.TT_CONTROLE ?? '')};\n` +
  readFileSync(new URL('./sonda.js', import.meta.url), 'utf8');

export default {
  ...base,
  root: fileURLToPath(new URL('../..', import.meta.url)),
  configFile: false,
  server: { ...base.server, port: 5173, strictPort: true },
  plugins: [
    ...(base.plugins ?? []),
    {
      name: 'tomatito-sonda',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/@sonda.js') {
            res.setHeader('Content-Type', 'text/javascript');
            res.end(SONDA);
            return;
          }
          if (req.url === '/__sonda/comando') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(COMANDO && existsSync(COMANDO) ? readFileSync(COMANDO, 'utf8') : '{}');
            return;
          }
          if (req.url === '/__sonda' && req.method === 'POST') {
            let corpo = '';
            req.on('data', (d) => (corpo += d));
            req.on('end', () => {
              appendFileSync(LOG, corpo.replace(/\n/g, ' ') + '\n');
              res.end('ok');
            });
            return;
          }
          next();
        });
      },
      transformIndexHtml() {
        return [{ tag: 'script', attrs: { type: 'module', src: '/@sonda.js' }, injectTo: 'head-prepend' }];
      },
    },
  ],
};
