"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Pantallita para elegir algo: sube desde abajo en el celular y aparece centrada
 * en la computadora. Se cierra tocando afuera, con la X o con Escape.
 */
export function Hoja({
  abierta,
  onClose,
  titulo,
  sub,
  children,
  pie,
  ancho = "max-w-md",
}: {
  abierta: boolean;
  onClose: () => void;
  titulo: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
  pie?: React.ReactNode;
  /** Ancho máximo en computadora (por defecto max-w-md). */
  ancho?: string;
}) {
  useEffect(() => {
    if (!abierta) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [abierta, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {abierta && (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-marino-2/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div className="pointer-events-none fixed inset-0 z-[71] flex items-end justify-center sm:items-center sm:p-6" exit={{ opacity: 1 }}>
            <motion.div
              role="dialog"
              aria-modal
              aria-label={titulo}
              className={`glass-strong pointer-events-auto max-h-[90dvh] w-full ${ancho} overflow-y-auto rounded-t-[2rem] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:rounded-[2rem] sm:pt-5`}
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold">{titulo}</h2>
                  {sub && <p className="mt-0.5 text-xs text-white/50">{sub}</p>}
                </div>
                <button className="btn-ghost !p-2.5" onClick={onClose} aria-label="Cerrar">
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-4">{children}</div>
              {pie && <div className="mt-5">{pie}</div>}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
