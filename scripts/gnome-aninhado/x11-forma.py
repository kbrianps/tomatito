#!/usr/bin/env python3
"""Forma de entrada (XShape, ShapeInput) das janelas "Tomatito" no X11 (M57).

Rodado pelo roteiro x11 com o DISPLAY do Xwayland aninhado. Imprime, em JSON,
cada janela de topo com esse nome: a geometria, quantos retângulos a forma de
entrada tem e a caixa que os cobre, e o mesmo para as janelas filhas.
"""
import json
from Xlib import X, display
from Xlib.ext import shape

d = display.Display()
raiz = d.screen().root


def forma(w):
    try:
        g = w.get_geometry()
        r = w.shape_get_rectangles(shape.SK.Input).rectangles
    except Exception as e:  # noqa: BLE001
        return {'erro': str(e)}
    caixa = None
    if r:
        x0 = min(a.x for a in r); y0 = min(a.y for a in r)
        x1 = max(a.x + a.width for a in r); y1 = max(a.y + a.height for a in r)
        caixa = [x0, y0, x1 - x0, y1 - y0]
    dentro = lambda px, py: any(a.x <= px < a.x + a.width and a.y <= py < a.y + a.height for a in r)
    return {'id': hex(w.id), 'geo': [g.x, g.y, g.width, g.height], 'n': len(r), 'caixa': caixa,
            'canto_4_4': dentro(4, 4), 'corpo_61_175': dentro(61, 175)}


def achar(w, saida):
    try:
        nome = w.get_wm_name()
    except Exception:  # noqa: BLE001
        nome = None
    if nome == 'Tomatito':
        item = forma(w)
        item['filhas'] = [forma(f) for f in w.query_tree().children]
        saida.append(item)
    for f in w.query_tree().children:
        achar(f, saida)


saida = []
achar(raiz, saida)
print(json.dumps(saida))
