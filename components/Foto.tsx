"use client";

import clsx from "clsx";
import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { AvatarPareja } from "@/components/Avatar";
import { toast } from "@/components/ui/Toaster";
import { vibrar } from "@/lib/feedback";
import { comprimirFoto } from "@/lib/fotos";

/**
 * Abre la cámara trasera (o la galería en un computador), comprime la foto y la entrega.
 * `children` es lo que se toca; si no hay, un botón con ícono de cámara.
 */
export function TomarFoto({
  onFoto,
  className,
  children,
  etiqueta = "Tomar foto",
}: {
  onFoto: (dataUrl: string) => Promise<void> | void;
  className?: string;
  children?: React.ReactNode;
  etiqueta?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);
  return (
    <>
      <button type="button" className={clsx("relative", className ?? "btn-ghost")} onClick={() => input.current?.click()} aria-label={etiqueta} disabled={trabajando}>
        {children ?? (
          <>
            <Camera className="size-4" /> {etiqueta}
          </>
        )}
        {trabajando && (
          <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/50">
            <Loader2 className="size-6 animate-spin text-white" />
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setTrabajando(true);
          try {
            vibrar(10);
            await onFoto(await comprimirFoto(f));
          } catch {
            toast("No se pudo leer la foto. Prueba otra vez.", "error");
          } finally {
            setTrabajando(false);
          }
        }}
      />
    </>
  );
}

/** Foto de la dupla (horizontal) o, si no hay, sus dos avatares. */
export function FotoDupla({
  url,
  nombres,
  fotos,
  className,
  avatar = 44,
}: {
  url?: string | null;
  nombres: string[];
  fotos?: (string | null | undefined)[];
  className?: string;
  avatar?: number;
}) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nombres.join(" y ")} className={clsx("shrink-0 object-cover", className)} />;
  return (
    <span className={clsx("flex shrink-0 items-center justify-center bg-white/[0.04]", className)}>
      <AvatarPareja nombres={nombres} fotos={fotos} size={avatar} />
    </span>
  );
}
