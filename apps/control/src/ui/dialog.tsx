import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import * as React from 'react';
import { cn } from './utils';
import { ScrollArea } from './scroll-area';

/*
 * coss ui Dialog. Changed for this app, for one reason: NOT-HALT.
 *
 * - A dialog never makes the rest of the page inert: `modal` is always
 *   "trap-focus" (the keys stay in the dialog, a finger still reaches
 *   everything outside it).
 * - Dialogs are not laid over the whole window. They are portalled into the
 *   `DialogLayer`, which the app places below its top bar: NOT-HALT stays
 *   visible and one tap away, and the layer shrinks with the app when the
 *   on-screen keyboard comes up. Backdrop and viewport are therefore
 *   `absolute` inside that layer, not `fixed`.
 * - No close cross in the corner: a sheet carries its own, labelled way out
 *   (48 px, in the operator's language).
 */

const LayerContext = React.createContext<{
  layer: HTMLElement | null;
  setLayer: (el: HTMLElement | null) => void;
} | null>(null);

/** Holds the place dialogs are drawn in; wraps the app once. */
export function DialogLayerProvider({ children }: { children: React.ReactNode }) {
  const [layer, setLayer] = React.useState<HTMLElement | null>(null);
  const value = React.useMemo(() => ({ layer, setLayer }), [layer]);
  return <LayerContext.Provider value={value}>{children}</LayerContext.Provider>;
}

/** The place itself: the app puts it where dialogs may lie (never over NOT-HALT). */
export function DialogLayer({ className, ...props }: React.ComponentProps<'div'>) {
  const context = React.useContext(LayerContext);
  return (
    <div
      ref={context?.setLayer}
      className={cn('pointer-events-none relative *:pointer-events-auto', className)}
      data-slot="dialog-layer"
      {...props}
    />
  );
}

export function Dialog(props: Omit<DialogPrimitive.Root.Props, 'modal'>): React.ReactElement {
  return <DialogPrimitive.Root {...props} modal="trap-focus" />;
}

export function DialogClose(props: DialogPrimitive.Close.Props): React.ReactElement {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export function DialogBackdrop({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props): React.ReactElement {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        'absolute inset-0 z-50 bg-black/48 backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none [@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none',
        className,
      )}
      data-slot="dialog-backdrop"
      {...props}
    />
  );
}

export function DialogViewport({
  className,
  ...props
}: DialogPrimitive.Viewport.Props): React.ReactElement {
  return (
    <DialogPrimitive.Viewport
      className={cn('absolute inset-0 z-50 flex flex-col items-center p-4', className)}
      data-slot="dialog-viewport"
      {...props}
    />
  );
}

export function DialogPopup({
  className,
  children,
  viewportProps,
  ...props
}: DialogPrimitive.Popup.Props & {
  viewportProps?: DialogPrimitive.Viewport.Props;
}): React.ReactElement | null {
  const layer = React.useContext(LayerContext)?.layer;
  // Without its layer a dialog would cover NOT-HALT: it waits for the layer.
  if (!layer) return null;
  return (
    <DialogPrimitive.Portal container={layer}>
      <DialogBackdrop />
      <DialogViewport {...viewportProps}>
        <DialogPrimitive.Popup
          className={cn(
            'relative flex max-h-full min-h-0 w-full min-w-0 max-w-lg origin-top flex-col rounded-2xl border bg-popover not-dark:bg-clip-padding text-popover-foreground outline-none transition-[scale,opacity] duration-200 ease-in-out before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-2xl)-1px)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-98 motion-safe:data-starting-style:scale-98 motion-reduce:transition-opacity contrast-more:border-2',
            className,
          )}
          data-slot="dialog-popup"
          {...props}
        >
          {children}
        </DialogPrimitive.Popup>
      </DialogViewport>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  className,
  render,
  ...props
}: useRender.ComponentProps<'div'>): React.ReactElement {
  const defaultProps = {
    className: cn('flex flex-none items-center gap-3 px-4 py-2', className),
    'data-slot': 'dialog-header',
  };

  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>(defaultProps, props),
    render,
  });
}

export function DialogFooter({
  className,
  render,
  ...props
}: useRender.ComponentProps<'div'>): React.ReactElement {
  const defaultProps = {
    className: cn(
      'flex flex-none items-center justify-between gap-3 rounded-b-[calc(var(--radius-2xl)-1px)] border-t bg-muted/72 px-5 py-3 text-muted-foreground text-sm',
      className,
    ),
    'data-slot': 'dialog-footer',
  };

  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>(defaultProps, props),
    render,
  });
}

export function DialogTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props): React.ReactElement {
  return (
    <DialogPrimitive.Title
      className={cn('font-heading font-semibold text-lg leading-none', className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props): React.ReactElement {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

export function DialogPanel({
  className,
  scrollFade = true,
  render,
  ...props
}: useRender.ComponentProps<'div'> & {
  scrollFade?: boolean;
}): React.ReactElement {
  const defaultProps = {
    className: cn('p-4', className),
    'data-slot': 'dialog-panel',
  };

  return (
    <ScrollArea overscrollContain scrollFade={scrollFade}>
      {useRender({
        defaultTagName: 'div',
        props: mergeProps<'div'>(defaultProps, props),
        render,
      })}
    </ScrollArea>
  );
}

export { DialogPrimitive };
