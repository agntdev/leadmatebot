import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getState } from "../data.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Browse services", data: "catalog:list", order: 10 });
const composer = new Composer<Ctx>();
async function show(ctx: Ctx, page = 0) {
  const state = await getState(ctx);
  const services = state.serviceIds.map((id) => state.services[id]).filter((s) => s?.visible).sort((a, b) => a.orderIndex - b.orderIndex);
  const start = page * 8; const shown = services.slice(start, start + 8);
  if (!shown.length) { await ctx.reply("No services are available yet. Tap Contact us to tell us what you need.", { reply_markup: inlineKeyboard([[inlineButton("Contact us", "lead:start")], [inlineButton("Back to menu", "menu:main")]]) }); return; }
  const rows = shown.map((s) => [inlineButton(s.title, `catalog:view:${s.serviceId}`)]);
  if (start + 8 < services.length) rows.push([inlineButton("Next", `catalog:page:${page + 1}`)]);
  if (page > 0) rows.push([inlineButton("Previous", `catalog:page:${page - 1}`)]);
  rows.push([inlineButton("Back to menu", "menu:main")]);
  await ctx.reply("Choose a service to see details.", { reply_markup: inlineKeyboard(rows) });
}
composer.callbackQuery("catalog:list", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery(/^catalog:page:\d+$/, async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx, Number(ctx.callbackQuery.data.split(":")[2])); });
composer.callbackQuery(/^catalog:view:/, async (ctx) => {
  await ctx.answerCallbackQuery(); const sid = ctx.callbackQuery.data.slice("catalog:view:".length); const s = (await getState(ctx)).services[sid];
  if (!s || !s.visible) { await ctx.reply("That service is no longer available. Tap Browse services to see the current list."); return; }
  await ctx.reply(`${s.title}\n${s.shortDescription}${s.priceEstimate ? `\n${s.priceEstimate}` : ""}`, { reply_markup: inlineKeyboard([[inlineButton("Request a quote", `catalog:quote:${sid}`), inlineButton("Book appointment", `catalog:book:${sid}`)], [inlineButton("Back to services", "catalog:list")]]) });
});
composer.callbackQuery(/^catalog:quote:/, async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Tell us what you need, and we’ll get back to you.", { reply_markup: inlineKeyboard([[inlineButton("Start contact form", `lead:start:${ctx.callbackQuery.data.slice(14)}`)], [inlineButton("Back to services", "catalog:list")]]) }); });
composer.callbackQuery(/^catalog:book:/, async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Let’s arrange your appointment.", { reply_markup: inlineKeyboard([[inlineButton("Start booking", `booking:from_service:${ctx.callbackQuery.data.slice(13)}`)], [inlineButton("Back to services", "catalog:list")]]) }); });
export default composer;
