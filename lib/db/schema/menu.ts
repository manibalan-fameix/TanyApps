import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

import { dealers } from "./dealers.ts"

/** Restaurant menu sections ("Starters", "Biryani"). Every row belongs to one dealer (tenant). */
export const menuCategories = pgTable(
  "menu_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("menu_categories_dealer_name_unique").on(t.dealerId, t.name), index("menu_categories_dealer_idx").on(t.dealerId)],
)

export type MenuPortion = { label: string; price: number }

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => menuCategories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Whole rupees, like car prices. Portions, when present, override it for display. */
    price: integer("price").notNull(),
    /** The price before an offer. When higher than `price`, the dish is shown as on offer. */
    compareAtPrice: integer("compare_at_price"),
    portions: jsonb("portions").$type<MenuPortion[]>().notNull().default([]),
    imageUrl: text("image_url"),
    /** Units left. Null means stock is not tracked and the dish is only ever Available or Sold out. */
    stockQuantity: integer("stock_quantity"),
    isVeg: boolean("is_veg").notNull().default(true),
    isAvailable: boolean("is_available").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("menu_items_dealer_idx").on(t.dealerId), index("menu_items_category_idx").on(t.categoryId)],
)
