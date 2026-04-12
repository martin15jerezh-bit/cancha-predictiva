"use client";

import { useState } from "react";
import { parseCsvFile, validateRows } from "@/lib/csv";
import { DatasetKey } from "@/lib/types";
import { datasetLabels } from "@/lib/data";

type DataUploaderProps<T extends Record<string, string>> = {
  dataset: DatasetKey;
  onLoad: (rows: T[]) => void;
};

export function DataUploader<T extends Record<string, string>>({
  dataset,
  onLoad
}: DataUploaderProps<T>) {
  const [message, setMessage] = useState<string>("Usa las columnas estándar del dataset.");
  const [error, setError] = useState<string[]>([]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = await parseCsvFile<T>(file);
      const validation = validateRows(dataset, parsed as Record<string, string>[]);

      if (!validation.valid) {
        setError(validation.errors.slice(0, 5));
        setMessage("Corrige el formato y vuelve a intentar.");
        return;
      }

      setError([]);
      setMessage(`${file.name} cargado correctamente.`);
      onLoad(parsed);
    } catch (loadError) {
      setError([loadError instanceof Error ? loadError.message : "No se pudo leer el CSV."]);
      setMessage("Error de carga.");
    }
  };

  return (
    <div className="upload-card">
      <div>
        <p className="eyebrow">Carga CSV</p>
        <h3>{datasetLabels[dataset]}</h3>
      </div>
      <label className="upload-button">
        Subir archivo
        <input accept=".csv" onChange={handleFile} type="file" />
      </label>
      <p className="muted">{message}</p>
      {error.length > 0 ? (
        <ul className="error-list">
          {error.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
