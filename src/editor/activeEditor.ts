/**
 * Which editor on the page keyboard shortcuts (undo/redo) act on: the one last pointed into or focused. Until then,
 * the first one mounted. Several editors can share a page, and each listens to the whole window's keys.
 */

let active: symbol | null = null;

/** An editor mounted: it is active if none is yet. */
export function registerEditor(id: symbol) {
  if (active === null) active = id;
}

/** An editor unmounted: it is no longer active (the next one pointed into becomes active). */
export function unregisterEditor(id: symbol) {
  if (active === id) active = null;
}

/** The user pointed into or focused this editor. */
export function activateEditor(id: symbol) {
  active = id;
}

/** Whether this editor handles the keyboard shortcuts (also when no editor is active). */
export function isActiveEditor(id: symbol): boolean {
  return active === null || active === id;
}
