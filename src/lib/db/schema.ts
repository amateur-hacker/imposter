import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name"),
  theme: text("theme").default("system"),
  soundEnabled: boolean("sound_enabled").default(true),
  animationsEnabled: boolean("animations_enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  secretWord: text("secret_word").notNull(),
  imposterWord: text("imposter_word").notNull(),
  imposterPlayerId: text("imposter_player_id").notNull(),
  opponentCount: integer("opponent_count").notNull(),
  config: jsonb("config").notNull(),
  status: text("status").notNull().default("in_progress"), // in_progress | completed | abandoned
  phase: text("phase").notNull().default("clue"), // clue | discussion | vote | guess | results
  turnOrder: jsonb("turn_order").notNull(), // string[]
  currentTurnIndex: integer("current_turn_index").notNull().default(0),
  winner: text("winner"), // crew | imposter
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
});

export const gamePlayers = pgTable(
  "game_players",
  {
    id: text("id").notNull(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playerIndex: integer("player_index").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(), // human | ai | manual
    isImposter: boolean("is_imposter").notNull().default(false),
    isEliminated: boolean("is_eliminated").notNull().default(false),
    personality: text("personality"),
    avatarSeed: text("avatar_seed"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.gameId, t.id] }),
  }),
);

export const clues = pgTable("clues", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  playerId: text("player_id").notNull(),
  clueText: text("clue_text").notNull(),
  turnOrder: integer("turn_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const votes = pgTable("votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  voterId: text("voter_id").notNull(),
  targetId: text("target_id").notNull(),
  round: integer("round").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const guesses = pgTable("guesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  playerId: text("player_id").notNull(),
  guessWord: text("guess_word").notNull(),
  correct: boolean("correct").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
