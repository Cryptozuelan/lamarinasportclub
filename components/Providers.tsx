"use client";

import { MotionConfig } from "framer-motion";
import { useEffect } from "react";
import { useAmericanos } from "@/lib/store";
import { useTorneos } from "@/lib/torneosStore";
import { Toaster } from "./ui/Toaster";
import { StaffLogin } from "./StaffLogin";

const INTERVALO_SYNC_MS = 8000;

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    Promise.resolve()
      .then(() => useAmericanos.persist.rehydrate())
      .catch(() => undefined)
      .finally(() => {
        useAmericanos.setState({ hidratado: true });
        useAmericanos.getState().cargarStaff().finally(() => {
          useAmericanos.getState().sincronizar();
          useTorneos.getState().sincronizar();
        });
      });
    Promise.resolve()
      .then(() => useTorneos.persist.rehydrate())
      .catch(() => undefined)
      .finally(() => useTorneos.setState({ hidratado: true }));
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      useAmericanos.getState().sincronizar();
      useTorneos.getState().sincronizar();
    }, INTERVALO_SYNC_MS);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => clearInterval(t);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {children}
      <StaffLogin />
      <Toaster />
    </MotionConfig>
  );
}
