import React from "react";

// Gate 7.5d: a money KPI value ("INR 8,16,00,000" or "INR 1,000 · USD 500"), one size down from
// the KPI default so a crore-sized amount fits a fifth of the desktop page on one line (at full
// size it broke between "INR" and the number). On a phone's two-column grid it may still wrap
// after the currency code; that is deliberate (no-wrap there scrolled the page sideways).
export function MoneyFigure({ text, color }: { text: string; color?: string }) {
  return (
    <span className="kpi-card__value" style={{ fontSize: "var(--text-xl)", color: color }}>
      {text}
    </span>
  );
}
