import { OrderDetail, loadOrder, orderSubtitle } from "@/components/restaurant/order-detail"
import { OrderPopup } from "@/components/restaurant/order-popup"
import { OrderStatusBadge } from "@/components/restaurant/order-status-badge"

export const metadata = { title: "Order" }
export const dynamic = "force-dynamic"

/** Opening an order from the orders table lands here. A refresh or a shared link shows the full page (orders/[id]). */
export default async function OrderPopupPage({ params }: { params: Promise<{ id: string }> }) {
  const data = await loadOrder(params)
  return (
    <OrderPopup title={`Order ${data.order.code}`} description={orderSubtitle(data.order)}>
      <div className="grid gap-4">
        <div>
          <OrderStatusBadge status={data.order.status} />
        </div>
        <OrderDetail {...data} />
      </div>
    </OrderPopup>
  )
}
