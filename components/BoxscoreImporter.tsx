"use client";

import { useState } from "react";
import { applyBoxscoreImports } from "@/lib/data";
import { BoxscoreImport, CompetitionKey, DatasetMap } from "@/lib/types";

type BoxscoreImporterProps = {
  competition: CompetitionKey;
  data: DatasetMap;
  onDataChange: (data: DatasetMap) => void;
};

export function BoxscoreImporter({ competition, data, onDataChange }: BoxscoreImporterProps) {
  const [urls, setUrls] = useState("");
  const [status, setStatus] = useState(`Pega links FIBA para ${competition}, uno por linea.`);
  const [errors, setErrors] = useState<string[]>([]);

  const handleImport = async () => {
    const parsedUrls = urls
      .split(/\n|,/)
      .map((url) => url.trim())
      .filter(Boolean);

    setStatus("Leyendo boxscores FIBA...");
    setErrors([]);

    try {
      const response = await fetch("/api/import-boxscores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: parsedUrls, competition })
      });
      const payload = (await response.json()) as { imports: BoxscoreImport[]; errors: string[] };

      if (!response.ok && payload.errors.length > 0) {
        throw new Error(payload.errors[0]);
      }

      const nextData = applyBoxscoreImports(data, payload.imports);
      onDataChange(nextData);
      setErrors(payload.errors);
      setStatus(
        `Importados ${payload.imports.length} boxscores, ${payload.imports.reduce(
          (sum, item) => sum + item.players.length,
          0
        )} filas de jugadores.`
      );
    } catch (error) {
      setStatus("No se pudo importar.");
      setErrors([error instanceof Error ? error.message : "Error inesperado importando boxscores."]);
    }
  };

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Boxscores FIBA</p>
          <h2>Importar desde links</h2>
          <p className="muted">Los boxscores se guardaran en: {competition}</p>
        </div>
        <button className="sync-button compact-sync" onClick={handleImport} type="button">
          Leer links y actualizar
        </button>
      </div>
      <textarea
        className="link-textarea"
        onChange={(event) => setUrls(event.target.value)}
        placeholder="https://fibalivestats.dcd.shared.geniussports.com/u/CLNB/2803278/"
        value={urls}
      />
      <p className="sync-status">{status}</p>
      {errors.length > 0 ? (
        <ul className="error-list">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
