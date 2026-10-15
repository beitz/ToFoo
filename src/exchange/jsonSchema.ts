import { z } from 'zod';
import { exchangeSchema, FORMAT_VERSION } from './schema';

export function exchangeJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(exchangeSchema, { io: 'input', unrepresentable: 'any' }),
    $id: 'https://beitz.github.io/ToFoo/exchange-format.schema.json',
    title: `ToFoo exchange format, version ${FORMAT_VERSION}`,
    description: 'Generated from src/exchange/schema.ts. See docs/exchange-format.md.',
  };
}
