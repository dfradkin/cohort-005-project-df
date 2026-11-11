# Research: what Knock gives us for in-app feeds

Resolves [#2](https://github.com/dfradkin/cohort-005-project-df/issues/2) (map: [#1](https://github.com/dfradkin/cohort-005-project-df/issues/1)). Read **2026-11-11** against Knock's own docs, API reference, pricing page and the `knocklabs/javascript` source. Knock is pre-decided — this is fact-finding, not a comparison.

> There was no existing convention for research notes in this repo (`docs/` held only `adr/` and `agents/`), so this file starts `docs/research/`.

Conventions in this file: claims are followed by the source that owns them. **Package versions read:** `@knocklabs/react@0.15.1`, `main` branch of `knocklabs/javascript`. Anything the docs do not say is marked **Unknown** rather than guessed.

---

## TL;DR for the map

1. Knock is a complete in-app feed backend: feed read API with cursor pagination, server-side read/seen/archived state, server-side unread/unseen/total counts, and a managed websocket the SDK wires up for you with no extra setup or tier gate.
2. The prebuilt React components are themeable through **~45 `--rnf-*` CSS variables** and `rnf-`-prefixed classes, but `NotificationIconButton` takes **no `className` and hardcodes Knock's own bell SVG** — for a sidebar bell we should build the trigger ourselves and keep `NotificationFeedPopover` (or go headless for the dropdown too). Not a Tailwind-native component set; Tailwind is not mentioned anywhere in the styling docs.
3. Recipients **can** be created lazily — inline identification on the trigger "enables lazy recipient creation". Ids are strings up to 256 chars, so `String(user.id)` works, but **ids are permanent and reused-after-reseed ids will inherit the previous user's feed**. We should namespace the id.
4. **No local emulator, no offline mode, no mock package.** Sandbox mode and the test runner both still call Knock. Offline Vitest has to come from our own transport seam — but `KnockProvider` ships an `enabled` prop that keeps the client fully idle (no API calls, no socket), which is a ready-made no-key fallback for the UI.
5. Workflows can be created as code (management API `PUT`, or CLI `push`), so new notification types do **not** require manual dashboard work — but the in-app **channel** itself is created in the dashboard once, and **API triggers only ever run the last committed version**.
6. Free tier: 10,000 messages/month, unlimited stored profiles/workflows/environments, 30-day log retention, in-app feed items retained **indefinitely**. The one Free-tier gate that touches our UI: **"Powered by Knock" branding is forced into `NotificationFeed`** on Free.

---

## 1. Feed API

**Endpoint.** `GET /v1/users/{user_id}/feeds/{id}`, where `id` is the **in-app feed channel's UUID** (not a feed name). Returns a paginated list of the user's feed items, newest first, plus feed metadata. If the user has not been identified in Knock, the endpoint returns an **empty feed** (not an error). Rate-limit tier 2, scoped per user and per environment. — [List feed items](https://docs.knock.app/api-reference/users/feeds/list_items)

**Auth.** The feed endpoint is documented as a client-side call: publishable key (`pk_`) plus a user token. Public keys "can safely be made public in any of your client-side code"; secret keys (`sk_`) must never reach the client. Keys are per-environment. — [API keys](https://docs.knock.app/developer-tools/api-keys), [Authentication](https://docs.knock.app/api-reference/overview/authentication)

**Pagination.** Cursor-based: `after` / `before` cursors plus `page_size` (default 50). The response carries `page_info: { after, before, page_size }`, and each item carries its own `__cursor`. The client SDK exposes `fetchNextPage()` on top of this. — [List feed items](https://docs.knock.app/api-reference/users/feeds/list_items), [`packages/client/src/clients/feed/interfaces.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/interfaces.ts), [`feed.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts)

**Filters.** `status` (`unread` | `read` | `unseen` | `seen` | `all`), `source` (workflow key), `tenant`, `has_tenant`, `workflow_categories`, `archived` (`include` | `exclude` | `only`), `trigger_data` (JSON string, flat key/values only), `inserted_at.gt/gte/lt/lte`, `exclude` (field paths to omit, max depth 3), `mode`, `locale` (Enterprise + custom translations only). — [List feed items](https://docs.knock.app/api-reference/users/feeds/list_items), [`interfaces.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/interfaces.ts)

**What an item carries.** The authoritative shape is the `FeedItem` interface in the client source:

| Field | Notes |
| --- | --- |
| `id`, `__cursor` | `id` is the Knock message id — this is what the message-status endpoints take |
| `inserted_at`, `updated_at` | ISO strings |
| `read_at`, `seen_at`, `clicked_at`, `interacted_at`, `link_clicked_at`, `archived_at` | `string \| null` — engagement state lives on the item |
| `blocks` | `ContentBlock[]`: `markdown` / `text` (each with `content` + `rendered` HTML) or `button_set` (`buttons: { name, label, action }[]`) |
| `actors`, `total_actors` | `Recipient[]`; the trigger's `actor` |
| `activities`, `total_activities` | **Only present in `rich` mode** |
| `data` | the workflow trigger data |
| `source` | `{ key, version_id, categories }` — `key` is the workflow key |
| `tenant` | `string \| null` |

— [`interfaces.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/interfaces.ts)

**Metadata.** `meta: { total_count, unread_count, unseen_count }` (`FeedMetadata`). — same source

**`mode` gotcha.** The API's default is `rich`, but the React/JS client overrides it: `feedClientDefaults = { archived: "exclude", mode: "compact" }`. In `compact` mode `activities` / `total_activities` are dropped, `data` loses nested arrays and objects, and `actors` is capped at one. **If we render anything from nested `data`, we must pass `{ mode: "rich" }` to `useNotifications`.** — [List feed items](https://docs.knock.app/api-reference/users/feeds/list_items) vs [`feed.ts` L39-41](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts)

**Response shaping is a dashboard setting.** By default the feed API returns all actors with their custom properties, public environment variables, the full trigger data, and the recipient with its custom properties. Trimming that is an "API response filter" JSON blob entered **per environment in the dashboard** under Channels and sources → the in-app channel → Advanced. It is not an API-level or as-code setting. — [In-app feeds integration](https://docs.knock.app/integrations/in-app/feeds)

---

## 2. React components

**Packages.** `@knocklabs/react` (prebuilt UI) → `@knocklabs/react-core` (hooks/providers) → `@knocklabs/client` (`Knock`, `Feed`, stores, socket). Server-side triggering is a separate SDK, `knock-node`. — [SDKs](https://docs.knock.app/developer-tools/sdks)

**What ships.** From `packages/react/src/modules/feed/components`: `NotificationIconButton`, `UnseenBadge`, `NotificationFeedPopover`, `NotificationFeed`, `NotificationFeedContainer`, `NotificationCell`, `EmptyFeed`. So yes — bell, badge, popover and feed list all exist prebuilt. — [source tree](https://github.com/knocklabs/javascript/tree/main/packages/react/src/modules/feed/components), [React feed docs](https://docs.knock.app/in-app-ui/react/feed)

**Wiring.** `<KnockProvider apiKey user={{ id }}>` → `<KnockFeedProvider feedId={channelId} colorMode>` → components. Requires a public API key and the in-app feed **channel UUID** from the dashboard. `@knocklabs/react/dist/index.css` must be imported unless you replace the styling wholesale. — [React feed docs](https://docs.knock.app/in-app-ui/react/feed)

**Compatibility with Cadence.** `peerDependencies` are `react`/`react-dom` `^17 || ^18 || ^19` (Cadence is on React 19.2) and `next` / `@tanstack/react-router`, both marked `optional: true` in `peerDependenciesMeta` — so a React Router v8 app installs cleanly. There is a `@knocklabs/react/next` and `/tanstack` entry point but **no React Router entry point**; we use the base export. — [`packages/react/package.json`](https://github.com/knocklabs/javascript/blob/main/packages/react/package.json)

### How themeable is it? (high-value for the sidebar bell)

Three documented levers, in increasing order of effort:

1. **CSS variables.** Override `--rnf-*` variables. Counted in `packages/react/src/theme.css`: **~45** `--rnf-*` tokens — font sizes, spacing (fixed px: `--rnf-spacing-1: 4px` … `--rnf-spacing-8: 42px`), font weights, `--rnf-font-family-sanserif` (defaults to Inter), three border radii, shadows, and a small gray palette (`--rnf-color-gray-100..900`, `--rnf-color-white`). Note the same file also contains a much larger `--knock-*` token set used by Knock's newer Telegraph-based components; the feed components read the `--rnf-*` ones. — [`theme.css`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/theme.css), [Feed styling](https://docs.knock.app/in-app-ui/feeds/styling)
2. **Replace the stylesheet.** Every feed class is `rnf-`-prefixed (`.rnf-notification-feed`, `.rnf-notification-feed__header`, `.rnf-dropdown`, `.rnf-mark-all-as-read`, `.rnf-notification-icon-button`, plus `--dark` variants). Drop the Knock CSS import and write our own against those classes. — [`NotificationFeed/styles.css`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/styles.css), [Feed styling](https://docs.knock.app/in-app-ui/feeds/styling)
3. **Render overrides on `NotificationFeed`.** The actual prop surface, read from source: `renderItem`, `renderHeader`, `renderLoading`, `EmptyComponent`, `initialFilterStatus`, `formatTimestamp`, `onNotificationClick`, `onNotificationButtonClick`, `onMarkAllAsReadClick` (`header` is deprecated in favour of `renderHeader`). `NotificationFeedPopover` extends all of those and adds `isVisible`, `onOpen`, `onClose`, `buttonRef`, `closeOnClickOutside`, `placement` (Popper placement, default `bottom-end`). — [`NotificationFeed.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx), [`NotificationFeedPopover.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx)

**What has to be rebuilt by hand — the sidebar bell.** `NotificationIconButton`'s entire prop surface is `{ badgeCountType?, onClick }`. It takes **no `className`, no `style`, no `children`, and no icon slot**; it renders a hardcoded `<BellIcon />` inside `className={"rnf-notification-icon-button rnf-notification-icon-button--" + colorMode}` with a hardcoded `aria-label="Open notification feed"`. For a bell that sits inside Cadence's existing sidebar nav and matches shadcn/Tailwind, the realistic plan is: **write our own trigger button** (`lucide-react` Bell, already a dependency, plus our own badge or Knock's `UnseenBadge`) and pass its ref as `buttonRef` to `NotificationFeedPopover`. Styling `rnf-notification-icon-button` from outside is possible but fights a component we cannot pass classes to. — [`NotificationIconButton.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationIconButton/NotificationIconButton.tsx)

**Tailwind: Unknown / not supported.** Knock's styling docs never mention Tailwind, and no component accepts a `className`. Tailwind can only reach these components via global CSS targeting `rnf-` classes (e.g. `@apply` in our own stylesheet), not via utility classes on the components. — [Feed styling](https://docs.knock.app/in-app-ui/feeds/styling)

**Headless escape hatch.** `useKnockClient()` / `useAuthenticatedKnockClient()`, `useNotifications(knock, channelId, options)` → `Feed`, `useNotificationStore(feedClient, selector?)` → `{ items, metadata, pageInfo, loading, networkStatus }`. Going headless keeps the data store, the API calls and the socket; we build 100% of the markup. The docs explicitly frame this as "completely custom feed experience" without "needing to build any of the backend infrastructure". — [Custom feed UI](https://docs.knock.app/in-app-ui/feeds/custom-ui), [`useNotifications`](https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notifications), [`useNotificationStore`](https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notification-store)

**Translations.** `i18n` on `KnockProvider`; default locale `en` and **no other translations ship out of the box**. Custom translations as a Knock feature are Enterprise. Not relevant to Cadence today. — [React feed docs](https://docs.knock.app/in-app-ui/react/feed), [Knock plans](https://docs.knock.app/manage-your-account/knock-plans)

---

## 3. Real-time transport

**Included, and automatic.** Knock runs a managed websocket service; when a message lands on an in-app feed channel it pushes the update to the connected client. "The SDKs manage the socket automatically, including connection lifecycle, reconnection logic, and message delivery." No separate service, no extra credential beyond the public key. — [Socket behavior](https://docs.knock.app/in-app-ui/feeds/socket-behavior)

**Setup needed: none beyond the providers.** `KnockProvider` + `KnockFeedProvider` (or `useNotifications` + `feedClient.listenForUpdates()` if headless) is the whole setup. `feed.ts` exposes `listenForUpdates()`, `teardown()`, `dispose()`, `reinitialize()`, and `on` / `off` event subscription. — [`feed.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts), [`useNotifications`](https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notifications)

**Options.** Passed via `defaultFeedOptions` on `KnockFeedProvider`: `auto_manage_socket_connection` (disconnect inactive tabs, with an optional delay) and `__experimentalCrossBrowserUpdates` (sync feeds across tabs/windows via `BroadcastChannel` — note the `__experimental` prefix in the type itself). — [React feed docs](https://docs.knock.app/in-app-ui/react/feed), [`interfaces.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/interfaces.ts)

**Tier gating: none found.** Neither the socket docs, the plans page, nor the pricing page lists real-time / websockets as a paid feature, and real-time is not in the Enterprise-only list. **Treated as available on Free.** No per-plan connection limit is documented — **Unknown**. — [Knock plans](https://docs.knock.app/manage-your-account/knock-plans), [Pricing](https://knock.app/pricing)

**No documented polling fallback.** The socket docs mention no polling interval or HTTP fallback. If the socket is down, the data still arrives on the next `feedClient.fetch()` — which `NotificationFeed` runs on mount and on filter change — so the map's "must appear on next navigation" bar is met by the fetch, not the socket. — [Socket behavior](https://docs.knock.app/in-app-ui/feeds/socket-behavior), [`NotificationFeed.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx)

**Verdict for the map's open question:** the socket costs us nothing to turn on and nothing to leave on. It is not a decision that needs a ticket.

---

## 4. Recipient identification

**Lazy creation: yes.** Three identification paths — direct (`PUT /v1/users/{user_id}`), bulk (`POST /v1/users/bulk/identify`), and **inline**, where a full recipient object is passed in the `recipients` / `actor` of a workflow trigger. The docs state inline identification "enables lazy recipient creation within Knock" and that "Knock guarantees that recipients are identified before executing any other action". So a first notify can create the user; no up-front sync job is required. — [Identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients), [Triggering workflows via API](https://docs.knock.app/send-notifications/triggering-workflows/api)

Inline objects require `id` (plus `collection` for objects); optional `channel_data`, `preferences`, `$trigger_data`, and arbitrary properties. Passing a bare string id is identification-by-reference only — it does **not** create or update the user's traits. Max 1000 recipients per trigger; bulk trigger is not supported. — same sources

**Client-side lazy identify too.** `KnockProvider`'s default `identificationStrategy` is `"inline"`: when `user` is an object with an `id`, `Knock.authenticate()` calls `user.identify(properties)` from the browser. `"skip"` disables it. So if we want the server to own user traits, pass `identificationStrategy: "skip"` and only identify server-side. — [`knock.ts` L116-180](https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts), [`KnockProvider.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/context/KnockProvider.tsx)

**Id format — and the reseed problem.** Documented constraints on a user `id`:

- Use your internal identifier, e.g. a primary key. Max **256 characters**. Cannot contain `/` or `#`.
- **Cannot be changed once set.** The docs warn against transient values.
- Unique **per environment**; environments are fully isolated, so the same user must be identified in each.
- The docs show a string example (`user_1234567890`) and **never state a type**. The API treats `user_id` as a string path parameter. Cadence's autoincrement integers are therefore fine as `String(user.id)` — **Unknown** whether a raw JSON integer is accepted in an inline recipient object; serialise to string and the question disappears.
- Properties merge deeply on every upsert; **existing properties cannot be removed**, only overwritten (setting `null` overwrites the value). Custom properties cap at 256 kB total.
- The docs **do not say** what happens when an id is reused after a user is deleted — **Unknown**.

— [Concepts: users](https://docs.knock.app/concepts/users), [Identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients)

> **Consequence for Cadence.** `npm run db:seed` drops and recreates SQLite, so user id `3` is a different human after every reseed — but Knock's user `3` is permanent, keeps its old properties (which cannot be deleted, only overwritten) and keeps its old feed items (which are retained indefinitely, see §7). A fresh dev database would open onto the previous developer's notifications. Mitigations the docs support: (a) namespace the Knock id, e.g. `cadence_dev_<seedRunId>_<userId>`, so a reseed yields fresh recipients; (b) point local dev at the Knock **development** environment, which is isolated from production but *not* from the previous reseed; (c) use a stable non-reused key instead of the autoincrement id. This is the one place Cadence's data model genuinely collides with Knock's, and it is worth a decision.

**Default security posture is wide open.** With enhanced security mode off (the default), "a request with your public key can act as any user" — the public key alone can read and mutate any user's feed. Enhanced security mode requires a backend-signed RS256 JWT (`sub` = user id, optional `grants`), signed with a key from Platform → API keys, conventionally `KNOCK_SIGNING_KEY`; the Node SDK has `signUserToken` (default 1h expiry), and the client has an `onUserTokenExpiring` callback. Knock recommends enabling it before releasing an in-app feed, and supports leaving it off in the development environment only. **No tier gate is documented for enhanced security mode or signing keys** — it is not in the Enterprise-only list — but the docs never state plan availability explicitly, so: available as far as we can tell, **not confirmed**. — [In-app security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication), [Knock plans](https://docs.knock.app/manage-your-account/knock-plans)

---

## 5. Read state

**All of it is server-side.** Knock tracks three engagement statuses per feed message — **unseen** (not yet rendered), **seen** (rendered, not read), **read** (clicked, or marked via mark-all-as-read) — plus **archived** as a separate axis (an archived message leaves the feed; it is excluded from the default feed request and retrievable with `archived: only`). Interacted and link-clicked are tracked as separate click events. — [In-app feeds integration](https://docs.knock.app/integrations/in-app/feeds)

**REST surface (Messages API).** Per message: `PUT`/`DELETE /v1/messages/{id}/seen`, `/read`, `/archived`, plus `PUT /v1/messages/{id}/interacted` (metadata: max 5 flat key/values). Batch: `POST /v1/messages/batch/{seen|unseen|read|unread|interacted|archived|unarchived}` with a `message_ids` array. — [Messages API reference](https://docs.knock.app/api-reference/messages)

**Client surface.** `Feed` exposes, verbatim from source: `markAsSeen`, `markAllAsSeen`, `markAsUnseen`, `markAsRead`, `markAllAsRead`, `markAsUnread`, `markAsInteracted`, `markAsArchived`, `markAllAsArchived`, `markAllReadAsArchived`, `markAsUnarchived`, `fetch`, `fetchNextPage`, `listenForUpdates`, `on`/`off`, `getState`, `teardown`, `dispose`, `reinitialize`. Each marker updates the store optimistically **and** issues the API call — single/few items go to `POST /v1/messages/batch/{status}`, while `markAll*` goes to the asynchronous bulk endpoint `POST /v1/channels/{channelId}/messages/bulk/{status}`, scoped to the current user and the feed's current filters so it only touches what is in view. The source itself flags a race: a message arriving mid-bulk-update can leave the count non-zero. — [`feed.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts), [`messages/index.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/messages/index.ts)

**Counts.** `metadata.unread_count`, `metadata.unseen_count`, `metadata.total_count` come from the feed endpoint's `meta`. The **badge defaults to `unseen`**, not unread — `NotificationIconButton` takes `badgeCountType`, and you must pass `badgeCountType="unread"` to count unread instead. For Cadence's "unread badge count" requirement, that prop is mandatory. — [List feed items](https://docs.knock.app/api-reference/users/feeds/list_items), [React feed docs](https://docs.knock.app/in-app-ui/react/feed), [`NotificationIconButton.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationIconButton/NotificationIconButton.tsx)

**Default behaviours to know.** `NotificationFeedPopover`'s default `onOpen` calls `markAllAsSeen()` when `unseen_count > 0` — opening the dropdown clears the (default) badge, which is probably not what "mark as read" means to a user. Items are marked **read** automatically when the feed is opened, when an item is clicked, or when a button inside it is clicked. Both are overridable via `onOpen` / `onNotificationClick`. — [`NotificationFeedPopover.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx), [Handling feed interactivity](https://docs.knock.app/in-app-ui/feeds/handling-interactivity)

**Content is immutable.** A sent feed message's content and metadata cannot be edited; only engagement status can change. To correct an outdated notification you archive it and re-trigger. — [In-app feeds integration](https://docs.knock.app/integrations/in-app/feeds)

---

## 6. Triggering: dashboard or as-code?

**Trigger call.** `POST /v1/workflows/{key}/trigger`, Bearer-authenticated with the secret key, rate-limit tier 5. Body: `recipients` (required, up to 1000), `actor`, `data` (any JSON, 10 MB cap), `tenant`, `cancellation_key`, `settings: { sandbox_mode, skip_delay }` (both default `false`). Returns `{ workflow_run_id }`; runs are asynchronous. Inline identification applies to `recipients`, `actor` and `tenant`. Per-recipient `$trigger_data` merges over the top-level `data`. — [Trigger workflow](https://docs.knock.app/api-reference/workflows/trigger), [Triggering workflows via API](https://docs.knock.app/send-notifications/triggering-workflows/api)

**The workflow must exist — but it does not need a human in the dashboard.** Two as-code paths:

- **Management API:** `PUT /v1/workflows/{workflow_key}` — "Updates a workflow of a given key, or creates a new one if it does not yet exist." The body includes `steps` (`type: "channel"`, `channel_key: "in-app-feed"`, `template` with `markdown_body` / `action_url`), and query params `environment`, `branch`, `commit`, `commit_message`, `allow_empty`, `force`. Authenticated with an account-level **service token** (`knock_st_`, created by an owner/admin in Settings → Service tokens; full management-API access, no granular scopes). — [Upsert workflow (mAPI)](https://docs.knock.app/mapi-reference/workflows/upsert), [Service tokens](https://docs.knock.app/developer-tools/service-tokens)
- **Knock CLI:** `knock push` upserts all local resource files (workflows, partials, layouts, translations, guides, message types, …) from the directory in `knock.json`, with `--commit -m`, `--environment`, `--force`. Workflow definitions can therefore live in this repo and be pushed from CI. — [CLI push](https://docs.knock.app/cli/resources/push)

**The commit model is the real constraint.** "API-triggered runs use the last committed version, not the last saved draft… To test changes through the API, you must commit them." Saving a draft affects only the dashboard test runner. So every new notification type needs a *commit* (which `push --commit` or `PUT ?commit=true` can do), and if production is configured read-only the change must be created in development and **promoted** up the environment chain. — [Commits](https://docs.knock.app/version-control/commits), [Environments](https://docs.knock.app/version-control/environments)

**Irreducible manual dashboard work.** Per the docs we read, the following are dashboard-only: creating/configuring the **in-app feed channel** and reading its UUID; the per-environment **API response filter**; enabling environments; generating API keys, the signing key and service tokens. **Everything else about a notification type — workflow, steps, in-app template — can be code.** Whether channel *creation* has a management-API equivalent is **Unknown**; the in-app feeds page only describes finding and configuring an existing channel.

**Answer to the ticket's worry:** no, each new notification type does **not** require manual dashboard work — but it does require a commit, and it requires the channel to have been set up once.

---

## 7. Local dev and testing

**There is no local emulator, no test mode, and no offline mode.** Nothing in the docs or in `knocklabs/javascript` provides one, and the monorepo ships no test/mock package (`packages/`: `client`, `react`, `react-core`, `react-native`, `expo`, `types`, plus config packages). What Knock *does* offer:

- **Sandbox mode** (`settings.sandbox_mode: true` on a trigger, or forced in the dashboard test runner): Knock still runs the workflow and generates the messages, it just doesn't hand them to providers. **It is a server-side call to Knock, not an offline mode.** — [Testing workflows](https://docs.knock.app/send-notifications/testing-workflows), [Triggering workflows via API](https://docs.knock.app/send-notifications/triggering-workflows/api)
- **Dashboard test runner** — pick recipient/actor/tenant/data and run; can re-run a past run from the debugger; can run a single channel step; uses the last **saved** version, unlike the API. — [Testing workflows](https://docs.knock.app/send-notifications/testing-workflows)
- **`knock workflow run`** via the CLI — still generates real workflow runs against Knock. — [Testing workflows](https://docs.knock.app/send-notifications/testing-workflows)
- **Isolated environments** (production + development, unlimited on every plan, each with its own keys, users and messages, never shared). The nearest thing to a sandbox, and still online. — [Environments](https://docs.knock.app/version-control/environments), [Pricing](https://knock.app/pricing)

**So Vitest offline is on us** — and the mailer pattern in `app/lib/mailer.server.ts` (Postmark when `POSTMARK_SERVER_TOKEN` is set, `.outbox/` JSON files otherwise) transfers directly: a notifier interface with a Knock implementation behind `KNOCK_SECRET_API_KEY` and a local no-op/record implementation when it is absent. Nothing in Knock's docs argues against that.

**Two SDK affordances worth knowing for the no-key path:**

- **`KnockProvider` has an `enabled` prop.** Documented in source: "When `false`, render children but keep the Knock client idle: no identify call, no API requests, and no websocket. Set it to `true` and it connects like a login; set it back to `false` and it disconnects like a logout. Defaults to `true`." `apiKey` is typed `string | undefined`. This is a first-class way for the sidebar bell to mount in a credential-free dev/test run without any network traffic — but note the children then have **no feed data**, so a local fallback feed still has to come from our own code. — [`KnockProvider.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/context/KnockProvider.tsx)
- **`host` override.** The `Knock` client takes a `host` option (default `https://api.knock.app`), surfaced as a `host` prop on `KnockProvider` — so the client can be pointed at a local stub server if we ever want integration tests against a fake Knock. — [`knock.ts` L23/L66](https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts), [`KnockProvider.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/context/KnockProvider.tsx)
- Guard rail: the client **throws** if given a key starting with `sk_`, so a mis-set env var fails loudly rather than leaking the secret key to the browser. — [`knock.ts` L74-75](https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts)

**Seeding a dev feed** (the map's open question) has no Knock-provided mechanism beyond triggering real workflows against the development environment — i.e. it needs a network call and a key. An offline seed has to be our own fallback's data.

---

## 8. Free (Developer) tier limits and what is gated

The plan formerly called **Developer** is now just **Free**. Three plans: Free, Starter ($250/mo + usage), Enterprise (custom). — [Knock plans](https://docs.knock.app/manage-your-account/knock-plans), [Pricing](https://knock.app/pricing)

| | Free | Starter | Enterprise |
| --- | --- | --- | --- |
| Price | $0, no credit card | $250/mo + usage | custom, annual |
| Messages sent / month | **10,000** | 50,000 then $0.005 each | volume-based |
| Guide recipients / month | 500 | 2,500 then $0.05 each | negotiated |
| Agent credits / month | 500 | 2,000 then $0.01 each | bulk |
| Log retention | **30 days** | 30 days | 90 days |
| Stored profiles (recipients) | **unlimited** | unlimited | unlimited |
| Workflows, environments, team members | **unlimited** | unlimited | unlimited |
| Uptime SLA | 99.9% | 99.9% | on request |

— [Pricing](https://knock.app/pricing)

**What "10,000 messages" means for us.** A message is counted "each time a notification is successfully delivered to one user on one channel", and usage accrues in **any** environment (development included). So one trigger fanned to 30 students = 30 messages, and local dev testing eats the same budget. Guide views don't count. Overages are **not hard-capped** — Knock says it will contact you about billing rather than cutting you off. — [Knock plans](https://docs.knock.app/manage-your-account/knock-plans), [Pricing](https://knock.app/pricing)

**Retention.** Message *log* data (contents, events, delivery logs, activities), workflow run logs, source event logs, webhook logs, audit logs: 30 days on Free/Starter, 90 on Enterprise. API logs: 30 days on all plans. **In-app feed messages (`FeedItem` data) are retained indefinitely** — after log data expires the item is still fetchable from the feed endpoint and its status still updatable, it just disappears from the Dashboard. Retention is **not configurable** on any plan. — [Data retention](https://docs.knock.app/manage-your-account/data-retention)

**Not available on Free** (from the pricing page's own exclusion list): removal of Knock branding, email client previews, priority support, custom roles, audit logs, SAML SSO, SCIM, translations (i18n), Enterprise SLAs, HIPAA/BAA. Enterprise-only per the plans page: per-tenant preferences/branding/guides, translations, batch render limits above 10 items, custom permission groups, SAML SSO, directory sync, warehouse export, and the Datadog/New Relic/Segment/Heap extensions. — [Pricing](https://knock.app/pricing), [Knock plans](https://docs.knock.app/manage-your-account/knock-plans)

### The one tier gate that lands in our UI: forced branding

`NotificationFeed` calls `useFeedSettings(feedClient)`, which `GET`s `/v1/users/{userId}/feeds/{feedId}/settings` and reads `features.branding_required`. When that flag is true the component renders a **"Powered by Knock"** link footer inside the feed:

```tsx
{settings?.features?.branding_required && (
  <div className="rnf-notification-feed__knock-branding">
    <a href={poweredByKnockUrl} target="_blank">{t("poweredBy") || "Powered by Knock"}</a>
  </div>
)}
```

Cross-referencing the pricing page — "removal of Knock branding" is listed as a Starter-and-up feature, absent from Free — **a Free-tier Cadence will show "Powered by Knock" in the dropdown feed** if we use the prebuilt `NotificationFeed`. The settings endpoint docs don't state what sets the flag, so the link between the flag and the plan is an inference from the pricing page, not something Knock writes down; but the direction is clear. Going headless side-steps it, since the branding lives in `NotificationFeed` itself. — [`NotificationFeed.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx), [`useFeedSettings.ts`](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/feed/hooks/useFeedSettings.ts), [Get feed settings](https://docs.knock.app/api-reference/users/feeds/get_settings), [Pricing](https://knock.app/pricing)

**Everything else the ticket asks about is available on Free:** feed API, cursor pagination, React components, websocket real-time, inline/lazy identification, full read/seen/archived state and counts, unlimited recipients and workflows, the management API / CLI / service tokens, multiple environments, and (as far as the docs say) enhanced security mode. Not tier-gated anywhere we could find.

---

## Open questions the docs do not answer

- What happens when a user `id` is **reused** after the original user was deleted in Knock — does the new user inherit the old feed? (Docs silent. Cadence's reseed makes this live.)
- Whether a JSON **integer** is accepted as an inline recipient `id` (docs only ever show strings and never state a type).
- Whether the in-app feed **channel** can be created via the management API, or only in the dashboard.
- Whether **enhanced security mode** is plan-gated (nothing says it is; nothing says it isn't).
- Any **websocket connection limit** per plan.
- What exactly sets `branding_required` on the feed-settings endpoint (inferred from the pricing page, not documented).
- Whether rate-limit **tier numbers map to the published per-second values in order** — the rate-limits page lists tiers and values but the extract we read didn't pair them unambiguously. Tier 2 (feed read) and tier 5 (workflow trigger) are therefore un-pinned. — [Rate limits](https://docs.knock.app/api-reference/overview/rate-limits)

## Sources

Knock docs (primary): [List feed items](https://docs.knock.app/api-reference/users/feeds/list_items) · [Get feed settings](https://docs.knock.app/api-reference/users/feeds/get_settings) · [Messages API](https://docs.knock.app/api-reference/messages) · [Trigger workflow](https://docs.knock.app/api-reference/workflows/trigger) · [Authentication](https://docs.knock.app/api-reference/overview/authentication) · [Rate limits](https://docs.knock.app/api-reference/overview/rate-limits) · [In-app feeds integration](https://docs.knock.app/integrations/in-app/feeds) · [Feed styling](https://docs.knock.app/in-app-ui/feeds/styling) · [Custom feed UI](https://docs.knock.app/in-app-ui/feeds/custom-ui) · [Handling interactivity](https://docs.knock.app/in-app-ui/feeds/handling-interactivity) · [Socket behavior](https://docs.knock.app/in-app-ui/feeds/socket-behavior) · [React feed](https://docs.knock.app/in-app-ui/react/feed) · [Headless React feed](https://docs.knock.app/in-app-ui/react/headless/feed) · [`useNotifications`](https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notifications) · [`useNotificationStore`](https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notification-store) · [In-app security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication) · [Concepts: users](https://docs.knock.app/concepts/users) · [Identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients) · [Triggering workflows via API](https://docs.knock.app/send-notifications/triggering-workflows/api) · [Testing workflows](https://docs.knock.app/send-notifications/testing-workflows) · [Environments](https://docs.knock.app/version-control/environments) · [Commits](https://docs.knock.app/version-control/commits) · [API keys](https://docs.knock.app/developer-tools/api-keys) · [Service tokens](https://docs.knock.app/developer-tools/service-tokens) · [SDKs](https://docs.knock.app/developer-tools/sdks) · [CLI push](https://docs.knock.app/cli/resources/push) · [Upsert workflow (mAPI)](https://docs.knock.app/mapi-reference/workflows/upsert) · [Knock plans](https://docs.knock.app/manage-your-account/knock-plans) · [Data retention](https://docs.knock.app/manage-your-account/data-retention) · [Pricing](https://knock.app/pricing)

Knock source (primary, `knocklabs/javascript@main`): [`client/src/knock.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts) · [`client/src/clients/feed/feed.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts) · [`client/src/clients/feed/interfaces.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/interfaces.ts) · [`client/src/clients/messages/index.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/messages/index.ts) · [`react-core/.../KnockProvider.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/context/KnockProvider.tsx) · [`react-core/.../useFeedSettings.ts`](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/feed/hooks/useFeedSettings.ts) · [`react/src/theme.css`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/theme.css) · [`react/.../NotificationFeed.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx) · [`react/.../NotificationFeed/styles.css`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/styles.css) · [`react/.../NotificationFeedPopover.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx) · [`react/.../NotificationIconButton.tsx`](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationIconButton/NotificationIconButton.tsx) · [`react/package.json`](https://github.com/knocklabs/javascript/blob/main/packages/react/package.json)
