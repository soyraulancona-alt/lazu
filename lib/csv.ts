/**
 * Celda CSV segura: comillas escapadas y protección contra inyección de fórmulas
 * (un contacto llamado "=HYPERLINK(...)" no debe ejecutarse al abrir el archivo en Excel).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM para que Excel abra el archivo con acentos correctos.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
