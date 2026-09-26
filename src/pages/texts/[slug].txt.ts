import { readFileSync } from "node:fs";
import type { APIRoute } from "astro";
import { getCatalog } from "@/lib/data";

/** Official license texts (from the SPDX license list) for copy/download in reports. */
export function getStaticPaths() {
  return [...getCatalog().licenses.values()].filter((l) => l.hasText).map((l) => ({ params: { slug: l.slug } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(readFileSync(`data/texts/${params.slug}.txt`, "utf8"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
