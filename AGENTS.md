<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design system (mandatory)

- All UI in this product MUST be built with the shadcn/ui design system only (preset `beEhfL04`, style `base-luma`, icons: `hugeicons`).
- Need a component? Add it with `pnpm dlx shadcn@latest add <component>` — do not hand-roll custom equivalents or introduce other UI libraries (MUI, Chakra, Ant, etc.).
- Style with the theme's CSS variables/Tailwind tokens in `app/globals.css`; no hard-coded colors or ad-hoc design tokens.
- Store backend (`app/(admin)/(shell)`): Tany brand colours only, meaning the brand red and the theme neutrals. No green, blue, amber or other palette colours; use `primary`, `destructive`, `muted` and `foreground` tokens. `globals.css` remaps `success`, `info`, toasts and category tiles under `[data-store-backend]`. Exceptions: third-party brand logos, Tany product logos, and previews of what customers see on the storefront.
- Use `hugeicons` for icons; do not add other icon libraries.
- Tables: every table uses the one tablecn layout (https://www.tablecn.com) from `components/data-table`: search and filter buttons on the left, Sort and View on the right, a tick box on each row, row actions in a "..." menu (`DataTableRowActions`: Edit or View first, value changes as a submenu with the current one ticked, Delete last with `confirm`; rows do nothing when clicked, and editing opens a side `Sheet`), and the shared pagination footer. Use `DataGrid` (`data-grid`) for list screens with filters or row clicks, `SimpleTable` (`simple-table`) for cells drawn up front, including from server pages, and `DataTable` with `useReactTable` only for special cases (drag-to-reorder, editable cells). Never render `components/ui/table` directly in a screen, add header icons or status tabs to a table, or add another table library (AG Grid has been removed).
- Charts: shadcn charts only (https://ui.shadcn.com/charts, `components/ui/chart` on Recharts). Screens use the shared cards and plots in `components/charts/charts.tsx` (`ChartCard`, `TrendPlot`, `BarPlot`, `DonutPlot`); colours come from the `--chart-*` tokens, which are shades of the Tany red. Do not add another chart library (AG Charts has been removed).
- Spreadsheet editing: the Products screen uses the tablecn data grid (`components/data-grid`, `hooks/use-data-grid`, `lib/data-grid-*`, installed from the Dice UI registry and adapted to hugeicons and `@/lib/toast`). It needs TanStack Table v9, installed beside v8 under the name `@tanstack/react-table-v9`: only data-grid code may import it, and everything else stays on v8. Do not add `sonner` or `lucide-react` when updating these files.
- Toasts: sileo only, through `@/lib/toast` (`toast.success | error | warning | info | message | promise`, with `action` for buttons). Never import `sileo`, `sonner` or any other toast/notification library directly, and never use `alert()`. The `<Toaster />` (top-center, theme-aware) is mounted once per surface layout from `components/ui/toaster.tsx`; a new surface layout must mount it. ESLint enforces the import rule.
