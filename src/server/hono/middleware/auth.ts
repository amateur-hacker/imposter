import { createMiddleware } from "hono/factory";
import { auth } from "@/lib/auth/server";

export const requireAuth = createMiddleware(async (c, next) => {
  const session = await auth.getSession();
  const user = session?.data?.user;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  (c as any).set("userId", user.id);
  (c as any).set("userName", user.name || user.email || "Player");
  (c as any).set("user", user);
  await next();
});
