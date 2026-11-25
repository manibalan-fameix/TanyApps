"use client"

import { type StoreInfo, type StoreReview, StoreAbout, StoreReviews } from "@/components/restaurant/store/store-tabs"
import { STORE_CONTENT } from "@/components/restaurant/store/layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TRIGGER = "h-11! flex-none rounded-full border-0 bg-muted! px-7 text-base font-semibold text-muted-foreground transition-colors after:hidden hover:text-foreground data-active:bg-foreground! data-active:text-background! data-active:shadow-md"

/** The Store info page: About and Reviews as two tabs. */
export function InfoTabs({ info, reviews, rating, write }: { info: StoreInfo; reviews: StoreReview[]; rating: { value: number; count: number } | null; write: "signed-in" | "signed-out" | "done" | "hidden" }) {
  return (
    <Tabs defaultValue="about" className="gap-0">
      {/* The tabs sit in the same page width as the home page, centred. The rule under them still runs edge to edge. */}
      <div className="border-b border-border">
        <div className={STORE_CONTENT}>
          <TabsList variant="line" className="h-[4.5rem]! w-full justify-center gap-3 bg-background py-3">
            <TabsTrigger value="about" className={TRIGGER}>About</TabsTrigger>
            <TabsTrigger value="reviews" className={TRIGGER}>Reviews{reviews.length ? ` (${rating?.count ?? reviews.length})` : ""}</TabsTrigger>
          </TabsList>
        </div>
      </div>
      <TabsContent value="about" className="text-sm">
        <StoreAbout info={info} rating={rating} />
      </TabsContent>
      <TabsContent value="reviews" className="mx-auto w-full max-w-3xl px-4 pt-5 text-sm sm:px-6">
        <StoreReviews reviews={reviews} rating={rating} write={write} />
      </TabsContent>
    </Tabs>
  )
}
