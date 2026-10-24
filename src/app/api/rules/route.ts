import { getData } from "@/lib/data";
import type { RulesResponse } from "@/lib/api-types";

export const dynamic = "force-static";

export function GET() {
  const { rules, levelPolicy } = getData();
  const body: RulesResponse = { rules, levelPolicy };
  return Response.json(body);
}
