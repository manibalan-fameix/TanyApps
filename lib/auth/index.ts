import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

import { unscopedDb } from "../db/client"
import { accounts, users } from "../db/schema"
import { firebaseProjectId, verifyFirebaseIdToken } from "./firebase"
import { findOrCreateFirebaseUser } from "./firebase-user"
import { authenticateTeammate } from "./teammate-login"

// Sign-in happens in the browser with Firebase (Google, phone OTP, email + password). The browser
// sends the Firebase ID token here; we verify it ourselves and start a normal app session.
// Keys come from env: AUTH_SECRET, FIREBASE_PROJECT_ID (+ FIREBASE_API_KEY, FIREBASE_APP_ID for the browser).
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(unscopedDb, { usersTable: users, accountsTable: accounts }),
  session: { strategy: "jwt" },
  // Host is validated by proxy.ts: only app.<ROOT_DOMAIN> can reach /api/auth.
  trustHost: true,
  providers: [
    Credentials({
      id: "firebase",
      credentials: { idToken: {} },
      async authorize(credentials) {
        const identity = await verifyFirebaseIdToken(String(credentials?.idToken ?? ""))
        if (!identity) return null
        // Email + password accounts must prove they own the address before they get a session.
        if (identity.provider === "password" && !identity.emailVerified) return null
        return findOrCreateFirebaseUser(identity)
      },
    }),
    Credentials({
      id: "teammate",
      credentials: { email: {}, password: {} },
      authorize: (credentials) => authenticateTeammate(String(credentials?.email ?? ""), String(credentials?.password ?? "")),
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
  },
})

export const isAuthConfigured = () =>
  Boolean(process.env.AUTH_SECRET && firebaseProjectId() && process.env.FIREBASE_API_KEY && process.env.FIREBASE_APP_ID)
