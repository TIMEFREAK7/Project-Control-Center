// Local calendar dates and date/time display for every React service/page. The actual rules
// (the user's chosen time zone from Settings → Time zone, or the device clock on Automatic)
// live in src/js/store.js's window.PCC.dates, which every app loads (mirror-app/ included);
// these wrappers only fall back to the device clock if it's somehow absent.
//
// Background (2026-09-24 audit): the old per-service `new Date().toISOString().slice(0, 10)`
// was the UTC date, a day behind in IST until 05:30. Stored dates stay plain YYYY-MM-DD
// strings, and the services' own addDaysIso()-style arithmetic stays UTC-based on those
// strings, which is timezone-neutral and correct. Only "what day is it NOW" and display
// were wrong.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function deviceIsoDate(dt: Date): string {
  return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
}

export function localIsoDate(d?: Date): string {
  if (window.PCC && window.PCC.dates) return window.PCC.dates.localIsoDate(d);
  return deviceIsoDate(d || new Date());
}

export function localTodayIso(): string {
  return localIsoDate(new Date());
}

/** A date for display. "YYYY-MM-DD" values are shown as that calendar date (never
 * zone-shifted); timestamps in the chosen time zone; empty/invalid → "". */
export function formatDate(value: string | Date | null | undefined): string {
  if (window.PCC && window.PCC.dates) return window.PCC.dates.formatDate(value);
  if (value === null || value === undefined || value === "") return "";
  var dt = value instanceof Date ? value : new Date(value);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString();
}

/** A timestamp (date + time) for display, in the chosen time zone; empty/invalid → "". */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (window.PCC && window.PCC.dates) return window.PCC.dates.formatDateTime(value);
  if (value === null || value === undefined || value === "") return "";
  var dt = value instanceof Date ? value : new Date(value);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleString();
}

/** A spreadsheet Date cell → the calendar date it means (same rule as
 * scheduleImportService.js's dateCellToIso). Deliberately DEVICE-local, never the chosen
 * zone: SheetJS builds these at the device's local midnight (10s early in Asia/Kolkata),
 * so rounding to the nearest device-local day recovers the date typed into the sheet. */
export function dateCellToIso(d: Date): string {
  return deviceIsoDate(new Date(d.getTime() + 12 * 60 * 60 * 1000));
}
