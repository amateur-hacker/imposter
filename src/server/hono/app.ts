import { Hono } from "hono";
import { handle } from "hono/vercel";
import { gameRoutes } from "./routes/game";
import { profileRoutes } from "./routes/profile";
import { settingsRoutes } from "./routes/settings";

const app = new Hono().basePath("/api");

app.route("/game", gameRoutes);
app.route("/profile", profileRoutes);
app.route("/settings", settingsRoutes);

app.get("/health", (c) => c.json({ ok: true }));

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
