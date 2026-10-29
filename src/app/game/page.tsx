"use client";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  BookOpen,
  Check,
  ChevronsUpDown,
  GripVertical,
  Lightbulb,
  Loader2,
  Play,
  Sparkles,
  Users,
  Vote,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth/client";
import { ALL_CATEGORIES } from "@/lib/game/words";

interface GameState {
  id: string;
  mode: "ai" | "manual";
  suggestionsEnabled: boolean;
  timerSeconds: number;
  categories: string[];
  difficulty: string;
  category: string;
  status: string;
  phase: string;
  opponentCount: number;
  secretWord: string | null;
  imposterWord: string | null;
  isSelfImposter: boolean;
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

const DEFINITION_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

const AI_DEFAULT_NAMES = [
  "Skeptical Sam",
  "Quiet Quinn",
  "Chatty Charlie",
  "Logical Lucy",
  "Nervous Ned",
  "Bold Bella",
  "Sly fox",
];

function sortableIndex(entity: unknown): number | null {
  if (typeof entity !== "object" || entity === null) return null;
  const index = (entity as { index?: unknown }).index;
  return typeof index === "number" ? index : null;
}

function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

function SeatRow({
  id,
  index,
  name,
  placeholder,
  control,
  onNameChange,
}: {
  id: string;
  index: number;
  name: string;
  placeholder: string;
  control: React.ReactNode;
  onNameChange: (value: string) => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id, index });
  return (
    <div
      ref={ref}
      className={`flex items-center gap-2 p-3 rounded-lg border bg-card ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label="Drag to reorder player"
        className="cursor-grab active:cursor-grabbing text-muted-foreground touch-none p-1"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-bold">
        {(name.trim() || placeholder).charAt(0).toUpperCase()}
      </span>
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value.slice(0, 24))}
        placeholder={placeholder}
        className="max-w-48"
      />
      {control}
    </div>
  );
}

export default function GamePage() {
  const [opponentCount, setOpponentCount] = useState<number>(3);
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [ownName, setOwnName] = useState("You");
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [seatTypes, setSeatTypes] = useState<("human" | "ai")[]>([
    "human",
    "human",
    "human",
    "human",
  ]);
  const [suggestOn, setSuggestOn] = useState(true);
  const [timerMin, setTimerMin] = useState("3");
  const [timerSec, setTimerSec] = useState("0");
  const [categories, setCategories] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<"easy" | "moderate" | "hard">(
    "moderate",
  );
  const [defLang, setDefLang] = useState("en");
  const [catOpen, setCatOpen] = useState(false);
  // All opponents are AI-controlled
  const [gameId, setGameId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clueInput, setClueInput] = useState("");
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [definition, setDefinition] = useState<string | null>(null);
  const [defLoading, setDefLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [meanings, setMeanings] = useState<Record<string, string>>({});
  const [meaningLoading, setMeaningLoading] = useState<string | null>(null);
  const [revealIndex, setRevealIndex] = useState(0);
  const [revealWord, setRevealWord] = useState<string | null>(null);
  const [revealDefinition, setRevealDefinition] = useState<string | null>(null);
  const [revealDefLoading, setRevealDefLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerDone = useRef(false);
  const [setupLoaded, setSetupLoaded] = useState(false);

  // Persist setup names so they survive reloads and stay editable.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("imposter:setup");
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.ownName === "string") setOwnName(saved.ownName);
        if (Array.isArray(saved.names)) setNames(saved.names);
        if (Array.isArray(saved.seatTypes)) {
          setSeatTypes(
            saved.seatTypes.filter((t: unknown) => t === "human" || t === "ai"),
          );
        }
        if (
          typeof saved.opponentCount === "number" &&
          [3, 4, 5, 6, 7, 8].includes(saved.opponentCount)
        ) {
          setOpponentCount(saved.opponentCount);
        }
        if (saved.mode === "ai" || saved.mode === "manual") {
          setMode(saved.mode);
        }
        if (typeof saved.suggestOn === "boolean") {
          setSuggestOn(saved.suggestOn);
        }
        if (typeof saved.timerMin === "string") setTimerMin(saved.timerMin);
        if (typeof saved.timerSec === "string") setTimerSec(saved.timerSec);
        if (Array.isArray(saved.categories)) {
          setCategories(
            saved.categories
              .filter(
                (c: unknown): c is string =>
                  typeof c === "string" && ALL_CATEGORIES.includes(c),
              )
              .slice(0, 3),
          );
        }
        if (
          saved.difficulty === "easy" ||
          saved.difficulty === "moderate" ||
          saved.difficulty === "hard"
        ) {
          setDifficulty(saved.difficulty);
        }
        if (
          typeof saved.defLang === "string" &&
          DEFINITION_LANGUAGE_OPTIONS.some((o) => o.value === saved.defLang)
        ) {
          setDefLang(saved.defLang);
        }
      }
    } catch {}
    setSetupLoaded(true);
  }, []);

  useEffect(() => {
    if (!setupLoaded) return;
    try {
      localStorage.setItem(
        "imposter:setup",
        JSON.stringify({
          ownName,
          names,
          seatTypes,
          opponentCount,
          mode,
          suggestOn,
          timerMin,
          timerSec,
          categories,
          difficulty,
          defLang,
        }),
      );
    } catch {}
  }, [
    ownName,
    names,
    seatTypes,
    opponentCount,
    mode,
    suggestOn,
    timerMin,
    timerSec,
    categories,
    difficulty,
    defLang,
    setupLoaded,
  ]);

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
    }
    if (!isAI) return;
    const delay = 2000 + Math.floor(Math.random() * 2000);
    const t = setTimeout(() => {
      advance(gameId);
    }, delay);
    return () => clearTimeout(t);
  }, [gameId, state, busy]);

  // Manual discussion timer: counts down, then opens voting automatically.
  // biome-ignore lint/correctness/useExhaustiveDependencies: startVoting is stable
  useEffect(() => {
    if (!gameId || !state || state.mode !== "manual") return;
    if (state.phase !== "discussion" || state.status !== "in_progress") return;
    if (timeLeft === null) {
      setTimeLeft(state.timerSeconds);
      return;
    }
    if (timeLeft <= 0) {
      if (!timerDone.current) {
        timerDone.current = true;
        startVoting();
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(t);
    // biome-ignore lint/correctness/useExhaustiveDependencies: timer tick only
  }, [gameId, state, timeLeft]);

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
    setMeanings({});
    setRevealIndex(0);
    setRevealWord(null);
    setRevealDefinition(null);
    setTimeLeft(null);
    timerDone.current = false;
    try {
      const isManualGame = mode === "manual";
      if (
        isManualGame &&
        !Array.from(
          { length: opponentCount },
          (_, i) => seatTypes[i] || "human",
        ).includes("human")
      ) {
        throw new Error("Manual games need at least one human player");
      }
      const totalSeconds =
        mode === "manual"
          ? Math.max(
              0,
              (Number.parseInt(timerMin || "0", 10) || 0) * 60 +
                (Number.parseInt(timerSec || "0", 10) || 0),
            )
          : undefined;
      const isManualPayload = mode === "manual";
      const res = await fetch("/api/game/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isManualPayload
            ? {
                players: Array.from({ length: opponentCount }, (_, i) => ({
                  type:
                    (seatTypes[i] || "human") === "ai"
                      ? ("ai" as const)
                      : ("manual" as const),
                  name: (names[i] || "").trim() || undefined,
                })),
                timerSeconds:
                  totalSeconds && totalSeconds > 0 ? totalSeconds : undefined,
                category: undefined,
              }
            : {
                opponentCount,
                ownName: ownName.trim() || undefined,
                suggestClues: suggestOn,
                players: Array.from({ length: opponentCount }, (_, i) => ({
                  type: "ai" as const,
                  name: (names[i] || "").trim() || undefined,
                })),
                category: undefined,
              },
        ),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start game");
      }
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

  function newGame() {
    setGameId(null);
    setState(null);
    setError(null);
    setDefinition(null);
    setSuggestions([]);
    setMeanings({});
    setRevealIndex(0);
    setRevealWord(null);
    setRevealDefinition(null);
    setTimeLeft(null);
    timerDone.current = false;
  }

  async function revealHold(playerId: string, show: boolean) {
    if (!gameId) return;
    if (!show) {
      setRevealWord(null);
      return;
    }
    try {
      const res = await fetch(`/api/game/${gameId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setRevealWord(data.word);
    } catch {
      // ignore peek errors; user can hold again
    }
  }

  async function fetchRevealDefinition(playerId: string) {
    if (!gameId || revealDefLoading || revealDefinition) return;
    setRevealDefLoading(true);
    try {
      const res = await fetch(`/api/game/${gameId}/define`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, language: defLang }),
      });
      if (!res.ok) throw new Error("Could not load meaning");
      const data = await res.json();
      setRevealDefinition(data.definition);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRevealDefLoading(false);
    }
  }

  async function startClues() {
    if (!gameId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/game/${gameId}/start-clues`, {
        method: "POST",
      });
      const data = await res.json();
      setState(data.state);
      setRevealWord(null);
      setRevealDefinition(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function fetchMeaning(playerId: string) {
    if (!gameId || meaningLoading || meanings[playerId]) return;
    setMeaningLoading(playerId);
    try {
      const res = await fetch(`/api/game/${gameId}/define`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, language: defLang }),
      });
      if (!res.ok) throw new Error("Could not load meaning");
      const data = await res.json();
      setMeanings((prev) => ({ ...prev, [playerId]: data.definition }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMeaningLoading(null);
    }
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

  async function fetchDefinition(playerId?: string) {
    if (!gameId || defLoading || definition) return;
    setDefLoading(true);
    try {
      const res = await fetch(`/api/game/${gameId}/define`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          playerId ? { playerId, language: defLang } : { language: defLang },
        ),
      });
      if (!res.ok) throw new Error("Could not load meaning");
      const data = await res.json();
      setDefinition(data.definition);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDefLoading(false);
    }
  }

  function resizeSeats(size: number) {
    setNames((prev) => {
      const next = Array(size).fill("");
      for (let i = 0; i < next.length; i++) {
        if (prev[i]) next[i] = prev[i];
      }
      return next;
    });
    setSeatTypes((prev) => {
      const next: ("human" | "ai")[] = Array(size).fill("human");
      for (let i = 0; i < next.length; i++) {
        if (prev[i]) next[i] = prev[i];
      }
      return next;
    });
  }

  function handleSeatDragEnd(event: DragEndEvent) {
    if (event.canceled) return;
    const operation = event.operation as unknown as {
      source?: unknown;
      target?: unknown;
    } | null;
    if (!operation) return;
    const from = sortableIndex(operation.source);
    const to = sortableIndex(operation.target);
    if (from === null || to === null || from === to) return;
    const size = opponentCount;
    const padNames = Array.from({ length: size }, (_, i) => names[i] || "");
    const padTypes = Array.from(
      { length: size },
      (_, i) => seatTypes[i] || "human",
    );
    setNames(moveInArray(padNames, from, to));
    setSeatTypes(moveInArray(padTypes, from, to));
  }

  // Setup screen
  if (!gameId || !state) {
    const defaultName = (i: number) =>
      mode === "ai"
        ? AI_DEFAULT_NAMES[i % AI_DEFAULT_NAMES.length]
        : `Player ${i + 1}`;
    const sizeOptions = mode === "ai" ? [3, 5, 7] : [4, 6, 8];
    return (
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">New Game</h1>
        <p className="text-muted-foreground mb-6">
          Play with AI opponents, or pass-and-play with friends on this device.
        </p>
        {error && <p className="text-destructive mb-4">{error}</p>}

        <div className="grid grid-cols-2 gap-3 mb-6">
          {(
            [
              { v: "ai", title: "AI game", desc: "Opponents are played by AI" },
              {
                v: "manual",
                title: "Manual",
                desc: "Pass-and-play with friends",
              },
            ] as const
          ).map((m) => (
            <Card
              key={m.v}
              className={
                mode === m.v
                  ? "ring-2 ring-primary cursor-pointer"
                  : "cursor-pointer"
              }
              onClick={() => {
                setMode(m.v);
                const size = m.v === "ai" ? 3 : 4;
                setOpponentCount(size);
                resizeSeats(size);
              }}
            >
              <CardContent className="pt-6">
                <p className="font-semibold">{m.title}</p>
                <p className="text-sm text-muted-foreground">{m.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Game size</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            {sizeOptions.map((n) => (
              <Button
                key={n}
                variant={opponentCount === n ? "default" : "outline"}
                onClick={() => {
                  setOpponentCount(n);
                  resizeSeats(n);
                }}
              >
                {mode === "ai" ? `${n} opponents` : `${n} players`}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="mb-6 overflow-visible">
          <CardHeader>
            <CardTitle>Word categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => setCatOpen((v) => !v)}
              >
                {categories.length > 0
                  ? `${categories.length} selected (max 3)`
                  : "Any category"}
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </Button>
              {catOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close categories"
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                    onClick={() => setCatOpen(false)}
                  />
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                    <Command>
                      <CommandInput placeholder="Search categories..." />
                      <CommandList>
                        <CommandEmpty>No category found.</CommandEmpty>
                        <CommandGroup>
                          {ALL_CATEGORIES.map((cat) => {
                            const selected = categories.includes(cat);
                            const full = categories.length >= 3 && !selected;
                            return (
                              <CommandItem
                                key={cat}
                                value={cat}
                                disabled={full}
                                onSelect={() => {
                                  setCategories((prev) =>
                                    prev.includes(cat)
                                      ? prev.filter((c) => c !== cat)
                                      : prev.length >= 3
                                        ? prev
                                        : [...prev, cat],
                                  );
                                }}
                              >
                                <Check
                                  className={
                                    selected
                                      ? "h-4 w-4 opacity-100"
                                      : "h-4 w-4 opacity-0"
                                  }
                                />
                                {cat}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </div>
                </>
              )}
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <Badge
                    key={cat}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() =>
                      setCategories((prev) => prev.filter((c) => c !== cat))
                    }
                  >
                    {cat} ×
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Empty means any category. AI picks the secret word from these.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Word difficulty</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            {(["easy", "moderate", "hard"] as const).map((d) => (
              <Button
                key={d}
                variant={difficulty === d ? "default" : "outline"}
                onClick={() => setDifficulty(d)}
                className="capitalize"
              >
                {d}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Word meaning language</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {DEFINITION_LANGUAGE_OPTIONS.map((o) => (
              <Button
                key={o.value}
                variant={defLang === o.value ? "default" : "outline"}
                onClick={() => setDefLang(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              {mode === "ai" ? "Players" : `Players (${opponentCount})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mode === "ai" && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  {(ownName.trim() || "Y").charAt(0).toUpperCase()}
                </span>
                <Input
                  value={ownName}
                  onChange={(e) => setOwnName(e.target.value.slice(0, 24))}
                  placeholder="Your name"
                  className="max-w-48"
                />
                <Badge className="ml-auto">You</Badge>
              </div>
            )}
            <DragDropProvider onDragEnd={handleSeatDragEnd}>
              {Array.from({ length: opponentCount }, (_, i) => (
                <SeatRow
                  key={`seat-${i}`}
                  id={`seat-${i}`}
                  index={i}
                  name={names[i] || ""}
                  placeholder={defaultName(i)}
                  onNameChange={(value) => {
                    const copy = [...names];
                    copy[i] = value;
                    setNames(copy);
                  }}
                  control={
                    mode === "ai" ? (
                      <Badge variant="outline" className="ml-auto">
                        AI
                      </Badge>
                    ) : (
                      <div className="ml-auto flex gap-1">
                        {(["human", "ai"] as const).map((t) => (
                          <Button
                            key={t}
                            size="sm"
                            variant={
                              (seatTypes[i] || "human") === t
                                ? "default"
                                : "outline"
                            }
                            onClick={() => {
                              const copy = [...seatTypes];
                              copy[i] = t;
                              setSeatTypes(copy);
                            }}
                          >
                            {t === "human" ? "Human" : "AI"}
                          </Button>
                        ))}
                      </div>
                    )
                  }
                />
              ))}
            </DragDropProvider>
          </CardContent>
        </Card>

        {mode === "manual" && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Discussion timer</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Minutes</p>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={timerMin}
                  onChange={(e) => setTimerMin(e.target.value)}
                  className="max-w-24"
                />
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Seconds</p>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={timerSec}
                  onChange={(e) => setTimerSec(e.target.value)}
                  className="max-w-24"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "ai" && (
          <Card className="mb-6">
            <CardContent className="pt-6 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">AI clue suggestions</p>
                <p className="text-sm text-muted-foreground">
                  Offer 3 clue ideas during your turn
                </p>
              </div>
              <Switch checked={suggestOn} onCheckedChange={setSuggestOn} />
            </CardContent>
          </Card>
        )}

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
  // No highlight in discussion or results.
  const highlightId =
    state.phase === "clue"
      ? currentTurnId
      : state.phase === "vote"
        ? nextVoterId
        : undefined;
  const phases =
    state.mode === "manual"
      ? ["reveal", "clue", "discussion", "vote", "results"]
      : ["clue", "discussion", "vote", "results"];
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

      {/* Secret word (AI mode) / word reveal (manual mode) */}
      {state.mode === "ai" ? (
        <Card className="mb-4">
          <CardContent className="pt-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Your word</p>
              <p className="text-2xl font-bold">
                {state.secretWord || "Hidden"}
              </p>
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
                      onClick={() => fetchDefinition()}
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
                    <p className="text-sm text-muted-foreground">
                      {definition}
                    </p>
                  )}
                </div>
              )}
            </div>
            <Badge variant={state.isSelfImposter ? "destructive" : "secondary"}>
              {state.isSelfImposter ? "Imposter" : "Crew"}
            </Badge>
          </CardContent>
        </Card>
      ) : (
        state.phase === "reveal" && (
          <Card className="mb-4">
            <CardContent className="pt-6 text-center space-y-4">
              {(() => {
                const pid = state.turnOrder[revealIndex];
                const player = state.players.find((p) => p.id === pid);
                const nextPid = state.turnOrder[revealIndex + 1];
                const nextPlayer = state.players.find((p) => p.id === nextPid);
                const isLast = revealIndex >= state.turnOrder.length - 1;
                if (!player) return null;
                return (
                  <>
                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-bold">
                      {player.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-xl font-bold">{player.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {isLast ? "Last player" : `Next: ${nextPlayer?.name}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border p-6 select-none w-full"
                      onPointerDown={() => revealHold(pid, true)}
                      onPointerUp={() => revealHold(pid, false)}
                      onPointerLeave={() => revealHold(pid, false)}
                      onMouseEnter={() => revealHold(pid, true)}
                      onMouseLeave={() => revealHold(pid, false)}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {revealWord ? (
                        <p className="text-3xl font-bold">{revealWord}</p>
                      ) : (
                        <p className="text-muted-foreground">
                          Hold here (or hover on desktop) to reveal your word
                        </p>
                      )}
                    </button>
                    {revealWord &&
                      (!revealDefinition ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchRevealDefinition(pid)}
                          disabled={revealDefLoading}
                        >
                          {revealDefLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}{" "}
                          What does it mean?
                        </Button>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {revealDefinition}
                        </p>
                      ))}
                    {!isLast ? (
                      <Button
                        size="lg"
                        onClick={() => {
                          setRevealWord(null);
                          setRevealDefinition(null);
                          setRevealIndex(revealIndex + 1);
                        }}
                      >
                        Next
                      </Button>
                    ) : (
                      <Button size="lg" onClick={startClues} disabled={busy}>
                        Start clues
                      </Button>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )
      )}

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
                <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg font-bold">
                  {p.name.charAt(0).toUpperCase()}
                </span>
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
              {ph}
            </Badge>
            {i < phases.length - 1 && (
              <span className="text-muted-foreground text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Clues (AI mode only — manual clues are spoken aloud) */}
      {state.mode === "ai" && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5" /> Clues
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {state.clues.filter((cl) => cl.clue && cl.clue.trim()).length ===
              0 && (
              <p className="text-sm text-muted-foreground">No clues yet.</p>
            )}
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
      )}

      {/* Clue phase actions (AI mode: type clues; manual uses spoken clues) */}
      {state.phase === "clue" && state.mode === "ai" && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            {currentPlayer && currentPlayer.type !== "ai" ? (
              <div className="space-y-3">
                <p className="font-medium">
                  Turn: {currentPlayer.name} — give a clue
                </p>
                {state.suggestionsEnabled &&
                  (suggestions.length > 0 ? (
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
                  ))}
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
                  Next
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

      {state.phase === "clue" && state.mode === "manual" && (
        <Card className="mb-4">
          <CardContent className="pt-6 text-center space-y-3">
            {(() => {
              const nextPid = state.turnOrder[state.currentTurnIndex + 1];
              const nextPlayer = state.players.find((p) => p.id === nextPid);
              if (!currentPlayer) {
                return (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Finishing
                    clues...
                  </div>
                );
              }
              return (
                <>
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-bold">
                    {currentPlayer.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-xl font-bold">{currentPlayer.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {state.turnOrder[state.currentTurnIndex + 1]
                        ? `Next: ${nextPlayer?.name}`
                        : "Last turn"}
                    </p>
                  </div>
                  {currentPlayer.type === "ai" ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />{" "}
                      {currentPlayer.name} is thinking...
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => advance(gameId!)}
                        disabled={busy}
                      >
                        Next
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-muted-foreground">
                        Say your clue out loud, then continue.
                      </p>
                      <Button
                        size="lg"
                        onClick={() => advance(gameId!)}
                        disabled={busy}
                      >
                        Next
                      </Button>
                    </>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Discussion */}
      {state.phase === "discussion" && state.mode === "ai" && (
        <Card className="mb-4">
          <CardContent className="pt-6 flex justify-between items-center">
            <p>Discuss the clues. Ready to vote?</p>
            <Button onClick={startVoting} disabled={busy}>
              Start voting
            </Button>
          </CardContent>
        </Card>
      )}

      {state.phase === "discussion" && state.mode === "manual" && (
        <Card className="mb-4">
          <CardContent className="pt-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Discussion time — talk it out! Voting opens automatically.
            </p>
            <p className="text-4xl font-bold tabular-nums">
              {timeLeft === null
                ? "--:--"
                : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`}
            </p>
            <Button onClick={startVoting} disabled={busy}>
              Vote now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Vote */}
      {state.phase === "vote" && state.mode === "ai" && (
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
                    All votes are in — counting the results…
                  </p>
                );
              }
              return (
                <>
                  <p className="text-sm text-muted-foreground">
                    {upNextVoter
                      ? `Up next: ${upNextVoter.name}`
                      : "Last vote — counting after this…"}
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
                        Next
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

      {state.phase === "vote" && state.mode === "manual" && (
        <div className="space-y-4 mb-4">
          {(() => {
            const remaining = state.turnOrder.filter((id) => !votedSet.has(id));
            const voter = state.players.find((p) => p.id === remaining[0]);
            const upNext = state.players.find((p) => p.id === remaining[1]);
            if (!voter) {
              return (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    All votes are in — counting the results…
                  </CardContent>
                </Card>
              );
            }
            return (
              <>
                <Card className="ring-2 ring-primary">
                  <CardContent className="pt-6 text-center space-y-2">
                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-bold">
                      {voter.name.charAt(0).toUpperCase()}
                    </span>
                    <p className="text-xl font-bold">{voter.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Your turn to vote — pass the device
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {upNext ? `Next: ${upNext.name}` : "Last vote"}
                    </p>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-2 gap-3">
                  {state.turnOrder
                    .filter((pid) => pid !== voter.id)
                    .map((pid) => state.players.find((p) => p.id === pid)!)
                    .filter(Boolean)
                    .map((p) => (
                      <Card
                        key={p.id}
                        className={
                          voteTarget === p.id
                            ? "ring-2 ring-primary cursor-pointer"
                            : "cursor-pointer"
                        }
                        onClick={() => setVoteTarget(p.id)}
                      >
                        <CardContent className="pt-4 text-center space-y-1">
                          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xl font-bold">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="text-sm font-medium">{p.name}</div>
                          <Badge variant="outline">Accuse</Badge>
                        </CardContent>
                      </Card>
                    ))}
                </div>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={submitVote}
                  disabled={busy || !voteTarget}
                >
                  Confirm vote
                </Button>
              </>
            );
          })()}
        </div>
      )}

      {/* Results */}
      {state.phase === "results" && (
        <>
          <Card className="mb-4 border-destructive">
            <CardContent className="pt-6 text-center space-y-1">
              <p className="text-sm text-muted-foreground">The Imposter was</p>
              <p className="text-2xl font-bold">
                {
                  state.players.find((p) => p.id === state.imposterPlayerId)
                    ?.name
                }
              </p>
              <p className="text-lg font-semibold">
                Winner: {state.winner === "imposter" ? "Imposter" : "Crew"}
              </p>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {state.turnOrder.map((pid) => {
              const p = state.players.find((pl) => pl.id === pid);
              if (!p) return null;
              const word = p.isImposter ? state.imposterWord : state.secretWord;
              return (
                <Card
                  key={p.id}
                  className={p.isImposter ? "ring-2 ring-destructive" : ""}
                >
                  <CardContent className="pt-4 text-center space-y-1">
                    <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg font-bold">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div>
                      <Badge variant="outline">
                        {p.type === "ai" ? "AI" : "Human"}
                      </Badge>
                      {p.isImposter && (
                        <Badge variant="destructive" className="ml-1">
                          Imposter
                        </Badge>
                      )}
                    </div>
                    <p className="font-semibold">{word}</p>
                    {word &&
                      (meanings[p.id] ? (
                        <p className="text-xs text-muted-foreground">
                          {meanings[p.id]}
                        </p>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchMeaning(p.id)}
                          disabled={meaningLoading === p.id}
                        >
                          {meaningLoading === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <BookOpen className="h-3 w-3" />
                          )}{" "}
                          Meaning
                        </Button>
                      ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Voting record</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.votedOutId && (
                <p>
                  Voted out:{" "}
                  <span className="font-semibold">
                    {state.players.find((p) => p.id === state.votedOutId)?.name}
                  </span>
                </p>
              )}
              <div className="pt-2">
                <p className="font-medium mb-1">Votes:</p>
                {(() => {
                  const tally: Record<string, number> = {};
                  state.votes.forEach((v) => {
                    tally[v.targetId] = (tally[v.targetId] || 0) + 1;
                  });
                  const counts = Object.values(tally).sort((a, b) => b - a);
                  const tied = counts.length > 1 && counts[0] === counts[1];
                  return tied ? (
                    <p className="text-sm text-muted-foreground mb-1">
                      Vote tied — the imposter survives ties.
                    </p>
                  ) : null;
                })()}
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
        </>
      )}
    </main>
  );
}
