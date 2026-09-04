/* Service boundary for the Vendor Performance Centre page (master prompt §9: "React must
 * not own core calculations... React should request calculations from domain/service
 * modules").
 *
 * This is a THIN WRAPPER, not a reimplementation. The per-vendor rating math
 * (overallRating/categoryAverage/ratingText/ratingBand) is duplicated here from the
 * original vanilla page module verbatim, exactly as that module itself duplicated it from
 * vendors.js — this app's own established per-module small-helper convention (see the
 * original src/js/pages/vendorPerformanceCentre.js header comment). Nothing here writes
 * back to vendor_performance; this page is read-only, same as before. Navigation
 * (window.PCC.vendors.openProfile / window.PCC.router.go) is exposed as a thin pass-through
 * so the component never touches window.PCC.* directly.
 */
import type { PCCVendor, PCCVendorPerformance } from "../types/pcc";

/** Duplicated from vendors.js / the original vendorPerformanceCentre.js verbatim. */
export function overallRating(perf: PCCVendorPerformance): number {
  const vals = [perf.quality_rating, perf.delivery_rating, perf.communication_rating, perf.safety_rating].filter((v): v is number => !!v && v > 0);
  if (vals.length === 0) return 0;
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((sum / vals.length) * 10) / 10;
}

export function ratingText(n: number): string {
  return n > 0 ? n.toFixed(1).replace(/\.0$/, "") + " / 5" : "Not rated";
}

// Same 80%/60% "on_track / at_risk / critical" thresholds projectHealthEngine.js uses on
// its 0-100 health score, scaled to this page's 0-5 rating range (4.0 / 3.0).
export function ratingBand(n: number): string {
  if (n >= 4) return "on_track";
  if (n >= 3) return "at_risk";
  return "critical";
}

function categoryAverage(reviews: PCCVendorPerformance[], key: keyof PCCVendorPerformance): number {
  const vals = reviews.map((r) => r[key] as number | undefined).filter((v): v is number => !!v && v > 0);
  if (vals.length === 0) return 0;
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((sum / vals.length) * 10) / 10;
}

export interface VendorPerformanceStat {
  vendor: PCCVendor;
  reviewCount: number;
  overall?: number;
  quality?: number;
  delivery?: number;
  communication?: number;
  safety?: number;
}

export interface VendorPerformanceSnapshot {
  vendors: PCCVendor[];
  reviewed: VendorPerformanceStat[];
  unreviewed: VendorPerformanceStat[];
  portfolioAvg: number | null;
}

/** Reads the current store snapshot and derives the worst-first vendor performance rollup
 * for it. Synchronous — store.get() is synchronous, and this page performs no engine call,
 * only a portfolio-wide aggregation over data already in the store. */
export function getVendorPerformanceSnapshot(): VendorPerformanceSnapshot {
  const data = window.PCC.store.get();
  const vendors = data.vendors;

  const stats: VendorPerformanceStat[] = vendors.map((v) => {
    const reviews = data.vendor_performance.filter((p) => p.vendor_id === v.id);
    if (reviews.length === 0) return { vendor: v, reviewCount: 0 };
    const overall = Math.round((reviews.reduce((sum, r) => sum + overallRating(r), 0) / reviews.length) * 10) / 10;
    return {
      vendor: v,
      reviewCount: reviews.length,
      overall,
      quality: categoryAverage(reviews, "quality_rating"),
      delivery: categoryAverage(reviews, "delivery_rating"),
      communication: categoryAverage(reviews, "communication_rating"),
      safety: categoryAverage(reviews, "safety_rating"),
    };
  });

  const reviewed = stats.filter((s) => s.reviewCount > 0).sort((a, b) => (a.overall || 0) - (b.overall || 0)); // worst first
  const unreviewed = stats.filter((s) => s.reviewCount === 0);

  const portfolioAvg = reviewed.length > 0 ? Math.round((reviewed.reduce((sum, s) => sum + (s.overall || 0), 0) / reviewed.length) * 10) / 10 : null;

  return { vendors, reviewed, unreviewed, portfolioAvg };
}

/** Navigates to a vendor's own Profile → Performance tab (or another tab), same as the
 * original page's row onclick handler. Reviews are only ever added/edited/removed there —
 * this page stays read-only. */
export function openVendorProfile(vendorId: string, tab?: string): void {
  window.PCC.vendors.openProfile(vendorId, tab);
  window.PCC.router.go("vendors");
}
