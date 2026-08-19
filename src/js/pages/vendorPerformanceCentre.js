/* Vendor Performance Centre (PCC Evolution Roadmap, Tier C: Project Performance).
 *
 * Portfolio-wide rollup of vendor performance — distinct from Gate 13's per-vendor
 * Performance tab (still the only place reviews are added/edited/removed; this page is
 * read-only). Same "inspect before proposing" discipline as every other roadmap gate: the
 * per-vendor data model, entry flow, and running average already existed
 * (`vendor_performance`, `overallRating()`); what was missing was any way to compare
 * vendors against each other or find the worst performers across the whole portfolio. This
 * gate adds exactly that — nothing here writes back to `vendor_performance`.
 *
 * Same worst-first convention as the Document Control Dashboard (Gate 26): reviewed
 * vendors are ranked lowest-overall-rating-first so problem vendors surface. Vendors with
 * zero reviews are listed separately, never ranked at the bottom as if they'd scored 0 —
 * "not rated" and "rated 0" are different things (see vendors.js's own `overallRating()`
 * comment, duplicated below per this app's per-module small-helper convention).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  /** Duplicated from vendors.js verbatim — small enough (< 30 lines combined) to fit this
   * app's established per-module-helpers convention rather than exporting a shared one. */
  function overallRating(perf) {
    var vals = [perf.quality_rating, perf.delivery_rating, perf.communication_rating, perf.safety_rating].filter(function (v) {
      return v > 0;
    });
    if (vals.length === 0) return 0;
    var sum = vals.reduce(function (a, b) {
      return a + b;
    }, 0);
    return Math.round((sum / vals.length) * 10) / 10;
  }

  function ratingText(n) {
    return n > 0 ? n.toFixed(1).replace(/\.0$/, "") + " / 5" : "Not rated";
  }

  // Same 80%/60% "on_track / at_risk / critical" thresholds projectHealthEngine.js uses on
  // its 0-100 health score, scaled to this page's 0-5 rating range (4.0 / 3.0).
  function ratingBand(n) {
    if (n >= 4) return "on_track";
    if (n >= 3) return "at_risk";
    return "critical";
  }

  function categoryAverage(reviews, key) {
    var vals = reviews.map(function (r) { return r[key]; }).filter(function (v) { return v > 0; });
    if (vals.length === 0) return 0;
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    return Math.round((sum / vals.length) * 10) / 10;
  }

  function kpiCard(label, value, colorVar) {
    var card = document.createElement("div");
    card.className = "kpi-card";
    var valueStyle = colorVar ? ' style="color:var(' + colorVar + ')"' : "";
    card.innerHTML =
      '<span class="kpi-card__label">' + label + '</span><span class="kpi-card__value mono"' + valueStyle + ">" + value + "</span>";
    return card;
  }

  function viewProfileBtn(vendorId) {
    var btn = document.createElement("button");
    btn.className = "btn btn--ghost";
    btn.textContent = "View Profile";
    btn.onclick = function () {
      window.PCC.vendors.openProfile(vendorId, "performance");
      window.PCC.router.go("vendors");
      window.PCC.router.render();
    };
    return btn;
  }

  function render(outlet) {
    var data = window.PCC.store.get();
    var vendors = data.vendors;

    var wrap = document.createElement("div");
    var h1 = document.createElement("h2");
    h1.textContent = "Vendor Performance Centre";
    h1.style.marginBottom = "4px";
    wrap.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "20px";
    sub.textContent =
      vendors.length === 0
        ? "No vendors yet — add some from Vendor Management."
        : "Portfolio-wide performance rollup across " + vendors.length + " vendor" + (vendors.length === 1 ? "" : "s") +
          ". Reviews are added from each vendor's own Profile → Performance tab.";
    wrap.appendChild(sub);

    if (vendors.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "Nothing to show yet. Once vendors exist and have at least one performance review, this page will rank them worst-first.";
      wrap.appendChild(empty);
      outlet.appendChild(wrap);
      return;
    }

    var stats = vendors.map(function (v) {
      var reviews = data.vendor_performance.filter(function (p) { return p.vendor_id === v.id; });
      if (reviews.length === 0) return { vendor: v, reviewCount: 0 };
      var overall = Math.round((reviews.reduce(function (sum, r) { return sum + overallRating(r); }, 0) / reviews.length) * 10) / 10;
      return {
        vendor: v,
        reviewCount: reviews.length,
        overall: overall,
        quality: categoryAverage(reviews, "quality_rating"),
        delivery: categoryAverage(reviews, "delivery_rating"),
        communication: categoryAverage(reviews, "communication_rating"),
        safety: categoryAverage(reviews, "safety_rating"),
      };
    });

    var reviewed = stats
      .filter(function (s) { return s.reviewCount > 0; })
      .sort(function (a, b) { return a.overall - b.overall; }); // worst first
    var unreviewed = stats.filter(function (s) { return s.reviewCount === 0; });

    var portfolioAvg = reviewed.length > 0
      ? Math.round((reviewed.reduce(function (sum, s) { return sum + s.overall; }, 0) / reviewed.length) * 10) / 10
      : null;

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";
    kpiGrid.appendChild(kpiCard("TOTAL VENDORS", vendors.length, null));
    kpiGrid.appendChild(kpiCard("REVIEWED", reviewed.length, null));
    kpiGrid.appendChild(kpiCard("NOT YET REVIEWED", unreviewed.length, unreviewed.length > 0 ? "--status-at-risk" : null));
    kpiGrid.appendChild(kpiCard("PORTFOLIO AVG RATING", portfolioAvg === null ? "—" : ratingText(portfolioAvg), null));
    wrap.appendChild(kpiGrid);

    var rankedPanel = document.createElement("div");
    rankedPanel.className = "panel";
    rankedPanel.style.marginTop = "16px";
    var rankedHeading = document.createElement("h3");
    rankedHeading.style.marginBottom = "8px";
    rankedHeading.textContent = "Vendor Performance (worst first)";
    rankedPanel.appendChild(rankedHeading);

    if (reviewed.length === 0) {
      var noReviews = document.createElement("p");
      noReviews.className = "text-secondary";
      noReviews.style.fontSize = "13px";
      noReviews.textContent = "No performance reviews yet across the portfolio.";
      rankedPanel.appendChild(noReviews);
    } else {
      reviewed.forEach(function (s) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "8px 0";
        row.style.borderBottom = "1px solid var(--divider)";

        var left = document.createElement("div");
        left.innerHTML =
          "<strong>" + (s.vendor.vendor_name || "(unnamed vendor)") + "</strong>" +
          "<p style='font-size:12px;margin:4px 0 0'>" +
          ratingText(s.overall) + " overall (" + s.reviewCount + " review" + (s.reviewCount === 1 ? "" : "s") + ")" +
          "</p>" +
          "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
          "Quality: " + ratingText(s.quality) + " · Delivery: " + ratingText(s.delivery) +
          " · Communication: " + ratingText(s.communication) + " · Safety: " + ratingText(s.safety) +
          "</p>";
        row.appendChild(left);

        var right = document.createElement("div");
        right.style.display = "flex";
        right.style.alignItems = "center";
        right.style.gap = "8px";
        right.style.flexShrink = "0";

        var badge = document.createElement("span");
        badge.className = "status-badge status-badge--" + ratingBand(s.overall);
        badge.textContent =
          ratingBand(s.overall) === "on_track" ? "On Track" : ratingBand(s.overall) === "at_risk" ? "At Risk" : "Critical";
        right.appendChild(badge);
        right.appendChild(viewProfileBtn(s.vendor.id));

        row.appendChild(right);
        rankedPanel.appendChild(row);
      });
    }
    wrap.appendChild(rankedPanel);

    var unreviewedPanel = document.createElement("div");
    unreviewedPanel.className = "panel";
    unreviewedPanel.style.marginTop = "16px";
    var unreviewedHeading = document.createElement("h3");
    unreviewedHeading.style.marginBottom = "8px";
    unreviewedHeading.textContent = "Not Yet Reviewed (" + unreviewed.length + ")";
    unreviewedPanel.appendChild(unreviewedHeading);

    if (unreviewed.length === 0) {
      var allReviewed = document.createElement("p");
      allReviewed.className = "text-secondary";
      allReviewed.style.fontSize = "13px";
      allReviewed.textContent = "Every vendor has at least one performance review.";
      unreviewedPanel.appendChild(allReviewed);
    } else {
      unreviewed.forEach(function (s) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "6px 0";
        row.style.borderBottom = "1px solid var(--divider)";
        row.style.fontSize = "13px";

        var name = document.createElement("span");
        name.textContent = s.vendor.vendor_name || "(unnamed vendor)";
        row.appendChild(name);
        row.appendChild(viewProfileBtn(s.vendor.id));

        unreviewedPanel.appendChild(row);
      });
    }
    wrap.appendChild(unreviewedPanel);

    outlet.appendChild(wrap);
  }

  window.PCC.pages.vendorPerformanceCentre = render;
})();
