export function normalizeOwnerNonNegativeInteger(
  value: number | string,
  field: string,
) {
  const normalized = Number(value);

  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${field} returned an invalid number.`);
  }

  return normalized;
}
