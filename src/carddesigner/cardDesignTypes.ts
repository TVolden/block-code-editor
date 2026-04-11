// All types and constants for the Card Designer.
// The CardDesign object serialises to/from plain JSON — the canonical storage format.

export interface TextEl {
  id: string; type: 'text';
  x: number; y: number; w: number; h: number;
  content: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  align: 'left' | 'center' | 'right';
}

export interface ImageEl {
  id: string; type: 'image';
  x: number; y: number; w: number; h: number;
  /** https URL or base-64 data URI */
  src: string;
}

export interface RectEl {
  id: string; type: 'rectangle';
  x: number; y: number; w: number; h: number;
  fill: string; stroke: string; strokeWidth: number; rx: number;
}

export interface CircleEl {
  id: string; type: 'circle';
  x: number; y: number; w: number; h: number;
  fill: string; stroke: string; strokeWidth: number;
}

export type CardElement = TextEl | ImageEl | RectEl | CircleEl;

export interface CustomField {
  key: string;
  value: string;
}

export interface CardMeta {
  name: string;
  description: string;
  cardType: string;
  /** comma-separated */
  tags: string;
  /** User-defined extra key/value pairs */
  customFields: CustomField[];
}

export interface CardDesign {
  version: '1';
  meta: CardMeta;
  background: { color: string; imageUrl: string };
  elements: CardElement[];
}

/** Physical card dimensions inside the SVG canvas (px). */
export const CARD_W = 280;
export const CARD_H = 392;
export const CARD_RX = 16;
/** Padding around the card inside the SVG viewport. */
export const SVG_PAD = 48;

export function defaultCardDesign(): CardDesign {
  return {
    version: '1',
    meta: {
      name: 'New Card',
      description: '',
      cardType: '',
      tags: '',
      customFields: [],
    },
    background: { color: '#1a2a4a', imageUrl: '' },
    elements: [],
  };
}

let _seq = 0;
export function genId(): string {
  return `el${++_seq}_${Date.now()}`;
}

/**
 * Replaces {{key}} placeholders in `text` with values from `meta`.
 * Built-in keys: name, description, type, tags.
 * Custom fields are matched by their key. All matching is case-insensitive.
 * Unknown keys are left as-is.
 */
export function interpolateMeta(text: string, meta: CardMeta): string {
  const vars: Record<string, string> = {
    name:        meta.name,
    description: meta.description,
    type:        meta.cardType,
    tags:        meta.tags,
  };
  for (const { key, value } of meta.customFields) {
    if (key.trim()) vars[key.trim().toLowerCase()] = value;
  }
  return text.replace(/\{\{(\w+)\}\}/g, (match, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k.toLowerCase())
      ? vars[k.toLowerCase()]
      : match
  );
}
