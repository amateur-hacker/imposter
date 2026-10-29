import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { requireAuth } from "../middleware/auth";

const app = new Hono();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const userId = (c as any).get("userId") as string;
  const userGames = await db
    .select()
    .from(games)
    .where(eq(games.userId, userId))
    .orderBy(desc(games.startedAt));
  const total = userGames.length;
  const completed = userGames.filter((g) => g.status === "completed");
  const wins = completed.filter((g) =>
    g.winner === "crew" ? false : false,
  ).length; // placeholder
  // Determine user wins: if user was imposter and imposter won, or user crew and crew won.
  // Manual games have no single "you", so personal stats cover AI games only.
  const ranked = completed.filter((g) => (g.config as any)?.mode !== "manual");
  let userWins = 0;
  let imposterCount = 0;
  let imposterWins = 0;
  for (const g of ranked) {
    // human player is p0
    const userWasImposter = g.imposterPlayerId === "p0";
    if (userWasImposter) imposterCount++;
    const userWon = userWasImposter
      ? g.winner === "imposter"
      : g.winner === "crew";
    if (userWon) userWins++;
    if (userWasImposter && g.winner === "imposter") imposterWins++;
  }
  const losses = ranked.length - userWins;
  const winRate = ranked.length
    ? Math.round((userWins / ranked.length) * 100)
    : 0;
  const imposterLosses = imposterCount - imposterWins;
  return c.json({
    stats: {
      totalGames: total,
      completedGames: completed.length,
      wins: userWins,
      losses,
      winRate,
      imposterCount,
      imposterWins,
      imposterLosses,
      rankedGames: ranked.length,
    },
    recentGames: userGames.slice(0, 20).map((g) => ({
      id: g.id,
      category: g.category,
      secretWord: g.secretWord,
      opponentCount: g.opponentCount,
      winner: g.winner,
      status: g.status,
      phase: g.phase,
      startedAt: g.startedAt,
      endedAt: g.endedAt,
      durationSeconds: g.durationSeconds,
      imposterPlayerId: g.imposterPlayerId,
    })),
  });
});

app.get("/:id", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const [g] = await db.select().from(games).where(eq(games.id, id)).limit(1);
  if (!g || g.userId !== userId) return c.json({ error: "Not found" }, 404);
  // load players/clues/votes/guesses
  const { gamePlayers, clues, votes, guesses } = await import(
    "@/lib/db/schema"
  );
  const players = await db
    .select()
    .from(gamePlayers)
    .where(eq(gamePlayers.gameId, id));
  const clueRows = await db.select().from(clues).where(eq(clues.gameId, id));
  const voteRows = await db.select().from(votes).where(eq(votes.gameId, id));
  const guessRows = await db
    .select()
    .from(guesses)
    .where(eq(guesses.gameId, id));
  return c.json({
    game: g,
    players,
    clues: clueRows,
    votes: voteRows,
    guesses: guessRows,
  });
});

export { app as profileRoutes };
export default app;
