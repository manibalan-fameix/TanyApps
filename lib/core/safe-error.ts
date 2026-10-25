/**
 * An error message that is safe to write to logs and to a job's recorded result.
 *
 * When a database statement fails, Drizzle's message is "Failed query: <sql>\nparams: <the values>": buyer names, phone
 * ciphertext, payment ids. None of that belongs in a log. The driver's own message (the SQLSTATE and, for example, "duplicate
 * key value violates unique constraint ...") says what went wrong and carries no row values, so that is what is kept.
 */
export function safeErrorMessage(error: unknown, max = 200): string {
  if (!(error instanceof Error)) return "unknown"
  const cause = (error as { cause?: { message?: string; code?: string } }).cause
  if (/^Failed query:/.test(error.message)) {
    const why = cause?.message ? `: ${cause.message.split("\n")[0]}` : ""
    return `database error${cause?.code ? ` ${cause.code}` : ""}${why}`.slice(0, max)
  }
  return error.message.split("\nparams:")[0].slice(0, max)
}
