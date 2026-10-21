import type { ExpiryStatus } from "@/lib/cabs/expiry"

// Plain rows the server pages hand to the client screens. Everything here is already safe to show the signed-in operator
// (registration and phone numbers are decrypted on the server for them; nothing secret like a key or hash is included).

export type ClassRow = { id: string; name: string; seats: number; bags: number; ac: boolean; description: string; imageUrl: string; sortOrder: number; active: boolean; vehicles: number }
export type ClassOption = { id: string; name: string }

export type DocSummary = { expired: number; soon: number; total: number }

export type VehicleRow = {
  id: string
  classId: string
  className: string
  reg: string
  makeModel: string
  year: number | null
  colour: string
  fuel: string
  ownership: "own" | "attached"
  odometerKm: number
  status: "active" | "maintenance" | "inactive"
  docs: DocSummary
}

export type DocRow = { id: string; type: string; typeLabel: string; number: string; validFrom: string | null; validTill: string | null; fileKey: string | null; status: ExpiryStatus }
export type BlockedRow = { id: string; startsAt: string; endsAt: string; reason: string }

export type DriverRow = {
  id: string
  name: string
  phone: string
  licenceNo: string
  licenceValidTill: string | null
  licenceStatus: ExpiryStatus
  badgeNo: string
  employment: "employee" | "attached" | "freelance"
  languages: string[]
  status: "available" | "on_trip" | "off" | "inactive"
  docs: DocSummary
}
export type DutyRow = { id: string; startedAt: string; endedAt: string | null }
