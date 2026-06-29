import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const messagesDir = join(process.cwd(), 'messages');

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}

describe('message catalog integrity', () => {
  it('defines edit PDF iframe patch labels for every locale', () => {
    const requiredKeys = [
      'common.editPdf.unnamedUser',
      'common.editPdf.undo',
      'common.editPdf.redo',
    ];

    const missing = readdirSync(messagesDir)
      .filter((file) => file.endsWith('.json'))
      .flatMap((file) => {
        const messages = JSON.parse(readFileSync(join(messagesDir, file), 'utf8'));
        return requiredKeys
          .filter((key) => typeof getNestedValue(messages, key) !== 'string')
          .map((key) => `${file}:${key}`);
      });

    expect(missing).toEqual([]);
  });
});
