import { createFileRoute } from "@tanstack/react-router";
import { TournamentBoard } from "@/components/TournamentBoard";

export const Route = createFileRoute("/god-tournament")({
  head: () => ({
    meta: [
      { title: "USTAD GOD MASTER Weekly Tournament | USTAD AI" },
      {
        name: "description",
        content:
          "The hardest weekly contest in USTAD AI: 20 very hard reasoning questions, 16 correct to win, a God Tournament Ticket to enter, and USTAD GOD ranking titles.",
      },
      { property: "og:title", content: "USTAD GOD MASTER Tournament" },
      {
        property: "og:description",
        content:
          "20 extreme reasoning questions once a week. Win coins, a trophy, a verified certificate and the USTAD GOD title.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <TournamentBoard
      kind="god"
      intro="One match per week. 20 very hard reasoning questions, 16 correct to win. Entry needs coins plus one God Tournament Ticket from the shop."
    />
  ),
});
