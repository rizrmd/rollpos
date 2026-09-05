export function convertQuantity(
  quantity: number,
  from: string,
  to: string
): number {
  if (from === to) return quantity
  const factors: Record<string, number> = {
    g: 1,
    kg: 1000,
    ml: 1,
    l: 1000,
    pcs: 1,
  }
  const groups: Record<string, string> = {
    g: "mass",
    kg: "mass",
    ml: "volume",
    l: "volume",
    pcs: "count",
  }
  if (!factors[from] || !factors[to] || groups[from] !== groups[to]) {
    throw new Error(`Unit recipe ${from} tidak kompatibel dengan stok ${to}.`)
  }
  return (quantity * factors[from]) / factors[to]
}
