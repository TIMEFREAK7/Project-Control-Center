/* The "notfound" route — a fixed message for an unknown hash route, no state, no service
 * needed (nothing to fetch). Ported verbatim from the old makeComingSoon() factory's only
 * real caller (src/js/pages/comingSoon.js), which also exists to be reused later for any
 * genuinely not-yet-built feature page, so the shape stays a reusable component rather
 * than a one-off literal.
 */
import React from "react";

export default function ComingSoonPage({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>{title}</h2>
      <div className="panel" style={{ maxWidth: 520, textAlign: "center" }}>
        <h3 style={{ marginBottom: 8 }}>Not built yet</h3>
        <p className="text-secondary" style={{ margin: 0 }}>
          {note}
        </p>
      </div>
    </div>
  );
}
