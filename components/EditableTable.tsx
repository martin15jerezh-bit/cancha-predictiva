"use client";

type EditableTableProps<T extends Record<string, string>> = {
  title: string;
  rows: T[];
  columns: Array<keyof T>;
  onChange: (rows: T[]) => void;
};

export function EditableTable<T extends Record<string, string>>({
  title,
  rows,
  columns,
  onChange
}: EditableTableProps<T>) {
  const handleCellChange = (rowIndex: number, column: keyof T, value: string) => {
    const nextRows = rows.map((row, index) =>
      index === rowIndex ? { ...row, [column]: value } : row
    );
    onChange(nextRows);
  };

  const handleAddRow = () => {
    const emptyRow = Object.fromEntries(columns.map((column) => [column, ""])) as T;
    onChange([...rows, emptyRow]);
  };

  const handleDeleteRow = (rowIndex: number) => {
    onChange(rows.filter((_, index) => index !== rowIndex));
  };

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Edicion manual</p>
          <h3>{title}</h3>
        </div>
        <button className="ghost-button" onClick={handleAddRow} type="button">
          Agregar fila
        </button>
      </div>

      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={String(column)}>{String(column)}</th>
              ))}
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={`${title}-${rowIndex}-${String(column)}`}>
                    <input
                      value={row[column] ?? ""}
                      onChange={(event) =>
                        handleCellChange(rowIndex, column, event.target.value)
                      }
                    />
                  </td>
                ))}
                <td>
                  <button className="danger-button" onClick={() => handleDeleteRow(rowIndex)} type="button">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
