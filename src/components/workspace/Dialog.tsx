"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}

/**
 * Modal built on the native `<dialog>`: focus moves inside on open, Tab stays inside, Escape closes,
 * and focus returns to the control that opened it. Children mount only while open, so forms reset.
 */
export function Dialog({ open, onClose, title, children, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    } else if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
      opener.current?.focus();
      opener.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`ws-dialog${wide ? " ws-dialog-wide" : ""}`}
      aria-labelledby={titleId}
      data-lenis-prevent
      onCancel={(e) => {
        // Let React state close it, so focus restoration runs in one place.
        e.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <div className="ws-dialog-body">
          <h2 id={titleId} className="ws-dialog-title">
            {title}
          </h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
