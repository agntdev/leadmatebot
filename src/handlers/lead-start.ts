import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { id, now, truncate, withState } from "../data.js";

registerMainMenuItem({ label: "Contact us", data: "lead:start", order: 30 });
const composer = new Composer<Ctx>();
const force = (placeholder: string) => ({ force_reply: true as const, input_field_placeholder: placeholder });
async function begin(ctx: Ctx, serviceId?: string) { ctx.session.step = "lead_message"; ctx.session.draft = serviceId ? { serviceId } : {}; await ctx.reply("What can we help you with?", { reply_markup: force("Describe what you need") }); }
composer.callbackQuery(/^lead:start(?::.*)?$/, async (ctx) => { await ctx.answerCallbackQuery(); await begin(ctx, ctx.callbackQuery.data.split(":")[2]); });
composer.callbackQuery("lead:skip_name", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "lead_phone"; await ctx.reply("What phone number can we use? You can skip this.", { reply_markup: inlineKeyboard([[inlineButton("Skip", "lead:skip_phone")]]) }); });
composer.callbackQuery("lead:skip_phone", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "lead_email"; await ctx.reply("What email address can we use? You can skip this.", { reply_markup: inlineKeyboard([[inlineButton("Skip", "lead:skip_email")]]) }); });
composer.callbackQuery("lead:skip_email", async (ctx) => { await ctx.answerCallbackQuery(); await leadPreview(ctx); });
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step; const text = ctx.message.text.trim();
  if (step === "lead_message") { if (!text) { await ctx.reply("Add a short message so we know how to help.", { reply_markup: force("Describe what you need") }); return; } ctx.session.draft = { ...(ctx.session.draft ?? {}), message: text }; ctx.session.step = "lead_name"; await ctx.reply("What name should we use? You can skip this.", { reply_markup: inlineKeyboard([[inlineButton("Skip", "lead:skip_name")]]) }); return; }
  if (step === "lead_name") { ctx.session.draft = { ...(ctx.session.draft ?? {}), name: text }; ctx.session.step = "lead_phone"; await ctx.reply("What phone number can we use? You can skip this.", { reply_markup: inlineKeyboard([[inlineButton("Skip", "lead:skip_phone")]]) }); return; }
  if (step === "lead_phone") { ctx.session.draft = { ...(ctx.session.draft ?? {}), phone: text }; ctx.session.step = "lead_email"; await ctx.reply("What email address can we use? You can skip this.", { reply_markup: inlineKeyboard([[inlineButton("Skip", "lead:skip_email")]]) }); return; }
  if (step === "lead_email") { ctx.session.draft = { ...(ctx.session.draft ?? {}), email: text }; await leadPreview(ctx); return; }
  return next();
});
async function leadPreview(ctx: Ctx) { ctx.session.step = "lead_confirm"; const d = ctx.session.draft ?? {}; await ctx.reply(`Please check your request:\n\n${truncate(d.message ?? "")}\n\nPrivacy note: we’ll use these details only to follow up on your request.`, { reply_markup: inlineKeyboard([[inlineButton("Submit request", "lead:confirm"), inlineButton("Edit", "lead:start")]]) }); }
composer.callbackQuery("lead:confirm", async (ctx) => {
  await ctx.answerCallbackQuery(); const d = ctx.session.draft ?? {}; const userId = String(ctx.from.id); const timestamp = new Date(now()).toISOString(); const leadId = id("lead");
  await withState(ctx, (s) => { s.leads[leadId] = { leadId, userTelegramId: userId, message: d.message ?? "", selectedServiceId: d.serviceId, contactName: d.name, contactPhone: d.phone, contactEmail: d.email, status: "New", createdAt: timestamp, updatedAt: timestamp, adminNotes: [] }; s.leadIds.push(leadId); const p = s.profiles[userId]; if (p) { p.phone = d.phone ?? p.phone; p.email = d.email ?? p.email; } });
ctx.session.step = undefined; ctx.session.draft = undefined; const owner = adminChatId(ctx as never);
  if (owner) { try { await ctx.api.sendMessage(owner, `New contact request ${leadId}\n\n${truncate(d.message ?? "")}\nName: ${d.name ?? "Not provided"}\nPhone: ${d.phone ?? "Not provided"}\nEmail: ${d.email ?? "Not provided"}`, { reply_markup: inlineKeyboard([[inlineButton("Accept", `admin:accept:lead:${leadId}`), inlineButton("Reject", `admin:reject:lead:${leadId}`)], [inlineButton("Ask for info", `admin:ask:lead:${leadId}`), inlineButton("View conversation", `admin:view:lead:${leadId}`)] ]) }); } catch { /* owner may be offline or have blocked the bot */ } }
  await ctx.reply(owner ? `Your request has been sent. Reference: ${leadId}` : `Your request was saved. The owner notification is pending. Reference: ${leadId}`);
});
export default composer;
