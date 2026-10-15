import { sun } from '../../model/parameters';
import type { Range, Scenario } from './paramTypes';
import { SCENARIOS } from './paramTypes';

export type SkinExposure = keyof typeof sun.skinFractions.value;

export interface SunSession {
  /** Local clock time when the time outside starts, in hours (e.g. 7.5 = 07:30). */
  startHour: number;
  minutes: number;
  skin: SkinExposure;
}

export interface SunDayInput {
  /** Local date. */
  year: number;
  month: number; // 1–12
  day: number;
  /** Offset of local time from UTC on that date, in hours (e.g. 2 for CEST). */
  utcOffsetHours: number;
  latitude: number;
  longitude?: number;
  sessions: SunSession[];
}

const DEG = Math.PI / 180;

/** Solar elevation in degrees (NOAA general solar position equations). */
export function solarElevation(year: number, month: number, day: number, localHour: number, utcOffsetHours: number, latitude: number, longitude: number): number {
  const startOfYear = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - startOfYear) / 86_400_000) + 1;
  const daysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
  const utcHour = localHour - utcOffsetHours;
  const g = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1 + (utcHour - 12) / 24);
  const eqTime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const trueSolarMinutes = utcHour * 60 + eqTime + 4 * longitude;
  const hourAngle = (trueSolarMinutes / 4 - 180) * DEG;
  const lat = latitude * DEG;
  const cosZenith = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) / DEG;
}

/** Clear-sky UV index for a solar elevation (degrees). */
export function clearSkyUvIndex(elevationDeg: number): number {
  if (elevationDeg <= 0) return 0;
  const mu = Math.sin(elevationDeg * DEG);
  return sun.uvIndexClearSky.value.coefficient * mu ** sun.uvIndexClearSky.value.exponent;
}

/** Share of erythemal UV that is effective for vitamin D at this solar elevation (0–1). */
export function vitaminDEffectiveness(elevationDeg: number, scenario: Scenario = 'central'): number {
  const { zero, full } = sun.elevationRampDeg.value[scenario];
  return Math.min(1, Math.max(0, (elevationDeg - zero) / (full - zero)));
}

const STEP_MIN = 5;

/** Estimated vitamin D made in the skin on one day (µg), for the low / central / high runs. */
export function sunVitaminD(input: SunDayInput): Range {
  const lon = input.longitude ?? sun.defaultLongitudeDeg.value;
  const result = { low: 0, central: 0, high: 0 } as Range;
  for (const s of SCENARIOS as Scenario[]) {
    let medTotal = 0;
    let weightedMed = 0; // Σ MED fraction × skin fraction
    for (const session of input.sessions) {
      if (!(session.minutes > 0)) continue;
      let effectiveDose = 0; // J/m², vitamin-D weighted
      for (let m = 0; m < session.minutes; m += STEP_MIN) {
        const dt = Math.min(STEP_MIN, session.minutes - m);
        const hour = session.startHour + (m + dt / 2) / 60;
        const elev = solarElevation(input.year, input.month, input.day, hour, input.utcOffsetHours, input.latitude, lon);
        const irradiance = clearSkyUvIndex(elev) * sun.erythemalWm2PerUvi.value; // W/m²
        effectiveDose += irradiance * dt * 60 * sun.realWorldFactor.value[s] * vitaminDEffectiveness(elev, s);
      }
      const med = effectiveDose / sun.medJm2.value[s];
      medTotal += med;
      weightedMed += med * sun.skinFractions.value[session.skin];
    }
    // Previtamin D plateaus: exposure beyond ~1 MED per day adds little.
    const cap = sun.maxMedPerDay.value;
    const scale = medTotal > cap ? cap / medTotal : 1;
    result[s] = weightedMed * scale * sun.yieldPerFullBodyMedUg.value[s];
  }
  return result;
}
