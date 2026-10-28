"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth/client";

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/game";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authClient
      .getSession()
      .then((res: any) => {
        if (res?.data?.session || res?.data?.user) {
          router.replace(next);
        }
      })
      .catch(() => {});
  }, [next, router]);

  async function signInGoogle() {
    setLoading(true);
    setError(null);
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: next });
    } catch (e: any) {
      setError(e?.message || "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign in to Imposter</CardTitle>
          <CardDescription>
            Use your Google account to play and save your stats.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={signInGoogle}
            disabled={loading}
          >
            {loading ? "Redirecting..." : "Continue with Google"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SignInInner />
    </Suspense>
  );
}
