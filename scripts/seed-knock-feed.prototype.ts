/**
 * PROTOTYPE — THROWAWAY (ticket #17). Pushes a few catalogue Notifications
 * into the REAL Knock in-app feed, so the Feed variants render live vendor
 * data instead of database fixtures.
 *
 * Needs one manual dashboard step first (Knock has no API for creating
 * workflows without a `knock_st_` management token, which we don't have):
 *
 *   1. dashboard.knock.app → Workflows → Create workflow
 *        Name: Cadence notification     Key: cadence-notification
 *   2. Add a step → In-app feed → pick the Cadence feed channel
 *   3. In the step's template, set the body to   {{ body }}
 *      and the action URL to                     {{ action_url }}
 *   4. Commit it to the development environment (Commits → Commit all changes).
 *      Without the commit, triggering 404s with `workflow_missing`.
 *
 * Then:  npx tsx scripts/seed-knock-feed.prototype.ts <cadence-user-id>
 */

const WORKFLOW_KEY = process.env.KNOCK_WORKFLOW_KEY ?? "cadence-notification";
const apiKey = process.env.KNOCK_API_KEY;

if (!apiKey) {
  console.error("KNOCK_API_KEY missing — run with: npx tsx --env-file=.env " + process.argv[1]);
  process.exit(1);
}

const recipientId = process.argv[2];
if (!recipientId) {
  console.error("usage: npx tsx --env-file=.env scripts/seed-knock-feed.prototype.ts <user-id>");
  process.exit(1);
}

/** A slice of the v1 catalogue (ticket #13): one line of copy, one destination. */
const catalogue = [
  {
    key: "lesson.added",
    body: "New lesson in Advanced TypeScript: Conditional types",
    action_url: "/courses/advanced-typescript/lessons/42",
    actor: null,
  },
  {
    key: "comment.replied",
    body: "Sarah Chen replied to your comment on Narrowing and guards",
    action_url: "/courses/advanced-typescript/lessons/39",
    actor: { id: "cadence-2", name: "Sarah Chen" },
  },
  {
    key: "question.asked",
    body: "Emma Wilson asked a question on Mapped types",
    action_url: "/instructor/questions",
    actor: { id: "cadence-5", name: "Emma Wilson" },
  },
  {
    key: "seat.claimed",
    body: "James Park claimed a seat on Advanced TypeScript",
    action_url: "/team",
    actor: { id: "cadence-6", name: "James Park" },
  },
  {
    key: "refund_request.raised",
    body: "Olivia Martinez asked for a refund on Design Systems",
    action_url: "/admin/refunds",
    actor: { id: "cadence-7", name: "Olivia Martinez" },
  },
];

for (const item of catalogue) {
  const res = await fetch(
    `https://api.knock.app/v1/workflows/${WORKFLOW_KEY}/trigger`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: [{ id: recipientId, name: `Cadence user ${recipientId}` }],
        ...(item.actor ? { actor: item.actor } : {}),
        data: { body: item.body, action_url: item.action_url, key: item.key },
      }),
    }
  );
  const json = await res.json();
  console.log(res.ok ? `✓ ${item.key}` : `✗ ${item.key}`, JSON.stringify(json));
  if (!res.ok) break;
}

export {};
