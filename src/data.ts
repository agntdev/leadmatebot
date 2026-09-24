import { MemorySessionStorage } from "./toolkit/index.js";

export type LeadStatus = "New" | "InfoRequested" | "Accepted" | "Rejected";
export type BookingStatus = "Pending" | "Confirmed" | "Rejected" | "Cancelled";
export interface Service { id: string; title: string; description: string; price?: string; visible: boolean; order: number }
export interface Profile { id: number; firstName?: string; lastName?: string; username?: string; phone?: string; email?: string; createdAt: number; lastSeen: number }
export interface Lead { id: string; userId: number; message: string; serviceId?: string; preferredDatetime?: string; name?: string; phone?: string; email?: string; status: LeadStatus; createdAt: number; updatedAt: number; notes: string[] }
export interface Booking { id: string; serviceId: string; userId: number; date: string; time: string; name?: string; phone?: string; email?: string; status: BookingStatus; createdAt: number; updatedAt: number }
export interface Data { profiles: Profile[]; services: Service[]; leads: Lead[]; bookings: Booking[]; actions: { id: string; entity: "lead" | "booking"; entityId: string; action: string; message?: string; at: number }[] }

export type Env = Record<string, unknown> | undefined;
interface D1 { prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> } } }
interface DurableNamespace { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> } }
const fallback = new MemorySessionStorage<Data>();
const empty: Data = { profiles: [], services: [], leads: [], bookings: [], actions: [] };
const seeded: Service[] = [
  { id: "consultation", title: "Initial consultation", description: "A focused conversation to understand your needs and recommend next steps.", price: "From £50", visible: true, order: 1 },
  { id: "project", title: "Project planning", description: "A practical plan with clear scope, milestones, and priorities.", price: "From £150", visible: true, order: 2 },
  { id: "support", title: "Ongoing support", description: "Reliable help and advice after your project is underway.", price: "From £75", visible: true, order: 3 },
];

function envOf(ctx: unknown): Env { return (ctx as { env?: Env }).env; }
function domainStub(ctx: unknown) {
  const namespace = envOf(ctx)?.CHAT_DO as DurableNamespace | undefined;
  return namespace?.get(namespace.idFromName("leadcrm:domain"));
}
function redisUrl(ctx: unknown): string | undefined {
  const value = envOf(ctx)?.REDIS_URL ?? (typeof process !== "undefined" ? process.env.REDIS_URL : undefined);
  return typeof value === "string" ? value : undefined;
}
async function redis(ctx: unknown): Promise<{ get(k: string): Promise<string | null>; set(k: string, v: string): Promise<unknown> } | undefined> {
  const url = redisUrl(ctx); if (!url) return undefined;
  const mod = await import("ioredis");
  const Redis = (mod as unknown as { default?: new (url: string) => { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<unknown> } }).default;
  return Redis ? new Redis(url) : undefined;
}
async function read(ctx: unknown): Promise<Data> {
  const durable = domainStub(ctx);
  if (durable) { const response = await durable.fetch("https://do/data"); if (response.status === 200) return await response.json() as Data; return { ...empty, services: seeded.map((s) => ({ ...s })) }; }
  const db = envOf(ctx)?.DB as D1 | undefined;
  if (db) {
    await db.prepare("CREATE TABLE IF NOT EXISTS bot_data (id TEXT PRIMARY KEY, value TEXT NOT NULL)").bind().run();
    const row = await db.prepare("SELECT value FROM bot_data WHERE id = ?").bind("root").first<{ value: string }>();
    return row ? JSON.parse(row.value) as Data : { ...empty, services: seeded.map((s) => ({ ...s })) };
  }
  const r = await redis(ctx);
  if (r) { const raw = await r.get("leadcrm:root"); return raw ? JSON.parse(raw) as Data : { ...empty, services: seeded.map((s) => ({ ...s })) }; }
  return (await fallback.read("root")) ?? { ...empty, services: seeded.map((s) => ({ ...s })) };
}
async function write(ctx: unknown, data: Data): Promise<void> {
  const value = JSON.stringify(data);
  const durable = domainStub(ctx);
  if (durable) { await durable.fetch("https://do/data", { method: "PUT", body: value }); return; }
  const db = envOf(ctx)?.DB as D1 | undefined;
  if (db) { await db.prepare("CREATE TABLE IF NOT EXISTS bot_data (id TEXT PRIMARY KEY, value TEXT NOT NULL)").bind().run(); await db.prepare("INSERT OR REPLACE INTO bot_data (id,value) VALUES (?,?)").bind("root", value).run(); return; }
  const r = await redis(ctx); if (r) { await r.set("leadcrm:root", value); return; }
  await fallback.write("root", data);
}
export async function updateData<T>(ctx: unknown, fn: (data: Data) => T | Promise<T>): Promise<T> { const data = await read(ctx); const result = await fn(data); await write(ctx, data); return result; }
export async function getData(ctx: unknown): Promise<Data> { return read(ctx); }
export function profileFrom(ctx: unknown, at: number): Profile {
  const from = (ctx as { from?: { id: number; first_name?: string; last_name?: string; username?: string } }).from;
  return { id: from?.id ?? 0, firstName: from?.first_name, lastName: from?.last_name, username: from?.username, createdAt: at, lastSeen: at };
}
