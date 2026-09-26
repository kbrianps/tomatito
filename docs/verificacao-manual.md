# Verificação manual

O que só uma pessoa na frente da tela consegue conferir. Para cada marco: o que já foi conferido de forma automática (o "proxy") e os passos exatos para a conferência humana. Marque `[x]` quando fizer.

## M01. Teste de fumaça

### O que já foi conferido sem olhar a tela (26/09/2026)

- **Janela na sessão Wayland:** `npm run tauri dev` com `WAYLAND_DEBUG=client` mostrou `xdg_toplevel.set_title("Tomatito")`, `xdg_toplevel.set_app_id("tomatito")` e os `configure` do compositor, sem `wl_display.error`. A janela ficou aberta uns 5 s e foi fechada.
- **Switch no WebKitGTK real:** um script de sonda, injetado só numa configuração do Vite fora do repositório, rodou dentro da janela e devolveu: `customElements.get('fluent-switch')` é `function`; borda `1px solid rgb(173, 173, 173)`; tamanho 40×20; depois de `click()`, `checked` passou de `false` para `true`, a bolinha foi de x=3 para x=23 e o fundo ficou `rgb(71, 158, 245)`.
- **Recarga ao salvar:** regravar o `index.html` com `tauri dev` aberto fez o Vite registrar `page reload index.html`; 1,5 s depois a janela pediu `/` de novo e a sonda rodou outra vez.
- **Prévia no Chrome headless:** `npm run shot -- --size 800x600 --click fluent-switch --wait 400 --shot docs/capturas/m01-switch.png` mostra o switch com borda (desligado) e azul com a bolinha à direita (ligado).

### Passos para você (uns 2 minutos)

1. [ ] Em `~/dev/tomatito`, rode `npm run tauri dev`. Espere a janela "Tomatito" aparecer (a primeira compilação já foi feita; deve levar menos de 1 min).
2. [ ] A janela **não** está em branco: no canto superior esquerdo aparece um switch pequeno, com borda cinza e uma bolinha à esquerda. O fundo branco é esperado neste marco (os temas entram no M06).
3. [ ] Clique no switch: a bolinha desliza para a direita e o fundo do switch fica azul. Clique de novo: volta.
4. [ ] Botão direito na janela → **Inspecionar**. No console, digite `customElements.get('fluent-switch')` e confira que a resposta **não** é `undefined`.
5. [ ] Com a janela aberta, abra o `index.html` no editor, acrescente um espaço numa linha e salve. A janela recarrega sozinha (o switch volta ao estado desligado). Desfaça a mudança e salve de novo.
6. [ ] Feche a janela e encerre o `tauri dev` com Ctrl+C no terminal.

Se a janela abrir em branco no passo 2: feche, rode uma vez `WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev` só para diagnosticar e anote o resultado em `docs/decisoes.md`. Não deixe a variável exportada.
