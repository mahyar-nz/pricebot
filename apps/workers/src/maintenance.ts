/** Maintenance never modifies products, prices, recommendations or audit history. */
export function retentionBoundaries(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error('Valid timestamp required');
  return {
    sessionExpiry: now,
    otpExpiry: new Date(now.getTime() - 86_400_000),
    rateLimitWindow: new Date(now.getTime() - 7 * 86_400_000),
  };
}
