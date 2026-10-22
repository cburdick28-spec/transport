"use client";

import dynamic from "next/dynamic";

const GameView = dynamic(() => import("@/components/Game"), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-[#0b0f17] text-slate-400">Loading Madrid…</div>
  ),
});

export default function Home() {
  return <GameView />;
}
