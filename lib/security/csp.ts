/**
 * The Content-Security-Policy, built from an inventory of the origins the pages really load from (read from the code, not guessed):
 *   Razorpay Checkout (script, API, frame), Firebase Auth (SDK, token endpoints, the hosted sign-in frame, reCAPTCHA / App Check),
 *   Google Maps JS and tiles, OpenStreetMap (tiles, the embedded location map), our R2 media CDNs, the live-location socket, and
 *   direct-to-R2 video uploads.
 *
 * It is sent as Content-Security-Policy-REPORT-ONLY: the browser reports what it would have blocked and blocks nothing. Enforcing a
 * policy that was only read from code could break payments or sign-in, so it is switched on only after staging and production reports
 * (/api/t/csp-report) stay quiet for the real journeys. Inline scripts and styles are allowed for now because Next injects inline
 * hydration data; moving to nonces is the step after that.
 */
const CDNS = ["https://cdn.tany.in", "https://cdn.tanystaging.in"]
const TRACKERS = ["wss://track.tany.in", "wss://track.tanystaging.in"]
const GOOGLE_AUTH = ["https://apis.google.com", "https://www.google.com", "https://www.gstatic.com"]
const FIREBASE = ["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://firebaseinstallations.googleapis.com", "https://*.firebaseapp.com"]
const MAPS = ["https://maps.googleapis.com", "https://maps.gstatic.com", "https://places.googleapis.com"]
const RAZORPAY = ["https://checkout.razorpay.com", "https://api.razorpay.com", "https://lumberjack.razorpay.com"]
const OSM = ["https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org", "https://www.openstreetmap.org", "https://*.basemaps.cartocdn.com"]
const R2_UPLOADS = ["https://*.r2.cloudflarestorage.com"]

export const CSP_REPORT_PATH = "/api/t/csp-report"

export const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", ...RAZORPAY.slice(0, 1), ...GOOGLE_AUTH, ...MAPS.slice(0, 1)],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "img-src": ["'self'", "data:", "blob:", ...CDNS, ...MAPS, ...OSM, "https://*.googleusercontent.com", "https://*.ggpht.com"],
  "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
  "connect-src": ["'self'", ...CDNS, ...TRACKERS, ...R2_UPLOADS, ...FIREBASE, ...MAPS, ...RAZORPAY, "https://www.googleapis.com", "https://*.googleapis.com"],
  "frame-src": ["'self'", ...RAZORPAY, "https://*.firebaseapp.com", "https://accounts.google.com", "https://www.google.com", "https://www.openstreetmap.org"],
  "media-src": ["'self'", "blob:", ...CDNS],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'", "https://api.razorpay.com"],
  "frame-ancestors": ["'self'"],
}

export function cspReportOnly(): string {
  return [...Object.entries(CSP_DIRECTIVES).map(([k, v]) => `${k} ${v.join(" ")}`), `report-uri ${CSP_REPORT_PATH}`].join("; ")
}
