#!/usr/bin/env python3
"""Posições da sessão em andamento no cartão de sessão (M18), pelos pixels.

Mede a caixa de tinta (pixels que diferem do fundo local da região) em
regiões fixas do cartão, em px CSS a partir do canto de cima à esquerda: o
cabeçalho, os quatro traços das 12, 3, 6 e 9 horas (que dão o disco), o
número com a unidade, os dois botões redondos e o rodapé. Serve para a
captura do Relógio em sessão (~/dev/tomatito-ref/crop-insession.png, o cartão
inteiro a 175%) e para as do Tomatito (a 100%), e o mostrador.mjs compara as
duas.

    python3 mostrador_bandas.py captura.png escala x0 y0

x0 y0 é o canto do cartão em pixels da captura. Imprime um JSON: nome ->
[x0, y0, x1, y1] em px CSS do cartão, ou null sem tinta. O fundo local é a
mediana da região (o cartão do Relógio tem um degradê, então um fundo único
não serviria). Precisa do Pillow (python3-pil). Só para as prévias; nunca
entra no app.
"""
import json
import sys

from PIL import Image

# (x0, y0, x1, y1) em px CSS do cartão e o limiar de tinta (a maior diferença
# de canal em relação à mediana da região). Os traços são sutis (#4A4A4D sobre
# o disco no Escuro), então o limiar deles é baixo.
REGIOES = {
    'cabecalho': ((0, 0, 300, 34), 60),
    'traco_12h': ((205, 40, 243, 82), 7),
    'traco_3h': ((318, 160, 360, 190), 7),
    'traco_6h': ((205, 268, 243, 310), 7),
    'traco_9h': ((88, 160, 130, 190), 7),
    'centro': ((135, 130, 315, 210), 60),
    'botoes': ((160, 322, 290, 378), 12),
    'rodape': ((90, 378, 360, 412), 60),
}


def mediana(valores):
    v = sorted(valores)
    return v[len(v) // 2]


def main():
    arquivo, escala = sys.argv[1], float(sys.argv[2])
    ox, oy = float(sys.argv[3]), float(sys.argv[4])
    im = Image.open(arquivo).convert('RGB')
    px = im.load()
    saida = {}
    for nome, ((x0, y0, x1, y1), limiar) in REGIOES.items():
        X0, Y0 = int(ox + x0 * escala), int(oy + y0 * escala)
        X1, Y1 = int(ox + x1 * escala), int(oy + y1 * escala)
        X1, Y1 = min(X1, im.width), min(Y1, im.height)
        pontos = [(x, y) for y in range(Y0, Y1) for x in range(X0, X1)]
        fundo = tuple(mediana([px[p][c] for p in pontos]) for c in range(3))
        tinta = [p for p in pontos if max(abs(px[p][c] - fundo[c]) for c in range(3)) > limiar]
        if not tinta:
            saida[nome] = None
            continue
        xs = [p[0] for p in tinta]
        ys = [p[1] for p in tinta]
        r = lambda v, o: round((v - o) / escala, 1)
        saida[nome] = [r(min(xs), ox), r(min(ys), oy), r(max(xs) + 1, ox), r(max(ys) + 1, oy)]
    print(json.dumps(saida))


if __name__ == '__main__':
    main()
