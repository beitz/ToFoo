import { useData } from '../../app/data';
import type { Food } from '../../foods/foodDb';
import { FavouriteStar } from './FavouriteButton';
import { foodName, foodAltName, groupName } from '../../i18n/names';

export function FoodList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
  const d = useData();
  return (
    <ul className="result-list">
      {foods.map((f) => (
        <li key={f.code} className="fav-row">
          <button className="result" onClick={() => onPick(f)}>
            <span className="result-name">{foodName(f)}</span>
            <span className="muted small">
              {foodAltName(f)} · {groupName(d.foods.groups[f.group])}
            </span>
          </button>
          <FavouriteStar foodRef={{ source: 'BLS', version: d.foods.version, code: f.code }} name={foodName(f)} />
        </li>
      ))}
    </ul>
  );
}
