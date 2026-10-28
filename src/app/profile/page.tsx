"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfilePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  async function openGame(id: string) {
    const res = await fetch(`/api/profile/${id}`);
    const d = await res.json();
    setSelected(d);
  }

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  const s = data?.stats;
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Profile & Stats</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Games", value: s?.totalGames ?? 0 },
          { label: "Wins", value: s?.wins ?? 0 },
          { label: "Win rate", value: `${s?.winRate ?? 0}%` },
          { label: "Imposter wins", value: s?.imposterWins ?? 0 },
        ].map((x) => (
          <Card key={x.label}>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold">{x.value}</div>
              <div className="text-sm text-muted-foreground">{x.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent games</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(!data?.recentGames || data.recentGames.length === 0) && (
            <p className="text-muted-foreground">No games yet.</p>
          )}
          {data?.recentGames?.map((g: any) => (
            <div
              key={g.id}
              className="flex items-center justify-between p-2 border rounded"
            >
              <div>
                <span className="font-medium">{g.category}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {new Date(g.startedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    g.winner === "imposter" ? "destructive" : "secondary"
                  }
                >
                  {g.winner || g.status}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openGame(g.id)}
                >
                  View
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Game details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p>
                <strong>Category:</strong> {selected.game.category}
              </p>
              <p>
                <strong>Secret word:</strong> {selected.game.secretWord}
              </p>
              <p>
                <strong>Winner:</strong> {selected.game.winner}
              </p>
              <p>
                <strong>Imposter:</strong>{" "}
                {selected.players.find((p: any) => p.isImposter)?.name}
              </p>
              <div>
                <strong>Clues:</strong>
                {selected.clues.map((c: any) => (
                  <div key={c.id}>
                    {
                      selected.players.find((p: any) => p.id === c.playerId)
                        ?.name
                    }
                    : {c.clueText}
                  </div>
                ))}
              </div>
              <div>
                <strong>Votes:</strong>
                {selected.votes.map((v: any) => (
                  <div key={`${v.voterId}-${v.targetId}`}>
                    {
                      selected.players.find((p: any) => p.id === v.voterId)
                        ?.name
                    }{" "}
                    →{" "}
                    {
                      selected.players.find((p: any) => p.id === v.targetId)
                        ?.name
                    }
                  </div>
                ))}
              </div>
              <div>
                <strong>Guesses:</strong>
                {selected.guesses.map((g: any, i: number) => (
                  <div key={`${g.playerId}-${g.guessWord}`}>
                    {
                      selected.players.find((p: any) => p.id === g.playerId)
                        ?.name
                    }
                    : {g.guessWord} {g.correct ? "✓" : "✗"}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
