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
import type { IndustryKey } from "@/lib/verticals"

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

export const navCabsGroups: NavGroup[] = [
  { label: "Main", items: [{ title: n.dashboard, url: "/dashboard", icon: DashboardSquare01Icon }] },
  {
    label: "Fleet",
    items: [
      { title: "Vehicles", url: "/cabs/vehicles", icon: Car01Icon },
      { title: "Vehicle classes", url: "/cabs/vehicle-classes", icon: Folder01Icon },
      { title: "Drivers", url: "/cabs/drivers", icon: UserMultiple02Icon },
    ],
  },
  {
    label: "Pricing",
    items: [
      { title: "Rate cards", url: "/cabs/pricing", icon: Wallet01Icon },
      { title: "Extra charges", url: "/cabs/pricing/surcharges", icon: PercentCircleIcon },
      { title: "Tour packages", url: "/cabs/packages", icon: RouteIcon },
    ],
  },
  {
    label: "System",
    items: [{ ...settingsItem, items: [{ title: "Fares, GST and rules", url: "/cabs/settings" }, ...settingsItem.items!] }],
  },
]
export const navCabs: NavMainItem[] = navCabsGroups.flatMap((g) => g.items)

export type NavTab = { href: string; icon: IconSvgElement; label: string; isActive: (pathname: string) => boolean }

const under = (pathname: string, url: string) => pathname === url || pathname.startsWith(`${url}/`)

/**
 * How the admin shell looks per industry. A `Record<IndustryKey, ...>`, so adding an industry to the registry fails to
 * compile until its navigation is described here.
 */
export type AdminNavSpec = {
  /** Sidebar groups; null means the flat `items` list. */
  groups: NavGroup[] | null
  items: NavMainItem[]
  /** The "recent cars" block under the main nav. */
  showRecentCars: boolean
  /** The prominent "add" button in the sidebar and on the phone tab bar. */
  addItem: { href: string; label: string }
  /** Phone tab bar: the second tab (the catalogue) and the fourth (the inbox). */
  catalogueTab: NavTab
  inboxTab: NavTab
  /** Pages with their own tab, so "More" lists everything else. */
  tabUrls: string[]
}

export const ADMIN_NAV: Record<IndustryKey, AdminNavSpec> = {
  motors: {
    groups: null,
    items: navMain,
    showRecentCars: true,
    addItem: { href: "/cars/new", label: n.addCar },
    catalogueTab: { href: "/cars", icon: Car01Icon, label: n.cars, isActive: (p) => under(p, "/cars") && p !== "/cars/new" },
    inboxTab: { href: "/leads", icon: UserMultiple02Icon, label: n.leads, isActive: (p) => under(p, "/leads") },
    tabUrls: ["/dashboard", "/cars", "/leads"],
  },
  restaurants: {
    groups: navRestaurantGroups,
    items: navRestaurant,
    showRecentCars: false,
    addItem: { href: "/menu/new", label: "Add dish" },
    catalogueTab: { href: "/menu", icon: Restaurant01Icon, label: "Menu", isActive: (p) => under(p, "/menu") && p !== "/menu/new" },
    inboxTab: { href: "/orders", icon: ShoppingBag01Icon, label: "Orders", isActive: (p) => under(p, "/orders") },
    tabUrls: ["/dashboard", "/menu", "/orders"],
  },
  // Not selectable yet (Vertical.adminReady is false). Phase 1 replaces this with the real cab navigation.
  // Bookings arrive in Phase 2 and replace the Drivers tab on the phone bar.
  cabs: {
    groups: navCabsGroups,
    items: navCabs,
    showRecentCars: false,
    addItem: { href: "/cabs/vehicles", label: "Add vehicle" },
    catalogueTab: { href: "/cabs/vehicles", icon: Car01Icon, label: "Vehicles", isActive: (p) => under(p, "/cabs/vehicles") },
    inboxTab: { href: "/cabs/drivers", icon: UserMultiple02Icon, label: "Drivers", isActive: (p) => under(p, "/cabs/drivers") },
    tabUrls: ["/dashboard", "/cabs/vehicles", "/cabs/drivers"],
  },
}

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
  ...[...navMain, ...navRestaurant, ...navCabs].flatMap((i) => [
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
