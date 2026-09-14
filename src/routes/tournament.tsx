import { createFileRoute } from "@tanstack/react-router";
import { TournamentBoard } from "@/components/TournamentBoard";

export const Route = createFileRoute("/tournament")({
  head: () => ({
    meta: [
      { title: "Mystery + Psychology Weekly Tournament | USTAD AI" },
      {
        name: "description",
        content:
          "Solve 20 AI-written mystery and psychology cases every week in USTAD AI. Four suspects, real clues, hidden score until case 20 — win coins, a trophy and a verified certificate.",
      },
      { property: "og:title", content: "USTAD Mystery + Psychology Tournament" },
      {
        property: "og:description",
        content:
          "Weekly detective tournament in USTAD AI: 20 cases, 12 correct to win, coins, trophy and certificate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <TournamentBoard
      kind="mystery"
      intro="20 unique cases every week. Four suspects, real clues, one right answer. Your score stays hidden until case 20."
    />
  ),
});
