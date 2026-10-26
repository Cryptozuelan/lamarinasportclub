"use client";

import { Cloud, CloudOff } from "lucide-react";
import { useAmericanos, usePendientes } from "@/lib/store";

export function ModoBadge() {
  const modo = useAmericanos((s) => s.modo);
  const pendientes = usePendientes();
  if (!modo) return null;
  if (modo === "SUPABASE" || modo === "POSTGRES")
    return (
      <span className="chip text-neon" title="Conectado a PadelReserve">
        <Cloud className="size-3" /> En línea
      </span>
    );
  if (modo === "OFFLINE")
    return (
      <span className="chip text-coral" title="Sin conexión: los cambios quedan guardados en este dispositivo y se suben solos al volver la señal">
        <CloudOff className="size-3" /> Sin conexión{pendientes > 0 && ` · ${pendientes} por subir`}
      </span>
    );
  // En modo DEMO no se muestra nada: el público no necesita saberlo.
  return null;
}
