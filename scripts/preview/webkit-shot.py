#!/usr/bin/env python3
"""Captura no WebKitGTK real, sem janela na tela. Chamado pelo webkit-shot.mjs.

Usa a mesma biblioteca do app no Linux (WebKitGTK 4.1, via PyGObject) numa
Gtk.OffscreenWindow: nada é mapeado no compositor, então não aparece janela na
sessão. A renderização é por software (HardwareAccelerationPolicy.NEVER),
porque a janela fora da tela não consegue contexto GL no Wayland; para CSS,
fontes e layout, o resultado é o mesmo do app.

Entrada: um JSON em argv[1] com url, width, height, scheme e steps
([["eval", "expr"], ["wait", "300"], ["shot", "arquivo.png"]]).
Saída: uma linha por passo no stdout; o console.error/warn e os erros da página
vão para o stderr. Código 1 se a página lançar erro ou um passo falhar.
"""
import json
import sys

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

cfg = json.loads(sys.argv[1])
state = {"code": 0, "steps": list(cfg["steps"])}

# Guarda console.error/warn e erros da página desde o início do documento.
PROBE = """
(() => {
  const log = (window.__ttLog = []);
  for (const k of ['error', 'warn']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { log.push([k, a.map(String).join(' ')]); orig(...a); };
  }
  addEventListener('error', (e) => log.push(['exceção', String(e.message)]));
  addEventListener('unhandledrejection', (e) => log.push(['exceção', String(e.reason)]));
})();
"""

settings = Gtk.Settings.get_default()
if settings is not None:
    settings.set_property("gtk-application-prefer-dark-theme", cfg.get("scheme") == "dark")

content = WebKit2.UserContentManager()
content.add_script(
    WebKit2.UserScript(
        PROBE,
        WebKit2.UserContentInjectedFrames.TOP_FRAME,
        WebKit2.UserScriptInjectionTime.START,
        None,
        None,
    )
)
view = WebKit2.WebView.new_with_user_content_manager(content)
view.get_settings().set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.NEVER)
view.set_size_request(cfg["width"], cfg["height"])
win = Gtk.OffscreenWindow()
win.set_default_size(cfg["width"], cfg["height"])
win.add(view)


def finish(code=None):
    if code is not None:
        state["code"] = max(state["code"], code)
    Gtk.main_quit()


def run_js(expr, callback):
    def done(_obj, res):
        try:
            value = view.call_async_javascript_function_finish(res)
            text = value.to_string() if value.is_string() else "null"
            callback(json.loads(text), None)
        except Exception as err:  # noqa: BLE001 (o erro vem do JS da página)
            callback(None, err)

    # O corpo é de uma função assíncrona: promessas são esperadas, e o valor
    # volta como JSON para não depender da conversão de tipos do JSC.
    body = "return JSON.stringify(await (" + expr + ")) ?? 'null';"
    view.call_async_javascript_function(body, -1, None, None, None, None, done)


def next_step():
    if not state["steps"]:
        return report_console()
    kind, value = state["steps"].pop(0)
    if kind == "wait":
        GLib.timeout_add(int(value), lambda: (next_step(), False)[1])
    elif kind == "eval":

        def done(result, err):
            if err:
                print(f"{value} => erro: {err}", file=sys.stderr)
                return finish(1)
            print(f"{value} => {json.dumps(result, ensure_ascii=False)}", flush=True)
            next_step()

        run_js(value, done)
    elif kind == "shot":

        def snap_done(_obj, res):
            try:
                surface = view.get_snapshot_finish(res)
                surface.write_to_png(value)
                print(f"captura: {value}", flush=True)
            except Exception as err:  # noqa: BLE001
                print(f"captura falhou: {err}", file=sys.stderr)
                return finish(1)
            next_step()

        view.get_snapshot(
            WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, snap_done
        )
    else:
        print(f"passo desconhecido: {kind}", file=sys.stderr)
        finish(1)


def report_console():
    def done(result, err):
        for kind, text in result or []:
            print(f"[{kind}] {text}", file=sys.stderr)
            if kind == "exceção":
                state["code"] = 1
        finish()

    run_js("window.__ttLog ?? []", done)


def on_load(_view, event):
    if event == WebKit2.LoadEvent.FINISHED:
        # Mesmo ponto de partida do shot.mjs: fontes prontas e dois quadros.
        run_js(
            "document.fonts.ready.then(() => new Promise((r) =>"
            " requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))",
            lambda _r, err: finish(1) if err else next_step(),
        )


def on_fail(_view, _event, uri, err):
    print(f"falha ao carregar {uri}: {err.message}", file=sys.stderr)
    finish(1)
    return True


view.connect("load-changed", on_load)
view.connect("load-failed", on_fail)
view.load_uri(cfg["url"])
win.show_all()
GLib.timeout_add_seconds(int(cfg.get("timeout", 60)), lambda: (print("tempo esgotado", file=sys.stderr), finish(1), False)[2])
Gtk.main()
sys.exit(state["code"])
