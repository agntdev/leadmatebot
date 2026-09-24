import type { Context } from "grammy";
import type { Ctx } from "./bot.js";

export type LeadStatus = "New" | "InfoRequested" | "Accepted" | "Rejected";
export type BookingStatus = "Pending" | "Confirmed" | "Rejected" | "Cancelled";
export interface Profile { telegramId: string; firstName?: string; lastName?: string; username?: string; phone?: string; email?: string; createdAt: string; lastSeen: string; }
export interface Service { serviceId: string; title: string; shortDescription: string; priceEstimate?: string; visible: boolean; orderIndex: number; }
export interface Lead { leadId: string; userTelegramId: string; message: string; selectedServiceId?: string; preferredDatetime?: string; contactName?: string; contactPhone?: string; contactEmail?: string; status: LeadStatus; createdAt: string; updatedAt: string; adminNotes: string[]; }
export interface Booking { bookingId: string; serviceId: string; userTelegramId: string; preferredDate: string; preferredTime: string; contactName?: string; contactPhone?: string; contactEmail?: string; status: BookingStatus; createdAt: string; updatedAt: string; }
export interface CRMState { profiles: Record<string, Profile>; services: Record<string, Service>; serviceIds: string[]; leads: Record<string, Lead>; leadIds: string[]; bookings: Record<string, Booking>; bookingIds: string[]; }

const seed: Service[] = [
  { serviceId: "consultation", title: "Consultation", shortDescription: "A focused session to understand your needs.", priceEstimate: "Quote on request", visible: true, orderIndex: 1 },
  { serviceId: "project", title: "Project work", shortDescription: "Practical delivery tailored to your goals.", priceEstimate: "Quote on request", visible: true, orderIndex: 2 },
  { serviceId: "support", title: "Ongoing support", shortDescription: "Reliable help after your project is complete.", priceEstimate: "Quote on request", visible: true, orderIndex: 3 },
];
export function emptyState(): CRMState {
  return { profiles: {}, services: Object.fromEntries(seed.map((s) => [s.serviceId, s])), serviceIds: seed.map((s) => s.serviceId), leads: {}, leadIds: [], bookings: {}, bookingIds: [] };
}
type D1Statement = { bind(...args: unknown[]): D1Statement; first<T>(): Promise<T | null>; run(): Promise<unknown> };
type D1 = { prepare(sql: string): D1Statement };
function dbOf(ctx: Context): D1 | undefined { return (ctx as Context & { env?: { DB?: D1 } }).env?.DB; }
async function read(ctx: Ctx): Promise<CRMState> {
  const db = dbOf(ctx);
  if (!db) { ctx.session.crm ??= emptyState(); return ctx.session.crm; }
  await db.prepare("CREATE TABLE IF NOT EXISTS crm_state (id INTEGER PRIMARY KEY, value TEXT NOT NULL)").run();
  const row = await db.prepare("SELECT value FROM crm_state WHERE id = 1").first<{ value: string }>();
  if (!row) { const state = emptyState(); await write(ctx, state); return state; }
  try { return JSON.parse(row.value) as CRMState; } catch { const state = emptyState(); await write(ctx, state); return state; }
}
async function write(ctx: Ctx, state: CRMState): Promise<void> {
  const db = dbOf(ctx);
  if (!db) { ctx.session.crm = state; return; }
  await db.prepare("INSERT INTO crm_state (id, value) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value").bind(JSON.stringify(state)).run();
}
export async function withState<T>(ctx: Ctx, fn: (state: CRMState) => T | Promise<T>): Promise<T> { const state = await read(ctx); const result = await fn(state); await write(ctx, state); return result; }
export async function getState(ctx: Ctx): Promise<CRMState> { return read(ctx); }
export function now(): number { return Date.now(); }
export function id(prefix: string): string { return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`; }
export function truncate(value: string, max = 700): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }
