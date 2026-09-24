import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { updateData, profileFrom } from "../data.js";
import { now } from "../time.js";

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

const WELCOME = "👋 Welcome! Tap a button below to get started.";

composer.command("start", async (ctx) => {
  const at = now();
  if (ctx.from) await updateData(ctx, (data) => {
    const existing = data.profiles.find((p) => p.id === ctx.from!.id);
    if (existing) { existing.lastSeen = at; existing.firstName = ctx.from!.first_name; existing.lastName = ctx.from!.last_name; existing.username = ctx.from!.username; }
    else data.profiles.push(profileFrom(ctx, at));
  });
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
