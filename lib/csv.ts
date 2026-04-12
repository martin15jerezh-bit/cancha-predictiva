import Papa from "papaparse";
import { DatasetKey, ValidationResult } from "@/lib/types";
import { requiredColumns } from "@/lib/data";

export function parseCsvFile<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        if (results.errors.length > 0) {
          reject(new Error(results.errors[0].message));
          return;
        }

        const cleaned = results.data.map((row) =>
          Object.fromEntries(
            Object.entries(row as Record<string, unknown>).map(([key, value]) => [
              key.trim(),
              String(value ?? "").trim()
            ])
          )
        ) as T[];

        resolve(cleaned);
      },
      error(error) {
        reject(error);
      }
    });
  });
}

export function validateRows(dataset: DatasetKey, rows: Record<string, string>[]): ValidationResult {
  const columns = requiredColumns[dataset];

  if (rows.length === 0) {
    return { valid: false, errors: ["El archivo CSV no contiene filas de datos."] };
  }

  const firstRowKeys = Object.keys(rows[0] ?? {});
  const missing = columns.filter((column) => !firstRowKeys.includes(column));
  const errors: string[] = [];

  if (missing.length > 0) {
    errors.push(`Faltan columnas obligatorias: ${missing.join(", ")}`);
  }

  rows.forEach((row, index) => {
    columns.forEach((column) => {
      if (String(row[column] ?? "").trim() === "") {
        errors.push(`Fila ${index + 2}: la columna "${column}" está vacía.`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
