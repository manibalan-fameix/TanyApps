import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"

// Auth.js tables (JWT sessions, so no sessions table). Shape follows @auth/drizzle-adapter.
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  /** E.164 (+91...). Lets a phone OTP sign-in reach a teammate added by number. */
  phone: text("phone").unique(),
  /** scrypt hash of a password an owner set for a teammate. Null for everyone else. */
  passwordHash: text("password_hash"),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
})

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)
