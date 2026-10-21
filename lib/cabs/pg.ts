/** Postgres error code of a failed query, wherever the driver put it. */
export function pgCode(e: unknown): string | undefined {
  const x = e as { code?: string; cause?: { code?: string } } | null
  return x?.cause?.code ?? x?.code
}
export const isUniqueViolation = (e: unknown) => pgCode(e) === "23505"
