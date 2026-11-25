import { StoreAppHome } from "@/components/restaurant/store/app-home"
import { StoreWebHome } from "@/components/restaurant/store/web-home"

type AppProps = React.ComponentProps<typeof StoreAppHome>

/** The phone home and the wide-screen home, one of which CSS shows. */
export function HomeScreens({ location, origin, ...shared }: AppProps) {
  return (
    <>
      <StoreAppHome {...shared} location={location} origin={origin} />
      <StoreWebHome dishes={shared.dishes} categories={shared.categories} banners={shared.banners} canOrder={shared.canOrder} couponHint={shared.couponHint} layout={shared.layout} />
    </>
  )
}
