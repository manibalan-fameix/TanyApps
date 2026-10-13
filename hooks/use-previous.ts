import { useState } from "react"

/**
 * Returns the previous value of a variable
 */
export function usePrevious<T>(value: T): T | undefined {
  const [state, setState] = useState<{ current: T; previous: T | undefined }>({ current: value, previous: undefined })
  if (state.current !== value) setState({ current: value, previous: state.current })
  return state.previous
}
