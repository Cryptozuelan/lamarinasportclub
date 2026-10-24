import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://lamarina-americanos.appceso.cloud"),
  title: { default: "Americanos · La Marina Sport Club", template: "%s · La Marina" },
  description: "Americanos y torneos de pádel en vivo: cuadros, marcadores y ranking en tiempo real. PadelReserve × La Marina Sport Club.",
  applicationName: "La Marina Americanos",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "La Marina", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/isotipo-256.png", sizes: "256x256", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: { title: "Americanos · La Marina Sport Club", description: "Cuadro vivo y ranking de pádel en tiempo real.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#0F058C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`tema-noche ${inter.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
