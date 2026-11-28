"use client"

import Link from "next/link"

import { requestHref } from "@/components/restaurant/store/request-link"
import { useStoreTerms } from "@/components/restaurant/store/terms-context"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { aOrAn } from "@/lib/verticals/terms"
import { cn } from "@/lib/utils"

/** The "can't find it?" card at the foot of the home page. */
export function RequestPrompt({ className }: { className?: string }) {
  const terms = useStoreTerms()
  return (
    <Card className={cn("items-center text-center", className)}>
      <CardHeader className="w-full justify-items-center">
        <CardTitle>Can’t find what you need?</CardTitle>
        <CardDescription>Tell us the {terms.item} you are looking for, or ask us anything.</CardDescription>
      </CardHeader>
      <CardFooter className="flex-wrap justify-center gap-2">
        <Link href={requestHref()} className={buttonVariants()}>Request {aOrAn(terms.item)}</Link>
        <Link href="/contact?type=question" className={buttonVariants({ variant: "outline" })}>Ask a question</Link>
      </CardFooter>
    </Card>
  )
}
