# LeadCapture & Mini-CRM — Bot specification

**Archetype:** crm

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A lightweight Telegram bot to capture customer inquiries, present a small service catalog, accept simple booking requests or quote requests, and notify a single owner/admin chat where leads and bookings can be reviewed and updated; stores users, leads, services and bookings persistently for history and status tracking.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Small business owners
- Freelancers and local service providers
- End customers seeking quotes or appointments

## Success criteria

- New lead submissions are delivered to ADMIN_CHAT_ID immediately with actionable buttons
- Service browsing shows up to 8 items and each item exposes Request quote and Book actions
- Bookings/leads are persisted and visible in subsequent sessions (survive restarts)
- Owner can change lead/booking status (Accept/Reject/Ask for info) from the admin chat and status updates are sent to users
- Users receive confirmations and status updates for their submissions

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu and welcome message
  - outputs: main menu with Browse services, Book appointment, Contact us
- **Browse services** (button, actor: user, callback: catalog:list) — Open the service catalog (paginated, up to 8 items shown)
  - outputs: catalog list with view details buttons
- **Book appointment** (button, actor: user, callback: booking:start) — Begin the guided booking form (select service → date/time → contact → confirm)
  - inputs: service selection (button), date (force reply or typed), time (typed), name (optional from profile), phone (optional)
  - outputs: booking draft preview, confirmation and booking id
- **Contact us** (button, actor: user, callback: lead:start) — Open the free-text lead/contact form with optional contact fields
  - inputs: message (force reply), name (optional), phone (optional), email (optional)
  - outputs: lead submission confirmation, lead id
- **/help** (command, actor: user, command: /help) — Show brief usage and owner contact instructions
  - outputs: help text

## Flows

### Start & Main Menu
_Trigger:_ /start

1. Show welcome text and main menu buttons (Browse services, Book appointment, Contact us)
2. Track or create user profile (store Telegram id, name if available)

_Data touched:_ UserProfile

### Browse Services
_Trigger:_ callback catalog:list

1. Return paginated list of up to 8 service items with View / Request quote / Book buttons per item
2. On View: show details (description, price estimate) and actions
3. On Request quote: open contact form pre-filling selected service
4. On Book: start booking flow with selected service pre-filled

_Data touched:_ ServiceItem, Lead, Booking, UserProfile

### Guided Booking Form
_Trigger:_ callback booking:start or booking:from_service

1. Prompt user to confirm or choose service (buttons)
2. Prompt for preferred date (ForceReply / typed)
3. Prompt for preferred time (ForceReply / typed) — validate future datetime simply
4. Collect contact info (use profile fields or prompt name/phone/email)
5. Show booking preview and Confirm / Edit buttons
6. On Confirm: persist Booking (status: Pending) and notify ADMIN_CHAT_ID with action buttons (Accept / Reject / Ask for info)
7. Notify user: booking received and will be confirmed by owner

_Data touched:_ Booking, UserProfile, Lead

### Contact / Lead Submission
_Trigger:_ callback lead:start

1. Prompt for free-text message (ForceReply)
2. Prompt optional contact fields (name, phone, email) with quick-skip buttons
3. Show preview and Submit button
4. On Submit: create Lead (status: New), persist and notify ADMIN_CHAT_ID with Accept / Reject / Ask for info quick buttons
5. Send user confirmation with lead id

_Data touched:_ Lead, UserProfile

### Admin Lead/Booking Management
_Trigger:_ Admin chat receives notification and taps action button

1. Owner receives message containing lead/booking details and inline action buttons: Accept / Reject / Ask for info / View conversation
2. Owner taps Accept → system updates entity status to Accepted and notifies user
3. Owner taps Reject → system updates status to Rejected and optionally requests reason to send to user
4. Owner taps Ask for info → bot prompts owner to type follow-up; owner reply is forwarded to user and status set to InfoRequested
5. Owner reply messages (regular replies in admin chat) are appended to lead/booking conversation log and forwarded to the user

_Data touched:_ Lead, Booking, AdminActionLog

### Service Catalog Editing (Owner)
_Trigger:_ owner command or platform setting (outside bot flow)

1. Owner edits service entries via platform UI (seeded items available)
2. Changes update ServiceItem records and affect what users see in Browse flow

_Data touched:_ ServiceItem

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat id where owner/admin receives lead and booking notifications
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **UserProfile** _(retention: persistent)_ — Telegram user contact metadata and optional contact fields
  - fields: telegram_id, first_name, last_name, username, phone (optional), email (optional), created_at, last_seen
- **Lead** _(retention: persistent)_ — A lead/contact submission from a user (free-text message + optional selections)
  - fields: lead_id, user_telegram_id, message, selected_service_id (optional), preferred_datetime (optional string), contact_name, contact_phone, contact_email, status (New | InfoRequested | Accepted | Rejected), created_at, updated_at, admin_notes (array)
- **ServiceItem** _(retention: persistent)_ — Catalog entry describing a service the owner offers
  - fields: service_id, title, short_description, price_estimate (optional string), visible (bool), order_index
- **Booking** _(retention: persistent)_ — A user-requested appointment or booking tied to a service
  - fields: booking_id, service_id, user_telegram_id, preferred_date, preferred_time, contact_name, contact_phone, contact_email, status (Pending | Confirmed | Rejected | Cancelled), created_at, updated_at
- **AdminActionLog** _(retention: persistent)_ — Record of owner actions and replies for audit and forwarding
  - fields: action_id, admin_telegram_id, entity_type (Lead|Booking), entity_id, action (Accept|Reject|AskForInfo|Reply), message (optional), created_at

## Integrations

- **Telegram** (required) — Bot API messaging, inline callbacks, ForceReply and sending notifications
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Receive new lead and booking notifications in ADMIN_CHAT_ID
- Change lead/booking status via inline action buttons in admin chat
- Reply to leads/bookings from admin chat and have replies forwarded to user
- Edit service catalog (seeded items editable) via platform owner UI
- Enable/disable visibility of individual ServiceItems

## Notifications

- Notify ADMIN_CHAT_ID immediately when a new Lead is submitted (include Accept/Reject/Ask for info buttons)
- Notify ADMIN_CHAT_ID immediately when a new Booking is created (include Accept/Reject/Ask for info buttons)
- Notify user when their Lead/Booking is submitted (confirmation with id)
- Notify user when owner changes status or sends a follow-up reply

## Permissions & privacy

- Store user-provided contact info (name, phone, email) and messages to enable follow-up
- Owner/admin (ADMIN_CHAT_ID) will receive full lead/booking content and any user contact info
- Users must consent by submitting contact info; bot will include short privacy note at submission
- Data retention and deletion policy not defined — owner should configure through platform (missing field)

## Edge cases

- ADMIN_CHAT_ID not configured: submissions should be accepted locally (persisted) and user informed that owner notification is pending
- Owner offline: owner action buttons expire or owner replies delayed — status remains Pending
- User picks invalid or past date/time: validate and re-prompt; allow free-text but flag if clearly past
- Simultaneous bookings for same service/time are accepted as requests; owner must manually confirm to avoid double-booking
- Long messages exceed Telegram limits: truncate preview in admin notification and include 'view full' link to internal storage
- User abandons form mid-flow: partial draft saved for a short time (session) and owner not notified until submit
- User provides no contact details: still accept lead but mark as anonymous and inform owner

## Required tests

- Dialog-level acceptance test: user completes Contact form -> lead persisted -> ADMIN_CHAT_ID receives notification with correct payload and action buttons
- Dialog-level acceptance test: user browses services -> views details -> starts booking -> completes booking -> booking persisted and admin notified
- Admin action test: owner taps Accept/Reject/Ask for info -> entity status updates and user receives corresponding notification
- Persistence test: restart service and verify leads, bookings, services and user profiles remain available
- Validation test: booking date/time in the past triggers re-prompt and cannot be submitted

## Assumptions

- Single owner/admin destination is sufficient (one ADMIN_CHAT_ID)
- Service catalog is small (seed up to 6 items) and edited via platform owner UI not in-chat complex flows
- Booking availability is confirmed manually by owner; no external calendar integration
- Date/time are captured as user-typed or simple prompts and validated only for being in the future
- No payment processing required initially
- Bot language/locale defaults to owner's chosen locale but localization details are not specified
