#!/usr/bin/env python3
"""Posições e cores do cartão "Progresso diário" (M27), pelos pixels.

    python3 progresso_pixels.py captura.png escala x0 y0 largura [cx cy raio fracao]

x0 y0 é o canto do cartão em pixels da captura; `largura`, a do cartão em px
CSS; `escala`, px da captura por px CSS (1,75 na do Relógio). Mede a caixa de
tinta (pixels que diferem do fundo do cartão) em px CSS do cartão:
  - o título, o rodapé e as colunas Ontem e Esta semana (faixas de linhas de
    texto, de cima para baixo: rótulo, número e unidade);
  - as bordas de fora do anel (em cima, embaixo, à esquerda e à direita).
Com cx cy raio fracao (o centro e o raio do meio do traço, em px CSS do
cartão, e a fração do arco), lê também a cor no meio do traço em ângulos
dentro e fora do arco. Imprime um JSON. Precisa do Pillow. Só para as
prévias; nunca entra no app.
"""
import json
import math
import sys

from PIL import Image


def main():
    arq, escala = sys.argv[1], float(sys.argv[2])
    ox, oy, largura = float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
    im = Image.open(arq).convert('RGB')
    px = im.load()
    X = lambda v: int(round(ox + v * escala))
    Y = lambda v: int(round(oy + v * escala))
    css_x = lambda v: round((v - ox) / escala, 1)
    css_y = lambda v: round((v - oy) / escala, 1)
    # Fundo: um trecho vazio do cartão, entre o título e o anel, à esquerda.
    fundo = px[X(8), Y(40)]
    tinta = lambda x, y: max(abs(px[x, y][c] - fundo[c]) for c in range(3)) > 12

    def faixas(x0, x1, y0, y1):
        out, ini = [], None
        for y in range(Y(y0), Y(y1)):
            on = any(tinta(x, y) for x in range(X(x0), X(x1)))
            if on and ini is None:
                ini = y
            if not on and ini is not None:
                out.append([css_y(ini), css_y(y)])
                ini = None
        if ini is not None:
            out.append([css_y(ini), css_y(Y(y1))])
        return out

    meio = largura / 2
    saida = {
        'fundo': '#%02X%02X%02X' % fundo,
        'titulo': faixas(3, 200, 3, 40),
        'ontem': faixas(3, 110, 90, 220),
        'semana': faixas(largura - 110, largura - 3, 90, 220),
        'rodape': faixas(meio - 100, meio + 100, 258, 300),
    }
    # Anel: descendo pela coluna do meio a partir de 35 px, a primeira tinta; subindo
    # a partir de 262 px (acima do rodapé), a última; na altura do meio do anel,
    # andando para fora a partir de 60 px do centro, a última tinta de cada lado.
    col = X(meio)
    topo = next((y for y in range(Y(35), Y(120)) if tinta(col, y)), None)
    base = next((y for y in range(Y(262), Y(180), -1) if tinta(col, y)), None)
    anel = {'topo': css_y(topo) if topo else None, 'base': css_y(base + 1) if base else None}
    if topo and base:
        cy = (topo + base + 1) / 2
        yy = int(round(cy))

        def borda(sentido):
            x = int(round(ox + (meio + sentido * 60) * escala))
            dentro = False
            ultimo = None
            while 0 <= x < im.width:
                if tinta(x, yy):
                    dentro = True
                    ultimo = x
                elif dentro:
                    break
                x += sentido
            return ultimo

        e, d = borda(-1), borda(1)
        anel['esquerda'] = css_x(e) if e is not None else None
        anel['direita'] = css_x(d + 1) if d is not None else None
    saida['anel'] = anel
    if len(sys.argv) > 6:
        cx, cy, raio, fracao = (float(v) for v in sys.argv[6:10])
        amostras = {}
        for graus in (5, 45, 90, 180, 270, 350):
            a = math.radians(graus)
            x = X(cx + raio * math.sin(a))
            y = Y(cy - raio * math.cos(a))
            amostras[str(graus)] = {'dentro': graus / 360 < fracao, 'cor': '#%02X%02X%02X' % px[x, y]}
        saida['amostras'] = amostras
    print(json.dumps(saida))


if __name__ == '__main__':
    main()
