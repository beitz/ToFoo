/**
 * "How often" on the nutrient page and why some averages span more days (owner's ask, 2026-10-26).
 * Rules and sources: model/howOften.ts; slow windows: model/parameters.ts (`storage`, `slowWindow`).
 *
 * - `often.<id>`: the DGE food rule for a nutrient, as the chip says it;
 * - `window.<id>`: one line on why that nutrient's average spans the days it does.
 */
export const howOftenEn = {
  'often.title': 'How often',
  'often.spoken': 'How often: {rule}',
  'often.source': 'German Nutrition Society (DGE), food guidelines for healthy adults',
  'often.examples': 'What 100 g covers, against your reference intake of {ref} a day:',
  'often.example': 'about {n} days',
  'often.exampleSpoken': '100 g {food} covers about {n} days',
  'often.examplesSource': 'Amounts from BLS 4.0, raw fish.',
  'often.dgeOnly': 'The guidelines say how often for some foods only; nutrients they don’t name have no line.',

  'often.EPADHA': 'Fatty fish once or twice a week',
  'often.ID': 'Sea fish once or twice a week, dairy every day',
  'often.CA': 'Milk and dairy every day',
  'often.RIBF': 'Milk and dairy every day',
  'often.VITB12': 'Milk and dairy every day',
  'often.PROT625': 'Dairy every day, legumes at least once a week',
  'often.FIBT': 'Fruit and vegetables five times a day, legumes once a week',
  'often.F18:2CN6': 'A small handful of nuts every day',
  'often.F18:3CN3': 'A small handful of nuts every day',

  'window.slow': 'Averaged over {weeks} weeks, not {usual} days, because the body evens it out slowly.',
  'window.EPADHA': 'Red blood cells swap half their omega-3 in about 4 weeks, so one fish meal counts for weeks.',
  'window.F18:2CN6': 'Body fat holds a large reserve that changes over years; blood follows within weeks.',
  'window.F18:3CN3': 'Body fat holds a reserve that reflects years of intake; blood follows within weeks.',
  'window.VITE': 'Body fat holds a large reserve that changes over years; blood follows within weeks.',
  'window.SE': 'The body holds selenium from food for months: half of a tracer dose was still there after 7 to 10 months.',
  'window.VITC': 'Averaged over {days} days: the body holds a pool of vitamin C that lasts weeks; half of it is replaced every 10 to 16 days.',
  'window.ZN': 'Averaged over {days} days: the body has no zinc store, but a small pool in blood and organs that turns over in about 12 days.',
  'window.VITK': 'Averaged over {days} days: the liver holds little vitamin K and uses it up within days.',
  'window.sourceLink': 'Source',
  'window.chartSpan': 'Bars show the last {n} days; the average spans {days} days.',
} as const;
