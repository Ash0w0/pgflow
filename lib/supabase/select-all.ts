import "server-only";

/** Matches PostgREST's default `max_rows` (see supabase/config.toml). */
const PAGE_SIZE = 1000;

type PageResult<Row> = PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;

/**
 * Reads every row of a query by paging with `.range()`. A bare `.limit(n)` is
 * silently capped by PostgREST `max_rows`, which drops rows from registers and
 * money totals without any error. The query must have a stable `.order()`.
 */
export async function selectAll<Row>(
  page: (from: number, to: number) => PageResult<Row>,
  maxRows = 100_000,
): Promise<{ data: Row[] | null; error: { message: string } | null }> {
  const rows: Row[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return { data: rows, error: null };
  }
  return { data: null, error: { message: "The result is too large to load at once." } };
}
