import type { Metadata, Viewport } from "next"
import { Geist_Mono, Outfit } from "next/font/google"

import "./globals.css"
import { cn } from "@/lib/utils"

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = { title: "ShowMoto", appleWebApp: { capable: true, title: "ShowMoto", statusBarStyle: "default" }, formatDetection: { telephone: false } }
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" }

// Root layout is theme-neutral. The admin layout adds next-themes; tenant pages get the
// dealer's tokens from their own layout, so buyers never see a dark-mode switch.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("antialiased", fontMono.variable, "font-sans", outfit.variable)}>
      <body>{children}</body>
    </html>
  )
}
