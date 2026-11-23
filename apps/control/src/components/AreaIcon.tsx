import { ActivityIcon, SettingsIcon, SquareTerminalIcon, WrenchIcon } from 'lucide-react';
import type { Area } from '../store/ui';

/** The sign of a side area – always shown with its name (DESIGN.md §7). */
export function AreaIcon({ area }: { area: Area }) {
  const Sign = {
    toollist: WrenchIcon,
    service: ActivityIcon,
    settings: SettingsIcon,
    console: SquareTerminalIcon,
  }[area];
  return <Sign aria-hidden="true" />;
}
