// Pure utility: extract table rows from heterogeneous output shapes.
// Shared between RunSurface (React) and tests (Node) without any React dep.

export type TableRow = Record<string, unknown>;

export function isArrayOfObjects(value: unknown): value is TableRow[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((r) => r !== null && typeof r === "object" && !Array.isArray(r))
  );
}

// Detects {count, items: [{...}, ...]} or similar wrapper shapes.
export function extractRows(output: unknown): TableRow[] | null {
  if (isArrayOfObjects(output)) return output as TableRow[];
  if (output !== null && typeof output === "object" && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    for (const key of ["items", "results", "rows", "data", "list", "tasks", "actions"]) {
      if (isArrayOfObjects(obj[key])) return obj[key] as TableRow[];
    }
    for (const val of Object.values(obj)) {
      if (isArrayOfObjects(val)) return val as TableRow[];
    }
  }
  return null;
}

// Union of all keys across all rows so heterogeneous shapes don't drop columns.
// Key order is stable: first-appearance order across rows, ties broken alphabetically.
// This prevents column order from varying on shareable-URL reload (where row order
// from Supabase JSON differs from the initial in-memory render).
export function unionKeys(rows: TableRow[]): string[] {
  const seen = new Map<string, number>(); // key → index of first appearance
  let globalIdx = 0;
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.set(key, globalIdx++);
      }
    }
  }
  return Array.from(seen.keys()).sort((a, b) => {
    const diff = (seen.get(a) ?? 0) - (seen.get(b) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}
