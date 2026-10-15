const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-10-23" as "23 Oct". */
export const dueText = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`

/** Whether what the user said is a clear yes / a clear no, for confirming or cancelling a draft. */
export const isYes = (t: string) => /\b(yes|yeah|yep|yup|sure|okay|ok|go ahead|create it|do it|confirm|please do|go for it|that's right|correct)\b/i.test(t)
export const isNo = (t: string) => /\b(no|nope|cancel|never mind|nevermind|don't|do not|stop|forget it|scrap it|leave it)\b/i.test(t)
