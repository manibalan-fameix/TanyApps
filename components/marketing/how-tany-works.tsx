"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InstagramIcon,
  Link01Icon,
  QrCodeIcon,
  Search01Icon,
  Store01Icon,
  UserIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react"

import { cn } from "@/lib/utils"

/*
 * How Tany works: a pinned, scroll-driven story in three steps.
 *
 * The section is 480vh tall; its inner viewport is sticky for the whole of it, so the page
 * cannot move on until the reader has scrolled through every step. Scroll position alone
 * decides the step (no wheel handlers, no autoplay):
 *
 *   0.00–0.15 intro     all steps at rest, the scene neutral
 *   0.15–0.35 Discover  a marketplace brings the customer
 *   0.35–0.55 Convert   QR / WhatsApp / link moves the next order to the business's own app
 *   0.55–0.88 Repeat    the customer orders again, directly (0.75–0.88 is the hold)
 *   0.88–1.00 release   the sticky viewport scrolls away with the section's end
 *
 * Like the ShowMoto showroom: every item stays on screen, one comes forward at a time, and
 * the one before it returns to rest.
 */

// Tany's brand colours, in one place. Move them into app/globals.css as tokens when the
// marketing site gets its own theme; the product theme there is ShowMoto's today.
const RED = "#E5262B"
const INK = "#0A0A0A"
const LINE = "#D4D4D4"

const EASE = [0.32, 0.72, 0, 1] as const
const MOVE = { duration: 0.5, ease: EASE }

type Step = 0 | 1 | 2 | 3 // 0 intro, 1 Discover, 2 Convert, 3 Repeat

const stepAt = (p: number): Step => (p < 0.15 ? 0 : p < 0.35 ? 1 : p < 0.55 ? 2 : 3)

const STEPS = [
  {
    n: "01",
    title: "Discover",
    body: "Customers find you where they already look: food apps, marketplaces, Instagram and Google.",
  },
  {
    n: "02",
    title: "Convert",
    body: "A QR code in the bag, a WhatsApp message or a direct link brings their next order to your own Tany app.",
  },
  {
    n: "03",
    title: "Repeat",
    body: "They come back to you directly. No commission on repeat orders, and the customer relationship is yours.",
  },
]

const CAPTIONS = [
  "Every customer journey starts somewhere.",
  "A customer finds you on a marketplace.",
  "A QR, a WhatsApp message or a link moves the next order to your own app.",
  "The marketplace found the customer. Your Tany app keeps them.",
]

/* ---------- the scene's geometry, in % of the canvas ---------- */

type Pt = [number, number]
type Seg = [Pt, Pt, Pt] // a quadratic curve: start, control, end

const SRC_Y = [26, 50, 74] // marketplace, social, search
const BRIDGE_Y = [32, 50, 68] // QR, WhatsApp, link
const CUSTOMER: Pt = [40, 50]

const line = (a: Pt, b: Pt): Seg => [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b]
const srcPath = (y: number): Seg => [[25, y], [31, y], [35, 50]]
const toBridge = (y: number): Seg => [[45, 50], [49, y], [53, y]]
const toPhone = (y: number): Seg => [[71, y], [73.5, y], [75, 50]]
const LOOP_OUT: Seg = [[45, 46], [61, 8], [75, 44]]
const LOOP_BACK: Seg = [[75, 56], [61, 92], [45, 54]]

const d = ([a, c, b]: Seg) => `M${a[0]} ${a[1]}Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`
const at = ([a, c, b]: Seg, t: number): Pt => {
  const u = 1 - t
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]
}
const len = (s: Seg) => {
  let L = 0
  for (let i = 1, p = s[0]; i <= 16; i++) {
    const q = at(s, i / 16)
    L += Math.hypot(q[0] - p[0], q[1] - p[1])
    p = q
  }
  return L
}
/** The point a share t of the way along a run of curves, by length. */
function along(segs: Seg[], t: number): Pt {
  const lens = segs.map(len)
  let left = Math.min(1, Math.max(0, t)) * lens.reduce((a, b) => a + b, 0)
  for (let i = 0; i < segs.length; i++) {
    if (left <= lens[i] || i === segs.length - 1) return at(segs[i], Math.min(1, left / lens[i]))
    left -= lens[i]
  }
  return segs[0][0]
}

// The three journeys a token travels, each scrubbed by scroll within its own step.
const DISCOVER_RUN = [srcPath(SRC_Y[0])]
const CONVERT_RUN = [srcPath(SRC_Y[0]), line([35, 50], [45, 50]), line([45, 50], [75, 50])]
const REPEAT_RUN = [LOOP_OUT, LOOP_BACK]

/* ---------- the section ---------- */

export function HowTanyWorks() {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion() ?? false
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const [step, setStep] = useState<Step>(0)

  useEffect(() => setStep(stepAt(scrollYProgress.get())), [scrollYProgress])
  useMotionValueEvent(scrollYProgress, "change", (p) => setStep(stepAt(p)))

  const rail = useTransform(scrollYProgress, [0.15, 0.75], [0, 1])
  const move = reduce ? { duration: 0 } : MOVE

  return (
    <section
      ref={ref}
      aria-labelledby="how-tany-works-title"
      className="relative h-[480vh] bg-white text-neutral-950"
      style={{ "--tany-red": RED } as CSSProperties}
    >
      <div className="sticky top-0 flex h-svh items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-5 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="flex flex-col gap-4 lg:gap-8">
            <header className="flex flex-col gap-2 lg:gap-3">
              <p className="text-xs font-medium tracking-[0.14em] text-neutral-500 uppercase">How Tany works</p>
              <h2
                id="how-tany-works-title"
                className="text-xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl lg:text-[2.6rem]"
              >
                Marketplaces find the customer. Tany keeps them yours.
              </h2>
            </header>

            <div className="relative">
              {/* the rail: how far through the story the reader is */}
              <div aria-hidden className="absolute top-2 bottom-2 -left-3 w-px bg-neutral-200 sm:-left-4">
                <motion.div className="h-full w-full origin-top bg-[var(--tany-red)]" style={{ scaleY: rail }} />
              </div>
              <ol className="flex flex-col gap-2.5 lg:gap-3">
                {STEPS.map((s, i) => (
                  <StepCard key={s.n} {...s} active={step === i + 1} move={move} />
                ))}
              </ol>
            </div>
          </div>

          <Scene step={step} progress={scrollYProgress} move={move} />
        </div>
      </div>
    </section>
  )
}

function StepCard({ n, title, body, active, move }: (typeof STEPS)[number] & { active: boolean; move: object }) {
  return (
    <motion.li
      aria-current={active ? "step" : undefined}
      animate={{
        scale: active ? 1.02 : 1,
        x: active ? 8 : 0,
        boxShadow: active ? "0 18px 40px -22px rgba(10,10,10,0.28)" : "0 0px 0px 0px rgba(10,10,10,0)",
      }}
      transition={move}
      className={cn(
        "relative origin-left overflow-hidden rounded-2xl border bg-white px-4 py-2.5 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] lg:px-5 lg:py-4",
        active ? "border-[color-mix(in_oklab,var(--tany-red)_30%,#e5e5e5)]" : "border-neutral-200",
      )}
    >
      <motion.span
        aria-hidden
        className="absolute top-3 bottom-3 left-0 w-[3px] origin-center rounded-full bg-[var(--tany-red)]"
        animate={{ scaleY: active ? 1 : 0, opacity: active ? 1 : 0 }}
        transition={move}
      />
      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            "font-mono text-xs tabular-nums transition-colors duration-500",
            active ? "text-[var(--tany-red)]" : "text-neutral-400",
          )}
        >
          {n}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            className={cn(
              "text-base font-semibold tracking-tight transition-colors duration-500 lg:text-lg",
              active ? "text-neutral-950" : "text-neutral-500",
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "text-sm leading-relaxed transition-colors duration-500",
              // on a phone only the active step keeps its description, so the pinned view fits one screen
              active ? "text-neutral-700 max-lg:line-clamp-3" : "text-neutral-400 max-lg:hidden",
            )}
          >
            {body}
          </p>
        </div>
      </div>
    </motion.li>
  )
}

/* ---------- the scene: one canvas that morphs between the steps ---------- */

function Scene({ step, progress, move }: { step: Step; progress: MotionValue<number>; move: object }) {
  // Each journey is scrubbed by scroll inside its own step.
  const discoverT = useTransform(progress, [0.18, 0.32], [0, 1])
  const convertT = useTransform(progress, [0.38, 0.52], [0, 1])
  const repeatT = useTransform(progress, [0.58, 0.86], [0, 2]) // two laps of the loop

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50/70">
      <div
        aria-hidden
        className="relative aspect-[7/5] w-full [container-type:inline-size] max-lg:aspect-auto max-lg:h-[36svh]"
      >
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
          {SRC_Y.map((y, i) => {
            const lit = (step === 1 || step === 2) && i === 0
            return (
              <Wire
                key={`s${i}`}
                seg={srcPath(y)}
                color={lit ? RED : i === 0 && step === 3 ? "#A3A3A3" : LINE}
                opacity={step === 3 ? 0.7 : 1}
                move={move}
              />
            )
          })}
          {BRIDGE_Y.map((y, i) => (
            <g key={`b${i}`}>
              <Wire
                seg={toBridge(y)}
                color={step === 2 && i === 1 ? RED : LINE}
                opacity={step === 2 ? 1 : 0.45}
                move={move}
              />
              <Wire seg={toPhone(y)} color={step === 2 && i === 1 ? RED : LINE} opacity={step === 2 ? 1 : 0.45} move={move} />
            </g>
          ))}
          {[LOOP_OUT, LOOP_BACK].map((seg, i) => (
            <motion.path
              key={`l${i}`}
              d={d(seg)}
              stroke={RED}
              strokeWidth={1.75}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={false}
              animate={{ pathLength: step === 3 ? 1 : 0, opacity: step === 3 ? 1 : 0 }}
              transition={{ ...move, delay: step === 3 ? i * 0.12 : 0 }}
            />
          ))}
        </svg>

        {/* tokens: the customer, travelling. Drawn under the nodes so they pass behind them. */}
        <Token run={DISCOVER_RUN} t={discoverT} on={step === 1} move={move} />
        <Token run={CONVERT_RUN} t={convertT} on={step === 2} move={move} />
        <Token run={REPEAT_RUN} t={repeatT} on={step === 3} move={move} loop />

        {/* sources: always present; one comes forward at a time */}
        {[
          { icon: Store01Icon, label: "Marketplace" },
          { icon: InstagramIcon, label: "Social" },
          { icon: Search01Icon, label: "Search" },
        ].map((s, i) => (
          <Chip
            key={s.label}
            x={14}
            y={SRC_Y[i]}
            w={22}
            icon={s.icon}
            label={s.label}
            state={step === 1 && i === 0 ? "active" : step === 3 ? "dim" : "rest"}
            move={move}
          />
        ))}

        {/* the customer */}
        <motion.div
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[1.2cqw]"
          style={{ left: `${CUSTOMER[0]}%`, top: `${CUSTOMER[1]}%` }}
        >
          <motion.div
            className="grid size-[9cqw] place-items-center rounded-full border bg-white"
            animate={{
              borderColor: step === 0 ? LINE : RED,
              scale: step === 0 ? 1 : 1.04,
              boxShadow: step === 0 ? "0 0 0 0px rgba(229,38,43,0)" : "0 0 0 5px rgba(229,38,43,0.08)",
            }}
            transition={move}
          >
            <HugeiconsIcon icon={UserIcon} className="size-[4cqw]" color={step === 0 ? "#737373" : INK} strokeWidth={1.6} />
          </motion.div>
          <span className="text-[clamp(9px,1.7cqw,12px)] font-medium text-neutral-500">Customer</span>
        </motion.div>

        {/* the bridge: how the next order leaves the marketplace */}
        {[
          { icon: QrCodeIcon, label: "QR code" },
          { icon: WhatsappIcon, label: "WhatsApp" },
          { icon: Link01Icon, label: "Direct link" },
        ].map((s, i) => (
          <Chip
            key={s.label}
            x={62}
            y={BRIDGE_Y[i]}
            w={18}
            icon={s.icon}
            label={s.label}
            state={step === 2 ? (i === 1 ? "active" : "rest") : "dim"}
            move={move}
            small
          />
        ))}

        <Phone step={step} move={move} />

        {/* the closing message, drawn as two brackets under the scene */}
        <motion.div
          className="absolute inset-x-[4%] bottom-[3%] flex items-end gap-[3%] text-[clamp(9px,1.65cqw,12px)] font-medium"
          initial={false}
          animate={{ opacity: step === 3 ? 1 : 0, y: step === 3 ? 0 : 6 }}
          transition={{ ...move, delay: step === 3 ? 0.25 : 0 }}
        >
          <Bracket className="w-[30%] text-neutral-500" tone="#A3A3A3">
            Marketplace acquires
          </Bracket>
          <Bracket className="ml-auto w-[54%] text-[var(--tany-red)]" tone={RED}>
            Tany owns the repeat
          </Bracket>
        </motion.div>
      </div>

      <div className="flex items-center gap-3 border-t border-neutral-200 bg-white px-4 py-3 sm:px-5">
        <div className="relative min-h-[2.6em] flex-1 text-xs leading-snug text-neutral-600 sm:text-sm" aria-live="polite">
          {CAPTIONS.map((c, i) => (
            <motion.p
              key={i}
              className="absolute inset-0"
              initial={false}
              animate={{ opacity: step === i ? 1 : 0, y: step === i ? 0 : step > i ? -6 : 6 }}
              transition={move}
              aria-hidden={step !== i}
            >
              {c}
            </motion.p>
          ))}
        </div>
        <span className="font-mono text-xs text-neutral-400 tabular-nums">{step === 0 ? "00" : `0${step}`} / 03</span>
      </div>
    </div>
  )
}

function Wire({ seg, color, opacity, move }: { seg: Seg; color: string; opacity: number; move: object }) {
  return (
    <motion.path
      d={d(seg)}
      strokeWidth={1.25}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      initial={false}
      animate={{ stroke: color, opacity }}
      transition={move}
    />
  )
}

function Token({ run, t, on, move, loop }: { run: Seg[]; t: MotionValue<number>; on: boolean; move: object; loop?: boolean }) {
  const left = useTransform(t, (v) => `${along(run, loop ? v % 1 : v)[0]}%`)
  const top = useTransform(t, (v) => `${along(run, loop ? v % 1 : v)[1]}%`)
  return (
    <motion.span
      className="absolute size-[2cqw] min-h-2 min-w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--tany-red)] shadow-[0_0_0_4px_rgba(229,38,43,0.15)]"
      style={{ left, top }}
      initial={false}
      animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.4 }}
      transition={move}
    />
  )
}

type ChipState = "rest" | "active" | "dim"

function Chip({
  x,
  y,
  w,
  icon,
  label,
  state,
  move,
  small,
}: {
  x: number
  y: number
  w: number
  icon: typeof Store01Icon
  label: string
  state: ChipState
  move: object
  small?: boolean
}) {
  const active = state === "active"
  return (
    <motion.div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-[1.2cqw] rounded-[1.8cqw] border bg-white px-[1.4cqw] py-[1.5cqw]"
      style={{ left: `${x}%`, top: `${y}%`, width: `${w}%` }}
      initial={false}
      animate={{
        scale: active ? 1.06 : 1,
        x: active ? "4%" : "0%",
        opacity: state === "dim" ? (small ? 0.5 : 0.6) : 1,
        borderColor: active ? "rgba(229,38,43,0.45)" : "#E5E5E5",
        boxShadow: active ? "0 14px 30px -16px rgba(10,10,10,0.35)" : "0 1px 2px 0 rgba(10,10,10,0.04)",
      }}
      transition={move}
    >
      <HugeiconsIcon
        icon={icon}
        className={small ? "size-[2.8cqw] shrink-0" : "size-[3.2cqw] shrink-0"}
        color={active ? RED : "#525252"}
        strokeWidth={1.6}
      />
      <span
        className={cn(
          "truncate font-medium transition-colors duration-500",
          small ? "text-[clamp(7.5px,1.6cqw,12px)]" : "text-[clamp(7.5px,1.85cqw,13px)]",
          active ? "text-neutral-950" : "text-neutral-600",
        )}
      >
        {label}
      </span>
    </motion.div>
  )
}

function Bracket({ children, className, tone }: { children: ReactNode; className?: string; tone: string }) {
  return (
    <div className={cn("flex flex-col gap-[0.8cqw]", className)}>
      <div className="h-[1.4cqw] rounded-b-[0.8cqw] border-x border-b" style={{ borderColor: tone }} />
      <span className="truncate text-center">{children}</span>
    </div>
  )
}

/* ---------- the business's own Tany app ---------- */

function Phone({ step, move }: { step: Step; move: object }) {
  const live = step >= 2
  return (
    <motion.div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[3.2cqw] border-[0.5cqw] bg-white"
      style={{ left: "86%", top: "48%", width: "22%", height: "74%" }}
      initial={false}
      animate={{
        borderColor: live ? INK : "#E5E5E5",
        scale: step === 3 ? 1.04 : live ? 1.02 : 1,
        opacity: live ? 1 : 0.7,
        boxShadow: live ? "0 24px 50px -24px rgba(10,10,10,0.45)" : "0 0 0 0 rgba(10,10,10,0)",
      }}
      transition={move}
    >
      <div className="mx-auto mt-[1.2cqw] h-[1cqw] w-[30%] shrink-0 rounded-full bg-neutral-200" />
      <div className="relative flex-1 text-[clamp(7px,1.45cqw,11px)] leading-tight">
        {/* before: an empty shell, the app the business does not have yet */}
        <Layer on={step < 2} move={move}>
          <div className="flex flex-col gap-[1.6cqw] p-[2cqw]">
            <div className="h-[2.2cqw] w-[60%] rounded bg-neutral-200" />
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="h-[5.5cqw] rounded-[1cqw] bg-neutral-100" />
            ))}
            <p className="mt-[1cqw] text-center text-neutral-400">Your app</p>
          </div>
        </Layer>
        {/* convert: the customer lands in the business's own app */}
        <Layer on={step === 2} move={move}>
          <div className="flex flex-col gap-[1.4cqw] p-[2cqw]">
            <StoreHead />
            <p className="text-neutral-500">Order directly from us</p>
            {["Chicken biryani", "Parotta & salna", "Filter coffee"].map((m) => (
              <div key={m} className="flex items-center justify-between rounded-[1cqw] border border-neutral-200 px-[1.4cqw] py-[1.3cqw]">
                <span className="truncate text-neutral-800">{m}</span>
                <span className="font-semibold text-[var(--tany-red)]">+</span>
              </div>
            ))}
            <div className="mt-auto rounded-[1.2cqw] bg-[var(--tany-red)] py-[1.4cqw] text-center font-semibold text-white">Place order</div>
          </div>
        </Layer>
        {/* repeat: the customer and the business, directly */}
        <Layer on={step === 3} move={move}>
          <div className="flex flex-col gap-[1.4cqw] p-[2cqw]">
            <StoreHead />
            <div className="self-start rounded-[1.4cqw] rounded-bl-[0.4cqw] bg-neutral-100 px-[1.4cqw] py-[1.2cqw] text-neutral-700">
              Your usual, Priya?
            </div>
            <div className="self-end rounded-[1.4cqw] rounded-br-[0.4cqw] bg-[var(--tany-red)] px-[1.4cqw] py-[1.2cqw] text-white">Yes please!</div>
            <p className="mt-[0.6cqw] font-semibold text-neutral-900">Order again</p>
            {["Order #3", "Order #2", "Order #1"].map((o, i) => (
              <div key={o} className="flex items-center justify-between rounded-[1cqw] border border-neutral-200 px-[1.4cqw] py-[1.1cqw]">
                <span className="text-neutral-800">{o}</span>
                <span className={i === 0 ? "font-semibold text-[var(--tany-red)]" : "text-neutral-400"}>{i === 0 ? "Now" : "Paid"}</span>
              </div>
            ))}
            <div className="mt-auto text-center font-medium text-neutral-500">0% commission</div>
          </div>
        </Layer>
      </div>
    </motion.div>
  )
}

function StoreHead() {
  return (
    <div className="flex items-center gap-[1.2cqw]">
      <div className="grid size-[4.2cqw] shrink-0 place-items-center rounded-[1cqw] bg-neutral-950 font-semibold text-white">A</div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-neutral-950">Anbu Biryani</p>
        <p className="truncate text-neutral-400">on Tany</p>
      </div>
    </div>
  )
}

function Layer({ on, move, children }: { on: boolean; move: object; children: ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col"
      initial={false}
      animate={{ opacity: on ? 1 : 0, y: on ? 0 : 8 }}
      transition={move}
    >
      {children}
    </motion.div>
  )
}
