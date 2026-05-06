export const money = (value: number | string | null | undefined) => {
  const n = Number(value || 0)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(n)
}
