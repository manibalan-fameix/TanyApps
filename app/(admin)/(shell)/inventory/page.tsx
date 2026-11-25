import { redirect } from "next/navigation"

/** Stock is now managed on the catalogue page; old links and bookmarks land there. */
export default function InventoryPage() {
  redirect("/menu")
}
