/**
 * How long a booking waits for an answer.
 *
 * A request waits `min(max, minutes until pickup - 60)` minutes, but never less than 10, so the operator always has a real chance
 * to answer and a request is never left open past the point where a car could still be arranged. The operator is nudged at half
 * the window. After the operator accepts a booking that needs an advance, the customer has `unpaidHoldMinutes` to pay it.
 */
export const RESPOND_FLOOR_MINUTES = 10
/** The cut-off before pickup: the window ends at least this long before the car is due. */
export const PICKUP_BUFFER_MINUTES = 60

export function respondWindowMinutes(input: { now: Date; startAt: Date; maxMinutes: number }): number {
  const untilPickup = Math.floor((input.startAt.getTime() - input.now.getTime()) / 60_000)
  return Math.max(RESPOND_FLOOR_MINUTES, Math.min(input.maxMinutes, untilPickup - PICKUP_BUFFER_MINUTES))
}

const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000)

export type RequestHold = { expiresAt: Date; alertAt: Date; windowMinutes: number }

/** The deadlines of a new request. The alert is half-way through the window. */
export function requestHold(input: { now: Date; startAt: Date; maxMinutes: number }): RequestHold {
  const windowMinutes = respondWindowMinutes(input)
  return { windowMinutes, expiresAt: addMinutes(input.now, windowMinutes), alertAt: addMinutes(input.now, windowMinutes / 2) }
}

/** The customer's deadline to pay the advance once the operator has accepted. */
export const paymentHoldExpiry = (now: Date, unpaidHoldMinutes: number): Date => addMinutes(now, unpaidHoldMinutes)
