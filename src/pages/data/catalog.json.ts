import type { APIRoute } from "astro";
import { getCatalog } from "@/lib/data";

/** Full catalog (all locales) for external consumers and the chat worker. */
export const GET: APIRoute = () => {
  const raw = getCatalog().raw;
  return new Response(JSON.stringify(raw), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
