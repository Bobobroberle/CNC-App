import { create } from 'zustand';
import { loadMacros, saveMacros, type Macro } from '../lib/macros';
import { browserStorage } from '../lib/persist';

const storage = browserStorage;

interface MacroStore {
  macros: Macro[];
  setMacros(macros: Macro[]): void;
}

export const useMacros = create<MacroStore>((set) => ({
  macros: loadMacros(storage),
  setMacros(macros) {
    saveMacros(storage, macros);
    set({ macros });
  },
}));
