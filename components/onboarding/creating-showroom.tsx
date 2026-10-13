"use client"

import Image from "next/image"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

const SLIDES = [
  {
    src: "/onboarding/step-1.jpg",
    title: "Creating your showroom",
    text: "Setting up a home for your cars.",
  },
  {
    src: "/onboarding/step-2.jpg",
    title: "Showing every detail",
    text: "Buyers see inside and out before they visit.",
  },
  {
    src: "/onboarding/step-3.jpg",
    title: "Getting ready for buyers",
    text: "Your link is made to be shared on WhatsApp.",
  },
  {
    src: "/onboarding/step-4.jpg",
    title: "Adding your brand",
    text: "Your name, logo and colours, front and centre.",
  },
  {
    src: "/onboarding/step-5.jpg",
    title: "Final checks",
    text: "Almost there. Your showroom goes live in a moment.",
  },
] as const

const INTERVAL_MS = 3000

/** Full-screen overlay shown while the showroom is being created: a new picture and line every 3 seconds. */
export function CreatingShowroom() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const t = setInterval(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      INTERVAL_MS
    )
    return () => clearInterval(t)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/20 p-6 backdrop-blur-2xl"
    >
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-3xl">
        {SLIDES.map((s, i) => (
          <Image
            key={s.src}
            src={s.src}
            alt=""
            fill
            sizes="384px"
            priority={i === 0}
            className={cn(
              "object-cover transition-all duration-700 ease-out motion-reduce:transition-none",
              i === index ? "scale-100 opacity-100" : "scale-105 opacity-0"
            )}
          />
        ))}
      </div>
      <div
        key={index}
        className="flex max-w-sm animate-in flex-col items-center gap-1 text-center duration-500 fade-in slide-in-from-bottom-2"
      >
        <h2 className="text-xl font-semibold text-balance">
          {SLIDES[index].title}
        </h2>
        <p className="text-sm text-balance text-muted-foreground">
          {SLIDES[index].text}
        </p>
      </div>
      <div className="flex gap-2" aria-hidden>
        {SLIDES.map((s, i) => (
          <span
            key={s.src}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index ? "w-6 bg-primary" : "w-1.5 bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  )
}
