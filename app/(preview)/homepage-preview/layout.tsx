import { Toaster } from "@/components/ui/toaster"

/** The home page editor's preview. Outside the admin layout, so it takes the store's own light look and none of the admin's chrome. */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
