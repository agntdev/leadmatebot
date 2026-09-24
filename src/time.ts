export function now(): number { return Date.now(); }
export function futureDateTime(date: string, time: string): boolean {
  const parsed = new Date(`${date}T${time}`);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() > now();
}
