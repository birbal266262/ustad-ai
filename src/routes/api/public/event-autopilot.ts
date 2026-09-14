/**
 * Cron entry point for the never-ending event stream.
 *
 * Reuses the EXISTING scheduled-job convention in this repo (same shared secret
 * header as `/api/public/exam-scheduler`), so there is still only one cron
 * mechanism. One tick both keeps the event stream alive and delivers the
 * 3-day / 2-day / 1-day / LIVE reminders for the announced event.
 */
import { createFileRoute } from "@tanstack/react-router";
import { runEventAutopilotTick } from "@/lib/event-autopilot.server";
import { runNotificationSchedulerTick } from "@/lib/notification-scheduler.server";

export const Route = createFileRoute("/api/public/event-autopilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        const provided = request.headers.get("x-cron-secret");
        if (!secret || provided !== secret) return new Response("Unauthorized", { status: 401 });
        try {
          const events = await runEventAutopilotTick();
          const reminders = await runNotificationSchedulerTick();
          return Response.json({ ok: true, events, reminders });
        } catch (error) {
          console.error(error);
          return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
        }
      },
    },
  },
});
