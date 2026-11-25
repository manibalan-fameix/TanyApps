import { SiteShell } from "./site-shell"

/** A readable single-column page: policies, About and Contact. */
export function TextPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <SiteShell>
      <article className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12 leading-relaxed sm:px-6 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {updated && <p className="text-sm text-muted-foreground">Last updated: {updated}</p>}
        {children}
      </article>
    </SiteShell>
  )
}
