import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cancha Predictiva LNB",
  description: "Analisis, boxscores y predicciones para la Liga Chery Apertura 2026."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
