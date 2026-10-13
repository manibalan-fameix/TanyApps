/** What a half-finished "add by voice" session keeps, so the dealer can come back to the same page. */
export type VoiceDraft = {
  /** The blanks filled so far. Checked again on the way in and out; never trusted as stored. */
  values: Record<string, unknown>
  lang: "en" | "ta" | "tg"
  /** True once the dealer has moved on to photos. From then on Continue resumes the normal steps. */
  done: boolean
}
