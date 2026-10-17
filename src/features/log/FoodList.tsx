import { useData } from '../../app/data';
import type { Food } from '../../foods/foodDb';

export function FoodList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
  const d = useData();
  return (
    <ul className="result-list">
      {foods.map((f) => (
        <li key={f.code}>
          <button className="result" onClick={() => onPick(f)}>
            <span className="result-name">{f.nameEn}</span>
            <span className="muted small">
              {f.nameDe} · {d.foods.groups[f.group]?.en}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
