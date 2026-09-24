import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getData, profileFrom, updateData } from "../data.js";
import { futureDateTime, now } from "../time.js";

registerMainMenuItem({ label: "Book appointment", data: "booking:start", order: 20 });
const composer = new Composer<Ctx>();
const skip = inlineKeyboard([[inlineButton("Skip", "booking:skip")], [inlineButton("Cancel", "booking:cancel")]]);
async function chooseService(ctx: Ctx) {
  const services = (await getData(ctx)).services.filter((s) => s.visible).sort((a, b) => a.order - b.order);
  if (!services.length) { await ctx.reply("There are no services available for booking yet."); return; }
  ctx.session.step = "booking_service";
  await ctx.reply("Which service would you like to book?", { reply_markup: inlineKeyboard(services.slice(0, 8).map((s) => [inlineButton(s.title, `booking:service:${s.id}`)]).concat([[inlineButton("Cancel", "booking:cancel")]])) });
}
async function begin(ctx: Ctx, serviceId?: string) { ctx.session.booking = { serviceId }; if (serviceId) { ctx.session.step = "booking_date"; await ctx.reply("What date would you prefer? Use YYYY-MM-DD.", { reply_markup: { force_reply: true, input_field_placeholder: "YYYY-MM-DD" } }); } else await chooseService(ctx); }
async function promptContact(ctx: Ctx) { ctx.session.step = "booking_name"; await ctx.reply("What name should we use? You can skip this.", { reply_markup: skip }); }
async function preview(ctx: Ctx) {
  const d = ctx.session.booking; if (!d?.serviceId || !d.date || !d.time) return;
  const service = (await getData(ctx)).services.find((s) => s.id === d.serviceId);
  await ctx.reply(`Please review your appointment:\n\nService: ${service?.title ?? "Selected service"}\nDate: ${d.date}\nTime: ${d.time}${d.name ? `\nName: ${d.name}` : ""}${d.phone ? `\nPhone: ${d.phone}` : ""}${d.email ? `\nEmail: ${d.email}` : ""}\n\nBy confirming, you consent to the owner storing these details to arrange your appointment.`, { reply_markup: inlineKeyboard([[inlineButton("Confirm booking", "booking:confirm"), inlineButton("Edit", "booking:edit")], [inlineButton("Cancel", "booking:cancel")]]) });
}
async function submit(ctx: Ctx) {
  const d = ctx.session.booking; const userId = ctx.from?.id ?? 0; if (!d?.serviceId || !d.date || !d.time) { await ctx.reply("Your booking details are incomplete. Tap Book appointment to start again."); return; }
  const id = `B${now()}-${userId}`; const at = now();
  await updateData(ctx, (data) => { data.profiles = data.profiles.filter((p) => p.id !== userId); data.profiles.push({ ...profileFrom(ctx, at), phone: d.phone, email: d.email }); data.bookings.push({ id, serviceId: d.serviceId!, userId, date: d.date!, time: d.time!, name: d.name, phone: d.phone, email: d.email, status: "Pending", createdAt: at, updatedAt: at }); });
  const admin = adminChatId(ctx as never); if (admin) { try { const service = (await getData(ctx)).services.find((s) => s.id === d.serviceId); await ctx.api.sendMessage(admin, `New booking request ${id}\n\nService: ${service?.title ?? d.serviceId}\nDate: ${d.date}\nTime: ${d.time}${d.name ? `\nName: ${d.name}` : ""}${d.phone ? `\nPhone: ${d.phone}` : ""}${d.email ? `\nEmail: ${d.email}` : ""}`, { reply_markup: inlineKeyboard([[inlineButton("Accept", `admin:accept:booking:${id}`), inlineButton("Reject", `admin:reject:booking:${id}`)], [inlineButton("Ask for info", `admin:info:booking:${id}`), inlineButton("View conversation", `admin:view:booking:${id}`)]]) }); } catch { /* owner may be offline */ } }
  ctx.session.step = undefined; ctx.session.booking = undefined;
  await ctx.reply(admin ? `Your booking request has been received. Reference ${id}. The owner will confirm it.` : `Your booking request has been saved. Reference ${id}. Owner notifications aren't set up yet.`);
}
composer.callbackQuery("booking:start", async (ctx) => { await ctx.answerCallbackQuery(); await begin(ctx); });
composer.callbackQuery(/^booking:service:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await begin(ctx, ctx.match[1]); });
composer.callbackQuery("booking:skip", async (ctx) => { await ctx.answerCallbackQuery(); const d = ctx.session.booking; if (ctx.session.step === "booking_name") { ctx.session.step = "booking_phone"; await ctx.reply("What phone number should we use? You can skip this.", { reply_markup: skip }); } else if (ctx.session.step === "booking_phone") { ctx.session.step = "booking_email"; await ctx.reply("What email address should we use? You can skip this.", { reply_markup: skip }); } else if (ctx.session.step === "booking_email") await preview(ctx); else if (!d?.serviceId) await chooseService(ctx); });
composer.callbackQuery("booking:cancel", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = undefined; ctx.session.booking = undefined; await ctx.reply("Booking cancelled. You can start again from the menu."); });
composer.callbackQuery("booking:edit", async (ctx) => { await ctx.answerCallbackQuery(); await chooseService(ctx); });
composer.callbackQuery("booking:confirm", async (ctx) => { await ctx.answerCallbackQuery(); await submit(ctx); });
composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim(); const step = ctx.session.step;
  if (step === "booking_date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) { await ctx.reply("Use YYYY-MM-DD so we can read the date.", { reply_markup: { force_reply: true, input_field_placeholder: "YYYY-MM-DD" } }); return; } ctx.session.booking = { ...ctx.session.booking, date: text }; ctx.session.step = "booking_time"; await ctx.reply("What time would you prefer? Use 24-hour HH:MM.", { reply_markup: { force_reply: true, input_field_placeholder: "HH:MM" } }); return; }
  if (step === "booking_time") { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text) || !futureDateTime(ctx.session.booking?.date ?? "", text)) { await ctx.reply("That date and time has passed or is not valid. Enter a future time.", { reply_markup: { force_reply: true, input_field_placeholder: "HH:MM" } }); return; } ctx.session.booking = { ...ctx.session.booking, time: text }; await promptContact(ctx); return; }
  if (step === "booking_name") { ctx.session.booking = { ...ctx.session.booking, name: text }; ctx.session.step = "booking_phone"; await ctx.reply("What phone number should we use? You can skip this.", { reply_markup: skip }); return; }
  if (step === "booking_phone") { ctx.session.booking = { ...ctx.session.booking, phone: text }; ctx.session.step = "booking_email"; await ctx.reply("What email address should we use? You can skip this.", { reply_markup: skip }); return; }
  if (step === "booking_email") { ctx.session.booking = { ...ctx.session.booking, email: text }; await preview(ctx); return; }
  await next();
});
export default composer;
