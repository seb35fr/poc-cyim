// Echelle de chaleur partagee par les cartes (monde, France, demographie).
// 0 -> neutre clair (gris quasi-blanc, n'attire pas l'oeil)
// faible -> vert
// moyen -> jaune/orange
// fort  -> rouge
//
// On applique un sqrt sur le ratio pour spreader les petites valeurs
// (sinon les regions a faible effectif resteraient presque grises).

const NEUTRAL = "#f1f5f9"; // gris tres clair (slate-100)
const STOPS = [
  { t: 0,   r: 48,  g: 221, b: 146 }, // vert CYIM (#30DD92)
  { t: 0.5, r: 255, g: 166, b: 0   }, // orange (#FFA600)
  { t: 1,   r: 229, g: 57,  b: 53  }, // rouge (#E53935)
];

function lerp(a, b, k) {
  return Math.round(a + (b - a) * k);
}

export function heatColor(value, maxValue) {
  if (!value || value <= 0) return NEUTRAL;
  const ratio = Math.min(1, value / Math.max(1, maxValue));
  const t = Math.sqrt(ratio);

  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i].t && t <= STOPS[i + 1].t) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const k = hi.t === lo.t ? 0 : (t - lo.t) / (hi.t - lo.t);
  const r = lerp(lo.r, hi.r, k);
  const g = lerp(lo.g, hi.g, k);
  const b = lerp(lo.b, hi.b, k);
  return `rgb(${r},${g},${b})`;
}

export const HEAT_NEUTRAL = NEUTRAL;
