import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scout Pro Chile",
  description: "Scouting, analisis tactico e ingestion Genius Sports para ligas chilenas."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
