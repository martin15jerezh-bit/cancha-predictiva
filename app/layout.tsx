import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DOS Scout Pro",
  description: "Scouting, analisis tactico e ingestion Genius Sports para Liga DOS Chile."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
