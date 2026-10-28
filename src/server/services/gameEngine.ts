import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clues, gamePlayers, games, guesses, votes } from "@/lib/db/schema";
import { personalityForIndex } from "@/lib/game/personalities";
import { randomWord } from "@/lib/game/words";
import {
  generateClue,
  generateGuess,
  generateSecretWord,
  generateVote,
} from "./ai";

export type PlayerConfig = { type: "ai" | "manual" };

export interface CreateGameInput {
  userId: string;
  userName: string;
  opponentCount: number;
  players: PlayerConfig[];
  category?: string;
}

function uid(prefix = "p") {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

export async function createGame(input: CreateGameInput) {
  const { category, word } = await generateSecretWord();
  // related word for imposter (different from secret)
  let imposterWord = randomWord().word;
  if (imposterWord.toLowerCase() === word.toLowerCase()) {
    imposterWord = randomWord().word;
  }
  const total = input.opponentCount + 1;
  // players: index 0 = human user, then opponents
  const playerRows: {
    id: string;
    name: string;
    type: string;
    personality?: string;
    avatarSeed: string;
  }[] = [];
  playerRows.push({
    id: "p0",
    name: input.userName || "You",
    type: "human",
    avatarSeed: "human",
  });
  input.players.forEach((pc, i) => {
    const idx = i + 1;
    const pers = personalityForIndex(i);
    playerRows.push({
      id: `p${idx}`,
      name: pc.type === "ai" ? pers.name : `Player ${idx}`,
      type: pc.type,
      personality: pc.type === "ai" ? pers.trait : undefined,
      avatarSeed: `p${idx}`,
    });
  });

  const imposterIndex = Math.floor(Math.random() * total);
  const imposterId = playerRows[imposterIndex].id;

  // random turn order
  const turnOrder = playerRows.map((p) => p.id).sort(() => Math.random() - 0.5);

  const gameId = crypto.randomUUID();
  await db.insert(games).values({
    id: gameId,
    userId: input.userId,
    category,
    secretWord: word,
    imposterWord,
    imposterPlayerId: imposterId,
    opponentCount: input.opponentCount,
    config: { players: input.players, category },
    status: "in_progress",
    phase: "clue",
    turnOrder,
    currentTurnIndex: 0,
  });

  await db.insert(gamePlayers).values(
    playerRows.map((p, i) => ({
      id: p.id,
      gameId,
      playerIndex: i,
      name: p.name,
      type: p.type,
      isImposter: p.id === imposterId,
      personality: p.personality ?? null,
      avatarSeed: p.avatarSeed,
    })),
  );

  return gameId;
}

export async function loadGame(gameId: string): Promise<any> {
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  if (!game) return null;
  const players = await db
    .select()
    .from(gamePlayers)
    .where(eq(gamePlayers.gameId, gameId));
  const clueRows = await db
    .select()
    .from(clues)
    .where(eq(clues.gameId, gameId))
    .orderBy(clues.turnOrder);
  const voteRows = await db
    .select()
    .from(votes)
    .where(eq(votes.gameId, gameId));
  const guessRows = await db
    .select()
    .from(guesses)
    .where(eq(guesses.gameId, gameId));
  return {
    game,
    players,
    clues: clueRows,
    votes: voteRows,
    guesses: guessRows,
  };
}

function isAI(players: any[], id: string) {
  return players.find((p) => p.id === id)?.type === "ai";
}

export async function advanceGame(gameId: string, userId: string) {
  const data = await loadGame(gameId);
  if (!data) return null;
  const { game, players } = data;
  if (game.userId !== userId) return null;
  if (game.status !== "in_progress") return data;

  const current = data;
  const g = current.game;

  if (g.phase === "clue") {
    const turnOrder = g.turnOrder as string[];
    const idx = g.currentTurnIndex;
    if (idx >= turnOrder.length) {
      await db
        .update(games)
        .set({ phase: "discussion" })
        .where(eq(games.id, gameId));
      return await loadGame(gameId);
    }
    const pid = turnOrder[idx];
    if (!isAI(players, pid)) return current;
    const player = players.find((p: any) => p.id === pid)!;
    const prevClues = current.clues.map((c: any) => {
      const pl = players.find((p2: any) => p2.id === c.playerId);
      return { name: pl?.name || c.playerId, clue: c.clueText };
    });
    const ctx = {
      playerName: player.name,
      personality: player.personality || "balanced",
      secretWord: player.isImposter ? g.imposterWord : g.secretWord,
      isImposter: player.isImposter,
      category: g.category,
      previousClues: prevClues,
    };
    const clueText = await generateClue(ctx);
    await db.insert(clues).values({
      gameId,
      playerId: pid,
      clueText,
      turnOrder: idx,
    });
    const nextIndex = idx + 1;
    if (nextIndex >= turnOrder.length) {
      await db
        .update(games)
        .set({ currentTurnIndex: nextIndex, phase: "discussion" })
        .where(eq(games.id, gameId));
    } else {
      await db
        .update(games)
        .set({ currentTurnIndex: nextIndex })
        .where(eq(games.id, gameId));
    }
    return await loadGame(gameId);
  }

  if (g.phase === "vote") {
    const turnOrder = g.turnOrder as string[];
    const votedIds = new Set(current.votes.map((v: any) => v.voterId));
    const nextVoter = turnOrder.find((id) => !votedIds.has(id));
    if (!nextVoter) {
      await finalizeVotes(gameId, current, players);
      return await loadGame(gameId);
    }
    if (!isAI(players, nextVoter)) return current;
    const player = players.find((p: any) => p.id === nextVoter)!;
    const clueList = current.clues.map((c: any) => {
      const pl = players.find((p2: any) => p2.id === c.playerId);
      return { name: pl?.name || c.playerId, clue: c.clueText };
    });
    const targetId = await generateVote({
      playerName: player.name,
      personality: player.personality || "balanced",
      isImposter: player.isImposter,
      secretWord: player.isImposter ? g.imposterWord : g.secretWord,
      category: g.category,
      players: players.map((p: any) => ({ id: p.id, name: p.name })),
      clues: clueList,
      selfId: player.id,
    });
    await db.insert(votes).values({
      gameId,
      voterId: nextVoter,
      targetId,
      round: 1,
    });
    const fresh = await loadGame(gameId);
    const votedCount = fresh.votes.length;
    if (votedCount >= players.length) {
      await finalizeVotes(gameId, fresh, players);
    }
    return await loadGame(gameId);
  }

  if (g.phase === "guess") {
    const imposter = players.find((p: any) => p.isImposter)!;
    if (imposter.type === "ai") {
      const clueList = current.clues.map((c: any) => {
        const pl = players.find((p2: any) => p2.id === c.playerId);
        return { name: pl?.name || c.playerId, clue: c.clueText };
      });
      const guessWord = await generateGuess({
        playerName: imposter.name,
        personality: imposter.personality || "balanced",
        category: g.category,
        clues: clueList,
      });
      const correct = guessWord.toLowerCase() === g.secretWord.toLowerCase();
      await db
        .insert(guesses)
        .values({ gameId, playerId: imposter.id, guessWord, correct });
      await completeGame(gameId, correct ? "imposter" : "crew");
      return await loadGame(gameId);
    }
    return current;
  }

  return current;
}

function topVoted(votesList: any[]): string | null {
  if (!votesList.length) return null;
  const tally: Record<string, number> = {};
  for (const v of votesList) tally[v.targetId] = (tally[v.targetId] || 0) + 1;
  let top: string | null = null;
  let topCount = 0;
  for (const [id, count] of Object.entries(tally)) {
    if (count > topCount) {
      top = id;
      topCount = count;
    }
  }
  return top;
}

async function finalizeVotes(gameId: string, data: any, players: any[]) {
  const votesList = data.votes;
  // tally
  const tally: Record<string, number> = {};
  for (const v of votesList) tally[v.targetId] = (tally[v.targetId] || 0) + 1;
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const imposterId = data.game.imposterPlayerId;
  let identified = false;
  if (sorted.length > 0) {
    const top = sorted[0];
    const second = sorted[1];
    if (top[0] === imposterId && (!second || top[1] > second[1])) {
      identified = true;
    }
  }
  if (!identified) {
    await completeGame(gameId, "imposter");
    await db
      .update(games)
      .set({ phase: "results" })
      .where(eq(games.id, gameId));
  } else {
    await db.update(games).set({ phase: "guess" }).where(eq(games.id, gameId));
  }
}

async function completeGame(gameId: string, winner: string) {
  const data = await loadGame(gameId);
  if (!data || data.game.status === "completed") return;
  const started = new Date(data.game.startedAt).getTime();
  const duration = Math.round((Date.now() - started) / 1000);
  await db
    .update(games)
    .set({
      status: "completed",
      winner,
      phase: "results",
      endedAt: new Date(),
      durationSeconds: duration,
    })
    .where(eq(games.id, gameId));
  // update stats
  await updateStats(data.game.userId, gameId, winner, data);
}

async function updateStats(
  userId: string,
  gameId: string,
  winner: string,
  data: any,
) {
  // We'll compute aggregate stats on read instead of maintaining counters, to avoid inconsistency.
  // But requirement wants statistics. We'll just rely on queries. No-op here.
}

export async function submitClue(
  gameId: string,
  playerId: string,
  clueText: string,
  userId: string,
) {
  const data = await loadGame(gameId);
  if (
    !data ||
    data.game.userId !== userId ||
    data.game.status !== "in_progress"
  )
    return { ok: false, error: "invalid" };
  if (data.game.phase !== "clue") return { ok: false, error: "wrong phase" };
  const turnOrder = data.game.turnOrder as string[];
  const idx = data.game.currentTurnIndex;
  if (idx >= turnOrder.length) return { ok: false, error: "no turn" };
  if (turnOrder[idx] !== playerId) return { ok: false, error: "not your turn" };
  const player = data.players.find((p: any) => p.id === playerId);
  if (!player || player.type === "ai")
    return { ok: false, error: "not allowed" };
  await db.insert(clues).values({
    gameId,
    playerId,
    clueText: clueText.slice(0, 200),
    turnOrder: idx,
  });
  const nextIndex = idx + 1;
  if (nextIndex >= turnOrder.length) {
    await db
      .update(games)
      .set({ currentTurnIndex: nextIndex, phase: "discussion" })
      .where(eq(games.id, gameId));
  } else {
    await db
      .update(games)
      .set({ currentTurnIndex: nextIndex })
      .where(eq(games.id, gameId));
  }
  return { ok: true };
}

export async function startVoting(gameId: string, userId: string) {
  const data = await loadGame(gameId);
  if (!data || data.game.userId !== userId) return { ok: false };
  if (data.game.phase !== "discussion") return { ok: false };
  await db
    .update(games)
    .set({ phase: "vote", currentTurnIndex: 0 })
    .where(eq(games.id, gameId));
  return { ok: true };
}

export async function submitVote(
  gameId: string,
  voterId: string,
  targetId: string,
  userId: string,
) {
  const data = await loadGame(gameId);
  if (
    !data ||
    data.game.userId !== userId ||
    data.game.status !== "in_progress"
  )
    return { ok: false, error: "invalid" };
  if (data.game.phase !== "vote") return { ok: false, error: "wrong phase" };
  const player = data.players.find((p: any) => p.id === voterId);
  if (!player || player.type === "ai")
    return { ok: false, error: "not allowed" };
  const already = data.votes.find((v: any) => v.voterId === voterId);
  if (already) return { ok: false, error: "already voted" };
  if (!data.players.find((p: any) => p.id === targetId))
    return { ok: false, error: "bad target" };
  await db.insert(votes).values({ gameId, voterId, targetId, round: 1 });
  const fresh = await loadGame(gameId);
  const votedCount = fresh!.votes.length;
  if (votedCount >= data.players.length) {
    await finalizeVotes(gameId, fresh, data.players);
  }
  return { ok: true };
}

export async function submitGuess(
  gameId: string,
  playerId: string,
  guessWord: string,
  userId: string,
) {
  const data = await loadGame(gameId);
  if (
    !data ||
    data.game.userId !== userId ||
    data.game.status !== "in_progress"
  )
    return { ok: false, error: "invalid" };
  if (data.game.phase !== "guess") return { ok: false, error: "wrong phase" };
  const imposter = data.players.find((p: any) => p.isImposter)!;
  if (playerId !== imposter.id) return { ok: false, error: "not imposter" };
  const player = data.players.find((p: any) => p.id === playerId);
  if (!player || player.type === "ai")
    return { ok: false, error: "not allowed" };
  const correct =
    guessWord.trim().toLowerCase() === data.game.secretWord.toLowerCase();
  await db.insert(guesses).values({ gameId, playerId, guessWord, correct });
  await completeGame(gameId, correct ? "imposter" : "crew");
  return { ok: true, correct };
}

export async function getPublicState(gameId: string, userId: string) {
  const data = await loadGame(gameId);
  if (!data) return null;
  if (data.game.userId !== userId) return null;
  const players = data.players;
  const humanPlayer = players.find((p: any) => p.type === "human"); // the account owner
  const isImposterSelf = humanPlayer?.isImposter ?? false;
  const completed = data.game.status === "completed";
  return {
    id: data.game.id,
    category: data.game.category,
    status: data.game.status,
    phase: data.game.phase,
    opponentCount: data.game.opponentCount,
    secretWord: completed
      ? data.game.secretWord
      : isImposterSelf
        ? data.game.imposterWord
        : data.game.secretWord,
    imposterWord: completed ? data.game.imposterWord : null,
    isSelfImposter: isImposterSelf,
    guesserType:
      !completed && data.game.phase === "guess"
        ? players.find((p: any) => p.isImposter)?.type === "ai"
          ? "ai"
          : "human"
        : null,
    imposterPlayerId: completed ? data.game.imposterPlayerId : null,
    votedOutId:
      data.game.phase === "guess" || completed ? topVoted(data.votes) : null,
    winner: data.game.winner,
    turnOrder: data.game.turnOrder,
    currentTurnIndex: data.game.currentTurnIndex,
    startedAt: data.game.startedAt,
    endedAt: data.game.endedAt,
    durationSeconds: data.game.durationSeconds,
    players: players.map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      avatarSeed: p.avatarSeed,
      isImposter: completed ? p.isImposter : undefined,
    })),
    clues: data.clues.map((c: any) => {
      const pl = players.find((p2: any) => p2.id === c.playerId);
      return {
        id: c.id,
        playerId: c.playerId,
        playerName: pl?.name,
        clue: c.clueText,
        order: c.turnOrder,
      };
    }),
    votes: data.votes.map((v: any) => ({
      voterId: v.voterId,
      targetId: v.targetId,
    })),
    guesses: data.guesses.map((g: any) => ({
      playerId: g.playerId,
      guessWord: g.guessWord,
      correct: g.correct,
    })),
  };
}
