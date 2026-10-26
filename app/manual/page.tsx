import type { Metadata } from "next";
import { Libro } from "@/components/manual/Libro";
import "./manual.css";

export const metadata: Metadata = {
  title: "Manual del staff",
  description: "El libro del staff de La Marina Americanos: crear eventos, cargar marcadores, Modo TV y qué hacer si algo falla.",
};

export default function ManualPage() {
  return <Libro />;
}
