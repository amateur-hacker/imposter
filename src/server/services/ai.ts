import Groq from "groq-sdk";
import { randomWord } from "@/lib/game/words";

const MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

function client() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function chat(prompt: string, maxTokens = 80): Promise<string> {
  try {
    const res = await client().chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.85,
      max_tokens: maxTokens,
    });
    return (res.choices?.[0]?.message?.content || "").trim();
  } catch (e) {
    console.error("Groq error", e);
    return "";
  }
}

export interface AIClueContext {
  playerName: string;
  personality: string;
  secretWord?: string;
  isImposter: boolean;
  category: string;
  previousClues: { name: string; clue: string }[];
}

export async function generateClue(ctx: AIClueContext): Promise<string> {
  const prev =
    ctx.previousClues.map((c) => `${c.name}: ${c.clue}`).join("\n") || "none";
  const roleLine = ctx.isImposter
    ? `You are the IMPOSTER. Your word is "${ctx.secretWord}" (a related but different word). Give a short clue that fits YOUR word, trying to blend in with the others and avoid detection. Do not reveal you are the imposter.`
    : `The secret word is "${ctx.secretWord}". Give a short clue that is related but not too obvious, while making your clue distinct from others so you don't look suspicious.`;
  const prompt = `You are ${ctx.playerName}, a cunning player in a word imposter game. Personality: ${ctx.personality}. ${roleLine}
Category: ${ctx.category}.
Previous clues:
${prev}
Rules: Output ONLY the clue, 2-8 words, no quotes, no extra text. Do not repeat previous clues. Think like a human trying to win.`;
  let out = await chat(prompt, 40);
  out = out.replace(/^["']|["']$/g, "").trim();
  if (!out || out.length < 2)
    out = ctx.isImposter ? "something familiar" : ctx.secretWord || "thing";
  return out.slice(0, 120);
}

export interface AIVoteContext {
  playerName: string;
  personality: string;
  isImposter: boolean;
  secretWord?: string;
  category: string;
  players: { id: string; name: string }[];
  clues: { name: string; clue: string }[];
  selfId: string;
}

export async function generateVote(ctx: AIVoteContext): Promise<string> {
  const candidates = ctx.players
    .filter((p) => p.id !== ctx.selfId)
    .map((p) => p.name)
    .join(", ");
  const clues = ctx.clues.map((c) => `${c.name}: ${c.clue}`).join("\n");
  const prompt = `You are ${ctx.playerName}. Personality: ${ctx.personality}. You are playing a social deduction game and must vote for who you think is the Imposter.
${ctx.isImposter ? "You ARE the Imposter. Deflect suspicion: accuse someone else convincingly, especially a player whose clue was weak or inconsistent. Never vote for yourself." : `Secret word: ${ctx.secretWord}.`}
Category: ${ctx.category}.
Players: ${candidates}.
Clues:
${clues}
Strategy: Look for contradictions, vagueness, or clues that don't fit. Protect yourself; if accused, redirect. Vote for the most suspicious player. Reply with ONLY the name of the player you accuse. No extra text.`;
  const out = await chat(prompt, 20);
  const match = ctx.players.find(
    (p) =>
      p.name.toLowerCase() === out.toLowerCase() ||
      out.toLowerCase().includes(p.name.toLowerCase()),
  );
  if (match && match.id !== ctx.selfId) return match.id;
  const others = ctx.players.filter((p) => p.id !== ctx.selfId);
  return others[Math.floor(Math.random() * others.length)].id;
}

export interface AIGuessContext {
  playerName: string;
  personality: string;
  category: string;
  clues: { name: string; clue: string }[];
}

export async function generateGuess(ctx: AIGuessContext): Promise<string> {
  const clues = ctx.clues.map((c) => `${c.name}: ${c.clue}`).join("\n");
  const prompt = `You are ${ctx.playerName}, the Imposter. Category: ${ctx.category}.
Clues given by crew:
${clues}
Infer the secret word from the clues. Reply with ONLY the word. No extra text.`;
  const out = await chat(prompt, 20);
  return out.split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "") || "";
}

export async function generateSecretWord(): Promise<{
  category: string;
  word: string;
}> {
  const seed = Date.now();
  const prompt = `Pick a random, MODERATE-difficulty secret word for a party word-guessing game. Seed: ${seed}.
Return ONLY valid JSON like: {"category":"Food","word":"Sushi"}
Use common, everyday words (not obscure). Word can be one or two words. Categories: Animals, Food, Places, Objects, Jobs, Sports, Nature, etc. Make it different each time. No markdown.`;
  const out = await chat(prompt, 40);
  try {
    const match = out.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      if (obj.category && obj.word && typeof obj.word === "string") {
        return { category: String(obj.category), word: String(obj.word) };
      }
    }
  } catch {}
  return randomWord();
}

export async function generateDefinition(
  word: string,
  category: string,
): Promise<string> {
  const prompt = `Explain the word "${word}" (category: ${category}) in one short, simple sentence for a party game player who may not know it. Plain everyday language, no markdown, max 25 words.`;
  const out = await chat(prompt, 60);
  return (
    out
      .replace(/^["']|["']$/g, "")
      .trim()
      .slice(0, 300) || ""
  );
}

export async function generateClueSuggestions(
  word: string,
  category: string,
  previousClues: string[],
): Promise<string[]> {
  const prev = previousClues.length
    ? `Avoid repeating these: ${previousClues.join("; ")}.`
    : "";
  const prompt = `In a party word imposter game (category: ${category}), the secret word is "${word}". Suggest 3 distinct, short clues (2-8 words each) a player could give: related but not too obvious. ${prev} One clue per line, plain text, no numbering, no markdown.`;
  const out = await chat(prompt, 80);
  return out
    .split("\n")
    .map((l) =>
      l
        .replace(/^[-*\d.)\s]+/, "")
        .replace(/^["']|["']$/g, "")
        .trim(),
    )
    .filter((l) => l.length >= 2)
    .slice(0, 3);
}
