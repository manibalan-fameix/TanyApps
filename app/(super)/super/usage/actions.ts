"use server"

import { revalidatePath } from "next/cache"

import { superAdminActor } from "@/lib/super/guard"
import { saveUsageLimit } from "@/lib/super/usage"

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim()
  return s === "" ? null : Number(s)
}

/** The Tany team sets a usage limit from the form on /super/usage. The guard runs here and again inside saveUsageLimit. */
export async function submitUsageLimit(formData: FormData): Promise<void> {
  await superAdminActor()
  const business = String(formData.get("business") ?? "").trim()
  const res = await saveUsageLimit({
    businessId: business === "" ? null : business,
    feature: String(formData.get("feature") ?? ""),
    includedMonthly: num(formData.get("includedMonthly")),
    abuseDaily: num(formData.get("abuseDaily")),
    estUnitCostMicros: num(formData.get("estUnitCostMicros")),
    topupQuantity: num(formData.get("topupQuantity")) ?? 0,
    mode: formData.get("mode") === "enforce" ? "enforce" : "observe",
    exempt: formData.get("exempt") === "on",
  })
  if (!res.ok) throw new Error(res.error)
  revalidatePath("/super/usage")
}
