/* Vendor Performance Centre — migrated to React (Post-Phase-5 Engineering Evolution,
 * progressive React migration, following the Storage Management pilot pattern).
 *
 * Portfolio-wide rollup of vendor performance — distinct from Gate 13's per-vendor
 * Performance tab (still the only place reviews are added/edited/removed; this page is
 * read-only). Same worst-first convention as the Document Control Dashboard: reviewed
 * vendors are ranked lowest-overall-rating-first so problem vendors surface. Vendors with
 * zero reviews are listed separately, never ranked at the bottom as if they'd scored 0.
 *
 * Reproduces the prior vanilla page's exact text and CSS class names (kpi-grid/kpi-card/
 * panel/empty-state/attention-list/attention-item/attention-item--clickable/
 * attention-item__icon/attention-item__body/attention-item__text/attention-item__meta/
 * text-secondary/mono) — same visual result, only the implementation moved. All
 * calculation logic lives in ../services/vendorPerformanceCentreService.js; this component
 * only reads a snapshot and renders it (no local calc, no store writes — read-only, same
 * as the original).
 */
import React from "react";
import { getVendorPerformanceSnapshot, ratingText, ratingBand, openVendorProfile, VendorPerformanceStat } from "../services/vendorPerformanceCentreService";

function KpiCard({ label, value, colorVar }: { label: string; value: string | number; colorVar: string | null }) {
  return (
    <div className="kpi-card">
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value" style={colorVar ? { color: `var(${colorVar})` } : undefined}>
        {value}
      </span>
    </div>
  );
}

function VendorRow({ stat, showDetail }: { stat: VendorPerformanceStat; showDetail: boolean }) {
  return (
    <div className="attention-item attention-item--clickable" onClick={() => openVendorProfile(stat.vendor.id, "performance")}>
      <span className={"attention-item__icon attention-item__icon--" + (showDetail ? ratingBand(stat.overall || 0) : "info")} />
      <div className="attention-item__body">
        <div className="attention-item__text">
          {showDetail
            ? `${stat.vendor.vendor_name || "(unnamed vendor)"} — ${ratingText(stat.overall || 0)} overall (${stat.reviewCount} review${stat.reviewCount === 1 ? "" : "s"})`
            : stat.vendor.vendor_name || "(unnamed vendor)"}
        </div>
        {showDetail ? (
          <div className="attention-item__meta">
            Quality: {ratingText(stat.quality || 0)} · Delivery: {ratingText(stat.delivery || 0)} · Communication: {ratingText(stat.communication || 0)} · Safety:{" "}
            {ratingText(stat.safety || 0)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function VendorPerformanceCentrePage() {
  const { vendors, reviewed, unreviewed, portfolioAvg } = getVendorPerformanceSnapshot();

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-4)" }}>Vendor Performance Centre</h2>

      {vendors.length === 0 ? (
        <div className="panel empty-state">
          No vendors yet. Add some in Vendors, then review them from each vendor's Profile → Performance tab.
          <button className="btn btn--ghost empty-state__action" onClick={() => window.PCC.router.go("vendors")}>
            Go to Vendors
          </button>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total vendors" value={vendors.length} colorVar={null} />
            <KpiCard label="Reviewed" value={reviewed.length} colorVar={null} />
            <KpiCard label="Not yet reviewed" value={unreviewed.length} colorVar={unreviewed.length > 0 ? "--status-at-risk" : null} />
            <KpiCard label="Portfolio avg rating" value={portfolioAvg === null ? "—" : ratingText(portfolioAvg)} colorVar={null} />
          </div>

          <div className="panel panel--flat" style={{ marginTop: "16px" }}>
            <h3 style={{ marginBottom: "8px" }}>Vendor Performance (worst first)</h3>
            {reviewed.length === 0 ? (
              <p className="text-secondary" style={{ fontSize: "var(--text-13)" }}>
                No performance reviews yet across the portfolio. Reviews are added from each vendor's Profile → Performance tab.
              </p>
            ) : (
              <div className="attention-list">
                {reviewed.map((s) => (
                  <VendorRow key={s.vendor.id} stat={s} showDetail={true} />
                ))}
              </div>
            )}
          </div>

          <div className="panel panel--flat" style={{ marginTop: "16px" }}>
            <h3 style={{ marginBottom: "8px" }}>Not Yet Reviewed ({unreviewed.length})</h3>
            {unreviewed.length === 0 ? (
              <p className="text-secondary" style={{ fontSize: "var(--text-13)" }}>
                Every vendor has at least one performance review.
              </p>
            ) : (
              <div className="attention-list">
                {unreviewed.map((s) => (
                  <VendorRow key={s.vendor.id} stat={s} showDetail={false} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
