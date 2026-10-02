#!/usr/bin/env python3
"""Compara as capturas de duas rodadas da bateria do desktop (PLANO-WEB, 3.10).

    python3 scripts/web/comparar-capturas.py <base> <atual>

<base> e <atual> são pastas da bateria (com capturas/ dentro) ou as próprias
pastas de PNG. Toda captura da base precisa existir na atual, com o mesmo
tamanho, e uma captura falha se mais de 0,1% dos pixels diferir em mais de
8/255 em algum canal (RGBA). Capturas a mais na atual são listadas, mas não
reprovam (telas novas podem entrar). O sha256 não conta: a prévia usa o
Date.now real, e telas com hora podem variar.

Saída: 0 se tudo passar, 1 se alguma captura falhar ou faltar, 2 em erro de
uso. Depende só do Pillow (12.1.1 na máquina de referência).
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops

LIMIAR_CANAL = 8  # em 255
LIMITE_FRACAO = 0.001  # 0,1% dos pixels


def pasta_de_capturas(caminho: Path) -> Path:
    sub = caminho / 'capturas'
    return sub if sub.is_dir() else caminho


def pixels_diferentes(a: Image.Image, b: Image.Image) -> int:
    diff = ImageChops.difference(a.convert('RGBA'), b.convert('RGBA'))
    # Um pixel conta se algum canal passar do limiar: cada canal vira 0/255
    # pelo limiar, e o máximo entre os canais marca o pixel.
    canais = [c.point(lambda v: 255 if v > LIMIAR_CANAL else 0) for c in diff.split()]
    marca = canais[0]
    for c in canais[1:]:
        marca = ImageChops.lighter(marca, c)
    return marca.histogram()[255]


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    base, atual = (pasta_de_capturas(Path(p)) for p in argv[1:])
    for p in (base, atual):
        if not p.is_dir():
            print(f'pasta inexistente: {p}', file=sys.stderr)
            return 2
    nomes_base = sorted(p.name for p in base.glob('*.png'))
    nomes_atual = {p.name for p in atual.glob('*.png')}
    if not nomes_base:
        print(f'nenhuma captura em {base}', file=sys.stderr)
        return 2
    falhas = 0
    for nome in nomes_base:
        if nome not in nomes_atual:
            print(f'FALTA  {nome}')
            falhas += 1
            continue
        with Image.open(base / nome) as a, Image.open(atual / nome) as b:
            if a.size != b.size:
                print(f'FALHA  {nome}: tamanho {a.size} x {b.size}')
                falhas += 1
                continue
            total = a.size[0] * a.size[1]
            n = pixels_diferentes(a, b)
        fracao = n / total
        ok = fracao <= LIMITE_FRACAO
        print(f'{"ok   " if ok else "FALHA"}  {nome}: {n} de {total} px ({fracao:.4%})')
        falhas += 0 if ok else 1
    for nome in sorted(nomes_atual - set(nomes_base)):
        print(f'nova   {nome} (sem par na base)')
    print(f'{len(nomes_base) - falhas}/{len(nomes_base)} capturas iguais dentro do limite')
    return 1 if falhas else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
