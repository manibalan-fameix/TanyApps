import { DrizzleAdapter } from "@auth/drizzle-adapter"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

import { unscopedDb } from "../db/client"
import { accounts, users } from "../db/schema"
import { firebaseProjectId, verifyFirebaseIdToken } from "./firebase"
import { findOrCreateFirebaseUser } from "./firebase-user"
import { applySignInClaims, exposeClaims, identityMaySignIn, withVerifiedClaims } from "./session-claims"
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
        if (!identityMaySignIn(identity)) return null
        const user = await findOrCreateFirebaseUser(identity)
        return user ? withVerifiedClaims(user, identity) : null
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
    // Claims are written only at sign-in (see ./session-claims.ts). Sessions that predate them have none and must sign in again
    // before they can use the super admin.
    jwt: ({ token, user }) => applySignInClaims(token, user),
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return exposeClaims(session, token)
    },
  },
})

export const isAuthConfigured = () =>
  Boolean(process.env.AUTH_SECRET && firebaseProjectId() && process.env.FIREBASE_API_KEY && process.env.FIREBASE_APP_ID)
