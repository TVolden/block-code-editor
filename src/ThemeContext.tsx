import { createContext, useContext } from 'react';
import { darkTheme, type Theme } from './theme';

export const ThemeContext = createContext<Theme>(darkTheme);
export function useTheme(): Theme { return useContext(ThemeContext); }
