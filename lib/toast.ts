import { sileo, type SileoOptions } from "sileo"

// One toast API for the whole product (sileo underneath). Call sites pass the message as the
// title, same shape they used before: toast.success("Saved.", { description, action, duration }).
type ToastOptions = {
  description?: SileoOptions["description"]
  action?: { label: string; onClick: () => void }
  duration?: number | null
}

function show(fire: (opts: SileoOptions) => string) {
  return (message: string, opts: ToastOptions = {}) => {
    // A long one-line title overflows the pill; a sentence-style message becomes title + description.
    const split = opts.description === undefined ? message.match(/^(.{3,60}?)[.!]\s+(.+)$/) : null
    return fire({
      title: split ? split[1] : message,
      description: split ? split[2] : opts.description,
      duration: opts.duration,
      // Sileo stamps a toast with its default (top-right) when it is created, before any <Toaster position> applies.
      position: "top-center",
      button: opts.action && { title: opts.action.label, onClick: opts.action.onClick },
    })
  }
}

export const toast = {
  success: show(sileo.success),
  error: show(sileo.error),
  info: show(sileo.info),
  warning: show(sileo.warning),
  // Neutral notice (payment pending, "open the app to paste", ...)
  message: show(sileo.info),
  promise: sileo.promise,
  dismiss: sileo.dismiss,
  clear: sileo.clear,
}
