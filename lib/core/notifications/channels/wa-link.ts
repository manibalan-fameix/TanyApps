import { whatsappLink } from "../../../whatsapp"
import type { Channel, Notification } from "../types"

/**
 * The zero-setup channel: nothing is sent by us. The notification is marked `link_ready` and the operator (or the person) taps
 * a wa.me link that opens WhatsApp with the message ready. The link contains the phone number, so it is never stored: it is
 * built from the encrypted recipient each time it is needed (see waLinkFor in ../outbox.ts).
 */
export const waLinkChannel: Channel = {
  name: "wa_link",
  async send() {
    return { status: "link_ready" }
  },
}

/** The message text a wa_link notification carries in its payload. */
export function waText(n: Pick<Notification, "payload">): string {
  const text = n.payload.text
  return typeof text === "string" ? text : ""
}

export const buildWaLink = (phone: string, n: Pick<Notification, "payload">) => whatsappLink(phone, waText(n))
