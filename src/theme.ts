export type ThemeId = 'dark' | 'light';

export interface Theme {
  id: ThemeId;
  label: string;
  // Surfaces
  appBg: string;
  paletteBg: string;
  paletteHeaderBg: string;
  canvasBg: string;
  consoleBg: string;
  consoleHeaderBg: string;
  // Borders
  border: string;
  // Accent (gold / navy)
  accent: string;
  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Inputs
  inputBg: string;
  inputBorder: string;
  // Grid
  gridDot: string;
  // Command blocks (neutral treatment)
  blockBody: string;
  blockBorder: string;
  blockText: string;
  socketBody: string;
  // Console output
  consoleOutput: string;
  consoleSeparator: string;
  // Delete zone
  deleteBorder: string;
  deleteText: string;
  deleteActiveBg: string;
  deleteActiveBorder: string;
  deleteActiveText: string;
  // Title bar
  titleBg: string;
  titlePrimaryText: string;
  titleSecondaryText: string;
  // Package rows
  pkgBg: string;
  pkgBorder: string;
  pkgActiveBg: string;
  pkgActiveBorder: string;
  pkgText: string;
  pkgActiveText: string;
  pkgSubText: string;
  // Theme switcher buttons
  switcherBg: string;
  switcherActiveBg: string;
  switcherText: string;
  switcherActiveText: string;
  switcherBorder: string;
}

export const darkTheme: Theme = {
  id: 'dark', label: 'Dark',
  // Surfaces — stepped hierarchy so each layer reads as distinct
  appBg:            '#0e1118',
  paletteBg:        '#141820',
  paletteHeaderBg:  '#0e1118',
  canvasBg:         '#111420',
  consoleBg:        '#0e1118',
  consoleHeaderBg:  '#141820',
  // Borders — visible but not loud
  border:           '#252d42',
  // Accent
  accent:           '#c9a43a',
  // Typography — each level clearly distinct from bg
  textPrimary:      '#dde8f8',
  textSecondary:    '#7a90b8',
  textMuted:        '#5a6888',
  // Inputs
  inputBg:          '#0e1118',
  inputBorder:      '#303858',
  // Grid
  gridDot:          '#252d42',
  // Blocks — body well above canvas bg; text near-white
  blockBody:        '#1a2236',
  blockBorder:      '#303858',
  blockText:        '#e8f0fc',
  socketBody:       '#141e30',
  // Console
  consoleOutput:    '#b8d4ec',
  consoleSeparator: '#4a6090',
  // Delete zone
  deleteBorder:     '#252d42',
  deleteText:       '#5a6888',
  deleteActiveBg:      '#3a0c0c',
  deleteActiveBorder:  '#8a2020',
  deleteActiveText:    '#e06060',
  // Title bar
  titleBg:          '#0e1118',
  titlePrimaryText: '#c9a43a',
  titleSecondaryText: '#5a6888',
  // Package rows
  pkgBg:            '#141820',
  pkgBorder:        '#252d42',
  pkgActiveBg:      '#1a2236',
  pkgActiveBorder:  '#3a4d70',
  pkgText:          '#7a8aaa',
  pkgActiveText:    '#c9a43a',
  pkgSubText:       '#5a6888',
  // Theme switcher
  switcherBg:         'transparent',
  switcherActiveBg:   '#1a2236',
  switcherText:       '#5a6888',
  switcherActiveText: '#c9a43a',
  switcherBorder:     '#252d42',
};

export const proTheme: Theme = {
  id: 'light', label: 'Light',
  appBg:            '#f0f2f6',
  paletteBg:        '#ffffff',
  paletteHeaderBg:  '#f8f9fc',
  canvasBg:         '#e8ebf2',
  consoleBg:        '#ffffff',
  consoleHeaderBg:  '#f8f9fc',
  border:           '#dde2ec',
  accent:           '#2a50a0',
  textPrimary:      '#1a2030',
  textSecondary:    '#5060a0',
  textMuted:        '#a0aac0',
  inputBg:          '#f0f2f6',
  inputBorder:      '#d0d8e8',
  gridDot:          '#c0c8d8',
  blockBody:        '#ffffff',
  blockBorder:      '#c8d0e0',
  blockText:        '#1a2030',
  socketBody:       '#eaecf4',
  consoleOutput:    '#2a50a0',
  consoleSeparator: '#dde2ec',
  deleteBorder:     '#dde2ec',
  deleteText:       '#b0b8d0',
  deleteActiveBg:      '#fff0f0',
  deleteActiveBorder:  '#e08080',
  deleteActiveText:    '#c04040',
  titleBg:          '#ffffff',
  titlePrimaryText: '#1a2030',
  titleSecondaryText: '#8090b0',
  pkgBg:            '#f8f9fc',
  pkgBorder:        '#dde2ec',
  pkgActiveBg:      '#eef2fc',
  pkgActiveBorder:  '#a0b8e0',
  pkgText:          '#7080a0',
  pkgActiveText:    '#2a50a0',
  pkgSubText:       '#9090a0',
  switcherBg:         'transparent',
  switcherActiveBg:   '#eaedf4',
  switcherText:       '#9090a0',
  switcherActiveText: '#1a2030',
  switcherBorder:     '#dde2ec',
};

export const THEMES: Theme[] = [darkTheme, proTheme];
