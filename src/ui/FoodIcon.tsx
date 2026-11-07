import { useEffect, useState } from 'react';
import type { FoodIconName } from '../logic/foodIcons';

type Svgs = Record<FoodIconName, string>;
let loaded: Svgs | undefined;
let loading: Promise<Svgs> | undefined;
/** The pictures (~45 KB) load with the first screen that shows one, not with Home. */
const load = () => (loading ??= import('./foodIconData').then((m) => (loaded = m.FOOD_ICON_SVG)));
const urls = new Map<FoodIconName, string>();
const urlOf = (svgs: Svgs, name: FoodIconName) => {
  let url = urls.get(name);
  if (!url) urls.set(name, (url = `data:image/svg+xml,${encodeURIComponent(svgs[name])}`));
  return url;
};

/**
 * A food picture in a plain ring (src/logic/foodIcons.ts), or two letters for a thing without one.
 * Drawn as an image, so the same picture twice on a screen never shares ids. Decorative: the name
 * next to it says what it is.
 */
export function FoodIcon({ icon, monogram, size = 56 }: { icon?: FoodIconName; monogram: string; size?: number }) {
  const [svgs, setSvgs] = useState(loaded);
  useEffect(() => {
    if (!svgs && icon) void load().then(setSvgs);
  }, [svgs, icon]);
  return (
    <span className="food-icon" style={{ width: size, height: size }} aria-hidden>
      {icon ? svgs && <img src={urlOf(svgs, icon)} alt="" width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} draggable={false} /> : <span className="food-icon-mono">{monogram}</span>}
    </span>
  );
}
