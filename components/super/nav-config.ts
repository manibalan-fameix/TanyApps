import type { IconSvgElement } from "@hugeicons/react"
import {
  Building03Icon,
  Car01Icon,
  ChartLineData01Icon,
  DashboardSquare01Icon,
  DeliveryTruck01Icon,
  Invoice01Icon,
  Mail01Icon,
  Notification01Icon,
  PercentCircleIcon,
  Restaurant01Icon,
  Search01Icon,
  Settings02Icon,
  ShoppingBag01Icon,
  StarIcon,
  UserGroupIcon,
  UserMultiple02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"

export type SuperNavItem = { title: string; url: string; icon: IconSvgElement }
export type SuperNavGroup = { label: string; items: SuperNavItem[] }

/** Same grouped sidebar as the restaurant admin: a short label per section, one icon per page. */
export const superNavGroups: SuperNavGroup[] = [
  {
    label: "Main",
    items: [
      { title: "Overview", url: "/super", icon: DashboardSquare01Icon },
      {
        title: "Analytics",
        url: "/super/analytics",
        icon: ChartLineData01Icon,
      },
      { title: "Activity", url: "/super/activity", icon: Notification01Icon },
      { title: "Search", url: "/super/search", icon: Search01Icon },
    ],
  },
  {
    label: "Businesses",
    items: [
      {
        title: "All businesses",
        url: "/super/businesses",
        icon: Building03Icon,
      },
      { title: "Users", url: "/super/users", icon: UserGroupIcon },
      { title: "Customers", url: "/super/customers", icon: UserMultiple02Icon },
    ],
  },
  {
    label: "Money",
    items: [
      { title: "Revenue & plans", url: "/super/revenue", icon: Wallet01Icon },
      { title: "Bookings", url: "/super/bookings", icon: Invoice01Icon },
    ],
  },
  {
    label: "Dealerships",
    items: [
      { title: "Cars", url: "/super/cars", icon: Car01Icon },
      { title: "Leads", url: "/super/leads", icon: UserMultiple02Icon },
    ],
  },
  {
    label: "Restaurants",
    items: [
      { title: "Orders", url: "/super/orders", icon: ShoppingBag01Icon },
      { title: "Menu items", url: "/super/menu", icon: Restaurant01Icon },
      { title: "Delivery", url: "/super/delivery", icon: DeliveryTruck01Icon },
      { title: "Coupons", url: "/super/coupons", icon: PercentCircleIcon },
    ],
  },
  {
    label: "Feedback",
    items: [
      { title: "Reviews", url: "/super/reviews", icon: StarIcon },
      { title: "Enquiries", url: "/super/enquiries", icon: Mail01Icon },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Platform", url: "/super/platform", icon: Settings02Icon },
    ],
  },
]

export const superNav: SuperNavItem[] = superNavGroups.flatMap((g) => g.items)

export function superTitleFor(pathname: string): string {
  const exact = superNav.find((i) => i.url === pathname)
  if (exact) return exact.title
  const parent = [...superNav]
    .sort((a, b) => b.url.length - a.url.length)
    .find((i) => i.url !== "/super" && pathname.startsWith(`${i.url}/`))
  return parent
    ? parent.url === "/super/businesses"
      ? "Business"
      : parent.title
    : "Overview"
}
