import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, isOwner, requireOwner } from "../toolkit/index.js";
import { now, withState } from "../data.js";

const composer = new Composer<Ctx>();
type EntityType = "lead" | "booking";
async function notifyUser(ctx: Ctx, userId: string, text: string) { try { await ctx.api.sendMessage(userId, text); } catch { /* a blocked user must not break owner actions */ } }
composer.callbackQuery(/^admin:(accept|reject|ask|view):(lead|booking):[^:]+$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx))) return;
  const [, action, entityType, entityId] = ctx.callbackQuery.data.split(":") as [string, string, EntityType, string];
  if (action === "view") { await ctx.reply("The full conversation is stored with this request."); return; }
  if (action === "ask") { ctx.session.adminReply = { entityType, entityId }; await ctx.reply("Type the follow-up message to send to the customer.", { reply_markup: { force_reply: true, input_field_placeholder: "Type your message" } }); return; }
  const status = action === "accept" ? (entityType === "lead" ? "Accepted" : "Confirmed") : "Rejected";
  let userId: string | undefined;
  await withState(ctx, (s) => { if (entityType === "lead") { const item = s.leads[entityId]; if (!item) return; item.status = status as "Accepted" | "Rejected"; item.updatedAt = new Date(now()).toISOString(); userId = item.userTelegramId; } else { const item = s.bookings[entityId]; if (!item) return; item.status = status as "Confirmed" | "Rejected"; item.updatedAt = new Date(now()).toISOString(); userId = item.userTelegramId; } });
  if (!userId) { await ctx.reply("That request is no longer available."); return; }
  await notifyUser(ctx, userId, entityType === "lead" ? `Your contact request was ${action === "accept" ? "accepted" : "rejected"}.` : `Your booking request was ${action === "accept" ? "confirmed" : "rejected"}.`);
  await ctx.reply("The customer has been notified.");
});
composer.on("message:text", async (ctx, next) => { const pending = ctx.session.adminReply; if (!pending || !isOwner(ctx) || String(ctx.chat.id) !== adminChatId(ctx)) return next(); const message = ctx.message.text.trim(); if (!message) { await ctx.reply("Type a message to send to the customer."); return; } let userId: string | undefined; await withState(ctx, (s) => { if (pending.entityType === "lead") { const item = s.leads[pending.entityId]; if (item) { item.status = "InfoRequested"; item.updatedAt = new Date(now()).toISOString(); item.adminNotes.push(message); userId = item.userTelegramId; } } else { const item = s.bookings[pending.entityId]; if (item) userId = item.userTelegramId; } }); if (userId) await notifyUser(ctx, userId, `The owner has a message for you:\n\n${message}`); ctx.session.adminReply = undefined; await ctx.reply(userId ? "Your message was sent." : "That request is no longer available."); });
export default composer;
