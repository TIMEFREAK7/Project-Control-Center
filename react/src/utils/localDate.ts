// Local calendar dates as YYYY-MM-DD, for every React service/page. The old per-service
// `new Date().toISOString().slice(0, 10)` is the UTC date, which in IST (UTC+5:30) still
// reads "yesterday" until 05:30 local time: overdue flags, default dates, report and backup
// stamps were all a day behind in that window (2026-09-24 audit). Stored dates stay plain
// YYYY-MM-DD strings, and the services' own addDaysIso()-style arithmetic stays UTC-based
// on those strings, which is timezone-neutral and correct. Only "what day is it NOW" was wrong.

export function localIsoDate(d?: Date): string {
  var dt = d || new Date();
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}

export function localTodayIso(): string {
  return localIsoDate(new Date());
}

/** A spreadsheet Date cell → the calendar date it means (same rule as
 * scheduleImportService.js's dateCellToIso: SheetJS builds local midnight, 10s early in
 * Asia/Kolkata, so round to the nearest local day). */
export function dateCellToIso(d: Date): string {
  return localIsoDate(new Date(d.getTime() + 12 * 60 * 60 * 1000));
}
