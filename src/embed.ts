/**
 * embed.ts — entry point for the self-contained embeddable build.
 *
 * Importing this file is all that's needed to register the <block-editor>
 * custom element. The Vite embed build (vite.embed.config.ts) bundles this
 * into a single IIFE JavaScript file that works with a plain <script> tag.
 */

import './webcomponent';
