// Copia tracker/lazu-tracker.js dentro de los HTML que tengan los marcadores
// /* LAZU-TRACKER:START */ ... /* LAZU-TRACKER:END */.
// Uso: npm run tracker:sync [-- archivo.html ...]   (por defecto public/test-profile.html)
import { readFileSync, writeFileSync } from "node:fs";

const START = "/* LAZU-TRACKER:START */";
const END = "/* LAZU-TRACKER:END */";

export function embedTracker(html, tracker) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error("Marcadores LAZU-TRACKER no encontrados");
  const indent = html.slice(html.lastIndexOf("\n", start) + 1, start);
  const body = tracker
    .trim()
    .split("\n")
    .map((line) => (line ? indent + line : line))
    .join("\n");
  return `${html.slice(0, start)}${START}\n${body}\n${indent}${html.slice(end)}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tracker = readFileSync(new URL("../tracker/lazu-tracker.js", import.meta.url), "utf8");
  const files = process.argv.slice(2);
  for (const file of files.length ? files : ["public/test-profile.html"]) {
    writeFileSync(file, embedTracker(readFileSync(file, "utf8"), tracker));
    console.log(`✔ Tracker embebido en ${file}`);
  }
}
