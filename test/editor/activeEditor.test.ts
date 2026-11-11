import { describe, expect, it } from 'vitest';
import { activateEditor, isActiveEditor, registerEditor, unregisterEditor } from '../../src/editor/activeEditor';

describe('active editor', () => {
  it('is the first editor mounted, then the one last pointed into, and none after it unmounts', () => {
    const ann = Symbol('ann'), bo = Symbol('bo');
    registerEditor(ann);
    registerEditor(bo);
    expect(isActiveEditor(ann)).toBe(true);
    expect(isActiveEditor(bo)).toBe(false);

    activateEditor(bo);
    expect(isActiveEditor(ann)).toBe(false);
    expect(isActiveEditor(bo)).toBe(true);

    // With no active editor (the active one unmounted), any editor handles the keys until one is pointed into.
    unregisterEditor(bo);
    expect(isActiveEditor(ann)).toBe(true);
    unregisterEditor(ann);
  });
});
