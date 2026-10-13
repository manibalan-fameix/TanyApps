import { randomBytes, scrypt, timingSafeEqual } from "crypto"

const KEY_LENGTH = 64

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, (err, key) => (err ? reject(err) : resolve(key))),
  )

/** "salt:hash", both base64. Never store or log the password itself. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `${salt.toString("base64")}:${(await derive(password, salt)).toString("base64")}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [salt, hash] = (stored ?? "").split(":")
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, "base64")
  const actual = await derive(password, Buffer.from(salt, "base64"))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
