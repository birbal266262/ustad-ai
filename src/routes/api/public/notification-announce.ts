/**
 * Notification ANNOUNCEMENT broadcast — server ops entry point.
 *
 * Reuses the same shared-secret convention as the other `/api/public/*`
 * schedulers (guarded by LOVABLE_CRON_SECRET). This lets a server task push a
 * "New Feature" or "Important Update" announcement to every real active guest
 * without the browser ever being able to forge one — there is no guest token
 * path to this route.
 *
 * Body:
 *   { type: "new_feature" | "important_update",
 *     key: "<stable dedupe key>",
 *     featureName?: string,
 *     message?: string,          // fills the template body when provided
 *     openPath?: string }        // optional existing-page button target
 */
import { createFileRoute } from "@tanstack/react-router";
import { broadcastAnnouncement } from "@/lib/notification.server";

export const Route = createFileRoute("/api/public/notification-announce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        const provided = request.headers.get("x-cron-secret");
        if (!secret || provided !== secret) return new Response("Unauthorized", { status: 401 });
        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const type = body["type"];
          if (type !== "new_feature" && type !== "important_update") {
            return Response.json({ ok: false, error: "invalid type" }, { status: 400 });
          }
          const key = String(body["key"] ?? "").slice(0, 120);
          if (!key) return Response.json({ ok: false, error: "key required" }, { status: 400 });
          const vars: Record<string, string> = {};
          if (body["featureName"]) vars["featureName"] = String(body["featureName"]);
          if (body["message"]) vars["source"] = String(body["message"]);
          const announceOpts: {
            type: "new_feature" | "important_update";
            dedupeKey: string;
            vars: typeof vars;
          } = { type, dedupeKey: key, vars };
          if (body["openPath"]) {
            (announceOpts as Record<string, unknown>)["openPath"] = String(body["openPath"]);
          }
          const sent = await broadcastAnnouncement(announceOpts);
          return Response.json({ ok: true, sent });
        } catch (error) {
          console.error(error);
          return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
        }
      },
    },
  },
});
