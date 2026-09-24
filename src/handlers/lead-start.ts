import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getData, profileFrom, updateData } from "../data.js";
import { now } from "../time.js";

registerMainMenuItem({ label: "Contact us", data: "lead:start", order: 30 });
const composer = new Composer<Ctx>();
const skip = inlineKeyboard([[inlineButton("Skip", "lead:skip")], [inlineButton("Cancel", "lead:cancel")]]);
function promptName(ctx: Ctx) { ctx.session.step = "lead_name"; return ctx.reply("What name should we use? You can skip this.", { reply_markup: skip }); }
function promptPhone(ctx: Ctx) { ctx.session.step = "lead_phone"; return ctx.reply("What phone number should we use? You can skip this.", { reply_markup: skip }); }
function promptEmail(ctx: Ctx) { ctx.session.step = "lead_email"; return ctx.reply("What email address should we use? You can skip this.", { reply_markup: skip }); }
async function begin(ctx: Ctx, serviceId?: string) { ctx.session.lead = { message: "", serviceId }; ctx.session.step = "lead_message"; await ctx.reply("Tell us how we can help. Your message stays private and is shared only with the owner.", { reply_markup: { force_reply: true, input_field_placeholder: "Type your message" } }); }
async function preview(ctx: Ctx) {
  const d = ctx.session.lead; if (!d) return;
  const service = d.serviceId ? (await getData(ctx)).services.find((s) => s.id === d.serviceId) : undefined;
  await ctx.reply(`Please review your request:\n\n${d.message}${service ? `\nService: ${service.title}` : ""}${d.name ? `\nName: ${d.name}` : ""}${d.phone ? `\nPhone: ${d.phone}` : ""}${d.email ? `\nEmail: ${d.email}` : ""}\n\nBy submitting, you consent to the owner storing these details to follow up.`, { reply_markup: inlineKeyboard([[inlineButton("Submit request", "lead:submit"), inlineButton("Edit", "lead:edit")], [inlineButton("Cancel", "lead:cancel")]]) });
}
async function submit(ctx: Ctx) {
  const d = ctx.session.lead; const userId = ctx.from?.id ?? 0; if (!d?.message) { await ctx.reply("Your message is missing. Tap Contact us to start again."); return; }
  const id = `L${now()}-${userId}`; const at = now();
  await updateData(ctx, (data) => { data.profiles = data.profiles.filter((p) => p.id !== userId); data.profiles.push({ ...profileFrom(ctx, at), phone: d.phone, email: d.email }); data.leads.push({ id, userId, message: d.message, serviceId: d.serviceId, name: d.name, phone: d.phone, email: d.email, status: "New", createdAt: at, updatedAt: at, notes: [] }); });
  const admin = adminChatId(ctx as never); if (admin) { try { await ctx.api.sendMessage(admin, `New contact request ${id}\n\n${d.message.slice(0, 700)}${d.name ? `\nName: ${d.name}` : ""}${d.phone ? `\nPhone: ${d.phone}` : ""}${d.email ? `\nEmail: ${d.email}` : ""}`, { reply_markup: inlineKeyboard([[inlineButton("Accept", `admin:accept:lead:${id}`), inlineButton("Reject", `admin:reject:lead:${id}`)], [inlineButton("Ask for info", `admin:info:lead:${id}`), inlineButton("View conversation", `admin:view:lead:${id}`)]]) }); } catch { /* owner may be offline */ } }
  ctx.session.step = undefined; ctx.session.lead = undefined;
  await ctx.reply(admin ? `Your request has been received. Reference ${id}. The owner will follow up.` : `Your request has been saved. Reference ${id}. Owner notifications aren't set up yet.`);
}
composer.callbackQuery("lead:start", async (ctx) => { await ctx.answerCallbackQuery(); await begin(ctx); });
composer.callbackQuery(/^lead:service:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await begin(ctx, ctx.match[1]); });
composer.callbackQuery("lead:skip", async (ctx) => { await ctx.answerCallbackQuery(); if (ctx.session.step === "lead_name") await promptPhone(ctx); else if (ctx.session.step === "lead_phone") await promptEmail(ctx); else if (ctx.session.step === "lead_email") await preview(ctx); else await begin(ctx); });
composer.callbackQuery("lead:cancel", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = undefined; ctx.session.lead = undefined; await ctx.reply("Request cancelled. You can start again from the menu."); });
composer.callbackQuery("lead:edit", async (ctx) => { await ctx.answerCallbackQuery(); await begin(ctx, ctx.session.lead?.serviceId); });
composer.callbackQuery("lead:submit", async (ctx) => { await ctx.answerCallbackQuery(); await submit(ctx); });
composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim(); const step = ctx.session.step;
  if (step === "lead_message") { if (!text) { await ctx.reply("Please add a message so the owner knows how to help."); return; } ctx.session.lead = { ...ctx.session.lead, message: text }; await promptName(ctx); return; }
  if (step === "lead_name") { ctx.session.lead = { message: ctx.session.lead?.message ?? "", serviceId: ctx.session.lead?.serviceId, name: text }; await promptPhone(ctx); return; }
  if (step === "lead_phone") { ctx.session.lead = { message: ctx.session.lead?.message ?? "", serviceId: ctx.session.lead?.serviceId, name: ctx.session.lead?.name, phone: text }; await promptEmail(ctx); return; }
  if (step === "lead_email") { ctx.session.lead = { message: ctx.session.lead?.message ?? "", serviceId: ctx.session.lead?.serviceId, name: ctx.session.lead?.name, phone: ctx.session.lead?.phone, email: text }; await preview(ctx); return; }
  await next();
});
export default composer;
