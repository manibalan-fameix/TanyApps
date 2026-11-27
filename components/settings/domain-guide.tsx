"use client"

import { Button, buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type SetupGuide, setupInstructions } from "@/lib/domains/hostname"
import { toast } from "@/lib/toast"

const copy = async (value: string, done = "Copied.") => {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(done)
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.")
  }
}

function Field({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="grid grid-cols-[4rem_1fr_auto] items-center gap-x-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono break-all">{value}</dd>
      <dd>
        {copyable ? (
          <Button type="button" variant="ghost" size="sm" aria-label={`Copy ${label}`} onClick={() => copy(value)}>
            Copy
          </Button>
        ) : null}
      </dd>
    </div>
  )
}

const Record = ({ type, name, value }: { type: string; name: string; value: string }) => (
  <dl className="grid gap-1 rounded-2xl border p-3 text-sm">
    <Field label="Type" value={type} />
    <Field label="Name" value={name} copyable />
    <Field label="Value" value={value} copyable />
  </dl>
)

const Steps = ({ items }: { items: string[] }) => (
  <ol className="grid list-decimal gap-1 pl-5 text-sm">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ol>
)

/** The one record to add, where to add it, and ways to get someone else to do it. */
export function DomainGuide({ guide, backup, helpPhone }: { guide: SetupGuide; backup: { name: string; value: string } | null; helpPhone: string }) {
  const { host, domain, name } = guide
  const message = setupInstructions(guide)
  const whatsapp = (to: string, text: string) => `https://wa.me/${to}?text=${encodeURIComponent(text)}`
  const link = buttonVariants({ variant: "outline", size: "sm" })

  return (
    <section className="grid gap-4" aria-labelledby="domain-record">
      <h2 id="domain-record" className="text-sm font-medium">
        Add this one record
      </h2>
      <Record type="CNAME" name={name} value={guide.value} />

      <Tabs defaultValue="godaddy">
        <TabsList>
          <TabsTrigger value="godaddy">GoDaddy</TabsTrigger>
          <TabsTrigger value="other">Other providers</TabsTrigger>
        </TabsList>
        <TabsContent value="godaddy" className="grid gap-3 pt-2">
          <Steps
            items={[
              `Sign in to GoDaddy, open your domains and choose ${domain}.`,
              "Open DNS, then DNS Records.",
              `If there is already a CNAME record named ${name}, press its pencil icon. If not, press Add New Record and choose CNAME.`,
              "Paste the name and value from above, then save.",
              ...(guide.forward ? [`So that ${domain} works too: open Forwarding and forward it to https://${host}.`] : []),
            ]}
          />
        </TabsContent>
        <TabsContent value="other" className="grid gap-3 pt-2">
          <Steps
            items={[
              `Sign in where you bought ${domain} and open its DNS settings.`,
              `Add a CNAME record with the name and value from above. If one named ${name} exists, edit it.`,
              ...(guide.forward ? [`So that ${domain} works too, forward it to https://${host}.`] : []),
            ]}
          />
        </TabsContent>
      </Tabs>
      <p className="text-sm text-muted-foreground">Leave your other records as they are, especially email records.</p>

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Want someone else to do it?</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => copy(message, "Instructions copied.")}>
            Copy instructions
          </Button>
          <a href={whatsapp("", message)} target="_blank" rel="noreferrer" className={link}>
            Send on WhatsApp
          </a>
          <a href={whatsapp(helpPhone, `I need help connecting my domain.\n\n${message}`)} target="_blank" rel="noreferrer" className={link}>
            Ask Tany for help
          </a>
        </div>
      </div>

      {backup ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Added the record and it is still not found?</summary>
          <div className="mt-2 grid gap-2">
            <p>Some providers hide CNAME records. Keep the record above and also add this one:</p>
            <Record type="TXT" name={backup.name} value={backup.value} />
          </div>
        </details>
      ) : null}
    </section>
  )
}
