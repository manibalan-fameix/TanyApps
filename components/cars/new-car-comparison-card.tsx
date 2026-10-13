import { SAVINGS_EMI_ASSUMPTIONS, type NewCarSavings } from "@/lib/cars/savings"

const inr = new Intl.NumberFormat("en-IN")
const money = (value: number) => `₹${inr.format(Math.round(value))}`

// Shows what a new car of this model costs today and what the buyer keeps by choosing this one.
export function NewCarComparisonCard({
  savings,
  title,
}: {
  savings: NewCarSavings
  title: string
}) {
  const {
    newCarPrice,
    askingPrice,
    saving,
    savingPct,
    newEmi,
    usedEmi,
    emiSaving,
  } = savings
  const { downPaymentPct, annualRate, months } = SAVINGS_EMI_ASSUMPTIONS
  return (
    <section
      className="rounded-lg bg-muted p-5"
      aria-labelledby="new-car-comparison-heading"
    >
      <h2
        id="new-car-comparison-heading"
        className="text-xl font-medium tracking-tight"
      >
        Buy this, not a new one
      </h2>

      <div className="mt-4 rounded-md bg-background p-4">
        <p className="text-sm text-muted-foreground">You save</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-success">
          {money(saving)}{" "}
          <span className="text-base font-medium">({savingPct}% less)</span>
        </p>
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            New {title.replace(/^\d{4}\s/, "")}, ex-showroom today
          </dt>
          <dd className="font-medium tabular-nums">{money(newCarPrice)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">This car</dt>
          <dd className="font-medium tabular-nums">{money(askingPrice)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-border pt-3">
          <dt className="text-muted-foreground">Estimated EMI, new</dt>
          <dd className="font-medium tabular-nums">{money(newEmi)}/month</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Estimated EMI, this car</dt>
          <dd className="font-medium tabular-nums">{money(usedEmi)}/month</dd>
        </div>
        {emiSaving > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="font-medium">Lower EMI by</dt>
            <dd className="font-semibold text-success tabular-nums">
              {money(emiSaving)}/month
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-4 text-xs text-muted-foreground">
        New car price is the ex-showroom price shared by the dealer and excludes
        registration, insurance and other charges, so confirm it with a
        showroom. EMI assumes {downPaymentPct}% down payment, {annualRate}%
        interest over {months} months.
      </p>
    </section>
  )
}
