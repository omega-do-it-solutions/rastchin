const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

/**
 * Localizes ASCII digits to Persian digits; leaves everything else as-is.
 * Use for counts, caption sizes, and step numbers. Versions stay Latin (the "v"
 * prefix rule), so don't run them through this.
 */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}
