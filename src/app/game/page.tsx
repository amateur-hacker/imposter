"use client";
import {
  BookOpen,
  Lightbulb,
  Loader2,
  Play,
  Sparkles,
  Users,
  Vote,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth/client";

interface GameState {
  id: string;
  category: string;
  status: string;
  phase: string;
  opponentCount: number;
  secretWord: string | null;
  imposterWord: string | null;
  isSelfImposter: boolean;
  guesserType: "ai" | "human" | null;
  imposterPlayerId: string | null;
  votedOutId: string | null;
  winner: string | null;
  turnOrder: string[];
  currentTurnIndex: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  players: {
    id: string;
    name: string;
    type: string;
    avatarSeed: string;
    isImposter?: boolean;
  }[];
  clues: {
    id: string;
    playerId: string;
    playerName?: string;
    clue: string;
    order: number;
  }[];
  votes: { voterId: string; targetId: string }[];
  guesses: { playerId: string; guessWord: string; correct: boolean }[];
}

export default function GamePage() {
  const [opponentCount, setOpponentCount] = useState<3 | 5 | 7>(3);
  // All opponents are AI-controlled
  const [gameId, setGameId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clueInput, setClueInput] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [definition, setDefinition] = useState<string | null>(null);
  const [defLoading, setDefLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sugLoading, setSugLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: advance is stable enough
  useEffect(() => {
    if (!gameId || !state || busy || state.status !== "in_progress") return;
    // Self-heal: clue phase but turn index ran past the order (stale game).
    // One advance flips it to discussion.
    if (
      state.phase === "clue" &&
      state.currentTurnIndex >= state.turnOrder.length
    ) {
      const t = setTimeout(() => {
        advance(gameId);
      }, 800);
      return () => clearTimeout(t);
    }
    let isAI = false;
    if (state.phase === "clue") {
      const cur = state.players.find(
        (p) => p.id === state.turnOrder[state.currentTurnIndex],
      );
      isAI = cur?.type === "ai";
    } else if (state.phase === "vote") {
      const voted = new Set(state.votes.map((v) => v.voterId));
      const nextVoterId = state.turnOrder.find((id) => !voted.has(id));
      const nextVoter = state.players.find((p) => p.id === nextVoterId);
      isAI = nextVoter?.type === "ai";
    } else if (state.phase === "guess") {
      isAI = state.guesserType === "ai";
    }
    if (!isAI) return;
    const delay = 2000 + Math.floor(Math.random() * 2000);
    const t = setTimeout(() => {
      advance(gameId);
    }, delay);
    return () => clearTimeout(t);
  }, [gameId, state, busy]);

  const loadState = useCallback(async (id: string) => {
    const res = await fetch(`/api/game/${id}`);
    if (!res.ok) throw new Error("Failed to load game");
    const data = await res.json();
    setState(data.state);
  }, []);

  async function startGame() {
    setLoading(true);
    setError(null);
    setDefinition(null);
    setSuggestions([]);
    try {
      const res = await fetch("/api/game/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opponentCount,
          players: Array(opponentCount).fill({ type: "ai" }),
          category: undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to start game");
      const data = await res.json();
      setGameId(data.gameId);
      setState(data.state);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function advance(id?: string) {
    const gid = id || gameId;
    if (!gid) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/game/${gid}/advance`, { method: "POST" });
      if (!res.ok) throw new Error("Advance failed");
      const data = await res.json();
      setState(data.state);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitClue() {
    if (!gameId || !state) return;
    const currentId = state.turnOrder[state.currentTurnIndex];
    setBusy(true);
    try {
      const res = await fetch(`/api/game/${gameId}/clue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: currentId, clue: clueInput }),
      });
      if (!res.ok) throw new Error("Clue failed");
      const data = await res.json();
      setState(data.state);
      setClueInput("");
      setSuggestions([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function startVoting() {
    if (!gameId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/game/${gameId}/start-voting`, {
        method: "POST",
      });
      const data = await res.json();
      setState(data.state);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitVote() {
    if (!gameId || !state || !voteTarget) return;
    const voted = new Set(state.votes.map((v) => v.voterId));
    const nextVoter = state.turnOrder.find((id) => !voted.has(id));
    if (!nextVoter) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/game/${gameId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: nextVoter, targetId: voteTarget }),
      });
      if (!res.ok) throw new Error("Vote failed");
      const data = await res.json();
      setState(data.state);
      setVoteTarget(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitGuess() {
    if (!gameId || !state) return;
    const me = state.players.find((p) => p.type === "human");
    const pid = me?.id;
    if (!pid) {
      setError("Could not determine your player.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/game/${gameId}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: pid, guess: guessInput }),
      });
      if (!res.ok) throw new Error("Guess failed");
      const data = await res.json();
      setState(data.state);
      setGuessInput("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function newGame() {
    setGameId(null);
    setState(null);
    setError(null);
    setDefinition(null);
    setSuggestions([]);
  }

  async function fetchSuggestions() {
    if (!gameId || sugLoading) return;
    setSugLoading(true);
    try {
      const res = await fetch(`/api/game/${gameId}/suggest-clues`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Could not suggest clues");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSugLoading(false);
    }
  }

  async function fetchDefinition() {
    if (!gameId || defLoading || definition) return;
    setDefLoading(true);
    try {
      const res = await fetch(`/api/game/${gameId}/define`, { method: "POST" });
      if (!res.ok) throw new Error("Could not load meaning");
      const data = await res.json();
      setDefinition(data.definition);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDefLoading(false);
    }
  }

  // Setup screen
  if (!gameId || !state) {
    return (
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">New Game</h1>
        <p className="text-muted-foreground mb-6">
          Choose your opponents and player types.
        </p>
        {error && <p className="text-destructive mb-4">{error}</p>}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Game size</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            {[3, 5, 7].map((n) => (
              <Button
                key={n}
                variant={opponentCount === n ? "default" : "outline"}
                onClick={() => setOpponentCount(n as any)}
              >
                {n} opponents
              </Button>
            ))}
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full"
          onClick={startGame}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Play className="h-5 w-5" />
          )}{" "}
          Start game
        </Button>
      </main>
    );
  }

  const currentTurnId = state.turnOrder[state.currentTurnIndex];
  const currentPlayer = state.players.find((p) => p.id === currentTurnId);
  const votedSet = new Set(state.votes.map((v) => v.voterId));
  const allVoted = votedSet.size >= state.players.length;
  const nextVoterId = allVoted
    ? undefined
    : state.turnOrder.find((id) => !votedSet.has(id));
  // Highlight a card only while someone has to act: clue turn or next voter.
  // No highlight in discussion, guess, or results.
  const highlightId =
    state.phase === "clue"
      ? currentTurnId
      : state.phase === "vote"
        ? nextVoterId
        : undefined;
  const phases = ["clue", "discussion", "vote", "guess", "results"];
  const phaseLabels: Record<string, string> = { guess: "final guess" };
  const phaseIndex = phases.indexOf(state.phase);

  return (
    <main className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Imposter</h1>
          <p className="text-sm text-muted-foreground">
            Category: {state.category} · {state.players.length} players
          </p>
        </div>
        {busy && <Loader2 className="h-5 w-5 animate-spin" />}
      </div>
      {error && <p className="text-destructive mb-3">{error}</p>}

      {/* Secret word */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Your word</p>
            <p className="text-2xl font-bold">{state.secretWord || "Hidden"}</p>
            {state.isSelfImposter && state.status === "in_progress" && (
              <p className="text-xs text-muted-foreground mt-1">
                Someone else has a similar word — blend in.
              </p>
            )}
            {state.secretWord && (
              <div className="mt-2">
                {!definition ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchDefinition}
                    disabled={defLoading}
                  >
                    {defLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BookOpen className="h-4 w-4" />
                    )}{" "}
                    What does it mean?
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">{definition}</p>
                )}
              </div>
            )}
          </div>
          <Badge variant={state.isSelfImposter ? "destructive" : "secondary"}>
            {state.isSelfImposter ? "Imposter" : "Crew"}
          </Badge>
        </CardContent>
      </Card>

      {/* Players */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {state.turnOrder.map((pid) => {
          const p = state.players.find((pl) => pl.id === pid);
          if (!p) return null;
          return (
            <Card
              key={p.id}
              className={highlightId === p.id ? "ring-2 ring-primary" : ""}
            >
              <CardContent className="pt-4 text-center">
                <div className="text-sm font-medium">{p.name}</div>
                <Badge variant="outline" className="mt-1">
                  {p.type === "ai" ? "AI" : "Human"}
                </Badge>
                {state.phase === "results" && p.isImposter && (
                  <Badge variant="destructive" className="mt-1 ml-1">
                    Imposter
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Phase indicator */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {phases.map((ph, i) => (
          <div key={ph} className="flex items-center gap-1.5">
            <Badge variant={i <= phaseIndex ? "default" : "outline"}>
              {phaseLabels[ph] ?? ph}
            </Badge>
            {i < phases.length - 1 && (
              <span className="text-muted-foreground text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Clues */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5" /> Clues
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.clues.filter((cl) => cl.clue && cl.clue.trim()).length ===
            0 && <p className="text-sm text-muted-foreground">No clues yet.</p>}
          {state.clues
            .filter((cl) => cl.clue && cl.clue.trim())
            .map((cl) => (
              <div key={cl.id} className="flex gap-2 text-sm">
                <span className="font-medium">{cl.playerName}:</span>
                <span>{cl.clue}</span>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Clue phase actions */}
      {state.phase === "clue" && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            {currentPlayer && currentPlayer.type !== "ai" ? (
              <div className="space-y-3">
                <p className="font-medium">
                  Turn: {currentPlayer.name} — give a clue
                </p>
                {suggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <Button
                        key={s}
                        variant="outline"
                        size="sm"
                        onClick={() => setClueInput(s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchSuggestions}
                    disabled={sugLoading}
                  >
                    {sugLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}{" "}
                    Suggest 3 clues for me
                  </Button>
                )}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (clueInput.trim()) submitClue();
                  }}
                >
                  <Input
                    value={clueInput}
                    onChange={(e) => setClueInput(e.target.value)}
                    placeholder="Your clue..."
                  />
                  <Button type="submit" disabled={busy || !clueInput.trim()}>
                    Submit
                  </Button>
                </form>
              </div>
            ) : currentPlayer ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />{" "}
                {currentPlayer.name} is thinking...
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => advance(gameId!)}
                  disabled={busy}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Finishing clues...
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Discussion */}
      {state.phase === "discussion" && (
        <Card className="mb-4">
          <CardContent className="pt-6 flex justify-between items-center">
            <p>Discuss the clues. Ready to vote?</p>
            <Button onClick={startVoting} disabled={busy}>
              Start voting
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Vote */}
      {state.phase === "vote" && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Vote className="h-5 w-5" /> Voting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const remaining = state.turnOrder.filter(
                (id) => !votedSet.has(id),
              );
              const currentVoter = state.players.find(
                (p) => p.id === remaining[0],
              );
              const upNextVoter = state.players.find(
                (p) => p.id === remaining[1],
              );
              if (!currentVoter) {
                return (
                  <p className="text-sm text-muted-foreground">
                    All votes are in — tallying the results…
                  </p>
                );
              }
              return (
                <>
                  <p className="text-sm text-muted-foreground">
                    {upNextVoter
                      ? `Up next: ${upNextVoter.name}`
                      : "Last vote — tallying after this…"}
                  </p>
                  {currentVoter.type === "ai" ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />{" "}
                      {`${currentVoter.name} is voting...`}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => advance(gameId!)}
                        disabled={busy}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-medium">
                        {currentVoter.name}, who is the Imposter?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {state.turnOrder
                          .filter((pid) => pid !== currentVoter.id)
                          .map(
                            (pid) => state.players.find((p) => p.id === pid)!,
                          )
                          .filter(Boolean)
                          .map((p) => (
                            <Button
                              key={p.id}
                              variant={
                                voteTarget === p.id ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() => setVoteTarget(p.id)}
                            >
                              {p.name}
                            </Button>
                          ))}
                      </div>
                      <Button
                        onClick={submitVote}
                        disabled={busy || !voteTarget}
                      >
                        Submit vote
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Guess */}
      {state.phase === "guess" && (
        <Card className="mb-4">
          <CardContent className="pt-6 space-y-3">
            {state.guesserType === "ai" ? (
              <div className="space-y-2">
                <p className="font-medium">
                  The crew voted out{" "}
                  {state.players.find((p) => p.id === state.votedOutId)?.name} —
                  the imposter! One final guess to steal the win…
                </p>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Guessing the
                  secret word...
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => advance(gameId!)}
                    disabled={busy}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-medium">
                  The crew caught you! Guess the secret word to steal the win.
                </p>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (guessInput.trim()) submitGuess();
                  }}
                >
                  <Input
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                    placeholder="Your guess..."
                  />
                  <Button type="submit" disabled={busy || !guessInput.trim()}>
                    Submit
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {state.phase === "results" && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xl font-bold">
              Winner: {state.winner === "imposter" ? "Imposter" : "Crew"}
            </p>
            <p>
              Secret word:{" "}
              <span className="font-semibold">{state.secretWord}</span>
            </p>
            <p>
              Imposter's word:{" "}
              <span className="font-semibold">{state.imposterWord}</span>
            </p>
            <p>
              Imposter:{" "}
              {state.players.find((p) => p.id === state.imposterPlayerId)?.name}
            </p>
            {state.guesses.map((g) => (
              <p key={g.playerId} className="text-sm">
                Guess by {state.players.find((p) => p.id === g.playerId)?.name}:{" "}
                {g.guessWord} {g.correct ? "✓" : "✗"}
              </p>
            ))}
            <div className="pt-2">
              <p className="font-medium mb-1">Votes:</p>
              {state.votes.map((v) => (
                <p key={`${v.voterId}-${v.targetId}`} className="text-sm">
                  {state.players.find((p) => p.id === v.voterId)?.name} →{" "}
                  {state.players.find((p) => p.id === v.targetId)?.name}
                </p>
              ))}
            </div>
            <Button onClick={newGame} className="mt-4">
              New game
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
