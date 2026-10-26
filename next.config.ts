import type { NextConfig } from "next"

import { cspReportOnly } from "./lib/security/csp.ts"

/**
 * Baseline response headers for every route. The Content-Security-Policy is REPORT-ONLY (lib/security/csp.ts): the pages load maps, Razorpay
 * checkout and Firebase auth, and an enforced policy written from the code alone could break them, so it only reports until the reports
 * from real journeys on staging and production are clean (see docs/architecture/SECURITY_AND_TENANCY.md).
 * Camera, microphone and location stay allowed for our own origin because photo capture, voice notes and rider tracking use them.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=15552000" },
  // Report-only: browsers tell /api/t/csp-report what they would block and block nothing. Enforce only after the reports stay quiet.
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly() },
]

const nextConfig: NextConfig = {
  // The e2e run uses its own build dir so it never fights a dev server you already have open.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The dev badge floats over the bottom-left corner, where the camera's Skip button sits.
  ...(process.env.E2E === "1" ? { devIndicators: false as const } : {}),
  // The Cloudflare (workerd) bundle resolves pg's socket shim through this condition; tracing
  // would otherwise keep only the empty Node stub and the bundle step fails.
  outputFileTracingIncludes: { "/*": ["./node_modules/pg-cloudflare/**/*"] },
  // /login serves HTML to navigations and an RSC payload to router fetches from the same URL. If an edge cache
  // stores the payload, iOS browsers download it as "login.txt" instead of rendering the page.
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/login",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Vary", value: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept" },
        ],
      },
    ]
  },
  experimental: {
    // Plate photos travel to the OCR action as base64. Photos and video go straight to storage.
    serverActions: { bodySizeLimit: "2mb" },
  },
}

export default nextConfig
