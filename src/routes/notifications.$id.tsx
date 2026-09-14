/**
 * FULL DETAIL view for a single notification (notification system upgrade).
 *
 * List rows stay SHORT; clicking one opens this page which shows the complete,
 * clearly sectioned information. Structured sections are enriched server-side
 * from REAL configured data (a real event / coin offer) — never fabricated —
 * and everything is in the notification's stored language. The action button
 * deep-links to an EXISTING screen (there is no duplicate feature page).
 */
import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, BellRing, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { notificationDetailFn, notificationDeleteFn } from "@/lib/notification.functions";
import { UI_TEXT, ICON_OF, type Language, type NotificationType } from "@/lib/notification-spec";
import { useGuest } from "@/lib/ustad-client";

export const Route = createFileRoute("/notifications/$id")({
  head: () => ({
    meta: [
      { title: "Notification | USTAD AI" },
      { name: "description", content: "Full details for this notification." },
      { property: "og:title", content: "Notification — USTAD AI" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: NotificationDetailPage,
});

type DetailSection = { key: string; value: string };

type Detail = {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  language: Language;
  referenceType: string;
  referenceId: string;
  actionPath: string;
  metadata: Record<string, string | number | boolean | null>;
  isRead: boolean;
  createdAt: string;
  exactTime: string;
  sections: DetailSection[];
  openPath: string;
};

function NotificationDetailPage() {
  const { id } = useParams({ from: "/notifications/$id" });
  const router = useRouter();
  const { token, ready } = useGuest();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [language, setLanguage] = useState<Language>("english");
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!ready || !token || !id) return;
    let alive = true;
    (async () => {
      try {
        const r = (await notificationDetailFn({ data: { token, id } })) as Detail | null;
        if (!alive) return;
        if (!r) setNotFound(true);
        else {
          setDetail(r);
          setLanguage(r.language ?? "english");
        }
      } catch {
        if (alive) setNotFound(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, token, id]);

  const t = UI_TEXT[language];

  const onDelete = async () => {
    if (!token || !detail || deleting) return;
    setDeleting(true);
    try {
      await notificationDeleteFn({ data: { token, id: detail.id } });
      toast.success("Notification deleted.");
      void router.history.back();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  };

  if (notFound) {
    return (
      <AppShell>
        <PageHeader title="Notification" />
        <div className="flex flex-col items-start gap-4 px-4">
          <p className="text-sm text-muted-foreground">{t.noLongerAvailable}</p>
          <Link to="/">
            <Button variant="outline">{t.back}</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const icon = detail ? (ICON_OF[detail.type as NotificationType] ?? "🔔") : "🔔";
  const sectionLabel = (key: string): string =>
    (t[key as keyof typeof t] as string | undefined) ?? key;

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void router.history.back()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t.back}
        </button>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {detail?.exactTime ?? ""}
          </span>
          {detail ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleting}
              onClick={() => void onDelete()}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
              {t.delete}
            </Button>
          ) : null}
        </div>
      </div>

      {!detail ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <BellRing className="size-4 animate-pulse" /> {t.loading}
        </div>
      ) : (
        <div className="mx-auto max-w-2xl px-4 pb-10">
          {/* Hero: icon + title */}
          <div className="mb-6 flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-card text-2xl">
              {icon}
            </span>
            <div>
              <h1 className="text-xl font-bold">{detail.title}</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">{detail.exactTime}</p>
            </div>
          </div>

          {/* Short preview is the stored message; the real info is sectioned below */}
          {detail.message ? (
            <div
              data-testid="notification-detail-message"
              className="mb-6 whitespace-pre-line rounded-xl border border-border bg-card/60 px-4 py-3 text-sm"
            >
              {detail.message}
            </div>
          ) : null}

          {/* Structured full details */}
          {detail.sections.length > 0 ? (
            <dl data-testid="notification-detail-sections" className="space-y-3">
              {detail.sections.map((s, i) => (
                <div
                  key={`${s.key}-${i}`}
                  className="rounded-xl border border-border bg-card px-4 py-3"
                >
                  <dt className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                    {sectionLabel(s.key)}
                  </dt>
                  <dd className="mt-1 text-sm whitespace-pre-line">{s.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noDetails}</p>
          )}

          {/* Action button → existing screen */}
          {detail.openPath && detail.openPath !== "/" ? (
            <div className="mt-8">
              <Button asChild>
                {/* openPath is a known existing route; cast because it is dynamic. */}
                <Link to={detail.openPath as never}>{t.viewNow}</Link>
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
