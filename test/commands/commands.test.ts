import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/commands/types';
import { applyCommand } from '../../src/commands/apply';
import { invertCommand } from '../../src/commands/invert';
import type { FixtureState } from './helpers';
import { comparable, rejectionCode, toState } from './helpers';

/** One case of the shared contract fixtures (also run by the backend's tests). */
interface Fixture {
  name: string;
  before: FixtureState;
  command: Command;
  after?: FixtureState;
  rejected?: string;
}

const dir = __dirname;
const fixtures: [string, Fixture][] = readdirSync(dir)
  .filter(file => file.endsWith('.json'))
  .flatMap(file => (JSON.parse(readFileSync(join(dir, file), 'utf8')) as Fixture[]).map(f => [file, f] as [string, Fixture]));

describe('command contract fixtures', () => {
  it.each(fixtures)('%s: %o', (_file, fixture) => {
    const before = toState(fixture.before);
    if (fixture.rejected) {
      expect(rejectionCode(() => applyCommand(before, fixture.command))).toBe(fixture.rejected);
      return;
    }
    const after = applyCommand(before, fixture.command);
    expect(comparable(after)).toEqual(comparable(toState(fixture.after!)));
  });
});

describe('undo round trips', () => {
  const accepted = fixtures.filter(([, f]) => !f.rejected);
  it.each(accepted)('%s: %o', (_file, fixture) => {
    const before = toState(fixture.before);
    const after = applyCommand(before, fixture.command);
    const undone = applyCommand(after, invertCommand(fixture.command));
    expect(comparable(undone)).toEqual(comparable(before));
    // And redo gets back to the same state.
    expect(comparable(applyCommand(undone, fixture.command))).toEqual(comparable(after));
  });
});

describe('commands never modify the state they are given', () => {
  it('leaves the input untouched, also when rejected', () => {
    for (const [, fixture] of fixtures) {
      const before = toState(fixture.before);
      const snapshot = JSON.stringify(comparable(before));
      rejectionCode(() => applyCommand(before, fixture.command));
      expect(JSON.stringify(comparable(before))).toBe(snapshot);
    }
  });
});
