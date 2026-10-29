import { Hono } from "hono";
import { z } from "zod";
import {
  advanceGame,
  createGame,
  getPublicState,
  loadGame,
  revealWord,
  startClues,
  startDiscussion,
  startVoting,
  submitClue,
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
    opponentCount: z
      .union([z.literal(3), z.literal(5), z.literal(7)])
      .optional(),
    players: z
      .array(
        z.object({
          type: z.enum(["ai", "manual"]),
          name: z.string().max(24).optional(),
        }),
      )
      .min(3)
      .max(8),
    ownName: z.string().max(24).optional(),
    suggestClues: z.boolean().optional(),
    timerSeconds: z.number().int().min(0).max(3600).optional(),
    categories: z.array(z.string().max(24)).max(3).optional(),
    difficulty: z.enum(["easy", "moderate", "hard"]).optional(),
    category: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);
  const types = new Set(parsed.data.players.map((p) => p.type));
  if (types.size > 1) {
    return c.json(
      { error: "Mixing AI and manual players is not supported" },
      400,
    );
  }
  const isManual = parsed.data.players.some((p) => p.type === "manual");
  if (isManual) {
    // Manual mode: every seat is a named player, 4/6/8 total, at least one human.
    if (![4, 6, 8].includes(parsed.data.players.length)) {
      return c.json({ error: "Manual games need 4, 6 or 8 players" }, 400);
    }
    if (!parsed.data.players.some((p) => p.type === "manual")) {
      return c.json(
        { error: "Manual games need at least one human player" },
        400,
      );
    }
  } else if (
    ![3, 5, 7].includes(parsed.data.players.length) ||
    parsed.data.players.length !== parsed.data.opponentCount
  ) {
    return c.json({ error: "Player count mismatch" }, 400);
  }
  const gameId = await createGame({
    userId,
    userName,
    ownName: parsed.data.ownName,
    opponentCount: parsed.data.opponentCount ?? parsed.data.players.length,
    players: parsed.data.players,
    suggestClues: parsed.data.suggestClues,
    timerSeconds: parsed.data.timerSeconds,
    categories: parsed.data.categories,
    difficulty: parsed.data.difficulty,
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

app.post("/:id/start-clues", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const res = await startClues(id, userId);
  if (!res.ok) return c.json({ error: "invalid" }, 400);
  const state = await getPublicState(id, userId);
  return c.json({ state });
});

app.post("/:id/start-discussion", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const res = await startDiscussion(id, userId);
  if (!res.ok) return c.json({ error: "invalid" }, 400);
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

app.post("/:id/reveal", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({ playerId: z.string() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);
  const result = await revealWord(id, parsed.data.playerId, userId);
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

app.post("/:id/define", async (c) => {
  const userId = (c as any).get("userId") as string;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    playerId: z.string().optional(),
    language: z.enum(["en", "hi", "es", "fr"]).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);
  const data = await loadGame(id);
  if (!data || data.game.userId !== userId)
    return c.json({ error: "Not found" }, 404);
  // Define the word of the requested player (owner-only game).
  const target = parsed.data.playerId
    ? data.players.find((p: any) => p.id === parsed.data.playerId)
    : data.players.find((p: any) => p.type === "human");
  if (!target) return c.json({ error: "Not found" }, 404);
  const completed = data.game.status === "completed";
  // Only ever define the word this player is allowed to see.
  const word = completed
    ? data.game.secretWord
    : target.isImposter
      ? data.game.imposterWord
      : data.game.secretWord;
  const { generateDefinition } = await import("@/server/services/ai");
  const definition = await generateDefinition(
    word,
    data.game.category,
    parsed.data.language ?? "en",
  );
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
  if ((data.game.config as any)?.suggestClues === false)
    return c.json({ error: "Suggestions are disabled" }, 400);
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
