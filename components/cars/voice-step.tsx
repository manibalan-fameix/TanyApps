"use client"

import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Mic01Icon, StopIcon } from "@hugeicons/core-free-icons"

import {
  createCarFromVoiceAction,
  saveVoiceDraftAction,
} from "@/app/(admin)/(shell)/cars/voice-actions"
import { BarAction } from "@/components/cars/wizard-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { copy } from "@/lib/copy"
import { voiceTa, voiceTg, type VoiceCopy } from "@/lib/copy-ta"
import { cn } from "@/lib/utils"
import {
  tamilOption,
  tamilToEnglish,
  tanglishToEnglish,
} from "@/lib/voice/tamil"
import {
  editableText,
  extractFromSpeech,
  FIELD_DEF,
  formatVoiceValue,
  isListField,
  isSkip,
  parseVoiceField,
  sectionFields,
  VOICE_FIELDS,
  VOICE_SECTIONS,
  type VoiceField,
  type VoiceSection,
  type VoiceValues,
} from "@/lib/voice/template"

/** A controlled text box that follows the blank's value, which can change while it is open (talk again). */
function EditInput({
  text,
  ...props
}: { text: string } & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "defaultValue" | "onChange"
>) {
  const [draft, setDraft] = useState(text)
  useEffect(() => setDraft(text), [text])
  return (
    <Input
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  )
}

export type VoiceLang = "en" | "ta" | "tg"

/** The page's text in each language. Speech recognition follows the same choice. */
export const voiceCopy = (lang: VoiceLang): VoiceCopy =>
  lang === "ta" ? voiceTa : lang === "tg" ? voiceTg : copy.admin.addCar.voice
// Tanglish is spoken Tamil with English words, and the recogniser writes it in English letters.
const SPEECH_LANG: Record<VoiceLang, string> = {
  en: "en-IN",
  ta: "ta-IN",
  tg: "en-IN",
}

/** Turn what was said or typed into the English words and digits the parser reads. */
const toEnglish = (lang: VoiceLang, text: string) =>
  lang === "ta"
    ? tamilToEnglish(text)
    : lang === "tg"
      ? tanglishToEnglish(text)
      : text

/** What an empty blank hints at: a few real choices for lists, otherwise an example answer. */
function suggestion(f: VoiceField, t: VoiceCopy, lang: VoiceLang): string {
  const def = FIELD_DEF[f]
  const show = (o: string) => (lang === "ta" ? tamilOption(o) : o)
  const options = (def.options ?? []).map(show)
  if (def.kind === "bool") return `${t.yes} / ${t.no}`
  if (def.kind === "option")
    return options.slice(0, 3).join(" / ") + (options.length > 3 ? " …" : "")
  if (def.kind === "multi") return options.slice(0, 2).join(", ") + " …"
  return t.examples[f]
}

const isField = (p: string): p is VoiceField => p in FIELD_DEF
const NEXT_SECTION = /^(?:next|skip) section\b/i

/**
 * "Add by voice": the car's details, section by section in the same order as the Marketplace details
 * page, each written as one flowing sentence with blanks. The dealer reads them out in turn, the words
 * are transcribed live, and each blank fills in as it is understood. Tap a blank to type it instead.
 */
export function VoiceStep({
  lang,
  onLangChange,
  onCreated,
  initial,
}: {
  lang: VoiceLang
  onLangChange: (lang: VoiceLang) => void
  onCreated: (r: { carId: string; hint: string }) => void | Promise<void>
  /** An unfinished session to pick up where the dealer left it. */
  initial?: { carId: string; values: VoiceValues }
}) {
  const t = voiceCopy(lang)
  const [values, setValues] = useState<VoiceValues>(initial?.values ?? {})
  // Carry on with the first blank that is still empty.
  const [active, setActive] = useState<VoiceField>(
    () =>
      VOICE_FIELDS.find((f) => initial?.values[f] === undefined) ??
      VOICE_FIELDS[0]
  )
  const [editing, setEditing] = useState<VoiceField | null>(null)
  const [listening, setListening] = useState(false)
  const [partial, setPartial] = useState("")
  const [heard, setHeard] = useState<string | null>(null)
  const [unplaced, setUnplaced] = useState(false)
  const [bad, setBad] = useState<VoiceField[]>([])
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // A blank the dealer tapped "talk again" on: the next thing said replaces just that one.
  const [redo, setRedo] = useState<VoiceField | null>(null)
  const ownsMic = useRef(false)
  // The draft car this session is saved on. It starts on the first blank filled, so leaving mid-way loses nothing.
  const draftId = useRef<string | undefined>(initial?.carId)
  const saves = useRef<Promise<unknown>>(Promise.resolve())
  // Closing the typing box to talk again must not save it (or clear it) on the way out.
  const skipCommit = useRef(false)
  const sections = useRef<Partial<Record<VoiceSection, HTMLElement | null>>>({})

  const has = (f: VoiceField, v: VoiceValues = values) => v[f] !== undefined
  const filled = VOICE_FIELDS.filter((f) => has(f)).length
  const activeSection = FIELD_DEF[active].section

  // Save as the dealer goes. Saves run one after another, so the first one cannot start a second draft.
  useEffect(() => {
    if (filled === 0 || creating) return
    const timer = setTimeout(() => {
      saves.current = saves.current.then(async () => {
        const res = await saveVoiceDraftAction({
          carId: draftId.current,
          values,
          lang,
        }).catch(() => null)
        if (res?.ok && !draftId.current) {
          draftId.current = res.carId
          window.history.replaceState(null, "", `/cars/new?car=${res.carId}`)
        }
      })
    }, 900)
    return () => clearTimeout(timer)
  }, [values, lang, filled, creating])

  // Keep the section being read in view while the dealer speaks.
  useEffect(() => {
    if (listening)
      sections.current[activeSection]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
  }, [activeSection, listening])

  const firstBlankAfter = (from: VoiceField, v: VoiceValues) => {
    const i = VOICE_FIELDS.indexOf(from)
    return (
      [...VOICE_FIELDS.slice(i + 1), ...VOICE_FIELDS.slice(0, i)].find(
        (f) => !has(f, v)
      ) ?? null
    )
  }

  function onSpeech(said: string) {
    setPartial("")
    setHeard(said)
    setUnplaced(false)
    // Tamil is turned into the English words and digits the parser reads; what the dealer said is what we show back.
    const text = toEnglish(lang, said)

    if (redo) {
      const again = isSkip(text) ? null : parseVoiceField(redo, text)
      if (again && !again.ok) return setUnplaced(true)
      if (again) {
        setValues((v) => ({ ...v, [redo]: again.value }))
        setBad((b) => b.filter((x) => x !== redo))
      }
      setRedo(null)
      // If tapping "talk again" is what turned the mic on, turn it off again once it has its answer.
      if (ownsMic.current) {
        ownsMic.current = false
        speech.stop()
        setListening(false)
      }
      return
    }

    if (NEXT_SECTION.test(text.trim())) {
      const at = VOICE_SECTIONS.indexOf(activeSection)
      const target = [
        ...VOICE_SECTIONS.slice(at + 1),
        ...VOICE_SECTIONS.slice(0, at),
      ]
        .flatMap(sectionFields)
        .find((f) => !has(f))
      if (target) setActive(target)
      return
    }
    if (isSkip(text)) {
      const next = firstBlankAfter(active, values)
      if (next) setActive(next)
      return
    }

    const found = extractFromSpeech(
      text,
      active,
      new Date().getFullYear(),
      values
    )
    const keys = Object.keys(found) as VoiceField[]
    if (keys.length === 0) return setUnplaced(true)
    setBad((b) => b.filter((f) => !keys.includes(f)))
    const next = { ...values, ...found }
    setValues(next)
    const after = firstBlankAfter(keys[keys.length - 1], next)
    if (after) setActive(after)
  }

  const speech = useSpeechRecognition({
    lang: SPEECH_LANG[lang],
    onPartial: setPartial,
    onFinal: onSpeech,
    onError: (message) => {
      setListening(false)
      setPartial("")
      setError(message)
    },
  })

  function changeLang(next: VoiceLang) {
    if (next === lang) return
    speech.stop()
    setListening(false)
    setPartial("")
    setHeard(null)
    setUnplaced(false)
    setError(null)
    setRedo(null)
    ownsMic.current = false
    onLangChange(next)
  }

  /** Speak just this blank again. Starts the mic if it is off, and stops it once the blank has its new answer. */
  function talkAgain(f: VoiceField) {
    setError(null)
    setHeard(null)
    setUnplaced(false)
    skipCommit.current = true
    setEditing(null)
    setActive(f)
    setRedo(f)
    if (listening) return
    if (speech.start()) {
      ownsMic.current = true
      setListening(true)
    } else setRedo(null)
  }

  function toggle() {
    setError(null)
    setRedo(null)
    ownsMic.current = false
    if (listening) {
      speech.stop()
      setListening(false)
      setPartial("")
      setHeard(null)
      setUnplaced(false)
    } else if (speech.start()) {
      // A fresh start: last time's "heard ... could not use it" must not greet the dealer.
      setHeard(null)
      setUnplaced(false)
      setPartial("")
      setListening(true)
      setEditing(null)
    }
  }

  /** A typed or corrected blank. Empty clears it. */
  function commit(f: VoiceField, raw: string) {
    setEditing(null)
    const text = raw.trim()
    if (!text) {
      setValues((v) =>
        Object.fromEntries(Object.entries(v).filter(([k]) => k !== f))
      )
      return setBad((b) => b.filter((x) => x !== f))
    }
    const r = parseVoiceField(f, toEnglish(lang, text))
    if (!r.ok) {
      setBad((b) => [...new Set([...b, f])])
      return setError(t.invalid(t.fields[f]))
    }
    setError(null)
    setBad((b) => b.filter((x) => x !== f))
    setValues((v) => ({ ...v, [f]: r.value }))
  }

  /** Yes/no blanks cycle on tap: empty, yes, no. */
  function cycle(f: VoiceField) {
    setActive(f)
    setValues((v) => {
      const { [f]: cur, ...rest } = v
      return cur === undefined
        ? { ...v, [f]: true }
        : cur === true
          ? { ...v, [f]: false }
          : rest
    })
  }

  async function create() {
    setError(null)
    if (filled === 0) return setError(t.needOne)
    setCreating(true)
    try {
      await saves.current
      const res = await createCarFromVoiceAction(values, {
        carId: draftId.current,
        lang,
      })
      if (!res.ok)
        return setError(
          res.error === "rate_limited"
            ? t.rateLimited
            : res.error === "invalid"
              ? t.needOne
              : t.failed
        )
      speech.stop()
      setListening(false)
      await onCreated({ carId: res.carId, hint: res.hint })
    } catch {
      setError(t.failed)
    } finally {
      setCreating(false)
    }
  }

  function slot(f: VoiceField) {
    const value = values[f]
    const isActive = f === active
    // Pick-many blanks show every choice as a pill: say it or tap it.
    if (FIELD_DEF[f].kind === "multi") {
      const chosen = Array.isArray(value) ? value : []
      return (
        <span
          key={f}
          role="group"
          aria-label={t.fields[f]}
          data-testid={`voice-slot-${f}`}
          className={cn(
            "mt-3 mb-2 flex w-full flex-wrap justify-center gap-2 rounded-2xl p-3 text-base leading-normal font-normal tracking-normal transition-colors",
            isActive && "bg-primary/10 ring-1 ring-primary/30",
            isActive && chosen.length === 0 && listening && "animate-pulse"
          )}
        >
          {(FIELD_DEF[f].options ?? []).map((option) => {
            const on = chosen.includes(option)
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setActive(f)
                  setValues((v) => {
                    const cur = Array.isArray(v[f]) ? (v[f] as string[]) : []
                    const next = on
                      ? cur.filter((o) => o !== option)
                      : [...cur, option]
                    if (next.length) return { ...v, [f]: next }
                    return Object.fromEntries(
                      Object.entries(v).filter(([k]) => k !== f)
                    )
                  })
                }}
                data-testid={`voice-pill-${option}`}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-dashed border-muted-foreground/30 text-muted-foreground/60 hover:border-muted-foreground/60 hover:text-foreground"
                )}
              >
                {lang === "ta" ? tamilOption(option) : option}
              </button>
            )
          })}
        </span>
      )
    }
    if (editing === f) {
      return (
        <span
          key={f}
          className={cn(
            "mx-1 inline-flex items-center gap-1.5 align-middle",
            isListField(f) || FIELD_DEF[f].kind === "note"
              ? "w-full max-w-md"
              : "w-64"
          )}
        >
          <EditInput
            autoFocus
            text={editableText(f, value)}
            aria-label={t.fields[f]}
            placeholder={t.examples[f]}
            className="h-11 min-w-0 flex-1 text-lg"
            onBlur={(e) => {
              if (skipCommit.current) {
                skipCommit.current = false
                return
              }
              commit(f, e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape")
                e.currentTarget.blur()
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            className="shrink-0 rounded-full"
            title={t.talkAgain}
            aria-label={`${t.talkAgain}: ${t.fields[f]}`}
            data-testid={`voice-talk-again-${f}`}
            // Keep the box focused, so tapping the button is not read as leaving it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => talkAgain(f)}
          >
            <HugeiconsIcon
              icon={Mic01Icon}
              strokeWidth={2}
              className="size-5"
            />
          </Button>
        </span>
      )
    }
    return (
      <button
        key={f}
        type="button"
        onClick={() =>
          FIELD_DEF[f].kind === "bool"
            ? cycle(f)
            : (setActive(f), (skipCommit.current = false), setEditing(f))
        }
        title={t.fields[f]}
        aria-label={`${t.fields[f]}: ${value === undefined ? "empty" : formatVoiceValue(f, value, lang)}`}
        data-testid={`voice-slot-${f}`}
        className={cn(
          "mx-0.5 rounded-lg px-1.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          value !== undefined
            ? "font-normal text-foreground underline decoration-primary/50 underline-offset-8"
            : "text-muted-foreground/40",
          bad.includes(f) && "text-destructive decoration-destructive/60",
          isActive && "bg-primary/10 text-primary",
          isActive &&
            (value === undefined || redo === f) &&
            listening &&
            "animate-pulse"
        )}
      >
        {value === undefined ? (
          <span
            className={cn(
              "border-b-2 border-dashed pb-0.5 text-[0.62em] font-extralight tracking-normal text-muted-foreground/40 italic",
              isActive
                ? "border-primary/40 text-primary/50"
                : "border-muted-foreground/25"
            )}
          >
            {suggestion(f, t, lang)}
          </span>
        ) : (
          formatVoiceValue(f, value, lang)
        )}
      </button>
    )
  }

  return (
    <div
      className="relative flex flex-col items-center gap-8 pb-16 sm:gap-10"
      lang={lang === "ta" ? "ta" : "en"}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-0 h-56 bg-gradient-to-t from-primary/15 via-primary/5 to-transparent transition-opacity duration-500",
          listening ? "opacity-100" : "opacity-40"
        )}
      />

      <Tabs
        value={lang}
        onValueChange={(v) => changeLang(v === "ta" || v === "tg" ? v : "en")}
        className="relative z-10 w-full sm:w-auto"
      >
        <TabsList aria-label={t.language} className="w-full sm:w-auto">
          <TabsTrigger value="en" data-testid="voice-lang-en">
            English
          </TabsTrigger>
          <TabsTrigger value="ta" data-testid="voice-lang-ta">
            தமிழ்
          </TabsTrigger>
          <TabsTrigger value="tg" data-testid="voice-lang-tg">
            Tanglish
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {VOICE_SECTIONS.map((section, index) => {
        const fields = sectionFields(section)
        const done = fields.filter((f) => has(f)).length
        const current = section === activeSection
        return (
          <section
            key={section}
            ref={(el) => {
              sections.current[section] = el
            }}
            aria-current={current ? "step" : undefined}
            data-testid={`voice-section-${section}`}
            className={cn(
              "relative z-10 flex w-full max-w-5xl flex-col items-center gap-4 text-center transition-opacity duration-300",
              current ? "opacity-100" : "opacity-45 hover:opacity-100"
            )}
          >
            <h2 className="flex items-center gap-3 text-xs font-medium tracking-widest text-muted-foreground uppercase">
              <span>{index + 1}</span>
              <span>{t.sections[section].title}</span>
              <span className="tracking-normal normal-case">
                {done}/{fields.length}
              </span>
            </h2>
            <p className="text-2xl leading-[2.2] font-light tracking-tight text-foreground/70 sm:text-4xl sm:leading-[2.1]">
              {t.sections[section].parts.map((part, i, parts) => {
                if (isField(part)) return slot(part)
                // A pill block ends its own line, so the full stop that closed the sentence would only dangle at the start of the next one.
                const prev = parts[i - 1]
                const afterPills =
                  prev !== undefined &&
                  isField(prev) &&
                  FIELD_DEF[prev].kind === "multi"
                const text = afterPills ? part.replace(/^[.,]\s*/, "") : part
                return text ? <span key={i}>{text}</span> : null
              })}
            </p>
          </section>
        )
      })}

      {error ? (
        <Alert variant="destructive" className="relative z-10 max-w-lg">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <BarAction>
        <div
          className="flex flex-col gap-2 border-t border-border bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-x-4 sm:px-14 sm:pb-3"
          data-testid="voice-bar"
        >
          <div className="order-2 flex min-w-0 items-center gap-3 sm:order-none">
            <span
              aria-hidden
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                listening
                  ? "animate-pulse bg-primary"
                  : "bg-muted-foreground/30"
              )}
            />
            <div
              className="flex min-h-10 min-w-0 flex-1 flex-col justify-center sm:min-h-11"
              role="status"
              aria-live="polite"
              data-testid="voice-transcript"
            >
              {partial ? (
                <p className="line-clamp-2 text-base text-foreground">
                  {partial}
                </p>
              ) : listening ? (
                <p className="animate-pulse truncate text-base text-primary">
                  {t.asking(t.fields[active])}…
                </p>
              ) : null}
              {!partial && heard ? (
                <p
                  className={cn(
                    "line-clamp-2 text-sm",
                    unplaced ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {unplaced
                    ? t.notUnderstood(t.fields[active], heard)
                    : t.heard(heard)}
                </p>
              ) : listening && !partial ? (
                <p className="truncate text-xs text-muted-foreground">
                  {t.commands}
                </p>
              ) : null}
            </div>
          </div>
          <p
            className="order-1 flex items-center justify-center gap-2 text-sm whitespace-nowrap text-muted-foreground sm:order-none"
            data-testid="voice-count"
          >
            <HugeiconsIcon
              icon={Mic01Icon}
              strokeWidth={1.5}
              className="size-4"
            />
            {t.filled(filled, VOICE_FIELDS.length)}
          </p>
          <div className="order-3 grid grid-cols-2 items-center gap-3 sm:order-none sm:flex sm:justify-end">
            <Button
              size="lg"
              variant={listening ? "outline" : "default"}
              onClick={toggle}
              className="gap-2 sm:shrink-0"
              data-testid={listening ? "voice-stop" : "voice-start"}
            >
              <HugeiconsIcon
                icon={listening ? StopIcon : Mic01Icon}
                strokeWidth={2}
                className="size-5"
              />
              {listening ? t.stop : t.start}
            </Button>
            <Button
              size="lg"
              variant={listening ? "default" : "outline"}
              onClick={create}
              disabled={filled === 0 || creating}
              className="sm:shrink-0"
              data-testid="voice-create"
            >
              {creating ? t.creating : t.create}
            </Button>
          </div>
        </div>
      </BarAction>
    </div>
  )
}
