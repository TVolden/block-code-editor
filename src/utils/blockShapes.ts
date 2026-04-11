import type { ParamType } from '../types';

// ── Connector tab ─────────────────────────────────────────────────────────────
// Fixed-position triangle at the left of each block so blocks of different
// widths snap together cleanly (centered connectors would misalign).
const CONN_L   = 16;                     // left edge of the tab
const CONN_W   = 14;                     // tab total width
const CONN_MID = CONN_L + CONN_W / 2;   // tip x-coordinate = 23
const CONN_H   = 5;                      // protrusion height
const R        = 4;                      // corner radius for rectangular blocks

export function commandBlockPath(w: number, h: number): string {
  return [
    `M ${R} 0`,
    // Top edge with inlet (triangle dips into the block)
    `H ${CONN_L} L ${CONN_MID} ${CONN_H} L ${CONN_L + CONN_W} 0`,
    `H ${w - R} Q ${w} 0 ${w} ${R}`,
    `V ${h - R} Q ${w} ${h} ${w - R} ${h}`,
    // Bottom edge with outlet (triangle protrudes below)
    `H ${CONN_L + CONN_W} L ${CONN_MID} ${h + CONN_H} L ${CONN_L} ${h}`,
    `H ${R} Q 0 ${h} 0 ${h - R}`,
    `V ${R} Q 0 0 ${R} 0 Z`,
  ].join(' ');
}

export function hatBlockPath(w: number, h: number): string {
  const HR = 10;  // larger top-corner radius for start blocks
  return [
    `M 0 ${HR} Q 0 0 ${HR} 0`,
    `H ${w - HR} Q ${w} 0 ${w} ${HR}`,
    `V ${h - R} Q ${w} ${h} ${w - R} ${h}`,
    // Bottom outlet only — start blocks have no inlet
    `H ${CONN_L + CONN_W} L ${CONN_MID} ${h + CONN_H} L ${CONN_L} ${h}`,
    `H ${R} Q 0 ${h} 0 ${h - R}`,
    `V ${HR} Z`,
  ].join(' ');
}

export function numberQueryPath(w: number, h: number): string {
  const r = h / 2;
  return [
    `M ${r} 0 H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
  ].join(' ');
}

export function boolQueryPath(w: number, h: number): string {
  const d = h / 2;
  return [
    `M ${d} 0 H ${w - d}`,
    `L ${w} ${h / 2} L ${w - d} ${h}`,
    `H ${d} L 0 ${h / 2} Z`,
  ].join(' ');
}

function roundedQueryPath(w: number, h: number, r: number): string {
  return [
    `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r}`,
    `V ${h - r} Q ${w} ${h} ${w - r} ${h}`,
    `H ${r} Q 0 ${h} 0 ${h - r}`,
    `V ${r} Q 0 0 ${r} 0 Z`,
  ].join(' ');
}

export function stringQueryPath(w: number, h: number): string {
  return roundedQueryPath(w, h, 5);
}

export function objectQueryPath(w: number, h: number): string {
  return roundedQueryPath(w, h, 9);
}

export function queryBlockPath(returnType: ParamType, w: number, h: number): string {
  switch (returnType) {
    case 'number':  return numberQueryPath(w, h);
    case 'boolean': return boolQueryPath(w, h);
    case 'string':  return stringQueryPath(w, h);
    default:        return objectQueryPath(w, h);
  }
}

export function socketPath(paramType: ParamType, w: number, h: number): string {
  return queryBlockPath(paramType, w, h);
}
