//! Região de entrada aproximada da janela `tomato` (spike B, M05).
//!
//! Soma de três formas do viewBox de 320 × 320, escaladas por `lado / 320`
//! (PLANO.md, M05):
//! - a elipse do corpo, com centro em (160, 185) e raios de 141,5 × 115, mais
//!   2 px de folga em cada raio;
//! - um retângulo sobre o cálice e o cabinho (x de 100 a 220, y de 40 a 115);
//! - um retângulo sobre os "ombros" (x de 16 a 304, y de 64 a 190).
//!
//! Cada linha de pixels vira a união das três formas naquela linha, e linhas
//! seguidas iguais se juntam num retângulo só. Código descartável: a região
//! exata, rasterizada do próprio SVG em JS, é do M53.

/// Um retângulo da região, em px da janela: `[x, y, largura, altura]`.
pub type Strip = [i32; 4];

/// Lado do viewBox do desenho.
const VIEWBOX: f64 = 320.0;
/// Elipse do corpo, no viewBox: centro e raios.
const BODY_CENTER: (f64, f64) = (160.0, 185.0);
const BODY_RADII: (f64, f64) = (141.5, 115.0);
/// Folga somada aos raios da elipse, em px da janela.
const BODY_MARGIN_PX: f64 = 2.0;
/// Retângulos no viewBox, como `[x0, y0, x1, y1]`.
const CALYX_BOX: [f64; 4] = [100.0, 40.0, 220.0, 115.0];
const SHOULDERS_BOX: [f64; 4] = [16.0, 64.0, 304.0, 190.0];

/// Faixas da região para uma janela de `size` × `size` px (240, 280 ou 320).
pub fn strips(size: u32) -> Vec<Strip> {
    let n = i32::try_from(size).expect("lado da janela cabe em i32");
    let k = f64::from(size) / VIEWBOX;
    let (cx, cy) = (BODY_CENTER.0 * k, BODY_CENTER.1 * k);
    let (rx, ry) = (
        BODY_RADII.0 * k + BODY_MARGIN_PX,
        BODY_RADII.1 * k + BODY_MARGIN_PX,
    );
    let rows: Vec<Vec<(i32, i32)>> = (0..n)
        .map(|y| {
            // A linha de pixels y cobre a faixa vertical [y, y + 1).
            let (top, bottom) = (f64::from(y), f64::from(y + 1));
            let mut spans = Vec::with_capacity(3);
            // Na elipse, a linha é mais larga na altura mais perto do centro.
            let dy = cy.clamp(top, bottom) - cy;
            if dy.abs() < ry {
                let half = rx * (1.0 - (dy / ry).powi(2)).sqrt();
                spans.push(((cx - half).floor() as i32, (cx + half).ceil() as i32));
            }
            for [x0, y0, x1, y1] in [CALYX_BOX, SHOULDERS_BOX] {
                if top < y1 * k && bottom > y0 * k {
                    spans.push(((x0 * k).floor() as i32, (x1 * k).ceil() as i32));
                }
            }
            union(spans, n)
        })
        .collect();
    merge_rows(&rows)
}

/// União de intervalos `[x0, x1)` de uma linha, recortada em `[0, n)`.
fn union(mut spans: Vec<(i32, i32)>, n: i32) -> Vec<(i32, i32)> {
    spans.sort_unstable();
    let mut out: Vec<(i32, i32)> = Vec::with_capacity(spans.len());
    for (x0, x1) in spans {
        let (x0, x1) = (x0.max(0), x1.min(n));
        if x0 >= x1 {
            continue;
        }
        match out.last_mut() {
            Some(last) if x0 <= last.1 => last.1 = last.1.max(x1),
            _ => out.push((x0, x1)),
        }
    }
    out
}

/// Junta linhas seguidas com as mesmas faixas num retângulo mais alto.
fn merge_rows(rows: &[Vec<(i32, i32)>]) -> Vec<Strip> {
    let mut out = Vec::new();
    let mut y = 0;
    while y < rows.len() {
        let mut h = 1;
        while y + h < rows.len() && rows[y + h] == rows[y] {
            h += 1;
        }
        for &(x0, x1) in &rows[y] {
            out.push([x0, y as i32, x1 - x0, h as i32]);
        }
        y += h;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{BTreeMap, BTreeSet};

    type P = (f64, f64);

    enum Seg {
        Line(P, P),
        Quad(P, P, P),
        Cubic(P, P, P, P),
        /// Elipse inteira: centro e raios.
        Ellipse(P, P),
    }

    fn at(seg: &Seg, t: f64) -> P {
        let u = 1.0 - t;
        match *seg {
            Seg::Line(a, b) => (u * a.0 + t * b.0, u * a.1 + t * b.1),
            Seg::Quad(a, b, c) => (
                u * u * a.0 + 2.0 * u * t * b.0 + t * t * c.0,
                u * u * a.1 + 2.0 * u * t * b.1 + t * t * c.1,
            ),
            Seg::Cubic(a, b, c, d) => (
                u * u * u * a.0 + 3.0 * u * u * t * b.0 + 3.0 * u * t * t * c.0 + t * t * t * d.0,
                u * u * u * a.1 + 3.0 * u * u * t * b.1 + 3.0 * u * t * t * c.1 + t * t * t * d.1,
            ),
            Seg::Ellipse(c, r) => {
                let a = t * std::f64::consts::TAU;
                (c.0 + r.0 * a.cos(), c.1 + r.1 * a.sin())
            }
        }
    }

    /// Contornos do desenho da `tomato.html` (cópia do `tomate-full.html`),
    /// no viewBox, com a meia-largura do traço. A sombra fica de fora de
    /// propósito: o clique atravessa a sombra (PLANO.md, 5.6).
    fn outlines() -> Vec<(&'static str, Vec<Seg>, f64)> {
        use Seg::*;
        let sepal = |a: P, b: P, c: P, d: P, e: P| vec![Quad(a, b, c), Quad(c, d, e), Line(e, a)];
        vec![
            (
                "corpo",
                vec![
                    Cubic((160., 80.), (190., 64.), (236., 62.), (268., 86.)),
                    Cubic((268., 86.), (296., 108.), (306., 150.), (300., 190.)),
                    Cubic((300., 190.), (293., 252.), (236., 298.), (160., 298.)),
                    Cubic((160., 298.), (84., 298.), (27., 252.), (20., 190.)),
                    Cubic((20., 190.), (14., 150.), (24., 108.), (52., 86.)),
                    Cubic((52., 86.), (84., 62.), (130., 64.), (160., 80.)),
                ],
                0.0,
            ),
            (
                "cabinho",
                vec![
                    Cubic((155.5, 88.), (155., 74.), (157., 60.), (160.5, 47.5)),
                    Quad((160.5, 47.5), (163.5, 43.), (169., 45.5)),
                    Cubic((169., 45.5), (166., 58.), (164.8, 72.), (165.5, 88.)),
                    Line((165.5, 88.), (155.5, 88.)),
                ],
                0.0,
            ),
            (
                "sépala 1",
                sepal(
                    (166., 83.),
                    (190., 66.),
                    (216., 77.),
                    (192., 92.),
                    (164., 91.),
                ),
                0.0,
            ),
            (
                "sépala 2",
                sepal(
                    (154., 83.),
                    (130., 66.),
                    (104., 77.),
                    (128., 92.),
                    (156., 91.),
                ),
                0.0,
            ),
            (
                "sépala 3",
                sepal(
                    (155., 90.),
                    (148., 100.),
                    (147., 113.),
                    (158., 105.),
                    (165., 91.),
                ),
                0.0,
            ),
            (
                "sépala 4",
                sepal(
                    (165., 82.),
                    (176., 64.),
                    (192., 60.),
                    (186., 76.),
                    (168., 87.),
                ),
                0.0,
            ),
            (
                "sépala 5",
                sepal(
                    (155., 82.),
                    (140., 64.),
                    (126., 62.),
                    (134., 76.),
                    (152., 87.),
                ),
                0.0,
            ),
            (
                "base do cálice",
                vec![Ellipse((160., 86.), (13., 6.5))],
                0.0,
            ),
            (
                "nervuras",
                vec![
                    Quad((170., 85.), (190., 79.), (210., 78.)),
                    Quad((150., 85.), (130., 79.), (110., 78.)),
                ],
                0.6,
            ),
        ]
    }

    /// Pixels que o desenho toca no contorno (com antialiasing, qualquer
    /// pixel cruzado pelo contorno recebe alfa > 0).
    fn touched(size: u32) -> BTreeSet<(i32, i32)> {
        let k = f64::from(size) / VIEWBOX;
        let mut px = BTreeSet::new();
        for (_, segs, half_stroke) in outlines() {
            let offsets: Vec<P> = if half_stroke > 0.0 {
                (0..16)
                    .map(|i| f64::from(i) * std::f64::consts::TAU / 16.0)
                    .map(|a| (half_stroke * k * a.cos(), half_stroke * k * a.sin()))
                    .chain([(0.0, 0.0)])
                    .collect()
            } else {
                vec![(0.0, 0.0)]
            };
            for seg in &segs {
                const STEPS: u32 = 20_000; // passo bem menor que 0,05 px
                for i in 0..=STEPS {
                    let (x, y) = at(seg, f64::from(i) / f64::from(STEPS));
                    for (ox, oy) in &offsets {
                        px.insert(((x * k + ox).floor() as i32, (y * k + oy).floor() as i32));
                    }
                }
            }
        }
        px
    }

    fn rows_of(strips: &[Strip]) -> BTreeMap<i32, Vec<(i32, i32)>> {
        let mut rows: BTreeMap<i32, Vec<(i32, i32)>> = BTreeMap::new();
        for &[x, y, w, h] in strips {
            for yy in y..y + h {
                rows.entry(yy).or_default().push((x, x + w));
            }
        }
        rows
    }

    const SIZES: [u32; 3] = [240, 280, 320];

    #[test]
    fn cobre_todo_o_contorno_em_240_280_e_320() {
        for size in SIZES {
            let n = size as i32;
            let rows = rows_of(&strips(size));
            let mut min_gap = i32::MAX;
            for (x, y) in touched(size) {
                assert!(
                    (0..n).contains(&x) && (0..n).contains(&y),
                    "{size} px: desenho fora da janela em ({x}, {y})"
                );
                let row = rows
                    .get(&y)
                    .unwrap_or_else(|| panic!("{size} px: linha {y} sem região"));
                let span = row.iter().find(|&&(x0, x1)| x0 <= x && x < x1);
                let &(x0, x1) = span.unwrap_or_else(|| {
                    panic!("{size} px: pixel ({x}, {y}) do desenho fora da região")
                });
                min_gap = min_gap.min(x - x0).min(x1 - 1 - x);
            }
            println!(
                "{size} px: {} retângulos, folga horizontal mínima {min_gap} px",
                strips(size).len()
            );
        }
    }

    #[test]
    fn cantos_da_janela_ficam_fora() {
        for size in SIZES {
            let m = size as i32 - 1;
            let rows = rows_of(&strips(size));
            for (x, y) in [(0, 0), (m, 0), (0, m), (m, m)] {
                let dentro = rows
                    .get(&y)
                    .is_some_and(|r| r.iter().any(|&(x0, x1)| x0 <= x && x < x1));
                assert!(!dentro, "{size} px: canto ({x}, {y}) dentro da região");
            }
        }
    }

    #[test]
    fn uma_faixa_por_linha_sem_sobreposicao_e_dentro_da_janela() {
        for size in SIZES {
            let n = size as i32;
            let s = strips(size);
            assert!(s.len() <= 300, "{size} px: {} retângulos", s.len());
            for &[x, y, w, h] in &s {
                assert!(
                    w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= n && y + h <= n,
                    "{size} px: {:?}",
                    [x, y, w, h]
                );
            }
            // Com uma faixa por linha, cobrir o contorno já cobre o miolo.
            for (y, row) in rows_of(&s) {
                assert_eq!(
                    row.len(),
                    1,
                    "{size} px: linha {y} com {} faixas",
                    row.len()
                );
            }
        }
    }

    #[test]
    fn uniao_e_juncao_de_linhas() {
        assert_eq!(
            union(vec![(5, 9), (-3, 2), (1, 6), (20, 40)], 30),
            vec![(0, 9), (20, 30)]
        );
        let rows = vec![
            vec![(1, 3)],
            vec![(1, 3)],
            vec![],
            vec![(0, 2), (4, 5)],
            vec![(0, 2), (4, 5)],
        ];
        assert_eq!(
            merge_rows(&rows),
            vec![[1, 0, 2, 2], [0, 3, 2, 2], [4, 3, 1, 2]]
        );
    }
}
