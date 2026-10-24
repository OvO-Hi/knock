import { getData } from "@/lib/data";
import type { ResourcesResponse } from "@/lib/api-types";

export const dynamic = "force-static";

export function GET() {
  const body: ResourcesResponse = { resources: getData().resources };
  return Response.json(body);
}
