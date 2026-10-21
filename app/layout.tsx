import type { Metadata, Viewport } from "next"
import { Space_Grotesk } from "next/font/google"

import "./globals.css"
import { cn } from "@/lib/utils"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = { title: "TanyApps", appleWebApp: { capable: true, title: "TanyApps", statusBarStyle: "default" }, formatDetection: { telephone: false } }
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" }

// Root layout is theme-neutral. The admin layout adds next-themes; tenant pages get the
// dealer's tokens from their own layout, so buyers never see a dark-mode switch.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("antialiased", "font-sans", spaceGrotesk.variable)}>
      <body>{children}</body>
    </html>
  )
}
