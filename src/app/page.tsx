import {
  Brain,
  Gamepad2,
  History,
  Play,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Gamepad2 className="h-6 w-6" /> Imposter
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link href="/sign-in">
            <Button>Get started</Button>
          </Link>
        </nav>
      </header>

      <section className="container mx-auto px-6 py-16 text-center">
        <Badge variant="secondary" className="mb-4">
          AI-powered social deduction
        </Badge>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
          Play Imposter whenever you want
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          The classic word imposter party game, ready on demand. No friends
          required — mix AI and manual players, or let AI fill every seat.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/sign-in?next=/game">
            <Button size="lg" className="gap-2">
              <Play className="h-5 w-5" /> Play now
            </Button>
          </Link>
          <Link href="/sign-in?next=/game">
            <Button size="lg" variant="outline" className="gap-2">
              <Users className="h-5 w-5" /> Choose size
            </Button>
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-6 py-12 grid md:grid-cols-3 gap-6">
        {[
          {
            icon: Brain,
            title: "Believable AI players",
            desc: "Each AI has a personality, bluffs, accuses, and makes human-like mistakes.",
          },
          {
            icon: Users,
            title: "Mix player types",
            desc: "Combine AI and manual players in any configuration for 3, 5, or 7 opponents.",
          },
          {
            icon: Shield,
            title: "Fair & authoritative",
            desc: "Roles, words, and winners are controlled server-side. No cheating.",
          },
          {
            icon: History,
            title: "Persistent history",
            desc: "Track games, stats, and revisit every clue and vote.",
          },
          {
            icon: Gamepad2,
            title: "Classic rules",
            desc: "Secret word, clues, discussion, voting, and a final imposter guess.",
          },
          {
            icon: Sparkles,
            title: "Polished experience",
            desc: "Responsive, installable PWA with smooth animations.",
          },
        ].map((f) => (
          <Card key={f.title}>
            <CardContent className="pt-6">
              <f.icon className="h-8 w-8 mb-3 text-primary" />
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="container mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-center mb-6">How it works</h2>
        <div className="grid md:grid-cols-4 gap-4 text-center">
          {[
            "Get a secret word",
            "Give a clue",
            "Vote the imposter",
            "Reveal & guess",
          ].map((s, i) => (
            <div key={s} className="p-4 rounded-lg border bg-card">
              <div className="text-2xl font-bold text-primary mb-2">
                {i + 1}
              </div>
              <div className="font-medium">{s}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="container mx-auto px-6 py-8 text-center text-sm text-muted-foreground border-t">
        © 2026 Imposter. Built for fun.
      </footer>
    </main>
  );
}
