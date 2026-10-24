// 우선순위 패널용: prioritize 도구를 그대로 호출 (CLAUDE.md §4.2)
import { ToolError, runTool } from "@/lib/tools";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const excludeFlags = q.getAll("exclude_flags").filter(Boolean);
  try {
    const r = runTool("prioritize", {
      region: q.get("region") ?? undefined,
      n: Number(q.get("n") ?? 10),
      constraints: {
        exclude_flags: excludeFlags,
        admin_type: q.get("admin_type") || undefined,
      },
    });
    return Response.json(r);
  } catch (e) {
    if (e instanceof ToolError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
