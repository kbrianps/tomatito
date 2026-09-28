// Catálogo de controles para desenvolvimento (#/dev). Começou no M09 como a
// amostra do tema do M06; o M12 acrescenta os componentes Fluent que faltavam
// (checkbox, dropdown, menu, dialog e tooltip), e o M13 completa os botões e
// os estados.
//
// M13: os botões completos (padrão, destaque, sutil e circular, com os
// desabilitados), os botões só de ícone com a dica própria (data-dica,
// components/dica.js), os desabilitados dos componentes Fluent e todos os
// ícones copiados para src/assets/icons/ (scripts/copy-icons.mjs).
//
// Não é uma tela do app: não aparece no painel nem tem atalho (abre-se pelo
// console do DevTools com location.hash = '#/dev', ou pela URL da prévia). Por
// isso os textos daqui são de exemplo e ficam fora do catálogo de textos da
// interface (src/lib/i18n/pt-BR.js).
//
// Todo fluent-* usado aqui precisa do seu import no main.js (o base.css esconde
// o que não foi definido).
//
// M12: os controles que abrem por cima da tela (as listas do dropdown, os
// menus e as dicas) ficam na camada de cima do documento (popover), ancorados
// ao controle pelo CSS Anchor Positioning; o diálogo, num <dialog> modal. Os
// dois menus existem para conferir que cada lista abre no próprio botão (o
// fluent-menu usa o mesmo nome de âncora em todas as instâncias), e a lista
// longa ("Zerar progresso às", 24 horas) para conferir a altura máxima e a
// virada para cima perto da borda de baixo (docs/decisoes.md, M12).
import { Updates } from '@microsoft/fast-element';
import { grades, icone, NOMES } from '../components/icon.js';
import { full, sons } from '../lib/ipc.js';

// Botão só de ícone: aria-label (o nome) e data-dica (a dica com o mesmo texto).
const deIcone = (classe, nome, rotulo, { grade = 16, extra = '' } = {}) =>
  `<button type="button" class="${classe}" aria-label="${rotulo}" data-dica${extra}>${icone(nome, grade)}</button>`;

// Todos os ícones copiados, em cada grade, no tamanho da grade.
const ICONES = NOMES.map(
  (nome) =>
    `<li class="tt-amostra-icone" data-icone="${nome}"><span class="tt-amostra-icone-grades">` +
    grades(nome)
      .map((g) => `<span class="tt-amostra-icone-${g}" data-grade="${g}">${icone(nome, g)}</span>`)
      .join('') +
    `</span><span class="tt-t-caption tt-fg-2">${nome}</span></li>`,
).join('');

const horas = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

const AMOSTRA = `
<div class="tt-amostra">
  <header class="tt-amostra-topo">
    <h1 class="tt-t-title" tabindex="-1">Catálogo de controles</h1>
    <p class="tt-fg-2">Os controles do app sobre os tokens do tema: botões, opções, anel, texto, os componentes Fluent que abrem por cima da tela e os ícones. Os estados desabilitados aparecem ao lado dos normais.</p>
  </header>

  <div class="tt-amostra-grade">
    <section class="tt-card" aria-labelledby="amostra-botoes" data-amostra="botoes">
      <h2 id="amostra-botoes" class="tt-t-subtitle">Botões</h2>
      <p class="tt-fg-2">Primário para a ação principal da tela; secundário para as demais. Embaixo, os dois desabilitados.</p>
      <div class="tt-linha">
        <button type="button" class="tt-accent" data-botao="destaque">${icone('play')}Iniciar sessão de foco</button>
        <button type="button" data-botao="padrao">Cancelar</button>
      </div>
      <div class="tt-linha">
        <button type="button" class="tt-accent" disabled data-botao="destaque-desabilitado">${icone('save')}Salvar</button>
        <button type="button" disabled data-botao="padrao-desabilitado">Descartar</button>
      </div>
    </section>

    <section class="tt-card" aria-labelledby="amostra-botoes-icone" data-amostra="botoes-icone">
      <h2 id="amostra-botoes-icone" class="tt-t-subtitle">Botões de ícone</h2>
      <p class="tt-fg-2">Só com ícone, sempre com nome e dica. Sutis de 32 × 32; circulares de 32 e 64 px. O último de cada linha está desabilitado.</p>
      <div class="tt-linha" data-grupo="sutis">
        ${deIcone('tt-sutil', 'more_horizontal', 'Mais opções', { extra: ' data-botao="sutil"' })}
        ${deIcone('tt-sutil', 'edit', 'Editar')}
        ${deIcone('tt-sutil', 'add', 'Adicionar tarefa')}
        ${deIcone('tt-sutil', 'dismiss', 'Remover')}
        ${deIcone('tt-sutil', 'save', 'Salvar', { extra: ' disabled data-botao="sutil-desabilitado"' })}
      </div>
      <div class="tt-linha" data-grupo="circulares">
        ${deIcone('tt-circular tt-accent', 'play', 'Iniciar', { extra: ' data-botao="circular-destaque"' })}
        ${deIcone('tt-circular', 'arrow_reset', 'Reiniciar', { extra: ' data-botao="circular"' })}
        ${deIcone('tt-circular', 'stop', 'Encerrar', { extra: ' disabled data-botao="circular-desabilitado"' })}
      </div>
      <div class="tt-linha" data-grupo="grandes">
        ${deIcone('tt-circular tt-grande tt-accent', 'pause', 'Pausar', { grade: 24, extra: ' data-botao="grande-destaque"' })}
        ${deIcone('tt-circular tt-grande', 'flag', 'Marcar volta', { grade: 24, extra: ' data-botao="grande"' })}
        ${deIcone('tt-circular tt-grande', 'arrow_reset', 'Reiniciar', { grade: 24 })}
        ${deIcone('tt-circular tt-grande tt-accent', 'play', 'Iniciar', { grade: 24, extra: ' disabled data-botao="grande-desabilitado"' })}
      </div>
    </section>

    <section class="tt-card" aria-labelledby="amostra-opcoes">
      <h2 id="amostra-opcoes" class="tt-t-subtitle">Opções</h2>
      <div class="tt-pilha">
        <label class="tt-opcao"><fluent-switch checked></fluent-switch>Tocar som no fim do foco</label>
        <label class="tt-opcao"><fluent-switch></fluent-switch>Pular intervalos</label>
        <label class="tt-opcao"><fluent-switch checked disabled></fluent-switch>Ligado e desabilitado</label>
        <label class="tt-opcao"><fluent-switch disabled></fluent-switch>Desligado e desabilitado</label>
      </div>
      <p id="amostra-intervalo" class="tt-t-body-strong">Duração do intervalo</p>
      <fluent-radio-group name="intervalo" value="5" orientation="vertical" aria-labelledby="amostra-intervalo">
        <label class="tt-opcao"><fluent-radio value="5"></fluent-radio>5 minutos</label>
        <label class="tt-opcao"><fluent-radio value="10"></fluent-radio>10 minutos</label>
        <label class="tt-opcao"><fluent-radio value="15"></fluent-radio>15 minutos</label>
        <label class="tt-opcao"><fluent-radio value="30" disabled></fluent-radio>30 minutos (desabilitada)</label>
      </fluent-radio-group>
    </section>

    <section class="tt-card" aria-labelledby="amostra-anel">
      <h2 id="amostra-anel" class="tt-t-subtitle">Anel</h2>
      <figure class="tt-ring" role="img" aria-label="16 minutos restantes, período de foco 1 de 2">
        <svg viewBox="0 0 236 236" aria-hidden="true" focusable="false">
          <circle class="tt-ring-track" cx="118" cy="118" r="108" />
          <!-- 2π·108 ≈ 678,58; 64% do percurso = 434,29 -->
          <circle
            class="tt-ring-arc"
            cx="118"
            cy="118"
            r="108"
            stroke-dasharray="434.29 678.58"
            transform="rotate(-90 118 118)"
          />
        </svg>
        <figcaption class="tt-ring-rotulo">
          <span class="tt-ring-tempo tt-num">16:00</span>
          <span class="tt-fg-2">minutos restantes</span>
        </figcaption>
      </figure>
    </section>

    <section class="tt-card" aria-labelledby="amostra-texto">
      <h2 id="amostra-texto" class="tt-t-subtitle">Texto</h2>
      <p class="tt-t-title-large tt-num">25:00</p>
      <p class="tt-t-body-large">Sessão de foco de 50 minutos</p>
      <p>Texto do corpo: ação, intervalo, período, configuração.</p>
      <p class="tt-fg-2">Texto secundário: próximo intervalo às 14:35.</p>
      <p class="tt-t-caption tt-fg-2">Legenda: 2 períodos de 25 minutos</p>
      <p class="tt-accent-fg">Texto em destaque: próximo período em 5 minutos.</p>
    </section>

    <section class="tt-card" aria-labelledby="amostra-caixas" data-amostra="caixas">
      <h2 id="amostra-caixas" class="tt-t-subtitle">Caixas de seleção</h2>
      <div class="tt-pilha">
        <label class="tt-opcao"><fluent-checkbox checked></fluent-checkbox>Pular intervalos</label>
        <label class="tt-opcao"><fluent-checkbox></fluent-checkbox>Tocar som no fim do intervalo</label>
        <label class="tt-opcao"><fluent-checkbox checked disabled></fluent-checkbox>Marcada e desabilitada</label>
        <label class="tt-opcao"><fluent-checkbox disabled></fluent-checkbox>Desmarcada e desabilitada</label>
      </div>
    </section>

    <section class="tt-card" aria-labelledby="amostra-listas" data-amostra="listas">
      <h2 id="amostra-listas" class="tt-t-subtitle">Listas suspensas</h2>
      <div class="tt-campo">
        <span id="amostra-meta-rotulo" class="tt-campo-rotulo">Meta diária</span>
        <fluent-dropdown data-rotulo="amostra-meta-rotulo" data-amostra="meta">
          <fluent-listbox>
            <fluent-option value="0">Desativada</fluent-option>
            <fluent-option value="30">30 minutos</fluent-option>
            <fluent-option value="60" selected>1 hora</fluent-option>
            <fluent-option value="90">1 hora e 30 minutos</fluent-option>
            <fluent-option value="120">2 horas</fluent-option>
            <fluent-option value="180">3 horas</fluent-option>
            <fluent-option value="240">4 horas</fluent-option>
            <fluent-option value="360">6 horas</fluent-option>
            <fluent-option value="480">8 horas</fluent-option>
          </fluent-listbox>
        </fluent-dropdown>
      </div>
      <div class="tt-campo">
        <span id="amostra-zerar-rotulo" class="tt-campo-rotulo">Zerar progresso às</span>
        <fluent-dropdown data-rotulo="amostra-zerar-rotulo" data-amostra="zerar">
          <fluent-listbox>
            ${horas.map((h, i) => `<fluent-option value="${i}"${i === 0 ? ' selected' : ''}>${h}</fluent-option>`).join('\n            ')}
          </fluent-listbox>
        </fluent-dropdown>
      </div>
      <div class="tt-campo">
        <span id="amostra-som-rotulo" class="tt-campo-rotulo">Som do intervalo</span>
        <fluent-dropdown disabled data-rotulo="amostra-som-rotulo" data-amostra="som">
          <fluent-listbox>
            <fluent-option value="sino" selected>Sino</fluent-option>
            <fluent-option value="nenhum">Nenhum</fluent-option>
          </fluent-listbox>
        </fluent-dropdown>
      </div>
    </section>

    <section class="tt-card" aria-labelledby="amostra-menus" data-amostra="menus">
      <h2 id="amostra-menus" class="tt-t-subtitle">Menus</h2>
      <p class="tt-fg-2">Cada menu abre embaixo do próprio botão, alinhado à esquerda dele.</p>
      <div class="tt-linha">
        <fluent-menu data-amostra="menu-sessao">
          <button type="button" slot="trigger">Sessão</button>
          <fluent-menu-list>
            <fluent-menu-item>Encerrar sessão</fluent-menu-item>
            <fluent-menu-item>Pular intervalo</fluent-menu-item>
          </fluent-menu-list>
        </fluent-menu>
        <fluent-menu data-amostra="menu-temporizador">
          <button type="button" slot="trigger">Temporizador</button>
          <fluent-menu-list>
            <fluent-menu-item>Editar</fluent-menu-item>
            <fluent-menu-item>Reiniciar</fluent-menu-item>
            <fluent-menu-item disabled>Duplicar</fluent-menu-item>
            <fluent-menu-item>Excluir</fluent-menu-item>
          </fluent-menu-list>
        </fluent-menu>
      </div>
    </section>

    <section class="tt-card" aria-labelledby="amostra-dialogo" data-amostra="dialogo">
      <h2 id="amostra-dialogo" class="tt-t-subtitle">Diálogo</h2>
      <p class="tt-fg-2">Modal, com o fundo escurecido; Esc ou Cancelar fecham.</p>
      <div class="tt-linha">
        <button type="button" data-abre="amostra-dialogo-meta">Editar meta diária</button>
      </div>
      <fluent-dialog id="amostra-dialogo-meta" aria-labelledby="amostra-dialogo-titulo">
        <fluent-dialog-body>
          <h2 slot="title" id="amostra-dialogo-titulo">Editar meta diária</h2>
          <div class="tt-pilha">
            <p>Quanto tempo de foco por dia você quer registrar?</p>
            <div class="tt-campo">
              <span id="amostra-dialogo-meta-rotulo" class="tt-campo-rotulo">Meta diária</span>
              <fluent-dropdown data-rotulo="amostra-dialogo-meta-rotulo" data-amostra="dialogo-meta">
                <fluent-listbox>
                  <fluent-option value="0">Desativada</fluent-option>
                  <fluent-option value="30">30 minutos</fluent-option>
                  <fluent-option value="60" selected>1 hora</fluent-option>
                  <fluent-option value="120">2 horas</fluent-option>
                  <fluent-option value="240">4 horas</fluent-option>
                </fluent-listbox>
              </fluent-dropdown>
            </div>
          </div>
          <button type="button" slot="action" class="tt-accent" data-fecha>Salvar</button>
          <button type="button" slot="action" data-fecha>Cancelar</button>
        </fluent-dialog-body>
      </fluent-dialog>
    </section>

    <section class="tt-card" aria-labelledby="amostra-dicas" data-amostra="dicas">
      <h2 id="amostra-dicas" class="tt-t-subtitle">Dicas</h2>
      <p class="tt-fg-2">Aparecem em cima do botão, centradas, com o mouse parado ou com o foco do teclado.</p>
      <div class="tt-linha">
        <button type="button" id="amostra-dica-reiniciar">Reiniciar</button>
        <fluent-tooltip anchor="amostra-dica-reiniciar">Voltar o temporizador ao início</fluent-tooltip>
        <button type="button" id="amostra-dica-volta">Volta</button>
        <fluent-tooltip anchor="amostra-dica-volta" positioning="below">Marcar uma volta do cronômetro</fluent-tooltip>
      </div>
    </section>

    <section class="tt-card" aria-labelledby="amostra-sons" data-amostra="sons">
      <h2 id="amostra-sons" class="tt-t-subtitle">Sons</h2>
      <p class="tt-fg-2">Os dois avisos sonoros, tocados agora na saída de áudio atual. Troque a saída (um fone, por exemplo) e teste de novo: vale sem reiniciar o app.</p>
      <div class="tt-linha">
        <button type="button" data-som="focusEnd">Testar fim de foco</button>
        <button type="button" data-som="breakEnd">Testar fim de intervalo</button>
      </div>
    </section>

    <section class="tt-card" aria-labelledby="amostra-tomate" data-amostra="tomate">
      <h2 id="amostra-tomate" class="tt-t-subtitle">Tomate (Full)</h2>
      <p class="tt-fg-2">M51: entra no Full pelo switch_window_mode, como a escolha "Tomatito Full" em Configurações: o tomate aparece e esta janela se esconde. Esc ou "Voltar ao modo normal" traz de volta.</p>
      <div class="tt-linha">
        <button type="button" data-tomate>Abrir o tomate</button>
      </div>
    </section>

    <section class="tt-card tt-amostra-largo" aria-labelledby="amostra-icones" data-amostra="icones">
      <h2 id="amostra-icones" class="tt-t-subtitle">Ícones</h2>
      <p class="tt-fg-2">Todos os copiados para src/assets/icons/, em cada grade copiada (16, 20 ou 24 px).</p>
      <ul class="tt-amostra-icones">${ICONES}</ul>
    </section>
  </div>
</div>
`;

export function montar(raiz) {
  raiz.innerHTML = AMOSTRA;

  // Rótulo das listas suspensas: o controle de verdade é um <button
  // role="combobox"> que o fluent-dropdown põe dentro de si (numa fila de
  // atualização); o rótulo visível passa a ser o nome dele, como no padrão
  // "select-only combobox" da ARIA. O valor escolhido continua sendo o texto.
  for (const dd of raiz.querySelectorAll('fluent-dropdown[data-rotulo]')) {
    Updates.enqueue(() => dd.control?.setAttribute('aria-labelledby', dd.dataset.rotulo));
  }

  // Diálogo: o botão abre; Salvar e Cancelar fecham (Esc e o clique fora já
  // fecham pelo próprio fluent-dialog). Na volta, o foco vai para o botão que
  // abriu, como no ContentDialog.
  const aoClicar = (ev) => {
    // Sons (M20): cada botão pede o `sound_test` do seu som.
    const som = ev.target.closest?.('[data-som]');
    if (som) {
      sons.testar(som.dataset.som).catch((e) => console.error('sound_test', e));
      return;
    }
    // M51: entra no Full (5.7).
    if (ev.target.closest?.('[data-tomate]')) {
      full.trocarModo(true).catch((e) => console.error('switch_window_mode', e));
      return;
    }
    const abre = ev.target.closest?.('[data-abre]');
    if (abre) {
      raiz.querySelector(`#${abre.dataset.abre}`)?.show();
      return;
    }
    const fecha = ev.target.closest?.('[data-fecha]');
    if (fecha) fecha.closest('fluent-dialog')?.hide();
  };
  const aoAlternar = (ev) => {
    if (ev.target.localName !== 'fluent-dialog' || ev.detail?.newState !== 'closed') return;
    raiz.querySelector(`[data-abre="${ev.target.id}"]`)?.focus();
  };
  raiz.addEventListener('click', aoClicar);
  raiz.addEventListener('toggle', aoAlternar);
  return () => {
    raiz.removeEventListener('click', aoClicar);
    raiz.removeEventListener('toggle', aoAlternar);
  };
}
