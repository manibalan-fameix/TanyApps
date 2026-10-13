"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createCategory,
  deleteCategory,
  renameCategory,
} from "@/app/(admin)/(shell)/menu/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type CategoryRow = { id: string; name: string; itemCount: number }

export function CategoriesManager({ categories }: { categories: CategoryRow[] }) {
  const [pending, start] = useTransition()
  const [name, setName] = useState("")
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn()
      if (res.ok) after?.()
      else toast.error(res.error ?? "Something went wrong.")
    })

  return (
    <div className="grid max-w-lg gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => createCategory(name), () => setName(""))
        }}
      >
        <Input
          aria-label="New category name"
          value={name}
          placeholder="Starters, Biryani, Desserts..."
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          Add
        </Button>
      </form>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No categories yet. Add one to group your dishes on the menu.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-3">
              {editing?.id === c.id ? (
                <>
                  <Input
                    aria-label="Category name"
                    value={editing.name}
                    onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  />
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => renameCategory(c.id, editing.name), () => setEditing(null))}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.itemCount} {c.itemCount === 1 ? "dish" : "dishes"}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setEditing({ id: c.id, name: c.name })}>
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Delete "${c.name}"? Its dishes stay on the menu without a category.`))
                        run(() => deleteCategory(c.id))
                    }}
                  >
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
