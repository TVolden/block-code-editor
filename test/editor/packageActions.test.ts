import { describe, expect, it, vi } from 'vitest';
import type { PackageRef } from '../../src/types';
import { runPackageAction } from '../../src/utils/packages';

const core: PackageRef = { publisher: 'cardcq', name: 'core', version: '1.0.0' };
const cards: PackageRef = { publisher: 'cardcq', name: 'cards', version: '2.0.0' };

describe('package actions', () => {
  it('run the host\'s onClick', () => {
    const onClick = vi.fn();
    const change = vi.fn();
    runPackageAction({ label: 'Help', onClick }, [core], change);
    expect(onClick).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
  });

  it('change the dependencies to the ones they give from the current ones', () => {
    const change = vi.fn();
    runPackageAction({ label: 'Import', dependencies: current => [...current, cards] }, [core], change);
    expect(change).toHaveBeenCalledWith([core, cards]);
  });
});
