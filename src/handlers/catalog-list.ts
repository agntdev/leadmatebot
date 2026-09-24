import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getData, type Service } from "../data.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Browse services", data: "catalog:list", order: 10 });
const composer = new Composer<Ctx>();
function catalog(services: Service[]) {
  const rows = services.slice(0, 8).map((s) => [inlineButton(s.title, `catalog:view:${s.id}`)]);
  rows.push([inlineButton("Book appointment", "booking:start"), inlineButton("Contact us", "lead:start")]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  return inlineKeyboard(rows);
}
async function list(ctx: Ctx) {
  const services = (await getData(ctx)).services.filter((s) => s.visible).sort((a, b) => a.order - b.order);
  if (services.length === 0) { await ctx.reply("There are no services available yet.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) }); return; }
  await ctx.reply("Choose a service to see details:", { reply_markup: catalog(services) });
}
composer.callbackQuery("catalog:list", async (ctx) => { await ctx.answerCallbackQuery(); await list(ctx); });
composer.callbackQuery(/^catalog:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const service = (await getData(ctx)).services.find((s) => s.id === ctx.match[1] && s.visible);
  if (!service) { await ctx.reply("That service is no longer available."); return; }
  await ctx.reply(`${service.title}\n${service.description}${service.price ? `\n${service.price}` : ""}`, { reply_markup: inlineKeyboard([[inlineButton("Request a quote", `lead:service:${service.id}`), inlineButton("Book this service", `booking:service:${service.id}`)], [inlineButton("View services", "catalog:list")]]) });
});
composer.callbackQuery(/^catalog:page:/, async (ctx) => { await ctx.answerCallbackQuery(); await list(ctx); });
export default composer;
