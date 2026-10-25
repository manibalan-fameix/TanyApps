<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design system (mandatory)

- All UI in this product MUST be built with the shadcn/ui design system only (preset `beEhfL04`, style `base-luma`, icons: `hugeicons`).
- Need a component? Add it with `pnpm dlx shadcn@latest add <component>` — do not hand-roll custom equivalents or introduce other UI libraries (MUI, Chakra, Ant, etc.).
- Style with the theme's CSS variables/Tailwind tokens in `app/globals.css`; no hard-coded colors or ad-hoc design tokens.
- Use `hugeicons` for icons; do not add other icon libraries.
- Toasts: sileo only, through `@/lib/toast` (`toast.success | error | warning | info | message | promise`, with `action` for buttons). Never import `sileo`, `sonner` or any other toast/notification library directly, and never use `alert()`. The `<Toaster />` (top-center, theme-aware) is mounted once per surface layout from `components/ui/toaster.tsx`; a new surface layout must mount it. ESLint enforces the import rule.
