// React-side wrapper around src/js/modalA11y.js — the one shared implementation of modal
// keyboard/focus behavior (Escape closes, Tab stays inside, focus moves in on open and back
// to the opener on close, role="dialog"/aria-modal/aria-labelledby). Same "thin wrapper over
// the real window.PCC module, never a second copy" rule as every react/src/services file.
//
//   const overlayRef = useModalA11y<HTMLDivElement>(open, () => setOpen(false), () => menuToggleRef.current);
//   {open ? <div className="modal-overlay" ref={overlayRef}>…</div> : null}
import { useEffect, useRef } from "react";

export function useModalA11y<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  fallbackFocus?: () => HTMLElement | null
) {
  const ref = useRef<T>(null);
  // Latest callbacks without re-attaching (re-attaching would re-steal focus and lose the
  // original opener) every time the parent re-renders with a new closure.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const fallbackRef = useRef(fallbackFocus);
  fallbackRef.current = fallbackFocus;

  useEffect(() => {
    const a11y = window.PCC.modalA11y;
    if (!open || !ref.current || !a11y) return undefined;
    return a11y.attach(ref.current, {
      onClose: () => onCloseRef.current(),
      fallbackFocus: () => (fallbackRef.current ? fallbackRef.current() : null),
    });
  }, [open]);

  return ref;
}
