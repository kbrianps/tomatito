#!/usr/bin/env python3
"""Compara as faixas da região do tomate com o que a página pinta (M53).

    python3 regiao_pixels.py captura.png faixas.json [r,g,b]

A captura é o tomato.html sem a sombra (a plataforma windows, onde o CSS a
tira), no tamanho da região (lado × escala). "Pintado" é todo pixel com alfa
acima de 0, inclusive a borda antisserrilhada: no Chrome, a captura sai com o
fundo transparente; no WebKitGTK (webkit-shot.py), o fundo é opaco, com a cor
r,g,b dada, e pintado é todo pixel de outra cor. Imprime um JSON com:
  - pintados: quantos pixels a página pinta;
  - fora: quantos pixels pintados ficam fora da região (tem de ser 0);
  - folga_max: a maior distância, em px (entre centros de pixel), de um pixel
    da região ao pixel pintado mais perto;
  - folga: quantos pixels da região estão a cada distância (arredondada para
    cima), para quem não é pintado;
  - folga_min: a menor distância, em px, de um pixel fora da região ao pixel
    pintado mais perto, menos 1 (quantos pixels só da região, no mínimo,
    separam o pintado do lado de fora);
  - area: quantos pixels a região cobre.
Precisa do Pillow e do NumPy. Só para as prévias; nunca entra no app.
"""
import json
import math
import sys

import numpy as np
from PIL import Image

RAIO = 6  # além disso, a folga sai como "> 6"


def main():
    img = Image.open(sys.argv[1]).convert("RGBA")
    faixas = json.load(open(sys.argv[2]))
    if len(sys.argv) > 3:
        fundo = np.array([int(c) for c in sys.argv[3].split(",")], dtype=np.int16)
        rgb = np.asarray(img.convert("RGB"), dtype=np.int16)
        pintado = (rgb != fundo).any(axis=2)
    else:
        pintado = np.asarray(img.getchannel("A")) > 0
    h, w = pintado.shape
    regiao = np.zeros((h, w), dtype=bool)
    for x, y, fw, fh in faixas:
        regiao[y : y + fh, x : x + fw] = True

    fora = pintado & ~regiao
    # Distância de cada pixel ao pintado mais perto, até o RAIO.
    dist = np.full((h, w), np.inf)
    dist[pintado] = 0
    ys, xs = np.nonzero(pintado)
    for dy in range(-RAIO, RAIO + 1):
        for dx in range(-RAIO, RAIO + 1):
            d = math.hypot(dx, dy)
            if d == 0 or d > RAIO:
                continue
            yy, xx = ys + dy, xs + dx
            ok = (yy >= 0) & (yy < h) & (xx >= 0) & (xx < w)
            np.minimum.at(dist, (yy[ok], xx[ok]), d)
    so_regiao = regiao & ~pintado
    folgas = dist[so_regiao]
    folga_max = float(folgas.max()) if folgas.size else 0.0
    fora_da_regiao = dist[~regiao]
    folga_min = float(fora_da_regiao.min()) - 1 if fora_da_regiao.size else None
    hist = {}
    for d in folgas:
        k = "> %d" % RAIO if math.isinf(d) else str(math.ceil(round(d, 6)))
        hist[k] = hist.get(k, 0) + 1
    print(
        json.dumps(
            {
                "lado": w,
                "pintados": int(pintado.sum()),
                "fora": int(fora.sum()),
                "fora_exemplos": [[int(x), int(y)] for y, x in list(zip(*np.nonzero(fora)))[:5]],
                "folga_max": None if math.isinf(folga_max) else round(folga_max, 3),
                "folga": dict(sorted(hist.items())),
                "folga_min": None if folga_min is None or math.isinf(folga_min) else round(folga_min, 3),
                "area": int(regiao.sum()),
            }
        )
    )


if __name__ == "__main__":
    main()
