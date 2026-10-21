/**
 * A status machine as data: which states exist and which moves between them are allowed. Verticals describe their
 * lifecycle once (orders, trips) and use the same helpers everywhere, so "may this move happen" is never re-implemented
 * in an action, a route and a UI button.
 */
export type StatusGraph<S extends string> = {
  readonly states: readonly S[]
  /** The states reachable from `from` in one move, in display order. */
  next(from: S): readonly S[]
  canMove(from: S, to: S): boolean
  /** Throws for an illegal move; returns `to` so it can be used inline. */
  assertMove(from: S, to: S): S
  isTerminal(state: S): boolean
}

export class IllegalTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot move from "${from}" to "${to}"`)
    this.name = "IllegalTransitionError"
  }
}

/**
 * `transitions` must list every state (a terminal state has `[]`). A move to a state that is not listed as a target is
 * illegal, and so is a move out of an unknown state.
 */
export function defineStatusGraph<S extends string>(transitions: Readonly<Record<S, readonly S[]>>): StatusGraph<S> {
  const states = Object.keys(transitions) as S[]
  for (const [from, targets] of Object.entries(transitions) as [S, readonly S[]][]) {
    for (const to of targets) {
      if (!(to in transitions)) throw new Error(`Status graph: "${from}" points at "${to}", which is not a state`)
    }
  }
  const next = (from: S): readonly S[] => transitions[from] ?? []
  const canMove = (from: S, to: S) => next(from).includes(to)
  return {
    states,
    next,
    canMove,
    assertMove(from, to) {
      if (!canMove(from, to)) throw new IllegalTransitionError(from, to)
      return to
    },
    isTerminal: (state) => next(state).length === 0,
  }
}
