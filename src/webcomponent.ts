/**
 * webcomponent.ts
 *
 * Registers the <block-editor> custom element.
 *
 * Usage on any webpage:
 *   <script src="block-editor.iife.js"></script>
 *   <block-editor blocks-url="/blocks.json" style="width:800px;height:500px;display:block;"></block-editor>
 *
 * Attributes:
 *   blocks-url  — URL to fetch block definitions from (default: '/blocks.json')
 *
 * Events dispatched by the element:
 *   'run'   — fired when the user clicks a block sequence
 *             event.detail = { lines: string[] }
 *   'save'  — fired when the user clicks the Save button
 *             event.detail = { state: SerializedCanvas }
 *
 * Methods:
 *   getState()          — returns the current SerializedCanvas as a JS object
 *   setState(canvas)    — loads a SerializedCanvas, replacing the current canvas
 *
 * Example:
 *   const el = document.querySelector('block-editor');
 *   el.addEventListener('save', e => fetch('/api/save', { method: 'POST', body: JSON.stringify(e.detail.state) }));
 *   el.setState(await fetch('/api/load').then(r => r.json()));
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import BlockEditor from './editor/BlockEditor';
import type { SerializedCanvas } from './types';

// Minimal CSS injected into the Shadow DOM.
// All component styles are inline; this only provides the baseline reset
// and tells the browser that <block-editor> is a block-level element.
const SHADOW_CSS = `
  :host {
    display: block;
    box-sizing: border-box;
  }
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  #root {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
`;

class BlockEditorElement extends HTMLElement {
  private reactRoot: Root | null = null;
  private _canvasState: SerializedCanvas | undefined = undefined;

  private renderEditor(blocksUrl: string) {
    this.reactRoot?.render(
      React.createElement(BlockEditor, {
        blocksUrl,
        initialState: this._canvasState,
        onRun: (lines: string[]) => {
          this.dispatchEvent(new CustomEvent('run', {
            detail: { lines },
            bubbles: true,
            composed: true,
          }));
        },
        onSave: (state: SerializedCanvas) => {
          this._canvasState = state;
          this.dispatchEvent(new CustomEvent('save', {
            detail: { state },
            bubbles: true,
            composed: true,
          }));
        },
      }),
    );
  }

  connectedCallback() {
    // Shadow DOM isolates our styles from the host page (and vice-versa)
    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    shadow.appendChild(style);

    // The React tree mounts into this div
    const container = document.createElement('div');
    container.id = 'root';
    shadow.appendChild(container);

    this.reactRoot = createRoot(container);
    this.renderEditor(this.getAttribute('blocks-url') ?? '/blocks.json');
  }

  disconnectedCallback() {
    // Clean up React when the element is removed from the page
    this.reactRoot?.unmount();
    this.reactRoot = null;
  }

  // Re-render when the blocks-url attribute changes
  static get observedAttributes() { return ['blocks-url']; }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue || !this.reactRoot) return;
    this.renderEditor(newValue ?? '/blocks.json');
  }

  /** Returns the current canvas state as a plain JS object (safe to JSON.stringify). */
  getState(): SerializedCanvas | undefined {
    return this._canvasState;
  }

  /** Loads a previously saved canvas state, replacing whatever is on the canvas. */
  setState(state: SerializedCanvas) {
    this._canvasState = state;
    this.renderEditor(this.getAttribute('blocks-url') ?? '/blocks.json');
  }
}

// Guard against double-registration (e.g. if the script is loaded twice)
if (!customElements.get('block-editor')) {
  customElements.define('block-editor', BlockEditorElement);
}
