import { useData } from '../../app/data';
import type { Food } from '../../foods/foodDb';
import { FavouriteStar } from './FavouriteButton';

export function FoodList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
  const d = useData();
  return (
    <ul className="result-list">
      {foods.map((f) => (
        <li key={f.code} className="fav-row">
          <button className="result" onClick={() => onPick(f)}>
            <span className="result-name">{f.nameEn}</span>
            <span className="muted small">
              {f.nameDe} · {d.foods.groups[f.group]?.en}
            </span>
          </button>
          <FavouriteStar foodRef={{ source: 'BLS', version: d.foods.version, code: f.code }} name={f.nameEn} />
        </li>
      ))}
    </ul>
  );
}
