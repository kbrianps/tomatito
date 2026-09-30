//! O `Motor` pelo lado do JS (W06a): `comando`, `estado`, `tick` e
//! `estaCorrendo` com `JsValue`, o `{ code, message }` lançado num erro e o
//! `RelogioJs` lendo o `Date.now` global a cada uso. Só existe no wasm
//! (`npm run test:wasm`, no Node e no Chrome).
#![cfg(target_family = "wasm")]

use js_sys::{Function, Object, Reflect};
use serde::Serialize;
use serde_json::{Value, json};
use tomatito_wasm::Motor;
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_test::wasm_bindgen_test as test;

const T0: f64 = 1_790_000_000_000.0;

/// Troca o `Date.now` global por um que lê `globalThis.__tomatitoAgora`, como
/// o relógio de teste do `verificar.mjs`; o original volta no `drop`.
struct RelogioDeTeste {
    date: Object,
    original: JsValue,
}

impl RelogioDeTeste {
    fn novo(agora: f64) -> Self {
        let date: Object = Reflect::get(&js_sys::global(), &"Date".into())
            .unwrap()
            .into();
        let original = Reflect::get(&date, &"now".into()).unwrap();
        let falso = Function::new_no_args("return globalThis.__tomatitoAgora;");
        Reflect::set(&date, &"now".into(), &falso).unwrap();
        let r = Self { date, original };
        r.por(agora);
        r
    }

    fn por(&self, agora: f64) {
        Reflect::set(
            &js_sys::global(),
            &"__tomatitoAgora".into(),
            &JsValue::from_f64(agora),
        )
        .unwrap();
    }
}

impl Drop for RelogioDeTeste {
    fn drop(&mut self) {
        Reflect::set(&self.date, &"now".into(), &self.original).unwrap();
    }
}

fn args(v: Value) -> JsValue {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .unwrap()
}

fn valor(v: JsValue) -> Value {
    serde_wasm_bindgen::from_value(v).unwrap()
}

#[test]
fn comando_devolve_resultado_efeitos_e_proximo_prazo() {
    let _r = RelogioDeTeste::novo(T0);
    let m = Motor::new();
    let v = valor(
        m.comando("focus_start", args(json!({ "minutes": 25 })))
            .unwrap(),
    );
    assert_eq!(v["resultado"]["status"], "focus");
    assert_eq!(v["resultado"]["session"]["remainingMs"], 1_500_000);
    assert_eq!(v["resultado"]["session"]["endsAt"], T0 as i64 + 1_500_000);
    assert_eq!(v["resultado"]["seq"], 1);
    let tipos: Vec<&str> = v["efeitos"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["tipo"].as_str().unwrap())
        .collect();
    assert_eq!(tipos, ["state", "phase"]);
    assert_eq!(v["efeitos"][1]["dados"]["cause"], "started");
    assert_eq!(v["proximoPrazo"], T0 as i64 + 1_500_000);
    assert!(m.esta_correndo());
}

#[test]
fn o_relogio_le_o_date_now_global_a_cada_uso() {
    let r = RelogioDeTeste::novo(T0);
    let m = Motor::new();
    m.comando("focus_start", args(json!({ "minutes": 25 })))
        .unwrap();
    r.por(T0 + 60_000.0);
    let v = valor(m.estado().unwrap());
    assert_eq!(v["resultado"]["focus"]["at"], T0 as i64 + 60_000);
    assert_eq!(v["resultado"]["focus"]["session"]["remainingMs"], 1_440_000);
    assert_eq!(v["resultado"]["speed"], 1.0);
    assert_eq!(
        v["resultado"]["timers"]["timers"].as_array().unwrap().len(),
        4
    );
    assert_eq!(v["resultado"]["stopwatch"]["status"], "idle");
    assert_eq!(v["efeitos"], json!([]));
}

#[test]
fn tick_emite_o_segundo_e_fecha_a_fase_vencida() {
    let r = RelogioDeTeste::novo(T0);
    let m = Motor::new();
    m.comando("focus_start", args(json!({ "minutes": 55 })))
        .unwrap();
    let v = valor(m.tick().unwrap());
    assert_eq!(v["resultado"], true);
    assert_eq!(v["efeitos"][0]["tipo"], "tick");
    assert_eq!(v["efeitos"][0]["dados"]["remainingMs"], 1_500_000);
    // O mesmo segundo mostrado: nenhum tick novo.
    r.por(T0 + 400.0);
    assert_eq!(valor(m.tick().unwrap())["efeitos"], json!([]));

    r.por(T0 + 25.0 * 60_000.0);
    let v = valor(m.tick().unwrap());
    let tipos: Vec<&str> = v["efeitos"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["tipo"].as_str().unwrap())
        .collect();
    assert_eq!(
        tipos,
        ["period", "state", "phase", "sound", "notice", "tick"]
    );
    assert_eq!(v["efeitos"][2]["dados"]["phase"]["kind"], "break");
    assert_eq!(v["proximoPrazo"], T0 as i64 + 30 * 60_000);

    m.comando("focus_stop", JsValue::UNDEFINED).unwrap();
    let v = valor(m.tick().unwrap());
    assert_eq!(v["resultado"], false);
    assert_eq!(v["proximoPrazo"], Value::Null);
    assert!(!m.esta_correndo());
}

#[test]
fn erro_do_comando_lanca_code_e_message_do_desktop() {
    let _r = RelogioDeTeste::novo(T0);
    let m = Motor::new();
    let e = m.comando("focus_pause", JsValue::UNDEFINED).unwrap_err();
    assert!(
        !e.is_instance_of::<js_sys::Error>(),
        "objeto simples, como o invoke"
    );
    assert_eq!(
        valor(e),
        json!({ "code": "notRunning", "message": "não há fase correndo para pausar" })
    );

    let e = m.comando("focus_resume", JsValue::NULL).unwrap_err();
    assert_eq!(valor(e)["code"], "notPaused");
    let e = m
        .comando("timer_start", args(json!({ "id": 99 })))
        .unwrap_err();
    assert_eq!(valor(e)["code"], "notFound");
    let e = m
        .comando("focus_start", args(json!({ "minutes": 1000 })))
        .unwrap_err();
    assert_eq!(valor(e)["code"], "invalidMinutes");
    let e = m.comando("focus_start", JsValue::UNDEFINED).unwrap_err();
    assert_eq!(valor(e)["code"], "invalidArgs");
    let e = m.comando("settings_get", JsValue::UNDEFINED).unwrap_err();
    assert_eq!(valor(e)["code"], "unknownCommand");
}

#[test]
fn temporizador_e_cronometro_com_args_em_camel_case() {
    let r = RelogioDeTeste::novo(T0);
    let m = Motor::new();
    let v = valor(
        m.comando(
            "timer_create",
            args(json!({ "name": "Chá", "durationMs": 90_000 })),
        )
        .unwrap(),
    );
    let id = v["resultado"]["timers"][4]["id"].clone();
    assert_eq!(v["resultado"]["timers"][4]["name"], "Chá");
    let v = valor(m.comando("timer_start", args(json!({ "id": id }))).unwrap());
    assert_eq!(v["proximoPrazo"], T0 as i64 + 90_000);
    assert_eq!(v["efeitos"][0]["tipo"], "timers");

    r.por(T0 + 90_000.0);
    let v = valor(m.tick().unwrap());
    assert_eq!(v["efeitos"][1]["tipo"], "timerNotice");
    assert_eq!(v["efeitos"][1]["dados"]["name"], "Chá");
    assert_eq!(v["efeitos"][1]["dados"]["late"], false);

    let v = valor(m.comando("stopwatch_start", JsValue::UNDEFINED).unwrap());
    assert_eq!(v["resultado"]["status"], "running");
    assert_eq!(v["efeitos"][0]["tipo"], "stopwatch");
    let e = m
        .comando("stopwatch_start", JsValue::UNDEFINED)
        .unwrap_err();
    assert_eq!(valor(e)["code"], "alreadyRunning");
}
