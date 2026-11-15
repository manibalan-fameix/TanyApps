import Link from "next/link"

import { BANNER_TONE_CLASS, type StoreBanner, isExternalLink } from "@/lib/restaurant/banners"
import { cn } from "@/lib/utils"

/**
 * One promo banner: a short title, a line of text and a button on the left, a picture on the right.
 * With a link the whole banner is tappable; the button is the visible cue for it.
 */
export function PromoBanner({ banner, className }: { banner: Omit<StoreBanner, "id">; className?: string }) {
  const tone = BANNER_TONE_CLASS[banner.tone]
  const body = (
    <>
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1 py-4 pr-2 pl-4">
        <p className="line-clamp-2 text-[17px] leading-tight font-bold tracking-tight">{banner.title}</p>
        {banner.subtitle ? <p className="line-clamp-2 text-sm leading-snug opacity-90">{banner.subtitle}</p> : null}
        {banner.buttonLabel && banner.linkUrl ? (
          <span className={cn("mt-2 inline-flex h-9 items-center rounded-full px-5 text-sm font-bold", tone.button)}>{banner.buttonLabel}</span>
        ) : null}
      </div>
      {banner.imageUrl ? (
        <div className="relative w-[36%] shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        </div>
      ) : (
        <div className="w-4 shrink-0" />
      )}
    </>
  )
  const base = cn("flex h-40 w-full overflow-hidden rounded-2xl", tone.card, className)
  if (!banner.linkUrl) return <div className={base}>{body}</div>
  return isExternalLink(banner.linkUrl) ? (
    <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={base} aria-label={banner.title}>
      {body}
    </a>
  ) : (
    <Link href={banner.linkUrl} className={base} aria-label={banner.title}>
      {body}
    </Link>
  )
}

/** Swipeable row of the restaurant's banners, shown under the search bar on the phone home screen. */
export function PromoBanners({ banners }: { banners: StoreBanner[] }) {
  if (banners.length === 0) return null
  return (
    <section aria-label="Offers" className="mt-4">
      <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {banners.map((b) => (
          <li key={b.id} className={cn("snap-start", banners.length === 1 ? "w-full" : "w-[86%] max-w-sm shrink-0")}>
            <PromoBanner banner={b} />
          </li>
        ))}
      </ul>
    </section>
  )
}
