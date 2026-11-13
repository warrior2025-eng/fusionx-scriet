import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";

/** The 1200×627 share image (LinkedIn's size) in the FusionX colours: only verified work. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[a-z0-9]{10}$/.test(code)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_share_card", { p_code: code });
  const card = ((data ?? []) as { name: string; mission: string; tasks: string[]; done_at: string }[])[0];
  if (!card) return new Response("Not found", { status: 404 });
  const tasks = card.tasks.slice(0, 4);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#00030D", color: "#FEFEFE", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 14, height: 56, background: "#004DF6", transform: "skewX(-18deg)" }} />
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>FusionX@SCRIET</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 26, color: "#9DB8FF" }}>{`${card.name} worked on`}</div>
          <div style={{ fontSize: card.mission.length > 40 ? 52 : 64, fontWeight: 700, lineHeight: 1.1 }}>{card.mission}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {tasks.map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "#D7DEF0" }}>
                <div style={{ width: 12, height: 12, background: "#004DF6" }} />
                <div>{t}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#9DB8FF" }}>
          <div>Verified by the FusionX team</div>
          <div>fxscriet.com/impact</div>
        </div>
      </div>
    ),
    { width: 1200, height: 627 },
  );
}
