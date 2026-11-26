/** "1 activity" / "3 activities": a real plural instead of "activity(ies)" (Gate 6.4).
 * `many` defaults to `one` + "s". */
export function plural(n: number, one: string, many?: string): string {
  return n + " " + (n === 1 ? one : many || one + "s");
}
