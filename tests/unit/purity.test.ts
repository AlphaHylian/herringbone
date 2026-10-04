import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('src/core purity', () => {
  const dir = join(__dirname, '../../src/core');
  for (const f of readdirSync(dir)) {
    it(`${f} imports nothing from rendering, input, platform or the DOM`, () => {
      const src = readFileSync(join(dir, f), 'utf8');
      const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
      for (const i of imports) expect(i === 'clipper2-ts' || i.startsWith('./')).toBe(true);
      expect(src).not.toMatch(/\b(window|document|localStorage|navigator)\./);
    });
  }
});
