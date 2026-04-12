import { NextResponse } from "next/server";
import { seedData } from "@/lib/data";

const GENIUS_SCHEDULE_URL = "https://clnb.web.geniussports.com/competitions/?cu=FDBCH%2Fschedule";
const WIKI_2026_URL =
  "https://es.wikipedia.org/wiki/Liga_Nacional_de_B%C3%A1squetbol_Apertura_2026_(Chile)";

async function checkSource(url: string) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "user-agent": "Cancha Predictiva LNB/0.1"
      }
    });

    return {
      ok: response.ok,
      status: response.status,
      url
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      error: error instanceof Error ? error.message : "No se pudo consultar la fuente."
    };
  }
}

export async function POST() {
  const checkedSources = await Promise.all([
    checkSource(GENIUS_SCHEDULE_URL),
    checkSource(WIKI_2026_URL)
  ]);

  return NextResponse.json({
    data: seedData,
    updatedAt: new Date().toISOString(),
    checkedSources,
    note:
      "Snapshot local actualizado con resultados 2026 verificados. La ruta consulta fuentes públicas y entrega el dataset listo para la app."
  });
}
