import { Hono } from "hono";
import { z } from "zod";
import {
  advanceGame,
  createGame,
  getPublicState,
  loadGame,
  startVoting,
  submitClue,
  submitGuess,
  submitVote,
} from "@/server/services/gameEngine";
import { requireAuth } from "../middleware/auth";

const app = new Hono();

app.use("*", requireAuth);

app.post("/create", async (c) => {
  const userId = (c as any).get("userId") as string;
  const userName = (c as any).get("userName") as string;
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    opponentCount: z.union([z.literal(3), z.literal(5), z.literal(7)]),
    players: z
      .array(z.object({ type: z.enum(["ai", "manual"]) }))
      .min(3)
      .max(7),
    category: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);
  if (parsed.data.players.length !== parsed.data.opponentCount) {
    return c.json({ error: "Player count mismatch" }, 400);
  }
  const gameId = await createGame({
    userId,
    userName,
    opponentCount: parsed.data.opponentCount,
    players: parsed.data.players,
    category: parsed.data.category,
  });
  const state = await getPublicState(gameId, userId);
  return c.json({ gameId, state });
});

app.get("/:id", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const state = await getPublicState(id, userId);
  if (!state) return c.json({ error: "Not found" }, 404);
  return c.json({ state });
});

app.post("/:id/advance", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  await advanceGame(id, userId);
  const state = await getPublicState(id, userId);
  if (!state) return c.json({ error: "Not found" }, 404);
  return c.json({ state });
});

app.post("/:id/clue", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    playerId: z.string(),
    clue: z.string().min(1).max(200),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);
  const res = await submitClue(
    id,
    parsed.data.playerId,
    parsed.data.clue,
    userId,
  );
  if (!res.ok) return c.json({ error: res.error }, 400);
  const state = await getPublicState(id, userId);
  return c.json({ state });
});

app.post("/:id/start-voting", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const res = await startVoting(id, userId);
  if (!res.ok) return c.json({ error: "invalid" }, 400);
  const state = await getPublicState(id, userId);
  return c.json({ state });
});

app.post("/:id/vote", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({ voterId: z.string(), targetId: z.string() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);
  const res = await submitVote(
    id,
    parsed.data.voterId,
    parsed.data.targetId,
    userId,
  );
  if (!res.ok) return c.json({ error: res.error }, 400);
  const state = await getPublicState(id, userId);
  return c.json({ state });
});

app.post("/:id/guess", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    playerId: z.string(),
    guess: z.string().min(1).max(50),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);
  const res = await submitGuess(
    id,
    parsed.data.playerId,
    parsed.data.guess,
    userId,
  );
  if (!res.ok) return c.json({ error: res.error }, 400);
  const state = await getPublicState(id, userId);
  return c.json({ state });
});

app.post("/:id/define", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const data = await loadGame(id);
  if (!data || data.game.userId !== userId)
    return c.json({ error: "Not found" }, 404);
  const human = data.players.find((p: any) => p.type === "human");
  const isImposter = human?.isImposter ?? false;
  const completed = data.game.status === "completed";
  // Only ever define the word this player is allowed to see.
  const word = completed
    ? data.game.secretWord
    : isImposter
      ? data.game.imposterWord
      : data.game.secretWord;
  const { generateDefinition } = await import("@/server/services/ai");
  const definition = await generateDefinition(word, data.game.category);
  if (!definition) return c.json({ error: "Could not define word" }, 502);
  return c.json({ definition });
});

app.post("/:id/suggest-clues", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const data = await loadGame(id);
  if (!data || data.game.userId !== userId)
    return c.json({ error: "Not found" }, 404);
  if (data.game.phase !== "clue" || data.game.status !== "in_progress")
    return c.json({ error: "Not your clue turn" }, 400);
  const turnOrder = data.game.turnOrder as string[];
  const currentId = turnOrder[data.game.currentTurnIndex];
  const current = data.players.find((p: any) => p.id === currentId);
  if (!current || current.type === "ai")
    return c.json({ error: "Not your clue turn" }, 400);
  // Only ever suggest for the word this player is allowed to see.
  const word = current.isImposter
    ? data.game.imposterWord
    : data.game.secretWord;
  const { generateClueSuggestions } = await import("@/server/services/ai");
  const suggestions = await generateClueSuggestions(
    word,
    data.game.category,
    data.clues.map((cl: any) => cl.clueText),
  );
  if (!suggestions.length)
    return c.json({ error: "Could not suggest clues" }, 502);
  return c.json({ suggestions });
});

export { app as gameRoutes };
// default export as Hono instance
export default app;
