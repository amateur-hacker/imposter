import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/sign-in" });

export const config = {
  matcher: ["/game/:path*", "/settings/:path*", "/profile/:path*"],
};
