import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BlockDefinition, PackageRef, PlacedBlock } from '../../src/types';
import type { Program } from '../../src/export/program';
import { toProgram } from '../../src/export/program';

/** One shared program case (the .NET library's ToProgram runs them too). */
interface Fixture {
  name: string;
  definitions: BlockDefinition[];
  canvas: { blocks: PlacedBlock[]; dependencies: PackageRef[] };
  program: Program;
}

const fixtures: [string, Fixture][] = readdirSync(__dirname)
  .filter(file => file.endsWith('.json'))
  .flatMap(file => (JSON.parse(readFileSync(join(__dirname, file), 'utf8')) as Fixture[]).map(f => [f.name, f] as [string, Fixture]));

describe('shared program cases', () => {
  it('has cases', () => expect(fixtures.length).toBeGreaterThan(0));

  it.each(fixtures)('%s', (_name, fixture) => {
    const definitions = new Map(fixture.definitions.map(d => [d.id, d]));
    const state = { blocks: new Map(fixture.canvas.blocks.map(b => [b.instanceId, b])), dependencies: fixture.canvas.dependencies };
    expect(toProgram(state, id => definitions.get(id))).toEqual(fixture.program);
  });
});
