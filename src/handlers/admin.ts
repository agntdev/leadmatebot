import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { getData, updateData, type Lead, type Booking } from "../data.js";
import { now } from "../time.js";

const composer = new Composer<Ctx>();
function target(data: string): { action: string; type: "lead" | "booking"; id: string } | undefined {
  const p = data.split(":"); if (p.length !== 4 || !["accept", "reject", "info", "view"].includes(p[1]) || !["lead", "booking"].includes(p[2])) return undefined;
  return { action: p[1], type: p[2] as "lead" | "booking", id: p[3] };
}
async function find(ctx: Ctx, type: "lead" | "booking", id: string): Promise<Lead | Booking | undefined> { const d = await getData(ctx); return type === "lead" ? d.leads.find((x) => x.id === id) : d.bookings.find((x) => x.id === id); }
async function notifyUser(ctx: Ctx, userId: number, text: string) { try { await ctx.api.sendMessage(userId, text); } catch { /* user may have blocked the bot */ } }
composer.callbackQuery(/^admin:(accept|reject|info|view):(lead|booking):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx as never))) return;
  const item = target(ctx.callbackQuery.data); if (!item) return;
  const entity = await find(ctx, item.type, item.id); if (!entity) { await ctx.reply("That request is no longer available."); return; }
  if (item.action === "view") { await ctx.reply(item.type === "lead" ? `Conversation ${item.id}:\n${(entity as Lead).message}` : `Conversation ${item.id}:\nBooking ${(entity as Booking).date} at ${(entity as Booking).time}`); return; }
  if (item.action === "info") { ctx.session.adminEntity = { type: item.type, id: item.id }; await updateData(ctx, (d) => { const e = item.type === "lead" ? d.leads.find((x) => x.id === item.id) : d.bookings.find((x) => x.id === item.id); if (e) e.status = item.type === "lead" ? "InfoRequested" : "Pending"; if (e) e.updatedAt = now(); d.actions.push({ id: `A${now()}`, entity: item.type, entityId: item.id, action: "AskForInfo", at: now() }); }); await ctx.reply("Type the follow-up question to send to the customer.", { reply_markup: { force_reply: true, input_field_placeholder: "Type your question" } }); return; }
  const status = item.type === "lead" ? (item.action === "accept" ? "Accepted" : "Rejected") : (item.action === "accept" ? "Confirmed" : "Rejected");
  await updateData(ctx, (d) => { const e = item.type === "lead" ? d.leads.find((x) => x.id === item.id) : d.bookings.find((x) => x.id === item.id); if (e) { e.status = status as never; e.updatedAt = now(); } d.actions.push({ id: `A${now()}`, entity: item.type, entityId: item.id, action: item.action === "accept" ? "Accept" : "Reject", at: now() }); });
  await notifyUser(ctx, entity.userId, item.type === "lead" ? `Your request ${item.id} was ${status.toLowerCase()}.` : `Your booking request ${item.id} was ${status === "Confirmed" ? "confirmed" : "rejected"}.`);
  await ctx.reply(item.type === "lead" ? `Request ${item.id} marked ${status}.` : `Booking ${item.id} marked ${status}.`);
});
composer.on("message:text", async (ctx, next) => {
  if (!ctx.session.adminEntity || !(await requireOwner(ctx as never))) return next();
  const targetEntity = ctx.session.adminEntity; const message = ctx.message.text.trim(); if (!message) { await ctx.reply("Type a follow-up message."); return; }
  const entity = await find(ctx, targetEntity.type, targetEntity.id); if (!entity) { ctx.session.adminEntity = undefined; await ctx.reply("That request is no longer available."); return; }
  await updateData(ctx, (d) => { const e = targetEntity.type === "lead" ? d.leads.find((x) => x.id === targetEntity.id) : d.bookings.find((x) => x.id === targetEntity.id); if (e) { e.updatedAt = now(); if (targetEntity.type === "lead") (e as Lead).notes.push(message); } d.actions.push({ id: `A${now()}`, entity: targetEntity.type, entityId: targetEntity.id, action: "Reply", message, at: now() }); });
  await notifyUser(ctx, entity.userId, `The owner sent a message about ${targetEntity.id}:\n\n${message}`);
  ctx.session.adminEntity = undefined; await ctx.reply("Your message was sent to the customer.");
});
export default composer;
