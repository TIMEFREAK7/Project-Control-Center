/* Schedule CPM (Critical Path Method) engine \u2014 calculation only. No DOM, no store
 * writes. Callers pass activities + relationships for a single schedule and get back
 * calculated dates/float per activity; writing those results onto the store is the
 * caller's job (schedule.js), same separation as scheduleImportService.js.
 *
 * SCOPE, DELIBERATELY:
 * - Calendar-naive. Durations are calendar days, not working days \u2014 there is no
 *   calendar entity yet (Gate 1 left calendar_id as a placeholder for a later gate),
 *   so this does plain date arithmetic rather than pretending to respect weekends/
 *   holidays it has no data for.
 * - Summary/WBS-summary activities are treated as ordinary network nodes if they
 *   participate in relationships, not rolled up from their children's dates. Roll-up
 *   is a distinct feature or store its own duration/relationships they get calculated
 *   like any other activity; if they don't, they're just left uncalculated like any
 *   isolated node with no duration.
 * - Free Float uses a generalized single definition across all four relationship
 *   types (see freeFloatConstraint below) rather than the type-specific conventions
 *   different commercial tools disagree on. Total Float and critical-path
 *   identification are the parts of CPM that must be unambiguous; free float already
 *   varies by implementation industry-wide, so a documented, consistent choice here
 *   is preferable to silently picking one.
 *
 * STATUS-DATE REFORECASTING (added after Gate 3 shipped pure-duration CPM):
 * - Three activity states, by presence of actual dates, not by percent_complete:
 *     completed:    actual_finish is set. Anchor = [actual_start||actual_finish, actual_finish],
 *                   fixed, ignores predecessor constraints for its own ES.
 *     in_progress:  actual_start is set, actual_finish is not. Anchor ES = max(dataDate,
 *                   actual_start); EF = anchor ES + remaining_duration. Ignores predecessor
 *                   constraints for its own ES (work already began).
 *     not_started:  neither set. Unchanged pure-CPM behavior \u2014 ES from predecessors/dataDate,
 *                   EF = ES + duration.
 * - remaining_duration is NEVER derived from percent_complete. If an in-progress activity has
 *   no remaining_duration, remaining is treated as 0 (not invented) and the activity is flagged
 *   insufficient_data so the resulting forecast is visibly unreliable rather than silently wrong.
 * - Both forward EF and backward LS use the SAME effective duration for a given activity
 *   (remaining for in-progress, actual elapsed for completed, planned duration for not-started)
 *   so total_float = LS-ES = LF-EF holds by construction even when ES is a fixed historical date
 *   rather than a network-derived one \u2014 this is also how a completed activity that actually
 *   finished late can legitimately show negative float: a real slippage signal, not a bug.
 * - options.ignoreActuals=true restores the original pure-duration CPM exactly (predecessor/
 *   duration-only, actual dates never consulted) for any future caller that explicitly wants a
 *   baseline-style calculation rather than a status-date reforecast.
 * - Data-consistency problems (100% complete with no actual_finish; actual_finish set with no
 *   actual_start; actual_finish before actual_start; in-progress with no remaining_duration) are
 *   flagged, never silently resolved by guessing a number.
 *
 * OUT-OF-SEQUENCE PROGRESS & CALCULATION MODE (Gate 21, PCC Evolution Roadmap Tier F):
 * - An activity is "out of sequence" (OOS) when it has an actual anchor (completed or
 *   in_progress) but its predecessors' own calculated dates — by the time this activity
 *   is reached in topological order — would only have permitted a LATER start than when
 *   it actually started. Detected purely from predecessor-derived constraints (never
 *   floored at dataDay, unlike the normal not-started ES floor — an activity starting
 *   before dataDate is normal and not a sequencing problem on its own).
 * - options.calculationMode controls how an OOS activity's forecast is treated:
 *     "progress_override" (default — the only behavior that existed before this gate):
 *       actual dates always win; predecessor logic is ignored for this activity's own ES,
 *       exactly as before.
 *     "retained_logic": for an in_progress OOS activity only, its ES (and therefore EF/
 *       downstream propagation) is pushed out to the predecessor-derived constraint —
 *       the schedule still respects the logic tie going forward even though the actual
 *       start already happened early. A completed OOS activity's own dates are NEVER
 *       moved in either mode — finished work is history, not subject to a "mode."
 * - is_out_of_sequence is reported for both modes regardless — it's a data-quality signal
 *   about what happened, independent of which mode is used to forecast what's next.
 *
 * CALENDAR-AWARE CALCULATION (PCC Architecture Upgrade Phase 7, Advanced Scheduling):
 * - OFF BY DEFAULT (options.calendarAware, backed by schedule.calendar_aware). With it
 *   off — the historical default, and every pre-existing schedule's stored value — this
 *   engine is byte-for-byte identical to the calendar-naive math described above. This is
 *   deliberate: Phase 1 already wired a default 5-day calendar onto essentially every
 *   existing activity (see store.js's v60->v61 migration), so making calendar-awareness
 *   the unconditional default the moment this shipped would have silently recalculated
 *   every existing schedule's dates/float — a correctness-critical value driving
 *   baselines, delay impact, EVM schedule performance, and Executive Center health scores
 *   across the whole app. An explicit per-schedule opt-in (same pattern as Gate 21's own
 *   calculation_mode) is the only safe way to ship this.
 * - When on, `options.calendars` (the project's Calendar records) is consulted via each
 *   activity's own `calendar_id`. An activity whose calendar_id doesn't resolve to a real
 *   calendar falls back to treating every day as a working day for that one activity
 *   (flagged with a warning) rather than either fabricating a calendar or throwing.
 * - Duration is consumed in WORKING days, not calendar days: a not-started activity's ES
 *   is normalized forward to the next working day (an activity can't start ON a
 *   non-working day), then its own duration's worth of working days are walked forward,
 *   skipping non-working days/holidays, to reach EF. A COMPLETED or IN-PROGRESS
 *   activity's real actual_start/actual_finish dates are NEVER renormalized — an
 *   observed historical fact isn't subject to a calendar model, same principle that
 *   already lets a late-finishing completed activity show real negative float.
 * - Relationship lag is likewise applied in working days, not calendar days, using the
 *   SAME calendar the constraint's own target activity uses: an earliest-start
 *   constraint (this activity's ES) uses ITS OWN calendar; a latest-finish constraint
 *   (a predecessor's LF, in the backward pass) uses the PREDECESSOR's own calendar. This
 *   is a documented, consistent choice — same spirit as the Free Float generalization
 *   above — for the same reason: different commercial tools disagree on whose calendar
 *   governs a cross-relationship lag, so a single stated convention beats silently
 *   picking one per-relationship.
 * - Total/Free Float are reported in WORKING days (of the activity's own calendar for
 *   Total Float; the SUCCESSOR's calendar for Free Float, matching "how much this
 *   activity can slip before delaying its successor's own timeline") when calendar-aware,
 *   vs. raw calendar-day differences when not — keeping float in the same time unit
 *   duration is already expressed in, in both modes.
 * - A calendar with zero working days (a real data-entry mistake — everyone should be
 *   off every day of the week) would otherwise loop forever searching for the next
 *   working day; detected and flagged as a warning, with that activity falling back to
 *   the same "every day is a working day" treatment as a missing calendar, never a hang.
 *
 * DATE CONSTRAINTS (PCC Architecture Upgrade Phase 7, Advanced Scheduling, follow-on to
 * calendar-awareness above):
 * - OFF BY DEFAULT (options.honorConstraints, backed by schedule.constraints_enabled),
 *   for the exact same reason calendar-awareness defaults off: every MSP/P6 import since
 *   Phase 2/3 has been populating activity.constraint_type/constraint_date, silently
 *   unused until now — turning this on unconditionally the moment it shipped would have
 *   silently recalculated every already-imported schedule's dates.
 * - Only applies to a NOT-STARTED activity's own ES — a completed or in-progress
 *   activity's real actual dates are never overridden by an imported constraint, same
 *   "observed fact beats any model" principle calendar-awareness above already follows.
 * - Six of the eight standard constraint types are enforced: MSO (Must Start On), SNET
 *   (Start No Earlier Than), SNLT (Start No Later Than), MFO (Must Finish On), FNET
 *   (Finish No Earlier Than), FNLT (Finish No Later Than). ASAP is simply "no constraint"
 *   (the pre-existing default behavior). ALAP (As Late As Possible) is READ and carried
 *   through import/export like every other constraint type, but deliberately NOT enforced
 *   by this engine — genuinely scheduling ALAP correctly requires seeding the forward
 *   pass from the backward pass's own late dates (a second network pass), a real
 *   engineering undertaking of its own rather than a natural extension of the other six,
 *   which are all simple floors/ceilings on a single pass. An ALAP activity is calculated
 *   with ordinary ASAP logic instead, and a warning says so — not a silent gap.
 * - Predecessor logic always wins over a constraint in a genuine conflict (e.g. a Must
 *   Start On date earlier than what predecessor relationships allow) — the same
 *   "the network's logic can never be violated" invariant this engine already applies
 *   everywhere else (cyclic activities excluded rather than given meaningless numbers,
 *   Kahn's algorithm itself). The conflict is flagged as a warning, not silently resolved
 *   by picking the constraint over logic or vice versa without saying so.
 * - Finish-oriented constraints (MFO/FNET/FNLT) are translated into an equivalent
 *   start-side bound using the activity's own effective duration — calendar-aware
 *   (retreatWorkingDays) when calendar-awareness is also on for this schedule, plain
 *   calendar-day subtraction otherwise. The two Phase 7 features compose but are
 *   independently switchable — a schedule can honor constraints without being
 *   calendar-aware, or vice versa.
 * - When calendar-aware, a finish-oriented constraint_date that doesn't itself land
 *   exactly on "the day after a working day" (e.g. a Must Finish On date that's a
 *   Saturday, or immediately after a non-working gap) can't be reproduced as an exact
 *   early_finish — there's no ES that makes a real working-day span end there. In that
 *   case retreatWorkingDays() finds the nearest working-day-ending span AT OR BEFORE the
 *   requested date, which is the same "finish as close to the request as real work
 *   allows" behavior a calendar-aware tool has to fall back to anyway — not a bug,
 *   deliberately not force-fitted, and not separately warned about (it's the expected
 *   shape of a finish constraint interacting with a calendar, not a data problem).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var DAY_MS = 24 * 60 * 60 * 1000;

  function toDayNumber(isoDateStr) {
    var d = new Date(isoDateStr + "T00:00:00Z");
    return Math.round(d.getTime() / DAY_MS);
  }
  function toIsoDate(dayNumber) {
    return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
  }

  // A safety bound on the working-day search loops below, not a real project length —
  // exists solely so a zero-working-day calendar (a data-entry mistake) can never hang
  // the browser; MAX_CALENDAR_SEARCH_DAYS days is far beyond any realistic schedule span.
  var MAX_CALENDAR_SEARCH_DAYS = 20000;

  /** true when `dayNumber` is a working day per `calendar` (working_days[] is Mon-first,
   * per store.js's newCalendar() — index 0 = Monday). `calendar` may be null/undefined
   * (missing/unresolved calendar) or a calendar with a malformed/all-false working_days
   * array — both treated as "every day is a working day," never a thrown error, since
   * the caller (calendarForActivity()) is what decides whether to warn about either case. */
  function isWorkingDay(calendar, dayNumber) {
    if (!calendar) return true;
    var jsDay = new Date(dayNumber * DAY_MS).getUTCDay(); // 0=Sun..6=Sat
    var mondayFirstIndex = (jsDay + 6) % 7; // 0=Mon..6=Sun
    var workingDays = calendar.working_days;
    var isWorking = Array.isArray(workingDays) ? workingDays[mondayFirstIndex] !== false : true;
    if (!isWorking) return false;
    var iso = toIsoDate(dayNumber);
    return !(Array.isArray(calendar.holidays) && calendar.holidays.indexOf(iso) !== -1);
  }

  /** true when `calendar` has at least one working day within a full week — a calendar
   * that never has one would make every search loop below run forever. */
  function calendarHasAnyWorkingDay(calendar) {
    if (!calendar) return true;
    for (var offset = 0; offset < 7; offset++) {
      if (isWorkingDay(calendar, offset)) return true; // holidays can't hide EVERY day of a full week
    }
    return false;
  }

  /** The next working day on or after `dayNumber` (returns `dayNumber` itself if already
   * one). Assumes the zero-working-day case was already ruled out by the caller. */
  function nextWorkingDayOnOrAfter(calendar, dayNumber) {
    var d = dayNumber;
    var guard = 0;
    while (!isWorkingDay(calendar, d)) {
      d++;
      if (++guard > MAX_CALENDAR_SEARCH_DAYS) return dayNumber; // shouldn't happen; never hang
    }
    return d;
  }

  /** The previous working day on or before `dayNumber` (mirror of the above, for the
   * backward pass). */
  function previousWorkingDayOnOrBefore(calendar, dayNumber) {
    var d = dayNumber;
    var guard = 0;
    while (!isWorkingDay(calendar, d)) {
      d--;
      if (++guard > MAX_CALENDAR_SEARCH_DAYS) return dayNumber;
    }
    return d;
  }

  /** Moves `dayNumber` by `n` WORKING days (n may be negative for lag applied
   * backward) — a pure lag/lead offset, not a duration consumption: the starting day
   * itself is not required to be a working day and is never normalized. n=0 is a no-op. */
  function offsetWorkingDays(calendar, dayNumber, n) {
    var d = dayNumber;
    var guard = 0;
    if (n > 0) {
      var remainingFwd = n;
      while (remainingFwd > 0) {
        d++;
        if (isWorkingDay(calendar, d)) remainingFwd--;
        if (++guard > MAX_CALENDAR_SEARCH_DAYS) return dayNumber + n; // shouldn't happen; never hang
      }
    } else if (n < 0) {
      var remainingBack = -n;
      while (remainingBack > 0) {
        d--;
        if (isWorkingDay(calendar, d)) remainingBack--;
        if (++guard > MAX_CALENDAR_SEARCH_DAYS) return dayNumber + n;
      }
    }
    return d;
  }

  /** Forward duration consumption: normalizes `startDay` to the next working day, then
   * walks `count` working days forward from there, returning the EXCLUSIVE end boundary
   * (the day right after the last working day consumed) — same [start, end) convention
   * the calendar-naive `ES + duration` arithmetic already uses, so EF/LF stay directly
   * comparable whichever mode produced them. count<=0 (a milestone) returns the
   * normalized start unchanged — zero duration consumes no working days. */
  function advanceWorkingDays(calendar, startDay, count) {
    var d = nextWorkingDayOnOrAfter(calendar, startDay);
    if (count <= 0) return d;
    var remaining = count - 1; // d itself is the 1st working day consumed
    var guard = 0;
    while (remaining > 0) {
      d++;
      if (isWorkingDay(calendar, d)) remaining--;
      if (++guard > MAX_CALENDAR_SEARCH_DAYS) return d + remaining; // shouldn't happen; never hang
    }
    return d + 1;
  }

  /** Backward mirror of advanceWorkingDays(): given the EXCLUSIVE end boundary
   * `endExclusive`, walks `count` working days backward to find the INCLUSIVE start of
   * that span — the exact inverse of advanceWorkingDays() for the same calendar/count. */
  function retreatWorkingDays(calendar, endExclusive, count) {
    var d = previousWorkingDayOnOrBefore(calendar, endExclusive - 1);
    if (count <= 0) return d + 1;
    var remaining = count - 1;
    var guard = 0;
    while (remaining > 0) {
      d--;
      if (isWorkingDay(calendar, d)) remaining--;
      if (++guard > MAX_CALENDAR_SEARCH_DAYS) return d - remaining;
    }
    return d;
  }

  /** Counts working days in the half-open range [fromDay, toDay) — used to report
   * Total/Free Float in working days (the same unit duration is expressed in) rather
   * than raw calendar days once calendar-awareness is on. Handles toDay < fromDay
   * (a negative float span) by negating the reversed count. Bounded by the same search
   * guard as the walk functions above, for the same "never hang on bad data" reason;
   * real schedules are nowhere near that span. */
  function workingDaysBetween(calendar, fromDay, toDay) {
    if (toDay < fromDay) return -workingDaysBetween(calendar, toDay, fromDay);
    var count = 0;
    var span = Math.min(toDay - fromDay, MAX_CALENDAR_SEARCH_DAYS);
    for (var d = fromDay; d < fromDay + span; d++) {
      if (isWorkingDay(calendar, d)) count++;
    }
    return count;
  }

  /** Given a predecessor's [ES,EF] (as day numbers), a relationship type + lag, and
   * the successor's own duration, returns the minimum day number the successor's ES
   * may start at because of this one relationship. Forward-pass building block.
   * `calendar`/`calendarAware` are the SUCCESSOR's — see the file header's
   * CALENDAR-AWARE CALCULATION section for why. */
  function earliestStartConstraint(predES, predEF, type, lag, succDuration, calendar, calendarAware) {
    if (!calendarAware) {
      switch (type) {
        case "SS":
          return predES + lag;
        case "FF":
          return predEF + lag - succDuration;
        case "SF":
          return predES + lag - succDuration;
        case "FS":
        default:
          return predEF + lag;
      }
    }
    switch (type) {
      case "SS":
        return offsetWorkingDays(calendar, predES, lag);
      case "FF":
        return retreatWorkingDays(calendar, offsetWorkingDays(calendar, predEF, lag), succDuration);
      case "SF":
        return retreatWorkingDays(calendar, offsetWorkingDays(calendar, predES, lag), succDuration);
      case "FS":
      default:
        return offsetWorkingDays(calendar, predEF, lag);
    }
  }

  /** Mirror of earliestStartConstraint for the backward pass: given a successor's
   * [LS,LF], returns the maximum day number the predecessor's LF may end at.
   * `calendar`/`calendarAware` are the PREDECESSOR's. */
  function latestFinishConstraint(succLS, succLF, type, lag, predDuration, calendar, calendarAware) {
    if (!calendarAware) {
      switch (type) {
        case "SS":
          return succLS - lag + predDuration;
        case "FF":
          return succLF - lag;
        case "SF":
          return succLF - lag + predDuration;
        case "FS":
        default:
          return succLS - lag;
      }
    }
    switch (type) {
      case "SS":
        return advanceWorkingDays(calendar, offsetWorkingDays(calendar, succLS, -lag), predDuration);
      case "FF":
        return offsetWorkingDays(calendar, succLF, -lag);
      case "SF":
        return advanceWorkingDays(calendar, offsetWorkingDays(calendar, succLF, -lag), predDuration);
      case "FS":
      default:
        return offsetWorkingDays(calendar, succLS, -lag);
    }
  }

  /** Classifies one activity's status-date treatment and computes its fixed anchor
   * (if any) plus the effective duration used for both EF (forward) and LS (backward).
   * Returns null anchorES when the activity should be calculated the normal
   * predecessor-driven way (not_started, or ignoreActuals mode). */
  function classifyActivity(a, dataDay, warnings, ignoreActuals) {
    var planned = a.duration == null ? 0 : a.duration;

    if (ignoreActuals) {
      return { fixedES: null, effDuration: planned, status: "not_started" };
    }

    var hasActualFinish = !!a.actual_finish;
    var hasActualStart = !!a.actual_start;

    if (hasActualFinish) {
      if (!hasActualStart) {
        warnings.push({ activityId: a.id, message: "Actual Finish is set without an Actual Start \u2014 flagged as inconsistent data." });
      }
      var startDay = hasActualStart ? toDayNumber(a.actual_start) : toDayNumber(a.actual_finish);
      var finishDay = toDayNumber(a.actual_finish);
      if (finishDay < startDay) {
        warnings.push({ activityId: a.id, message: "Actual Finish is earlier than Actual Start \u2014 flagged as inconsistent data; treated as 0 days elapsed." });
        finishDay = startDay;
      }
      return { fixedES: startDay, effDuration: finishDay - startDay, status: "completed" };
    }

    if (hasActualStart) {
      if ((a.percent_complete || 0) >= 100) {
        warnings.push({ activityId: a.id, message: "Marked 100% complete but has no Actual Finish \u2014 flagged as inconsistent data; still treated as in-progress." });
      }
      var anchorES = Math.max(dataDay, toDayNumber(a.actual_start));
      var remaining = a.remaining_duration;
      var insufficientData = false;
      if (remaining == null) {
        // Deliberately NOT derived from percent_complete \u2014 that fallback was rejected
        // as an implicit assumption PCC shouldn't make. Remaining is 0 (not invented),
        // and this activity's forecast is flagged so it reads as unreliable, not exact.
        warnings.push({ activityId: a.id, message: "In progress with no Remaining Duration \u2014 insufficient data to forecast; treated as 0 days remaining." });
        remaining = 0;
        insufficientData = true;
      }
      return { fixedES: anchorES, effDuration: remaining, status: "in_progress", insufficientData: insufficientData };
    }

    return { fixedES: null, effDuration: planned, status: "not_started" };
  }

  /** Calculates ES/EF/LS/LF/float for every activity in one schedule.
   *
   * @param activities  array of { id, duration, activity_type, actual_start, actual_finish,
   *                                remaining_duration, percent_complete, planned_finish }
   * @param relationships  array of { predecessor_id, successor_id, type, lag }
   * @param options.dataDate  ISO date string, the project's day-zero / status date (defaults to today)
   * @param options.nearCriticalThresholdDays  float <= this (but > 0) is "near critical" (default 5)
   * @param options.ignoreActuals  true = pure planned-duration CPM, actual dates never consulted
   * @param options.calculationMode  "progress_override" (default) or "retained_logic" — see the
   *   file header's OUT-OF-SEQUENCE section for what each does
   * @param options.calendarAware  see the file header's CALENDAR-AWARE CALCULATION section
   * @param options.calendars  Calendar records ({id, working_days, holidays}) — only consulted
   *   when calendarAware is true
   * @param options.honorConstraints  see the file header's DATE CONSTRAINTS section
   * @returns {
   *   results: { [activityId]: { early_start, early_finish, late_start, late_finish,
   *                               total_float, free_float, is_critical, is_near_critical,
   *                               status, insufficient_data, is_out_of_sequence } },
   *   projectFinish, plannedProjectFinish, forecastVarianceDays,  (ISO date strings / integer or null)
   *   criticalActivityIds: [...],
   *   cyclicActivityIds: [...],   // excluded from calculation entirely, results[id] is null
   *   warnings: [{ activityId, message }]
   * }
   */

  /** Applies activity `a`'s own constraint_type/constraint_date (if any) on top of
   * `naturalEs` — the ES this activity would get from predecessor logic/dataDate alone.
   * `predFloor` is the predecessor-derived constraint alone (null if none), which a hard
   * constraint may never push earlier than — see the file header's DATE CONSTRAINTS
   * section for the full reasoning. Only ever called for a NOT-STARTED activity. */
  function applyDateConstraint(a, naturalEs, predFloor, effDuration, calendar, calendarAware, warnings) {
    var type = a.constraint_type;
    if (!type || type === "ASAP") return naturalEs;

    if (type === "ALAP") {
      warnings.push({
        activityId: a.id,
        message: "This activity has an 'As Late As Possible' constraint, which this engine does not yet enforce — calculated with ordinary ASAP logic instead.",
      });
      return naturalEs;
    }

    if (!a.constraint_date) {
      warnings.push({ activityId: a.id, message: "This activity has a \"" + type + "\" constraint with no constraint date set — ignored." });
      return naturalEs;
    }
    var constraintDay = toDayNumber(a.constraint_date);

    function clampToFloor(candidate, label) {
      if (predFloor != null && candidate < predFloor) {
        warnings.push({
          activityId: a.id,
          message: label + " constraint could not be fully honored — predecessor logic requires a later date. Predecessor logic wins.",
        });
        return predFloor;
      }
      return candidate;
    }

    var esFromFinishConstraint = calendarAware ? retreatWorkingDays(calendar, constraintDay, effDuration) : constraintDay - effDuration;

    switch (type) {
      case "MSO":
        return clampToFloor(constraintDay, "Must Start On");
      case "SNET":
        return Math.max(naturalEs, constraintDay);
      case "SNLT":
        return clampToFloor(Math.min(naturalEs, constraintDay), "Start No Later Than");
      case "MFO":
        return clampToFloor(esFromFinishConstraint, "Must Finish On");
      case "FNET":
        return Math.max(naturalEs, esFromFinishConstraint);
      case "FNLT":
        if (naturalEs > esFromFinishConstraint) {
          warnings.push({
            activityId: a.id,
            message: "Finish No Later Than constraint could not be honored — predecessor logic and/or duration require a later finish. Predecessor logic wins.",
          });
        }
        return naturalEs;
      default:
        warnings.push({ activityId: a.id, message: "Unrecognized constraint type \"" + type + "\" — ignored." });
        return naturalEs;
    }
  }

  function calculateSchedule(activities, relationships, options) {
    options = options || {};
    var dataDate = options.dataDate || new Date().toISOString().slice(0, 10);
    var dataDay = toDayNumber(dataDate);
    var nearCriticalThreshold = options.nearCriticalThresholdDays != null ? options.nearCriticalThresholdDays : 5;
    var ignoreActuals = !!options.ignoreActuals;
    var retainedLogic = options.calculationMode === "retained_logic";
    var calendarAwareRequested = !!options.calendarAware;
    var honorConstraints = !!options.honorConstraints;

    var warnings = [];
    var byId = {};
    var duration = {}; // effective duration used for THIS activity's own EF (fwd) and LS (bwd)
    var fixedES = {}; // non-null day number for completed/in_progress activities
    var statusById = {};
    var insufficientById = {};

    // Calendar-aware calculation (see file header) \u2014 resolved once per activity here,
    // never re-looked-up (and re-warned about) inside the forward/backward passes below.
    var calendarsById = {};
    (options.calendars || []).forEach(function (c) { calendarsById[c.id] = c; });
    var activityCalendars = {};
    function calendarForActivity(id) {
      return calendarAwareRequested ? activityCalendars[id] : null;
    }

    activities.forEach(function (a) {
      byId[a.id] = a;
      var classified = classifyActivity(a, dataDay, warnings, ignoreActuals);
      duration[a.id] = classified.effDuration;
      fixedES[a.id] = classified.fixedES;
      statusById[a.id] = classified.status;
      insufficientById[a.id] = !!classified.insufficientData;
      if (classified.status === "not_started" && !ignoreActuals && a.duration == null) {
        warnings.push({ activityId: a.id, message: "No duration set \u2014 treated as 0 days for calculation." });
      }
      if (calendarAwareRequested) {
        var cal = a.calendar_id ? calendarsById[a.calendar_id] : null;
        if (!cal) {
          warnings.push({ activityId: a.id, message: "Calendar-aware calculation is on, but this activity has no resolvable calendar \u2014 treated as working every day." });
          cal = null;
        } else if (!calendarHasAnyWorkingDay(cal)) {
          warnings.push({ activityId: a.id, message: "This activity's calendar has no working days at all (a data error) \u2014 treated as working every day instead." });
          cal = null;
        }
        activityCalendars[a.id] = cal;
      }
    });

    // Only keep relationships between activities that actually exist in this batch.
    var rels = relationships.filter(function (r) {
      return byId[r.predecessor_id] && byId[r.successor_id];
    });

    var successors = {}; // id -> [{ toId, type, lag }]
    var predecessors = {}; // id -> [{ fromId, type, lag }]
    activities.forEach(function (a) {
      successors[a.id] = [];
      predecessors[a.id] = [];
    });
    rels.forEach(function (r) {
      successors[r.predecessor_id].push({ toId: r.successor_id, type: r.type, lag: r.lag || 0 });
      predecessors[r.successor_id].push({ fromId: r.predecessor_id, type: r.type, lag: r.lag || 0 });
    });

    // Kahn's algorithm for topological order + cycle detection. Any activity left
    // out of `order` once the queue drains is part of a cycle \u2014 excluded from
    // calculation entirely rather than producing numbers that would be meaningless.
    var inDegree = {};
    activities.forEach(function (a) {
      inDegree[a.id] = predecessors[a.id].length;
    });
    var queue = activities.filter(function (a) { return inDegree[a.id] === 0; }).map(function (a) { return a.id; });
    var order = [];
    var inDegreeWorking = Object.assign({}, inDegree);
    while (queue.length) {
      var id = queue.shift();
      order.push(id);
      successors[id].forEach(function (edge) {
        inDegreeWorking[edge.toId]--;
        if (inDegreeWorking[edge.toId] === 0) queue.push(edge.toId);
      });
    }
    var orderedSet = {};
    order.forEach(function (id) { orderedSet[id] = true; });
    var cyclicActivityIds = activities.filter(function (a) { return !orderedSet[a.id]; }).map(function (a) { return a.id; });
    cyclicActivityIds.forEach(function (id) {
      warnings.push({ activityId: id, message: "Part of a circular dependency \u2014 excluded from calculation." });
    });

    // Relationships touching any cyclic activity are dropped from both passes so a
    // cycle elsewhere in the schedule can't corrupt the acyclic part of the network.
    var cyclicSet = {};
    cyclicActivityIds.forEach(function (id) { cyclicSet[id] = true; });
    var safeRels = rels.filter(function (r) { return !cyclicSet[r.predecessor_id] && !cyclicSet[r.successor_id]; });
    var safeSuccessors = {};
    var safePredecessors = {};
    order.forEach(function (id) { safeSuccessors[id] = []; safePredecessors[id] = []; });
    safeRels.forEach(function (r) {
      safeSuccessors[r.predecessor_id].push({ toId: r.successor_id, type: r.type, lag: r.lag || 0 });
      safePredecessors[r.successor_id].push({ fromId: r.predecessor_id, type: r.type, lag: r.lag || 0 });
    });

    // ---- Forward pass, backward pass, and float, as one reinvokable unit ----
    // Extracted (Phase 7, ALAP enforcement) so it can run twice: once as a plain ASAP-
    // style preview (needed only to learn where an ALAP activity's own late dates would
    // land), then a final pass with each ALAP activity anchored there. See the file
    // header's ALAP section — alapFixedES is empty and pushWarnings is true for the
    // overwhelming common case (no ALAP activities in play), making this byte-for-byte
    // the same single pass this engine has always run.
    //
    // Completed/in-progress activities use their fixed anchor and ignore predecessor
    // constraints for their OWN start — the work already began regardless of what
    // logic says, but they still constrain their successors normally via EF below.
    // Exception: an in_progress activity that's out-of-sequence (see below) in
    // "retained_logic" mode has its ES pushed to the predecessor-derived constraint
    // instead — the actual start already happened, but the forecast keeps respecting
    // the logic tie for what's left.
    function runForwardBackwardFloat(alapFixedES, pushWarnings) {
      var ES = {};
      var EF = {};
      var outOfSequenceById = {};
      order.forEach(function (id) {
        var calendar = calendarForActivity(id);
        var preds = safePredecessors[id];
        var predConstraint = null; // predecessor-derived only, never floored at dataDay
        preds.forEach(function (edge) {
          var c = earliestStartConstraint(ES[edge.fromId], EF[edge.fromId], edge.type, edge.lag, duration[id], calendar, calendarAwareRequested);
          if (predConstraint == null || c > predConstraint) predConstraint = c;
        });

        var isOOS = !ignoreActuals && fixedES[id] != null && predConstraint != null && predConstraint > fixedES[id];
        outOfSequenceById[id] = isOOS;
        if (isOOS && pushWarnings) {
          warnings.push({
            activityId: id,
            message:
              "Out-of-sequence: this activity's actual start is before its predecessor logic would have allowed (" +
              (statusById[id] === "completed" ? "already completed, dates unaffected" : retainedLogic ? "forecast pushed to respect predecessor logic" : "actual dates retained, predecessor logic overridden") +
              ").",
          });
        }

        var es;
        var normalizeES = calendarAwareRequested; // real actual anchors below turn this back off
        var alapAnchor = alapFixedES[id];
        if (alapAnchor != null) {
          // Already a valid, calendar-consistent day number (the preview pass's own LS
          // for this activity) — no renormalization needed, UNLESS honoring it would
          // violate predecessor logic (a real, if rare, edge case: some other activity's
          // actual dates elsewhere already left this activity with negative float in the
          // preview pass). Predecessor logic always wins, same principle every other
          // constraint type in this file already follows — flagged, not silently picked.
          es = alapAnchor;
          normalizeES = false;
          if (predConstraint != null && predConstraint > es) {
            if (pushWarnings) {
              warnings.push({ activityId: id, message: "As Late As Possible target could not be fully honored — predecessor logic requires a later date. Predecessor logic wins." });
            }
            es = predConstraint;
            normalizeES = calendarAwareRequested;
          }
        } else if (fixedES[id] != null) {
          if (isOOS && retainedLogic && statusById[id] === "in_progress") {
            es = predConstraint;
          } else {
            es = fixedES[id]; // real actual_start/actual_finish — never renormalized to a calendar
            normalizeES = false;
          }
        } else {
          es = dataDay;
          if (predConstraint != null && predConstraint > es) es = predConstraint;
          if (honorConstraints) es = applyDateConstraint(byId[id], es, predConstraint, duration[id], calendar, calendarAwareRequested, pushWarnings ? warnings : []);
        }
        if (normalizeES) es = nextWorkingDayOnOrAfter(calendar, es);
        ES[id] = es;

        // A COMPLETED activity's EF must exactly reconstruct its real actual_finish
        // (es + effDuration, effDuration itself being actual elapsed calendar days per
        // classifyActivity()) regardless of calendar-awareness — an observed historical
        // fact, not a forecast to walk through working days. Every other status is a
        // forecast and gets calendar-aware duration consumption when requested.
        var useCalendarForEF = calendarAwareRequested && statusById[id] !== "completed";
        EF[id] = useCalendarForEF ? advanceWorkingDays(calendar, es, duration[id]) : es + duration[id];
      });

      var projectFinishDay = order.length ? Math.max.apply(null, order.map(function (id) { return EF[id]; })) : null;

      // ---- Backward pass: LS/LF in reverse topological order ----
      // Runs uniformly for every activity, fixed-anchor or not — retrospective float on
      // a completed activity is meaningful (see file header: negative float = real
      // slippage) — and, for an ALAP activity, this is exactly what tells the FINAL pass
      // "how late can this legitimately start," via the PREVIEW pass's own LS.
      var LS = {};
      var LF = {};
      order
        .slice()
        .reverse()
        .forEach(function (id) {
          var calendar = calendarForActivity(id);
          var succs = safeSuccessors[id];
          var lf = projectFinishDay;
          succs.forEach(function (edge) {
            var c = latestFinishConstraint(LS[edge.toId], LF[edge.toId], edge.type, edge.lag, duration[id], calendar, calendarAwareRequested);
            if (c < lf) lf = c;
          });
          LF[id] = lf;
          LS[id] = calendarAwareRequested ? retreatWorkingDays(calendar, lf, duration[id]) : lf - duration[id];
        });

      // ---- Float ----
      var results = {};
      var criticalActivityIds = [];
      order.forEach(function (id) {
        var calendar = calendarForActivity(id);
        var totalFloat = calendarAwareRequested ? workingDaysBetween(calendar, ES[id], LS[id]) : LS[id] - ES[id];
        var succs = safeSuccessors[id];
        var freeFloat;
        if (succs.length === 0) {
          freeFloat = totalFloat;
        } else {
          freeFloat = Math.min.apply(
            null,
            succs.map(function (edge) {
              var succDuration = duration[edge.toId];
              var succCalendar = calendarForActivity(edge.toId);
              var requiredIfCritical = earliestStartConstraint(ES[id], EF[id], edge.type, edge.lag, succDuration, succCalendar, calendarAwareRequested);
              return calendarAwareRequested ? workingDaysBetween(succCalendar, requiredIfCritical, ES[edge.toId]) : ES[edge.toId] - requiredIfCritical;
            })
          );
        }
        var isCritical = totalFloat <= 0;
        var isNearCritical = !isCritical && totalFloat <= nearCriticalThreshold;
        if (isCritical) criticalActivityIds.push(id);

        results[id] = {
          early_start: toIsoDate(ES[id]),
          early_finish: toIsoDate(EF[id]),
          late_start: toIsoDate(LS[id]),
          late_finish: toIsoDate(LF[id]),
          total_float: totalFloat,
          free_float: freeFloat,
          is_critical: isCritical,
          is_near_critical: isNearCritical,
          status: statusById[id],
          insufficient_data: insufficientById[id],
          is_out_of_sequence: !!outOfSequenceById[id],
        };
      });

      return { ES: ES, EF: EF, LS: LS, LF: LF, results: results, criticalActivityIds: criticalActivityIds, projectFinishDay: projectFinishDay, outOfSequenceById: outOfSequenceById };
    }

    // ALAP needs to know each ALAP activity's own late-start date BEFORE it can anchor
    // anything there — a genuine chicken-and-egg CPM requires a preview pass to resolve.
    // Only not-started activities are eligible (never override a real actual date),
    // matching every other constraint type's own scope.
    var alapActivityIds = honorConstraints
      ? order.filter(function (id) {
          return fixedES[id] == null && byId[id].constraint_type === "ALAP";
        })
      : [];

    var finalPass;
    if (alapActivityIds.length === 0) {
      finalPass = runForwardBackwardFloat({}, true);
    } else {
      var preview = runForwardBackwardFloat({}, false);
      var alapFixedES = {};
      alapActivityIds.forEach(function (id) {
        alapFixedES[id] = preview.LS[id];
      });
      finalPass = runForwardBackwardFloat(alapFixedES, true);
    }

    var ES = finalPass.ES;
    var EF = finalPass.EF;
    var projectFinishDay = finalPass.projectFinishDay;
    var results = finalPass.results;
    var criticalActivityIds = finalPass.criticalActivityIds;
    var outOfSequenceById = finalPass.outOfSequenceById;

    cyclicActivityIds.forEach(function (id) {
      results[id] = null;
    });

    // Planned Project Finish vs Forecast Project Finish \u2014 Section 7's variance. Only
    // meaningful if at least one activity actually has a planned_finish recorded;
    // otherwise there's nothing to compare the forecast against, and reporting a
    // variance against a missing baseline would be inventing a number.
    var plannedFinishDays = activities
      .map(function (a) { return a.planned_finish ? toDayNumber(a.planned_finish) : null; })
      .filter(function (d) { return d != null; });
    var plannedProjectFinishDay = plannedFinishDays.length ? Math.max.apply(null, plannedFinishDays) : null;
    var forecastVarianceDays =
      plannedProjectFinishDay != null && projectFinishDay != null ? projectFinishDay - plannedProjectFinishDay : null;

    var outOfSequenceActivityIds = order.filter(function (id) { return outOfSequenceById[id]; });

    return {
      results: results,
      projectFinish: projectFinishDay != null ? toIsoDate(projectFinishDay) : null,
      plannedProjectFinish: plannedProjectFinishDay != null ? toIsoDate(plannedProjectFinishDay) : null,
      forecastVarianceDays: forecastVarianceDays,
      criticalActivityIds: criticalActivityIds,
      cyclicActivityIds: cyclicActivityIds,
      outOfSequenceActivityIds: outOfSequenceActivityIds,
      warnings: warnings,
    };
  }

  window.PCC.scheduleCpmEngine = { calculateSchedule: calculateSchedule };
})();

