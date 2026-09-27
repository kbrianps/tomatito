#!/usr/bin/env python3
"""Gera os sons do Tomatito (PLANO.md, M20 e seção 9).

Só a biblioteca padrão (wave + math). Saída: WAV mono, 44,1 kHz, 16 bits,
com 1 s cada, em src-tauri/sounds/:

- focus-end.wav: fim de foco, duas notas senoidais subindo (Mi5 e Si5), cada
  uma com ataque curto e decaimento exponencial;
- break-end.wav: fim de intervalo, uma nota (Sol5), com o mesmo envelope.

O resultado é determinístico (sem ruído nem data no arquivo): rodar de novo
dá os mesmos bytes. `--check` só confere se os arquivos no disco batem com o
que o script geraria, sem escrever nada (sai com 1 se não baterem).

Uso: python3 scripts/gen-sounds.py [--check]
"""

import io
import math
import pathlib
import struct
import sys
import wave

TAXA = 44_100          # amostras por segundo
DURACAO = 1.0          # segundos
PICO = 0.5             # amplitude máxima de cada nota (-6 dBFS); a soma fica abaixo de 1
ATAQUE = 0.006         # s: rampa de entrada, para não estalar
DECAIMENTO = 0.22      # s: constante de tempo do decaimento exponencial
SAIDA_FINAL = 0.08     # s: rampa de saída no fim do arquivo, para terminar em zero

# (frequência em Hz, início em s)
SONS = {
    "focus-end.wav": [(659.26, 0.0), (987.77, 0.16)],  # Mi5, Si5
    "break-end.wav": [(783.99, 0.0)],                   # Sol5
}

PASTA = pathlib.Path(__file__).resolve().parent.parent / "src-tauri" / "sounds"


def envelope(t: float) -> float:
    """Ataque linear curto e decaimento exponencial; zero antes de começar."""
    if t < 0:
        return 0.0
    ataque = min(1.0, t / ATAQUE)
    return ataque * math.exp(-t / DECAIMENTO)


def amostras(notas):
    n = int(TAXA * DURACAO)
    for i in range(n):
        t = i / TAXA
        v = 0.0
        for freq, inicio in notas:
            dt = t - inicio
            v += PICO * envelope(dt) * math.sin(2 * math.pi * freq * dt)
        restante = DURACAO - t
        if restante < SAIDA_FINAL:
            v *= restante / SAIDA_FINAL
        yield max(-32768, min(32767, round(v * 32767)))


def gerar(notas) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes(b"".join(struct.pack("<h", s) for s in amostras(notas)))
    return buf.getvalue()


def main(argv) -> int:
    conferir = "--check" in argv
    ok = True
    for nome, notas in SONS.items():
        dados = gerar(notas)
        caminho = PASTA / nome
        if conferir:
            if not caminho.exists() or caminho.read_bytes() != dados:
                print(f"diferente: {caminho}")
                ok = False
            else:
                print(f"ok: {caminho} ({len(dados)} bytes)")
        else:
            PASTA.mkdir(parents=True, exist_ok=True)
            caminho.write_bytes(dados)
            print(f"gerado: {caminho} ({len(dados)} bytes)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
