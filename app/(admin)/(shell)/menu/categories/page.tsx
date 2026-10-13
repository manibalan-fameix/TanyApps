import { redirect } from "next/navigation"

// Categories moved to their own sidebar page.
export default function OldCategoriesPage() {
  redirect("/categories")
}
