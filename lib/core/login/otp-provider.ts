import { verifiedPhone } from "../../auth/firebase-phone"

/**
 * Who sends the one-time code and who vouches for it. The login page and the ticket endpoint talk only to these two interfaces,
 * so changing from Firebase to an Indian SMS gateway (MSG91) is a change of PHONE_OTP_PROVIDER, not a rewrite.
 *
 * Client half (the browser): sends the code and turns the code the person typed into a `proof`.
 * Server half: checks a proof and says which phone number it proves.
 */
export type OtpProviderName = "firebase" | "msg91"

export const INDIA_MOBILE = /^\+91[6-9][0-9]{9}$/

export interface PhoneOtpServer {
  readonly name: OtpProviderName
  /** The E.164 number the proof vouches for, or null. India only: anything else is null. */
  verify(proof: string): Promise<string | null>
}

export const firebasePhoneOtpServer: PhoneOtpServer = {
  name: "firebase",
  async verify(proof) {
    const phone = await verifiedPhone(proof)
    return phone && INDIA_MOBILE.test(phone) ? phone : null
  },
}

/**
 * MSG91 is the planned replacement. Not built: it needs the DLT registration (entity, sender id, approved OTP template) first. Until
 * then it refuses everything, so choosing it by mistake fails safe instead of letting anyone in.
 */
export const msg91PhoneOtpServer: PhoneOtpServer = {
  name: "msg91",
  async verify() {
    return null
  },
}

export function configuredOtpProvider(env: Record<string, string | undefined> = process.env): OtpProviderName {
  return env.PHONE_OTP_PROVIDER?.trim() === "msg91" ? "msg91" : "firebase"
}

export function otpServer(name: OtpProviderName = configuredOtpProvider()): PhoneOtpServer {
  return name === "msg91" ? msg91PhoneOtpServer : firebasePhoneOtpServer
}
