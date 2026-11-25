import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PLANS, TRIAL_DAYS, isFreePlan, monthlyPriceFor, planLimitLabel, priceFor, yearlyMonthsFor, type SignupPlanKey } from "@/lib/plans"
import { productForIndustry } from "@/lib/products"
import { getVertical, verticalList } from "@/lib/verticals"

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

/** Public price list, read from the same plan table that billing charges from. */
export function PricingSection() {
  return (
    <Tabs defaultValue={verticalList[0].key} className="gap-6">
      <TabsList className="self-center">
        {verticalList.map((v) => (
          <TabsTrigger key={v.key} value={v.key}>
            {v.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {verticalList.map((v) => {
        const plans = getVertical(v.key).offeredPlans as readonly SignupPlanKey[]
        return (
          <TabsContent key={v.key} value={v.key}>
            <div className="grid gap-4 sm:grid-cols-2 lg:flex">
              {plans.map((key) => (
                <Card key={key} className="lg:flex-1">
                  <CardHeader>
                    <CardTitle>
                      {productForIndustry(v.key).name} {PLANS[key].label}
                    </CardTitle>
                    <CardDescription>{planLimitLabel(v.key, key)}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {isFreePlan(key) ? (
                      <>
                        <p className="text-3xl font-semibold">{rupees(0)}</p>
                        <p className="text-muted-foreground">No payment method needed</p>
                      </>
                    ) : (
                      <>
                        <p className="text-3xl font-semibold">
                          {rupees(monthlyPriceFor(v.key, key))}
                          <span className="text-sm font-normal text-muted-foreground"> / month</span>
                        </p>
                        <p className="text-muted-foreground">
                          or {rupees(priceFor(v.key, key, "yearly"))} a year (pay for {yearlyMonthsFor(v.key)} months)
                        </p>
                        <p className="text-muted-foreground">{TRIAL_DAYS}-day free trial</p>
                      </>
                    )}
                    {PLANS[key].customDomain && <p>Your own domain and branding</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
