/** The orders table, with room for an order's popup on top of it (the @modal slot). */
export default function OrdersLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  )
}
