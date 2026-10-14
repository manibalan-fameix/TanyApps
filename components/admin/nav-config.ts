import type { IconSvgElement } from "@hugeicons/react"
import {
  Car01Icon,
  ChartLineData01Icon,
  Home01Icon,
  HelpCircleIcon,
  LinkSquare02Icon,
  DashboardSquare01Icon,
  DeliveryTruck01Icon,
  Folder01Icon,
  Location01Icon,
  Mail01Icon,
  MapPinpoint01Icon,
  Notification01Icon,
  PercentCircleIcon,
  Radio01Icon,
  Restaurant01Icon,
  ShoppingBag01Icon,
  StarIcon,
  Wallet01Icon,
  WarehouseIcon,
  RouteIcon,
  Settings02Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"

import { copy } from "@/lib/copy"

const n = copy.admin.nav

export type NavMainItem = {
  title: string
  url: string
  icon: IconSvgElement
  /** With `items`, the entry is a dropdown only: `url` marks its section but is not a page. */
  items?: { title: string; url: string }[]
}

export const navMain: NavMainItem[] = [
  { title: n.dashboard, url: "/dashboard", icon: Home01Icon },
  {
    title: n.cars,
    url: "/cars",
    icon: Car01Icon,
    items: [
      { title: n.allCars, url: "/cars" },
      { title: n.addCar, url: "/cars/new" },
      { title: n.soldCars, url: "/cars/sold" },
    ],
  },
  {
    title: n.leads,
    url: "/leads",
    icon: UserMultiple02Icon,
    items: [
      { title: n.allLeads, url: "/leads" },
      { title: n.pipeline, url: "/leads/pipeline" },
    ],
  },
  { title: n.transfers, url: "/transfers", icon: RouteIcon },
  { title: n.reports, url: "/reports", icon: ChartLineData01Icon },
  {
    title: n.settings,
    url: "/settings",
    icon: Settings02Icon,
    items: [
      { title: n.hours, url: "/settings/hours" },
      { title: n.theme, url: "/settings/theme" },
      { title: n.team, url: "/settings/team" },
      { title: n.billing, url: "/settings/billing" },
      { title: n.payments, url: "/settings/payments" },
    ],
  },
]

export type NavGroup = { label: string; items: NavMainItem[] }

const settingsItem = navMain.find((i) => i.url === "/settings")!

/**
 * Sidebar for restaurants: the same seven sections as the Lala Sweets admin (Main, Catalog, Delivery, Customers,
 * Payments, Insights, System). Only Settings opens a sub-list, because TanyApps's settings are shared with every industry.
 */
export const navRestaurantGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { title: n.dashboard, url: "/dashboard", icon: DashboardSquare01Icon },
      { title: "Orders", url: "/orders", icon: ShoppingBag01Icon },
    ],
  },
  {
    label: "Catalog",
    items: [
      { title: "Dishes", url: "/menu", icon: Restaurant01Icon },
      { title: "Categories", url: "/categories", icon: Folder01Icon },
      { title: "Inventory", url: "/inventory", icon: WarehouseIcon },
      { title: "Offers & Coupons", url: "/coupons", icon: PercentCircleIcon },
    ],
  },
  {
    label: "Delivery",
    items: [
      { title: "Delivery Partners", url: "/delivery-partners", icon: DeliveryTruck01Icon },
      { title: "Live Deliveries", url: "/live-deliveries", icon: Radio01Icon },
      { title: "Delivery Zones", url: "/delivery-zones", icon: Location01Icon },
    ],
  },
  {
    label: "Customers",
    items: [
      { title: "Customers", url: "/customers", icon: UserMultiple02Icon },
      { title: "Reviews", url: "/reviews", icon: StarIcon },
      { title: "Enquiries", url: "/enquiries", icon: Mail01Icon },
    ],
  },
  { label: "Payments", items: [{ title: "Payments", url: "/payments", icon: Wallet01Icon }] },
  {
    label: "Insights",
    items: [
      { title: "Analytics", url: "/analytics", icon: ChartLineData01Icon },
      { title: "Order by Location", url: "/order-by-location", icon: MapPinpoint01Icon },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Notifications", url: "/notifications", icon: Notification01Icon },
      {
        ...settingsItem,
        items: [
          { title: "Storefront", url: "/settings/storefront" },
          { title: "Ordering", url: "/settings/ordering" },
          { title: "Location & range", url: "/settings/location" },
          ...settingsItem.items!,
        ],
      },
    ],
  },
]

/** Every restaurant page, flat. Used for page titles and the phone "More" sheet. */
export const navRestaurant: NavMainItem[] = navRestaurantGroups.flatMap((g) => g.items)

export const navSecondary = {
  help: { title: n.help, url: "/help", icon: HelpCircleIcon },
  viewPage: { title: n.viewPage, icon: LinkSquare02Icon },
}

/** Destinations reachable from the sidebar and user menu that have no screen yet. */
export const userMenuPages = [
  { title: n.upgrade, url: "/settings/plan" },
  { title: n.account, url: "/settings/account" },
  { title: n.billing, url: "/settings/billing" },
  { title: n.notifications, url: "/settings/notifications" },
]

const allPages: { title: string; url: string }[] = [
  ...[...navMain, ...navRestaurant].flatMap((i) => [
    { title: i.title, url: i.url },
    ...(i.items ?? []),
  ]),
  { title: n.help, url: "/help" },
  ...userMenuPages,
  { title: n.recentCars, url: "/cars" },
]

export function pageFor(pathname: string) {
  return allPages.find((p) => p.url === pathname)
}

/** Longest matching page, so /cars/new titles as "Add a car" and unknown children fall back to their parent. */
export function pageTitleFor(pathname: string): string {
  const exact = pageFor(pathname)
  if (exact) return exact.title
  const parent = [...allPages]
    .sort((a, b) => b.url.length - a.url.length)
    .find((p) => pathname.startsWith(`${p.url}/`))
  return parent?.title ?? n.dashboard
}

/** Sidebar and user-menu destinations without a screen yet, plus per-car pages. */
export function isPlaceholderPath(pathname: string): boolean {
  return Boolean(pageFor(pathname)) || /^\/cars\/[\w-]+$/.test(pathname)
}
