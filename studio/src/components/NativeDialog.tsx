'use client';

import React, {
  useEffect,
  useRef,
  useId,
  useCallback,
  type ReactNode,
} from 'react';

/**
 * Probes whether the browser reliably supports discrete CSS display transitions.
 * Guards against Firefox bug 1882408 where CSS.supports returns true but the display
 * property transitions instantly to 'none'.
 */
let supportsDisplayTransitionCache: boolean | undefined;

export function canTransitionDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  if (supportsDisplayTransitionCache !== undefined) return supportsDisplayTransitionCache;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }

  const probe = document.createElement('div');
  // Shorthand is intentional: browsers without allow-discrete drop the entire declaration,
  // making display: none apply instantly and the probe correctly returns false.
  // !important guards against global reduced-motion resets (* { transition: none !important }).
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  // Force computed style calculation
  void getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransitionCache = getComputedStyle(probe).display === 'block';
  probe.remove();

  return supportsDisplayTransitionCache;
}

/**
 * Checks if the browser supports both CSS overlay transition and discrete display transition.
 * Evaluated lazily to ensure document.body is present.
 */
export function supportsTopLayerExit(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
}

/**
 * Smoothly closes a top-layer element (like <dialog>) by waiting for exit animations
 * if the browser lacks native overlay + allow-discrete exit support.
 */
export async function closeTopLayer(element: HTMLDialogElement): Promise<void> {
  if (!supportsTopLayerExit()) {
    element.setAttribute('data-closing', '');
    const animations = element.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
    if (!element.hasAttribute('data-closing')) return;
    element.removeAttribute('data-closing');
  }

  if (element.open) {
    element.close();
  }
}

export interface NativeDialogProps {
  /** Controlled open state of the dialog */
  open: boolean;
  /** Callback fired when the dialog is dismissed or closed */
  onClose: () => void;
  /** Primary dialog heading/title */
  title?: ReactNode;
  /** Secondary subtitle or contextual description */
  subtitle?: ReactNode;
  /** Width utility class (defaults to w-[min(94vw,620px)]) */
  widthClass?: string;
  /** Custom extra classes for the dialog card */
  className?: string;
  /** Whether to show the top-right dismiss button (defaults to true) */
  showCloseButton?: boolean;
  /** Light dismiss mode: 'any' (Esc + backdrop click), 'closerequest' (Esc only), 'none' */
  closedBy?: 'any' | 'closerequest' | 'none';
  /** Optional custom header extra content (e.g. status pills, actions) */
  headerExtra?: ReactNode;
  /** Optional sticky or docked modal footer content */
  footer?: ReactNode;
  /** Content of the dialog */
  children: ReactNode;
  /** Optional explicit aria-label if no visible title is rendered */
  ariaLabel?: string;
  /** Optional explicit aria-labelledby override */
  ariaLabelledBy?: string;
  /** Optional explicit aria-describedby override */
  ariaDescribedBy?: string;
}

/**
 * NativeDialog — Modern Web Guidance Standards-Compliant Dialog Component.
 *
 * Rules adhered to:
 * 1. Native `<dialog>` element rendered in the top layer via `showModal()`.
 * 2. Light-dismiss using `closedby="any"` with automatic pointerdown/pointerup
 *    fallback when `!('closedBy' in HTMLDialogElement.prototype)`.
 * 3. ZERO `role="dialog"` or `aria-modal` attributes (native <dialog> already provides them).
 * 4. Resets `dialog.returnValue = ''` immediately upon closure.
 * 5. Uses `canTransitionDisplay()` + `supportsTopLayerExit()` + `data-closing` + `getAnimations()`
 *    exit fallback for smooth top-layer animations across all browsers (Firefox, Safari, Chromium).
 * 6. Styled strictly with AntiSlop Obsidian Cobalt & Archival Paper CSS variables.
 */
export function NativeDialog({
  open,
  onClose,
  title,
  subtitle,
  widthClass = 'w-[min(94vw,620px)]',
  className = '',
  showCloseButton = true,
  closedBy = 'any',
  headerExtra,
  footer,
  children,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
}: NativeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Request smooth close helper
  const requestDismiss = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || !dialog.open) {
      onCloseRef.current();
      return;
    }
    void closeTopLayer(dialog);
  }, []);

  // Synchronize open prop with native modal state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      void closeTopLayer(dialog);
    }
  }, [open]);

  // Native event wiring: close, cancel, and closedBy backdrop fallback
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Handle close event and reset returnValue
    const handleClose = () => {
      dialog.returnValue = '';
      onCloseRef.current();
    };

    // Route native cancel requests (e.g. Esc key or native light-dismiss)
    // through closeTopLayer so exit transitions play smoothly instead of closing abruptly.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      void closeTopLayer(dialog);
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('cancel', handleCancel);

    // Fallback light-dismiss for browsers lacking native HTML closedBy support
    const supportsClosedBy =
      typeof HTMLDialogElement !== 'undefined' &&
      ('closedBy' in HTMLDialogElement.prototype || 'closedby' in HTMLDialogElement.prototype);

    let removePointerListeners: (() => void) | undefined;

    if (!supportsClosedBy && closedBy === 'any') {
      const isOutsideDialog = (e: PointerEvent): boolean => {
        const rect = dialog.getBoundingClientRect();
        return (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        );
      };

      let pressedOutside = false;

      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutsideDialog(e);
      };

      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutsideDialog(e) && dialog.open) {
          void closeTopLayer(dialog);
        }
        pressedOutside = false;
      };

      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);

      removePointerListeners = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('cancel', handleCancel);
      removePointerListeners?.();
    };
  }, [closedBy]);

  const resolvedAriaLabelledBy = ariaLabelledBy ?? (title ? titleId : undefined);
  const resolvedAriaDescribedBy = ariaDescribedBy ?? (subtitle ? subtitleId : undefined);

  return (
    <dialog
      ref={dialogRef}
      closedby={closedBy}
      aria-label={ariaLabel}
      aria-labelledby={resolvedAriaLabelledBy}
      aria-describedby={resolvedAriaDescribedBy}
      className={`relative max-h-[min(90vh,820px)] overflow-hidden rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-0 text-[var(--ink-primary)] shadow-[var(--shadow-card)] backdrop:bg-transparent ${widthClass} ${className}`}
    >
      <div className="flex max-h-[min(90vh,820px)] flex-col overflow-hidden">
        {/* Dialog Header */}
        {(title || subtitle || showCloseButton || headerExtra) && (
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-6 py-4.5">
            <div className="min-w-0 flex-1">
              {title && (
                <h2
                  id={titleId}
                  className="truncate text-base font-semibold tracking-tight text-[var(--ink-primary)]"
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p
                  id={subtitleId}
                  className="mt-0.5 text-xs text-[var(--ink-secondary)] leading-relaxed"
                >
                  {subtitle}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {headerExtra}
              {showCloseButton && (
                <button
                  type="button"
                  onClick={requestDismiss}
                  aria-label="Close dialog"
                  className="group inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--ink-muted)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cobalt-bright)] active:scale-95"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="transition-transform duration-150 group-hover:rotate-90"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 1.5L12.5 12.5M12.5 1.5L1.5 12.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </header>
        )}

        {/* Dialog Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-[var(--ink-primary)]">
          {children}
        </div>

        {/* Optional Dialog Footer */}
        {footer && (
          <footer className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-6 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}

export default NativeDialog;
