"use client"

import Link from "next/link"
import { useEffect, useState, useSyncExternalStore, useTransition } from "react"
import { toast } from "@/lib/toast"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AiMagicIcon,
  GridViewIcon,
  ArrowRight01Icon,
  Calendar03Icon,
  CancelCircleIcon,
  Call02Icon,
  Car01Icon,
  CheckmarkCircle01Icon,
  DashboardSpeed01Icon,
  FavouriteIcon,
  FilterHorizontalIcon,
  Fuel02Icon,
  HeartIcon,
  ImageUpload01Icon,
  Search01Icon,
  SteeringIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"

import { Logo } from "@/components/logo"
import { signOutAction } from "@/lib/auth/actions"
import {
  HOW_IT_WORKS,
  INDUSTRY_PRODUCT,
  PRODUCTS,
  type ProductKey,
} from "@/lib/products"
import { ProductStory } from "@/components/onboarding/product-story"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  HOURS_PRESETS,
  PALETTES,
  RADIUS_KEYS,
  type OnboardDraft,
  onboardSchema,
  slugSchema,
} from "@/lib/dealers/onboard"
import { RADIUS_OPTIONS, readableOn } from "@/lib/theme/tokens"
import { resizeToPng } from "@/lib/image/resize"
import { slugify } from "@/lib/slug"
import { cn } from "@/lib/utils"

import { authorisePayment } from "@/components/billing/razorpay-checkout"
import { celebrate } from "@/components/onboarding/confetti"
import { CreatingShowroom } from "@/components/onboarding/creating-showroom"
import { useEnabledIndustries } from "@/components/onboarding/enabled-industries"
import { IndustryPicker } from "@/components/onboarding/industry-picker"
import { FindMyTany } from "@/components/onboarding/find-my-tany"
import { PhoneVerify } from "@/components/onboarding/phone-verify"
import { RestaurantPreview } from "@/components/onboarding/restaurant-preview"
import { CabsPreview } from "@/components/onboarding/cabs-preview"
import { type IndustryKey, getIndustry } from "@/lib/industries"
import type { FirebaseWebConfig } from "@/lib/firebase/client"
import { PlanPicker } from "@/components/billing/plan-picker"
import {
  PLANS,
  freeTierPhrase,
  planLimitLabel,
  TRIAL_DAYS,
  isFreePlan,
  type BillingCycle,
  type SignupPlanKey,
} from "@/lib/plans"

import { type SlugStatus, checkSlug, createDealership } from "./actions"

const STEPS = [
  "Explore your app",
  "Your business",
  "Contact details",
  "Make it yours",
  "Choose your plan",
] as const
const CITY_SUGGESTIONS = [
  "Chennai",
  "Bengaluru",
  "Hyderabad",
  "Mumbai",
  "Pune",
  "Delhi",
  "Kolkata",
  "Coimbatore",
  "Madurai",
  "Kochi",
  "Ahmedabad",
  "Jaipur",
]

type Errors = Partial<Record<keyof OnboardDraft | "form" | "logo", string>>

const initialHours = () => {
  const p = HOURS_PRESETS[0]
  return Object.fromEntries(
    p.days.map((d) => [d, { open: p.open, close: p.close }])
  ) as OnboardDraft["hours"]
}

export function OnboardingWizard({
  rootDomain,
  firstName,
  email,
  verifiedPhone,
  firebaseConfig,
  testPhones,
  initialIndustry,
  phoneNotice,
}: {
  rootDomain: string
  firstName: string
  email: string
  verifiedPhone: string
  firebaseConfig: FirebaseWebConfig | null
  testPhones: string[]
  /** Set by a product-specific signup entry, such as /onboarding/cabs. */
  initialIndustry?: IndustryKey
  phoneNotice?: string
}) {
  const [step, setStep] = useState(initialIndustry ? 1 : 0)
  const [done, setDone] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Errors>({})

  const compact = useIsCompact()
  const [industry, setIndustry] = useState<IndustryKey | null>(initialIndustry ?? null)
  const ind = getIndustry(industry ?? "motors")

  const [displayName, setDisplayName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [remote, setRemote] = useState<{
    slug: string
    status: SlugStatus
  } | null>(null)
  const [city, setCity] = useState("")
  const [phone, setPhone] = useState(verifiedPhone)
  const [verified, setVerified] = useState(verifiedPhone)
  // Hours are not asked here; the default applies until the dealer edits them in Settings.
  const [hours] = useState<OnboardDraft["hours"]>(initialHours)
  const [primary, setPrimary] = useState<string>(PALETTES[0].primary)
  const [accent, setAccent] = useState<string>(PALETTES[0].accent)
  const [radius, setRadius] = useState<OnboardDraft["radius"]>("md")
  const [logo, setLogo] = useState<string | null>(null)
  const [chosenPlan, setPlan] = useState<SignupPlanKey>("free")
  // A kind of business may not offer every plan (cabs has no free plan): fall back to its first one.
  const offered = getIndustry(industry ?? "motors").offeredPlans
  const plan = (offered.includes(chosenPlan) ? chosenPlan : offered[0]) as SignupPlanKey
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly")
  const [billingNote, setBillingNote] = useState<
    "authorised" | "later" | "free"
  >(isFreePlan(plan) ? "free" : "later")

  // Live availability check, debounced. Only the async answer is state; idle/invalid/checking are derived,
  // and an answer for a stale slug is ignored.
  const parsedSlug = slugSchema.safeParse(slug)
  const slugStatus: SlugStatus | "checking" | "idle" = !slug
    ? "idle"
    : !parsedSlug.success
      ? "invalid"
      : remote?.slug === parsedSlug.data
        ? remote.status
        : "checking"
  // Set by the login form when it finds a first-time user.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("tany:new-user") !== "1") return
      sessionStorage.removeItem("tany:new-user")
    } catch {
      return
    }
    toast.info("You're new to Tany", {
      description: "Create your account to get started.",
    })
  }, [])
  useEffect(() => {
    const parsed = slugSchema.safeParse(slug)
    if (!parsed.success) return
    let stale = false
    const t = setTimeout(async () => {
      const status = await checkSlug(parsed.data).catch(
        () => "limited" as const
      )
      if (!stale) setRemote({ slug: parsed.data, status })
    }, 400)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [slug])

  const draft: OnboardDraft = {
    industry: industry ?? "motors",
    displayName,
    slug,
    city,
    phone,
    hours,
    primary,
    accent,
    radius,
    plan,
    billingCycle,
  }

  function validate(fields: (keyof OnboardDraft)[]): boolean {
    const result = onboardSchema.safeParse(draft)
    const next: Errors = {}
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof OnboardDraft
        if (fields.includes(key)) next[key] ??= issue.message
      }
    }
    if (fields.includes("phone") && !next.phone && phone !== verified) {
      next.phone = "Verify your mobile number with the code we send."
    }
    if (fields.includes("slug") && !next.slug) {
      if (slugStatus === "taken")
        next.slug = "That web address is taken. Try another."
      else if (slugStatus === "checking" || slugStatus === "idle")
        next.slug = "Hold on, checking that address..."
      else if (slugStatus === "limited")
        next.slug = "Too many checks. Wait a moment and try again."
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  // Product centred in the explore reel; products without an active vertical remain previews.
  const [pickMode, setPickMode] = useState<"browse" | "find">("find")
  const [exploreProduct, setExploreProduct] = useState<ProductKey | null>(null)
  const enabledIndustries = useEnabledIndustries()
  const comingSoon =
    exploreProduct !== null &&
    !enabledIndustries.some((i) => INDUSTRY_PRODUCT[i] === exploreProduct)

  const next = () => {
    if (step === 0 && comingSoon) {
      setErrors({ form: "This app is not available yet. Choose a live product to continue." })
      return
    }
    if (step === 0 && !industry) {
      setErrors({ form: "Choose an app to continue." })
      return
    }
    const ok =
      step === 0
        ? true
        : step === 1
          ? validate(["displayName", "slug"])
          : step === 2
            ? validate(["city", "phone"])
            : step === 3
              ? validate(["primary", "accent", "radius"])
              : validate(["plan", "billingCycle"])
    if (ok) setStep((s) => s + 1)
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/"))
      return setErrors((e) => ({ ...e, logo: "Choose an image file." }))
    try {
      const blob = await resizeToPng(file, 256)
      const reader = new FileReader()
      reader.onload = () => {
        setLogo(reader.result as string)
        setErrors((e) => ({ ...e, logo: undefined }))
      }
      reader.readAsDataURL(blob)
    } catch {
      setErrors((e) => ({
        ...e,
        logo: "Could not read that image. Try a PNG or JPG.",
      }))
    }
  }

  function submit() {
    if (!validate(["plan", "billingCycle"])) return
    startTransition(async () => {
      const result = await createDealership(draft, logo)
      if (result.ok) {
        if (isFreePlan(plan)) setBillingNote("free")
        else if (result.checkout) {
          const authorised = await authorisePayment(result.checkout, {
            description: `${PLANS[plan].label} · ${TRIAL_DAYS}-day free trial`,
            color: primary,
            prefill: { name: firstName, contact: phone },
          })
          setBillingNote(authorised === "done" ? "authorised" : "later")
        }
        return setDone(result.url)
      }
      if (result.fieldErrors) {
        setErrors(result.fieldErrors as Errors)
        setStep(
          result.fieldErrors.slug || result.fieldErrors.displayName
            ? 0
            : result.fieldErrors.logo
              ? 2
              : 1
        )
      } else {
        setErrors({ form: result.error })
      }
    })
  }

  if (done)
    return (
      <Success
        url={done}
        billingNote={billingNote}
        industry={industry ?? "motors"}
        name={displayName}
        city={city}
        primary={primary}
        accent={accent}
        radius={radius}
      />
    )

  const footer = (
    <div className="flex w-full flex-col gap-3">
      <div
        className="flex gap-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        aria-label={`Step ${step + 1} of ${STEPS.length}`}
      >
        {STEPS.map((name, i) => (
          <span
            key={name}
            className={cn(
              "h-1 flex-1 rounded-full",
              i <= step
                ? "bg-primary"
                : "bg-muted-foreground/25"
            )}
          />
        ))}
      </div>
      <div className="relative flex items-center justify-between">
        <p className="absolute left-1/2 hidden -translate-x-1/2 text-sm text-muted-foreground sm:block">
          Step {step + 1} of {STEPS.length}
        </p>
        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={() => {
              setErrors({})
              setStep((s) => s - 1)
            }}
          >
            Back
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={() => void signOutAction()}
          >
            Have an account? Log in
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            size="lg"
            className="ml-auto h-14 px-8"
            disabled={step === 0 && (!industry || comingSoon)}
            onClick={next}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="ml-auto h-14 px-8"
            disabled={pending}
            onClick={submit}
          >
            {pending
              ? `Creating your ${ind.pageNoun}...`
              : isFreePlan(plan)
                ? `Create my ${ind.pageNoun}`
                : `Start ${TRIAL_DAYS}-day free trial`}
          </Button>
        )}
      </div>
    </div>
  )
  const exploreKey: ProductKey | null =
    exploreProduct ?? (industry ? INDUSTRY_PRODUCT[industry] : null)
  // Show the preview product while browsing; otherwise show the selected live product.
  const storyProduct: ProductKey | null =
    step === 0 && comingSoon && exploreProduct
      ? exploreProduct
      : industry
        ? INDUSTRY_PRODUCT[industry]
        : null
  const exploreStory = storyProduct ? (
    HOW_IT_WORKS.includes(storyProduct) ? (
      <StoryFrame
        key={storyProduct}
        product={storyProduct}
        title={`How ${PRODUCTS.find((p) => p.key === storyProduct)?.name} works`}
      />
    ) : (
      <ProductStory product={storyProduct} />
    )
  ) : null
  return (
    <>
      {pending ? <CreatingShowroom /> : null}
      <OnboardShell
        wide={step === 0}
        flush={step === 0 && exploreStory !== null}
        showAside={step > 0 || exploreStory !== null}
        balanced={step === 0}
        tinted={step === 0 ? (exploreKey ?? (pickMode === "browse" ? "tanymotos" : null)) : null}
        footer={footer}
        aside={
          step === 0 && exploreStory ? (
            compact ? null : exploreStory
          ) : (
            <div className="w-full max-w-sm">
              <p className="mb-3 text-center text-sm text-muted-foreground">
                Live preview of your {ind.pageNoun}
              </p>
              <IndustryPreview
                industry={industry ?? "motors"}
                name={
                  displayName ||
                  ind.previewName
                }
                city={city || "Your city"}
                primary={primary}
                accent={accent}
                radius={radius}
                logo={logo}
              />
            </div>
          )
        }
      >
        <div
          className={cn(
            "flex min-h-0 flex-col",
            step === 0 ? "gap-5 max-sm:gap-3.5" : "gap-6",
            step === 0 ? "h-full pt-8 pb-28 max-sm:pt-0" : "my-auto max-h-full"
          )}
        >
          <div
            className={cn(
              "flex shrink-0 flex-col items-center gap-2 text-center"
            )}
          >
            <h1
              className={cn(
                "pt-2 text-3xl font-bold text-balance sm:text-4xl",
                // Phones: a smaller heading leaves more height for the product card.
                step === 0 && "font-semibold max-sm:pt-0 max-sm:text-xl max-sm:[-webkit-text-stroke:0.5px_currentColor]"
              )}
            >
              {step === 0 ? (
                firstName ? (
                  <>
                    Welcome,{" "}
                    {firstName.charAt(0).toUpperCase() + firstName.slice(1)}.
                    <br />
                    What kind of business do you run?
                  </>
                ) : (
                  "What kind of business do you run?"
                )
              ) : step === 1 ? (
                `Set up your ${ind.pageNoun}`
              ) : (
                STEPS[step]
              )}
            </h1>
            <p
              className={cn(
                "mt-2 text-sm text-balance text-muted-foreground",
                step === 0 && "hidden"
              )}
            >
              {step === 1 &&
                `This is what ${ind.customerNoun} will see. You can change it any time.`}
              {step === 2 &&
                `${ind.customerNoun.charAt(0).toUpperCase()}${ind.customerNoun.slice(1)} call this number to reach you. Add your opening hours later in Settings.`}
              {step === 3 &&
                `Pick a colour for your ${ind.pageNoun}. The preview updates live.`}
              {step === 4 &&
                `Start free with ${freeTierPhrase(ind.key)}, no card needed. Paid plans include a ${TRIAL_DAYS}-day free trial.`}
            </p>
          </div>

          <div
            className={cn(
              "flex min-h-0 flex-col",
              step === 0
                ? "gap-9 max-lg:gap-8"
                : "gap-8",
              step === 0 ? "flex-1" : "overflow-y-auto p-1"
            )}
          >
            {step === 0 && (
              <Tabs
                value={pickMode}
                onValueChange={(v) => {
                  // Each tab starts clean: no product carried over from the other one.
                  setPickMode(v as "browse" | "find")
                  setIndustry(null)
                  setExploreProduct(null)
                  setErrors({})
                }}
                className="shrink-0 items-center"
              >
                <TabsList className="h-11 bg-foreground/[0.06] p-1">
                  <TabsTrigger value="find" className="px-4 text-base max-sm:px-3 max-sm:text-sm text-foreground/70 focus-visible:ring-0 focus-visible:outline-none data-active:bg-background data-active:text-foreground data-active:shadow-sm">
                    <HugeiconsIcon icon={AiMagicIcon} />
                    Find My Tany
                  </TabsTrigger>
                  <TabsTrigger value="browse" className="px-4 text-base max-sm:px-3 max-sm:text-sm text-foreground/70 focus-visible:ring-0 focus-visible:outline-none data-active:bg-background data-active:text-foreground data-active:shadow-sm">
                    <HugeiconsIcon icon={GridViewIcon} />
                    Browse Products
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {step === 0 && pickMode === "find" && (
              <FindMyTany
                onPick={(nextIndustry, product) => {
                  // The recommended product tints the page and fills the side panel, live or not.
                  setIndustry(nextIndustry)
                  setExploreProduct(product)
                  setErrors({})
                }}
              />
            )}

            {step === 0 && pickMode === "browse" && (
              <IndustryPicker
                value={industry}
                variant="explore"
                renderStory={(product) =>
                  HOW_IT_WORKS.includes(product) ? (
                    <StoryFrame
                      key={product}
                      product={product}
                      title={`How ${PRODUCTS.find((p) => p.key === product)?.name} works`}
                    />
                  ) : null
                }
                onProductChange={setExploreProduct}
                onChange={(nextIndustry) => {
                  setIndustry(nextIndustry)
                  setErrors({})
                }}
              />
            )}

            {step === 1 && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="displayName">{ind.nameLabel}</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    placeholder={ind.namePlaceholder}
                    autoFocus
                    autoComplete="organization"
                    onChange={(e) => {
                      setDisplayName(e.target.value)
                      if (!slugEdited)
                        setSlug(
                          slugify(e.target.value).replace(/-/g, "").slice(0, 40)
                        )
                    }}
                  />
                  <FieldError message={errors.displayName} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="slug">Your web address</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="slug"
                      value={slug}
                      autoCapitalize="none"
                      spellCheck={false}
                      onChange={(e) => {
                        setSlugEdited(true)
                        setSlug(
                          e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")
                        )
                      }}
                    />
                    <span className="text-sm whitespace-nowrap text-muted-foreground">
                      .{rootDomain}
                    </span>
                  </div>
                  <SlugHint
                    status={slugStatus}
                    slug={slug}
                    rootDomain={rootDomain}
                  />
                  <FieldError message={errors.slug} />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    list="cities"
                    value={city}
                    placeholder="Chennai"
                    autoComplete="address-level2"
                    onChange={(e) => setCity(e.target.value)}
                  />
                  <datalist id="cities">
                    {CITY_SUGGESTIONS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <FieldError message={errors.city} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">{ind.phoneLabel}</Label>
                  <PhoneVerify
                    config={firebaseConfig}
                    testPhones={testPhones}
                    phone={phone}
                    onPhone={setPhone}
                    verified={verified}
                    onVerified={setVerified}
                    error={errors.phone}
                    industry={industry ?? "motors"}
                    notice={phoneNotice}
                  />
                </div>
                {email ? (
                  <div className="grid gap-2">
                    <Label htmlFor="account-email">Your email</Label>
                    <Input id="account-email" value={email} readOnly disabled />
                    <p className="text-xs text-muted-foreground">
                      From your sign-in. We&apos;ll send receipts and updates
                      here.
                    </p>
                  </div>
                ) : null}
              </>
            )}

            {step === 3 && (
              <>
                <div className="grid gap-2">
                  <Label>Logo (optional)</Label>
                  <div className="flex items-center gap-3">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logo}
                          alt="Your logo"
                          className="size-full object-contain"
                        />
                      ) : (
                        <HugeiconsIcon
                          icon={ImageUpload01Icon}
                          className="size-6 text-muted-foreground"
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "cursor-pointer"
                        )}
                      >
                        {logo ? "Change logo" : "Upload logo"}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => {
                            void pickLogo(e.target.files?.[0])
                            e.target.value = ""
                          }}
                        />
                      </label>
                      {logo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setLogo(null)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <FieldError message={errors.logo} />
                </div>
                <div className="grid gap-2">
                  <Label>Brand colour</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {PALETTES.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        title={p.name}
                        aria-label={p.name}
                        aria-pressed={primary === p.primary}
                        onClick={() => {
                          setPrimary(p.primary)
                          setAccent(p.accent)
                        }}
                        className={cn(
                          "size-9 rounded-full border-2 border-transparent",
                          primary === p.primary &&
                            "ring-2 ring-ring ring-offset-2 ring-offset-background"
                        )}
                        style={{ backgroundColor: p.primary }}
                      />
                    ))}
                    <label className="ml-1 flex items-center gap-2 text-sm text-muted-foreground">
                      Custom
                      <input
                        type="color"
                        aria-label="Custom brand colour"
                        value={primary}
                        onChange={(e) => setPrimary(e.target.value)}
                        className="size-9 cursor-pointer rounded-md border bg-transparent p-0.5"
                      />
                    </label>
                  </div>
                  <FieldError message={errors.primary} />
                </div>
                <div className="grid gap-2">
                  <Label>Corner style</Label>
                  <div
                    className="flex gap-2"
                    role="group"
                    aria-label="Corner style"
                  >
                    {RADIUS_KEYS.map((r) => (
                      <Button
                        key={r}
                        type="button"
                        size="sm"
                        variant={radius === r ? "default" : "outline"}
                        aria-pressed={radius === r}
                        onClick={() => setRadius(r)}
                      >
                        {r === "none"
                          ? "Square"
                          : r === "sm"
                            ? "Soft"
                            : r === "md"
                              ? "Rounded"
                              : "Round"}
                      </Button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  You can change your logo and fine-tune colours later in
                  Settings.
                </p>
              </>
            )}

            {step === 4 && (
              <>
                <PlanPicker
                  industry={industry ?? "motors"}
                  plan={plan}
                  cycle={billingCycle}
                  onPlan={setPlan}
                  onCycle={setBillingCycle}
                />
                <FieldError message={errors.plan ?? errors.billingCycle} />
                <p className="text-xs text-muted-foreground">
                  {isFreePlan(plan)
                    ? `You can upgrade to a paid plan any time from Settings, when you have more ${ind.itemNoun} to list.`
                    : `Free for ${TRIAL_DAYS} days. You add a payment method now and are charged only when the trial ends. Cancel any time before then.`}
                </p>
              </>
            )}

            {errors.form ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            ) : null}
          </div>
        </div>
      </OnboardShell>
    </>
  )
}

/** shadcn `login-02` layout: brand + form on the left, a muted panel on the right (large screens only). */
function OnboardShell({
  children,
  aside,
  footer,
  wide,
  flush,
  showAside = true,
  balanced = false,
  tinted = null,
  plainLeft = false,
}: {
  /** Keep the left column white while the rest of the page is tinted. */
  plainLeft?: boolean
  /** Industry whose animation colour tints the whole page. */
  tinted?: ProductKey | null
  wide?: boolean
  flush?: boolean
  children: React.ReactNode
  aside: React.ReactNode
  footer?: React.ReactNode
  showAside?: boolean
  balanced?: boolean
}) {
  return (
    <div
      style={tinted ? { backgroundColor: `var(--ground-${tinted})` } : undefined}
      className={cn(
        "grid h-svh overflow-hidden transition-colors duration-700",
        showAside
          ? balanced
            ? "lg:grid-cols-2"
            : "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
          : "grid-cols-1"
      )}
    >
      <div
        className={cn(
          "relative flex min-h-0 flex-col gap-4 px-6 pt-6 md:px-10 md:pt-10",
          plainLeft && "bg-background"
        )}
      >
        <div className="flex justify-center gap-2 md:justify-start">
          <Link
            href="/"
            aria-label="TanyApps home"
            className="flex items-center gap-2 font-medium"
          >
            <Logo className="h-7" />
          </Link>
        </div>
        <div
          className={cn("flex min-h-0 flex-1 justify-center", !wide && "pb-40")}
        >
          <div
            className={cn(
              "flex min-h-0 w-full min-w-0 flex-col",
              wide ? "max-w-2xl" : "max-w-sm"
            )}
          >
            {children}
          </div>
        </div>
        <div
          style={
            tinted && !plainLeft
              ? { backgroundColor: `var(--ground-${tinted})` }
              : undefined
          }
          className={cn(
            "fixed inset-x-0 bottom-0 z-20 px-6 pt-4 pb-[max(1rem,var(--safe-area-inset-bottom))] transition-colors duration-700 md:px-10",
            (!tinted || plainLeft) && "bg-white"
          )}
        >
          {footer}
        </div>
      </div>
      <div
        className={cn(
          "relative hidden lg:flex lg:items-center lg:justify-center",
          !tinted && "bg-muted",
          showAside && "animate-in fade-in slide-in-from-right-6 duration-700",
          !showAside && "lg:hidden",
          flush ? "overflow-hidden" : "lg:p-10"
        )}
      >
        {aside}
      </div>
    </div>
  )
}

/** How-it-works page in the side panel. Stays hidden over the product's tint until it has loaded, so no white flashes in while it swaps. */
function StoryFrame({ product, title }: { product: ProductKey; title: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <iframe
      src={`/brand/${product}-how-it-works.html`}
      title={title}
      sandbox="allow-scripts"
      onLoad={() => setLoaded(true)}
      style={{ backgroundColor: `var(--ground-${product})` }}
      // Not interactive, and an iframe swallows scroll events: let them reach the page.
      className={cn(
        "pointer-events-none size-full border-0 transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-0"
      )}
    />
  )
}

const PHONE_QUERY = "(max-width: 1023px)"

/** True below lg, where the side panel is hidden and the animation moves above the picker. */
function useIsCompact() {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(PHONE_QUERY)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null
}

function SlugHint({
  status,
  slug,
  rootDomain,
}: {
  status: SlugStatus | "checking" | "idle"
  slug: string
  rootDomain: string
}) {
  if (status === "idle")
    return (
      <p className="text-xs text-muted-foreground">
        Letters and numbers only. Your link will be {`<name>.${rootDomain}`}.
      </p>
    )
  if (status === "checking")
    return <p className="text-xs text-muted-foreground">Checking...</p>
  if (status === "available")
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-success">
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          className="size-4 shrink-0"
        />
        {slug}.{rootDomain} is available.
      </p>
    )
  if (status === "taken")
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
        <HugeiconsIcon icon={CancelCircleIcon} className="size-4 shrink-0" />
        {slug}.{rootDomain} is not available. Try adding your city.
      </p>
    )
  if (status === "limited")
    return (
      <p className="text-xs text-muted-foreground">
        Too many checks. Wait a moment.
      </p>
    )
  return (
    <p className="text-xs text-destructive">
      Use 2 or more letters or numbers. Some names are reserved.
    </p>
  )
}

/** A miniature of the buyer-facing page, styled with the chosen theme. Colours here are the dealer's own data. */
function Preview({
  name,
  city,
  primary,
  accent,
  radius,
  logo,
}: {
  name: string
  city: string
  primary: string
  accent: string
  radius: OnboardDraft["radius"]
  logo?: string | null
}) {
  const fg = readableOn(primary)
  const r = RADIUS_OPTIONS[radius]
  const specs = [
    { icon: DashboardSpeed01Icon, label: "31,500 km" },
    { icon: Fuel02Icon, label: "Diesel" },
    { icon: SteeringIcon, label: "Manual" },
  ]
  const tabs = [
    { icon: Car01Icon, label: "Cars", active: true },
    { icon: FilterHorizontalIcon, label: "Filter", active: false },
    { icon: Add01Icon, label: "Add car", active: false, prominent: true },
    { icon: Call02Icon, label: "Call", active: false },
    { icon: UserCircleIcon, label: "Account", active: false },
  ]
  return (
    <div
      className="mx-auto w-[300px] rounded-[2.5rem] border-[6px] border-foreground/90 bg-foreground/90 shadow-xl"
      aria-label="Preview of your showroom page"
    >
      <div className="relative flex h-[620px] flex-col overflow-hidden rounded-[2rem] bg-background">
        <div className="absolute top-2 left-1/2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-foreground/90" />
        {/* Header: logo, search, shortlist, account */}
        <div className="flex h-[72px] shrink-0 items-end gap-2 border-b bg-background px-3 pb-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              className="size-8 shrink-0 rounded-full bg-muted object-contain"
            />
          ) : (
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{ backgroundColor: primary, color: fg }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-xl border bg-muted px-2 text-[11px] text-muted-foreground">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="size-3.5 shrink-0"
            />
            <span className="truncate text-muted-foreground/50">
              Search make or model
            </span>
          </div>
          <span className="flex h-8 shrink-0 items-center">
            <HugeiconsIcon
              icon={FavouriteIcon}
              strokeWidth={2}
              className="size-5"
            />
          </span>
        </div>

        <div className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col gap-3 overflow-y-auto p-3 [&::-webkit-scrollbar]:hidden">
          {/* Offer banner */}
          <div
            className="aspect-[3/1] shrink-0 overflow-hidden border bg-muted"
            style={{ borderRadius: r }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/offer-quality-checked-cars.png"
              alt="Quality-checked cars"
              className="size-full object-cover"
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight">
                Available now
              </h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                1
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cars selected for quality, value, and the road ahead.
            </p>
          </div>

          {/* Car card */}
          <div
            className="shrink-0 overflow-hidden border bg-card"
            style={{ borderRadius: r }}
          >
            <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-muted">
              {/* Sample photo: "Hyundai Creta 1.6 GLS 2019" by RL GNZLZ, CC BY-SA 2.0, via Wikimedia Commons */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/preview-car.jpg"
                alt=""
                className="size-full object-cover"
              />
              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                <span className="rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium shadow-sm">
                  TN 09
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: accent, color: readableOn(accent) }}
                >
                  Dealer verified
                </span>
              </div>
              <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-background/90 shadow-sm">
                <HugeiconsIcon
                  icon={HeartIcon}
                  strokeWidth={2}
                  className="size-3.5 text-foreground"
                />
              </span>
            </div>
            <div className="flex flex-col gap-2.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    2019 Hyundai Creta
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    SX
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tracking-tight">
                    ₹11,25,000
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    EMI from ₹19,500
                  </p>
                </div>
              </div>
              <ul className="flex flex-wrap gap-1.5 border-y py-2">
                {specs.map(({ icon, label }) => (
                  <li
                    key={label}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"
                  >
                    <HugeiconsIcon
                      icon={icon}
                      strokeWidth={1.8}
                      className="size-3 text-foreground"
                    />
                    {label}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    icon={Calendar03Icon}
                    strokeWidth={2}
                    className="size-3.5"
                    style={{ color: primary }}
                  />
                  Ready to test drive
                </span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom tab bar */}
        <ul className="flex shrink-0 border-t bg-background px-1 pb-2">
          {tabs.map(({ icon, label, active, prominent }) =>
            prominent ? (
              <li
                key={label}
                className="flex flex-1 items-center justify-center"
              >
                <span
                  className="flex size-10 items-center justify-center rounded-full shadow-md"
                  style={{ backgroundColor: primary, color: fg }}
                  aria-label={label}
                >
                  <HugeiconsIcon
                    icon={icon}
                    strokeWidth={2.5}
                    className="size-5"
                  />
                </span>
              </li>
            ) : (
              <li
                key={label}
                className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium"
                style={active ? { color: primary } : undefined}
              >
                <HugeiconsIcon
                  icon={icon}
                  strokeWidth={2}
                  className={cn("size-5", !active && "text-muted-foreground")}
                />
                <span className={cn(!active && "text-muted-foreground")}>
                  {label}
                </span>
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  )
}

function IndustryPreview({
  industry,
  ...props
}: {
  industry: IndustryKey
  name: string
  city: string
  primary: string
  accent: string
  radius: OnboardDraft["radius"]
  logo?: string | null
}) {
  return industry === "restaurants" ? (
    <RestaurantPreview {...props} />
  ) : industry === "cabs" ? (
    <CabsPreview {...props} />
  ) : (
    <Preview {...props} />
  )
}

function Success({
  url,
  billingNote,
  industry,
  name,
  city,
  primary,
  accent,
  radius,
}: {
  url: string
  billingNote: "authorised" | "later" | "free"
  industry: IndustryKey
  name: string
  city: string
  primary: string
  accent: string
  radius: OnboardDraft["radius"]
}) {
  const ind = getIndustry(industry)
  useEffect(() => {
    celebrate([primary, accent, "#ffffff"])
    // Once, when the showroom is first shown as created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <OnboardShell
      aside={
        <IndustryPreview
          industry={industry}
          name={name}
          city={city}
          primary={primary}
          accent={accent}
          radius={radius}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{name} is live</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {ind.liveMessage}
          </p>
          <p className="text-xs text-balance text-muted-foreground">
            {billingNote === "free"
              ? `You are on the Free plan: ${planLimitLabel(ind.key, "free").replace(/^Up to /, "up to ")}. Upgrade any time.`
              : billingNote === "authorised"
                ? `Your ${TRIAL_DAYS}-day free trial has started.`
                : `Your ${TRIAL_DAYS}-day free trial has started. Add a payment method before it ends to keep your showroom live.`}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(url).then(
                () => toast.success("Link copied"),
                () => toast.error("Could not copy")
              )
            }
          >
            Copy
          </Button>
        </div>
        <Link
          href={ind.firstItemHref}
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          {ind.firstItemCta}
        </Link>
        <div className="flex justify-between text-sm">
          <Link href="/dashboard" className="text-muted-foreground underline">
            Go to dashboard
          </Link>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground underline"
          >
            View my {ind.pageNoun}
          </a>
        </div>
      </div>
    </OnboardShell>
  )
}
