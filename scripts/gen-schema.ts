/** Writes docs/exchange-format.schema.json from src/exchange/schema.ts. Run: npm run schema */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exchangeJsonSchema } from '../src/exchange/jsonSchema';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/exchange-format.schema.json');
writeFileSync(out, JSON.stringify(exchangeJsonSchema(), null, 2) + '\n');
console.log(`Wrote ${out}`);
