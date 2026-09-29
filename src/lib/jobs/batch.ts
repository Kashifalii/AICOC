export type BatchWindow = { start: number; end: number; next: number; complete: boolean };

export function getBatchWindow(cursor: number, total: number, batchSize: number): BatchWindow {
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    throw new RangeError("Cursor must be a non-negative integer");
  if (!Number.isSafeInteger(total) || total < 0)
    throw new RangeError("Total must be a non-negative integer");
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new RangeError("Batch size must be a positive integer");
  const start = Math.min(cursor, total);
  const end = Math.min(total, start + batchSize);
  return { start, end, next: end, complete: end >= total };
}
