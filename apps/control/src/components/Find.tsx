import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t, type MessageKey } from '../i18n';
import { findCommands, placeOf, titleOf } from '../lib/commandSearch';
import { shownFeatures } from '../lib/features';
import { commandById, needMet, quickAccess, type Command, type Situation } from '../lib/commands';
import { SHORTCUT_GROUPS, SHORTCUTS, shortcutFor, type Cap, type Shortcut } from '../lib/shortcuts';
import { returnFocus, runCommand, useFind } from '../store/find';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useReadiness } from '../store/readiness';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Kbd, KbdGroup } from '../ui/kbd';
import { cn } from '../ui/utils';
import { Icon } from './Icon';

/** Cmd instead of Ctrl where the keyboard has it. */
const MAC = typeof navigator !== 'undefined' && /Mac|iPad|iPhone/.test(navigator.platform ?? '');

const CAP_WORDS: Record<string, MessageKey> = {
  mod: MAC ? 'find.caps.modMac' : 'find.caps.mod',
  shift: 'find.caps.shift',
  alt: 'find.caps.alt',
  del: 'find.caps.del',
  backspace: 'find.caps.backspace',
  esc: 'find.caps.esc',
  arrows: 'find.caps.arrows',
  pageUp: 'find.caps.pageUp',
  pageDown: 'find.caps.pageDown',
  wheel: 'find.caps.wheel',
  space: 'find.caps.space',
};

function capText(cap: Cap): string {
  const word = CAP_WORDS[cap];
  return word ? t(word) : cap;
}

/** The ways to press a key of the table, as key caps. */
function Caps({ shortcut, all = false }: { shortcut: Shortcut; all?: boolean }) {
  const ways = all ? shortcut.caps : shortcut.caps.slice(0, 1);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {ways.map((way, i) => (
        <KbdGroup key={i}>
          {i > 0 ? (
            <span className="font-sans text-muted-foreground text-sm">
              {t('find.shortcuts.or')}
            </span>
          ) : null}
          {way.map((cap) => (
            <Kbd key={cap}>{capText(cap)}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </span>
  );
}

/** The always-visible way into the quick search, in the top bar. */
export function FindButton() {
  const open = useFind((s) => s.open === 'search');
  const palette = SHORTCUTS[0]!;
  return (
    <Button
      variant="outline"
      className="find-button rounded-full text-muted-foreground aria-expanded:border-ring aria-expanded:text-foreground"
      data-testid="find-button"
      aria-haspopup="dialog"
      aria-expanded={open}
      title={t('find.openHint')}
      onClick={() => (open ? useFind.getState().close() : useFind.getState().show('search'))}
    >
      <Icon name="search" size={22} />
      <span className="find-button-label">{t('find.open')}</span>
      <span className="kbd-hint" aria-hidden="true">
        <Caps shortcut={palette} />
      </span>
    </Button>
  );
}

/** Where the operator stands, for the quick access. */
function useSituation(): Situation {
  const connected = useMachine((s) => s.connection === 'connected');
  const homed = useMachine((s) => s.homed);
  const running = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const program = useJob((s) => s.analysis !== null);
  const drawing = useUi((s) => s.place === 'cam');
  const expert = useWorkshop((s) => s.settings.expertMode);
  const hidden = useWorkshop((s) => s.settings.hiddenFeatures);
  const readiness = useReadiness();
  return useMemo(
    () => ({
      connected,
      homed,
      running,
      program,
      drawing,
      expert,
      features: shownFeatures(hidden, readiness?.items ?? []),
      readiness: readiness?.items ?? [],
    }),
    [connected, homed, running, program, drawing, expert, hidden, readiness?.items],
  );
}

interface Row {
  command: Command;
  group: 'results' | 'quick' | 'recent';
}

/**
 * A sheet in the dialog layer under the top bar: NOT-HALT stays above it, one
 * tap away. The focus goes back to where it was when the sheet closes.
 */
function Sheet({
  label,
  testId,
  layerId,
  className,
  initialFocus,
  onKeyDown,
  children,
}: {
  label: string;
  testId: string;
  layerId: string;
  className?: string;
  initialFocus?: React.RefObject<HTMLElement | null>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  children: ReactNode;
}) {
  useEffect(() => returnFocus, []);
  const { close } = useFind.getState();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPopup
        aria-label={label}
        data-testid={testId}
        className={cn('find-sheet', className)}
        initialFocus={initialFocus}
        finalFocus={false}
        viewportProps={{ className: 'find-viewport', 'data-testid': layerId } as object}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          } else onKeyDown?.(e);
        }}
      >
        {children}
      </DialogPopup>
    </Dialog>
  );
}

/**
 * The quick search: one field, and under it what was found – or, before
 * anything is typed, what matters right now and what was used last. A row
 * leads to its place; it never does the thing itself.
 */
function Palette() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const situation = useSituation();
  const recent = useFind((s) => s.recent);

  const typed = query.trim() !== '';
  const hits = useMemo(() => (typed ? findCommands(query) : []), [query, typed]);
  const rows = useMemo<Row[]>(() => {
    if (hits.length > 0) return hits.map((command) => ({ command, group: 'results' }));
    const quick = quickAccess(situation);
    const again = typed ? [] : recent.filter((id) => !quick.includes(id));
    return [
      ...quick.map((id) => ({ command: commandById(id)!, group: 'quick' as const })),
      ...again.map((id) => ({ command: commandById(id)!, group: 'recent' as const })),
    ];
  }, [hits, typed, situation, recent]);
  const at = Math.min(active, rows.length - 1);

  // The marked row stays in sight while the arrows walk the list.
  useLayoutEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [at, rows]);

  const { close } = useFind.getState();
  const choose = (row: Row | undefined) => {
    if (row) runCommand(row.command.id, situation.features);
  };

  return (
    <Sheet
      label={t('find.title')}
      testId="find"
      layerId="find-layer"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (rows.length === 0) return;
          const step = e.key === 'ArrowDown' ? 1 : -1;
          setActive((at + step + rows.length) % rows.length);
        } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          choose(rows[at]);
        }
      }}
    >
      <DialogHeader className="find-field text-muted-foreground">
        <Icon name="search" size={24} />
        <Input
          unstyled
          nativeInput
          className="flex-1"
          type="text"
          role="combobox"
          inputMode="search"
          enterKeyHint="go"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={query}
          placeholder={t('find.placeholder')}
          aria-label={t('find.title')}
          aria-expanded="true"
          aria-controls="find-list"
          aria-autocomplete="list"
          aria-activedescendant={rows[at] ? `find-${rows[at].command.id}` : undefined}
          data-testid="find-input"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        <Button variant="ghost" className="text-muted-foreground" onClick={close}>
          {t('find.close')}
        </Button>
      </DialogHeader>
      <div
        ref={list}
        id="find-list"
        className="find-list"
        role="listbox"
        // The arrows walk the list from the field; a scrolling list is no tab stop of its own.
        tabIndex={-1}
        aria-label={t('find.results')}
        data-testid="find-list"
      >
        {typed && hits.length === 0 ? (
          <p className="px-3 pt-2.5 pb-1" role="status" data-testid="find-none">
            {t('find.none', { query: query.trim() })}
          </p>
        ) : null}
        {rows.map((row, i) => {
          const { command } = row;
          const shortcut = shortcutFor(command.id);
          const met = needMet(command.needs, situation);
          const heading = row.group !== 'results' && rows[i - 1]?.group !== row.group;
          return (
            <div key={command.id} role="presentation">
              {heading ? (
                <p
                  className="px-3 pt-2.5 pb-1 font-medium text-muted-foreground text-xs"
                  role="presentation"
                >
                  {t(`find.${row.group as 'quick' | 'recent'}`)}
                </p>
              ) : null}
              <div
                id={`find-${command.id}`}
                role="option"
                aria-selected={i === at}
                className="find-row"
                data-command={command.id}
                // The field keeps the focus (and the keyboard stays up) while a row is tapped.
                onPointerDown={(e) => e.preventDefault()}
                onPointerMove={(e) => {
                  if (e.pointerType === 'mouse' && i !== at) setActive(i);
                }}
                onClick={() => choose(row)}
              >
                <Icon name={command.icon} size={24} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-foreground">{titleOf(command)}</span>
                  <span className="text-muted-foreground text-sm">
                    {placeOf(command)}
                    {met ? '' : ` – ${t(`find.needs.${command.needs!}`)}`}
                  </span>
                </span>
                {shortcut ? (
                  <span className="kbd-hint">
                    <Caps shortcut={shortcut} />
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <span>{t('find.safety')}</span>
        <span className="kbd-hint">{t('find.shortcuts.hint')}</span>
      </DialogFooter>
    </Sheet>
  );
}

/** Every key of the app on one sheet, in groups. */
function KeySheet() {
  const done = useRef<HTMLButtonElement>(null);
  const { close } = useFind.getState();
  return (
    <Sheet
      label={t('find.shortcuts.title')}
      testId="keys"
      layerId="keys-layer"
      className="keys-sheet"
      initialFocus={done}
    >
      <DialogHeader className="border-b">
        <Icon name="keyboard" size={24} />
        <DialogTitle className="flex-1">{t('find.shortcuts.title')}</DialogTitle>
        <Button ref={done} variant="ghost" className="text-muted-foreground" onClick={close}>
          {t('find.close')}
        </Button>
      </DialogHeader>
      <DialogPanel className="keys-body">
        <p className="text-muted-foreground text-sm">{t('find.shortcuts.intro')}</p>
        <div className="keys-groups">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group} className="keys-group">
              <h3 className="font-medium text-muted-foreground text-sm">
                {t(`find.shortcuts.groups.${group}`)}
              </h3>
              {group === 'drawing' || group === 'drive' ? (
                <p className="text-muted-foreground text-sm">
                  {t(`find.shortcuts.notes.${group}`)}
                </p>
              ) : null}
              <dl>
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <div key={s.id}>
                    <dt>
                      <Caps shortcut={s} all />
                    </dt>
                    <dd>{t(s.label)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogPanel>
    </Sheet>
  );
}

/** The quick search or the overview of the keys, when one of them is asked for. */
export function FindLayer() {
  const open = useFind((s) => s.open);
  return open === 'search' ? <Palette /> : open === 'keys' ? <KeySheet /> : null;
}
