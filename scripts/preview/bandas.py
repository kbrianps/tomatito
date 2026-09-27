#!/usr/bin/env python3
"""Posições do cartão "Pronto para focar" numa captura (M17), pelos pixels.

Mede as faixas de tinta (linhas com pixels que diferem do fundo do cartão)
em regiões fixas do cartão, em px CSS a partir do canto de cima à esquerda:
o texto fora do seletor (título, duas linhas de texto, frase, caixa e botão),
o número e a unidade dentro do campo, os dois chevrons e as bordas de cima e
de baixo do seletor. Serve para a captura do Relógio
(~/dev/tomatito-ref/clock-focus-sessions-page.png, a 175%) e para as do
Tomatito (a 100%), e o cartao-sessao.mjs compara as duas.

    python3 bandas.py captura.png escala x0 y0 x1 y1

x0 y0 x1 y1 é a caixa do cartão, em pixels da captura (com a borda). Imprime
um JSON: nome -> [y de cima, y de baixo, x do centro em relação ao centro do
cartão]. Precisa do Pillow (python3-pil). Só para as prévias; nunca entra no
app.
"""
import json
import sys

from PIL import Image

# Regiões do cartão, em px CSS: (x0, y0, x1, y1). O seletor fica entre x 140
# e 310 e entre y 126 e 226 nas duas capturas; o campo termina em x 254 e a
# coluna dos chevrons começa em x 258.
FORA_DO_TOPO = 32         # a linha de botões do Relógio (que o Tomatito não tem)
SELETOR = (138, 126, 312, 226)
CAMPO = (148, 136, 252, 216)
CHEVRONS = (260, 136, 302, 216)
LIMIAR = 40               # diferença mínima de um canal para contar como tinta


def main():
    arquivo, escala = sys.argv[1], float(sys.argv[2])
    cx0, cy0, cx1, cy1 = map(int, sys.argv[3:7])
    im = Image.open(arquivo).convert('RGB')
    px = im.load()
    largura = (cx1 - cx0) / escala
    fundo = px[cx0 + int(8 * escala), cy0 + int(400 * escala)]

    def tinta(x, y):
        c = px[x, y]
        return max(abs(c[i] - fundo[i]) for i in range(3)) > LIMIAR

    def faixas(regiao, mascara=None):
        x0, y0, x1, y1 = regiao
        saida, atual = [], None
        for yc in range(int(y0 * escala), int(y1 * escala)):
            xs = []
            for xc in range(int(x0 * escala), int(x1 * escala)):
                if mascara and mascara[0] * escala <= xc < mascara[2] * escala and mascara[1] * escala <= yc < mascara[3] * escala:
                    continue
                if tinta(cx0 + xc, cy0 + yc):
                    xs.append(xc)
            if xs:
                if atual is None:
                    atual = [yc, yc, min(xs), max(xs)]
                else:
                    atual[1] = yc
                    atual[2] = min(atual[2], min(xs))
                    atual[3] = max(atual[3], max(xs))
            elif atual:
                saida.append(atual)
                atual = None
        if atual:
            saida.append(atual)
        return [
            [round(a / escala, 1), round((b + 1) / escala, 1), round((c + d + 1) / 2 / escala - largura / 2, 1)]
            for a, b, c, d in saida
        ]

    fora = [f for f in faixas((4, FORA_DO_TOPO, largura - 4, 400), SELETOR) if f[1] - f[0] >= 4]
    nomes = ['titulo', 'texto1', 'texto2', 'frase', 'caixa', 'botao']
    medidas = dict(zip(nomes, fora))
    if len(fora) != len(nomes):
        medidas['aviso'] = f'{len(fora)} faixas fora do seletor, esperado {len(nomes)}: {fora}'
    campo = [f for f in faixas(CAMPO) if f[1] - f[0] >= 4]
    if campo:
        medidas['digitos'] = campo[0]
        medidas['unidade'] = campo[-1]
    chev = faixas(CHEVRONS)
    if len(chev) >= 2:
        medidas['chevron_cima'] = chev[0]
        medidas['chevron_baixo'] = chev[-1]

    # Bordas do seletor: na coluna x = 170 (dentro do campo, fora do número),
    # a primeira linha que difere do fundo do cartão é o topo, e a última, o
    # sublinhado.
    xc = cx0 + int(150 * escala)
    ys = [y for y in range(int(120 * escala), int(232 * escala)) if max(abs(px[xc, cy0 + y][i] - fundo[i]) for i in range(3)) > 6]
    if ys:
        medidas['seletor'] = [round(ys[0] / escala, 1), round((ys[-1] + 1) / escala, 1), None]
    print(json.dumps(medidas))


if __name__ == '__main__':
    main()
