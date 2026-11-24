import { create } from 'zustand';
import { browserStorage, loadJson, saveJson } from '../lib/persist';

/**
 * This device's login at the Pi: the token it got when the Pi code was typed (never the code itself). It is
 * kept under a key of its own – not in the settings: the settings are synced to the Pi and to every other
 * device, and a token must stay on the device that earned it. It is bound to the address of the Pi it came
 * from and sent to no other: a changed or mistyped address never gets a token.
 */

export interface PiLogin {
  /** The companion's address (`http://host:port`) the token belongs to */
  base: string;
  token: string;
  /** What this device called itself at the login */
  name: string;
}

const KEY = 'lowrider-control.piLogin';

const valid = (v: unknown): PiLogin | null => {
  if (typeof v !== 'object' || v === null) return null;
  const { base, token, name } = v as Record<string, unknown>;
  if (typeof base !== 'string' || typeof token !== 'string' || typeof name !== 'string')
    return null;
  return token.length > 0 && token.length <= 100 ? { base, token, name } : null;
};

interface PiLoginStore {
  login: PiLogin | null;
  /** The address whose token the Pi refused, until a new login or a logout: the card says why the login is gone */
  expired: string | null;
  set(login: PiLogin): void;
  clear(): void;
  /** The Pi refused this token (it was removed there, or the Pi was set up anew): the login ends – if it is still the one for that address */
  expire(base: string): void;
}

export const usePiLogin = create<PiLoginStore>((set) => ({
  login: loadJson(browserStorage, KEY, valid, null),
  expired: null,
  set(login) {
    set({ login, expired: null });
    saveJson(browserStorage, KEY, login);
  },
  clear() {
    set({ login: null, expired: null });
    saveJson(browserStorage, KEY, null);
  },
  expire(base) {
    if (usePiLogin.getState().login?.base !== base) return;
    set({ login: null, expired: base });
    saveJson(browserStorage, KEY, null);
  },
}));

// A login or logout in another tab of the same browser: this one follows (the storage event is not sent to the tab that wrote)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    usePiLogin.setState({ login: loadJson(browserStorage, KEY, valid, null) });
  });
}

/** The token for this companion – only where the login was made at that very address. */
export function tokenFor(base: string): string | null {
  const { login } = usePiLogin.getState();
  return login && login.base === base ? login.token : null;
}
