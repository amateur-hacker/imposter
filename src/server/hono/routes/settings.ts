import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { requireAuth } from "../middleware/auth";

const app = new Hono();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const userId = (c as any).get("userId") as string;
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return c.json({ profile: profile || null });
});

app.patch("/", async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json().catch(() => ({}));
  const schema = z.object({
    displayName: z.string().max(60).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    soundEnabled: z.boolean().optional(),
    animationsEnabled: z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);
  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (existing.length) {
    await db
      .update(userProfiles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  } else {
    await db.insert(userProfiles).values({ userId, ...parsed.data });
  }
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return c.json({ profile });
});

export { app as settingsRoutes };
export default app;
