# Sons do Tomatito

| Arquivo | Quando toca | O que é |
|---|---|---|
| `focus-end.wav` | fim de um período de foco (e fim da sessão) | duas notas senoidais subindo, Mi5 (659,26 Hz) e Si5 (987,77 Hz, 160 ms depois) |
| `break-end.wav` | fim de um intervalo | uma nota senoidal, Sol5 (783,99 Hz) |

Os dois: WAV PCM mono, 44,1 kHz, 16 bits, 1 s; ataque de 6 ms, decaimento
exponencial (constante de 220 ms), pico de cada nota em -6 dBFS e rampa de
saída de 80 ms, para começar e terminar em zero (sem estalo).

## Origem e licença

Gerados por `scripts/gen-sounds.py`, só com a biblioteca padrão do Python
(`wave` e `math`), sem amostras de terceiros. São parte do Tomatito e têm a
mesma licença do código (MIT, `LICENSE` na raiz).

Para gerar de novo (o resultado é o mesmo, byte a byte):

```
python3 scripts/gen-sounds.py          # escreve os dois arquivos
python3 scripts/gen-sounds.py --check  # só confere se batem com o script
```

Os arquivos entram no binário com `include_bytes!` (`src-tauri/src/audio.rs`);
não são lidos do disco em tempo de execução.
