/* Project Control Center — data store.
 * No backend, no server. Everything lives in one JS object (window.PCC.store.data),
 * autosaved to localStorage on every change, and exportable to a single
 * project-data.json file for moving between machines.
 */
(function () {
  "use strict";

  window.PCC = window.PCC || {};

  var LOCAL_STORAGE_KEY = "pcc_local_data_v1";
  var SCHEMA_VERSION = 32;

  var PROJECT_STATUSES = ["on_track", "at_risk", "critical", "complete"];

  function emptyData() {
    return {
      schema_version: SCHEMA_VERSION,
      meta: {
        app_name: "Aditya Abhyankar's Project Control Center",
        created_at: new Date().toISOString(),
        last_saved_at: null,
        last_exported_at: null,
      },
      settings: {
        theme: "dark",
        company_name: "",
        backup_reminder_days: 7,
        backup_nudge_dismissed_at: null,
        // Gate 9 (Project Executive Center): weights for the configurable health score,
        // one set applied to every project rather than per-project config — the spec
        // asks for the weighting logic to be configurable and visible, not for each
        // project to carry its own tuning. Must sum to 100; projectHealthEngine.js
        // normalizes defensively if a user edits them into an inconsistent state.
        health_score_weights: {
          schedule: 25,
          cost: 20,
          risk: 20,
          issue: 10,
          rfi: 15,
          change: 10,
        },
        // Gate 16 (Document Control 3: Nomenclature): a single portfolio-wide naming
        // pattern (not per-project) checked against an uploaded document's filename —
        // matches how health_score_weights above is one shared config, not per-project
        // tuning. Tokens (PROJECT/DISCIPLINE/DOCUMENTTYPE/NUMBER/REV) are substituted by
        // documentNomenclatureEngine.js; any other characters in the pattern (separators
        // like "-") pass through unchanged, so a user can adopt any separator/order they
        // want without a schema change. Warn-only, never enforced — see documents.js.
        document_nomenclature_pattern: "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV",
        document_nomenclature_enabled: true,
      },
      projects: [],
      documents: [],
      risks: [],
      daily_logs: [],
      meetings: [],
      rfis: [],
      change_orders: [],
      // Gate 1 (Schedule/WBS/Activity data model): storage only — no import parser and
      // no CPM calculation engine yet (those are Gates 2 and 3). Every activity/relationship
      // field this app will ever need for CPM already exists on the shape below so later
      // gates only have to populate/calculate fields, never migrate the schema again just
      // to add them.
      schedules: [],
      wbs_items: [],
      activities: [],
      relationships: [],
      // Gate 4: thin index only \u2014 see scheduleBaselineStore.js for the actual
      // frozen snapshot payload, which lives in IndexedDB, not here.
      schedule_baselines: [],
      // Gate 5b (Tier 2 Cost Tracking): budget line items and the actual-cost log
      // against them. Deliberately two separate arrays, not one shape distinguished by
      // a type field \u2014 unlike Risk/Issue/Opportunity or RFI/TQ, a budget line item and
      // an actual cost entry aren't the same shape (dates, vendor, invoice ref only
      // make sense on an actual). No EVM (PV/EV/CPI/SPI) here \u2014 that's a separate,
      // later gate per the locked Tier 2 order.
      cost_budget_items: [],
      cost_actuals: [],
      // Gate 9 (Project Executive Center): editable overrides for the template-based
      // Executive Summary, one record per project. See newExecutiveSummary() header.
      executive_summaries: [],
      // Gate 11 (Resource Management): resources is a shared, portfolio-wide pool
      // (not project-scoped) — see the header comment above newResource() for why.
      resources: [],
      resource_assignments: [],
      // Gate 13 (Vendor Management): Vendor Master is portfolio-wide, not scoped to a
      // single project the way Documents/Risk/RFI are — vendor_project_links is the
      // many-to-many join, same shape convention as every other join in this store
      // (a flat array of link records, not nested arrays on either side). The
      // vendor_meeting_links / vendor_rfi_links / vendor_risk_links joins deliberately
      // don't touch meetings.js/rfis.js/risks.js's own schemas at all — linking happens
      // entirely from the Vendor side, and "open the real record" reuses those modules'
      // existing public expand*() hooks (see vendors.js) instead of adding fields there.
      vendors: [],
      vendor_contacts: [],
      vendor_project_links: [],
      vendor_documents: [],
      vendor_meeting_links: [],
      vendor_rfi_links: [],
      vendor_risk_links: [],
      vendor_performance: [],
      vendor_notes: [],
      // Gate 14 (Document Control 1: Master Document Repository): a portfolio-wide,
      // user-configurable list of document TYPES (BOQ, ITP, Method Statement, ...) that
      // may be required on a project — the first admin-manageable taxonomy in this app;
      // every prior "types" list (DOCUMENT_CATEGORIES, VENDOR_DOCUMENT_CATEGORIES,
      // RESOURCE_TYPES) is a hardcoded JS array, not store-backed. Seeded with a starting
      // list on first install so the repository isn't empty on day one — see
      // seedDocumentTypes(). Deliberately NOT linked to documents.js's existing
      // `category` field or vendors.js's VENDOR_DOCUMENT_CATEGORIES yet; reconciling
      // those is real design work for a later gate (project-specific requirements,
      // classification), not this one.
      document_types: seedDocumentTypes(),
      // Gate 15 (Document Control 2: Project-Specific Document Requirements): a flat
      // join, same "existence of a row = selected" convention as vendor_project_links —
      // one row per (project, document_type) pairing the user has marked applicable to
      // that project. NOT every master-repository type applies to every project (per
      // spec); this array is how "applies here" is recorded without ever touching
      // document_types itself. See newProjectDocumentRequirement() below.
      project_document_requirements: [],
    };
  }

  function newProjectId() {
    return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newDocumentId() {
    return "d_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  var DOCUMENT_CATEGORIES = ["contract", "drawing", "photo", "invoice", "other"];

  // Gate 17 (Document Control 4: Status + Version Control). Both flows from the spec
  // collapse onto one flat list rather than two separate enums — "rejected" and
  // "resubmitted" are just as much a document's status as "approved" is, and a plain
  // select (not an enforced state machine) matches how every other status-like field in
  // this app already works (VENDOR_STATUSES, PROJECT_STATUSES, ACTIVITY_STATUSES) — warn/
  // inform, don't gate. "not_started"/"required" from the spec's own flow describe a
  // document that doesn't exist as a file yet, which is Gate 15's
  // project_document_requirements territory, not a field on an actual uploaded record.
  var DOCUMENT_STATUSES = ["draft", "submitted", "under_review", "approved", "rejected", "resubmitted", "superseded", "archived"];

  /** Fields default to "" / null rather than being omitted, so forms always have
   * something to bind to and exports/imports have a stable shape. `attachments`
   * holds document ids referencing entries in data.documents (Phase 3). */
  function newProject(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newProjectId(),
      name: "",
      // Gate 16 (Document Control 3: Nomenclature): a short code (e.g. "ABC") used as
      // the PROJECT token in the document naming pattern — optional; nomenclature
      // checking simply can't validate the PROJECT segment for a project that hasn't
      // set one (see documents.js), rather than fabricating one from `name`.
      project_code: "",
      client: "",
      company: "",
      country: "",
      location: "",
      sector: "",
      contract_type: "",
      // Gate 9: "Project Type" on the Executive Center's Overview — distinct from
      // contract_type (which describes the commercial arrangement, e.g. lump sum vs
      // cost-plus). E.g. "Commercial Building," "Highway," "Water Treatment Plant."
      project_type: "",
      // Gate 9: free-text label for the Executive Center's Overview (e.g. "Design,"
      // "Procurement," "Construction," "Commissioning"). Not an enum — phases vary too
      // much by industry/project type to force a fixed list.
      current_phase: "",
      // Gate 9: optional manual override for "Forecast Finish" on the Executive Center
      // when no schedule has been calculated yet (or the PM wants to record a forecast
      // independent of the CPM engine's own projectFinish). The Executive Center prefers
      // the active schedule's calculated finish when one exists; this is the fallback,
      // never silently blended with it — see projectHealthEngine.js/executiveCenter.js.
      forecast_finish_date: "",
      budget: null,
      contract_value: null,
      currency: "",
      start_date: "",
      finish_date: "",
      status: "on_track",
      progress: 0,
      project_manager: "",
      planner: "",
      engineers: "",
      contractor: "",
      consultant: "",
      owner: "",
      archived: false,
      attachments: [],
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  /** A document record holds metadata, whatever we could extract client-side, and
   * (by explicit choice, since storage isn't a concern) the original file itself as a
   * base64 data URI in `file_data` — so "Open File" always reproduces the exact
   * uploaded file, not a re-derived version. This lives in the same exported JSON as
   * everything else. The tradeoff: browser localStorage typically caps around 5-10MB
   * total, so large/many files can outrun autosave well before they'd trouble a pen
   * drive — see the size warning shown at upload time. `extraction` is null until an
   * extractor (Excel/Word/PDF) has processed it. */
  function newDocument(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newDocumentId(),
      project_id: "",
      filename: "",
      category: "other",
      file_size: 0,
      mime_type: "",
      uploaded_at: now,
      extraction: null,
      file_data: null,
      meeting_id: "",
      // Duplicate detection (schema v14). content_hash/hash_method are set at upload
      // time by duplicateService.fingerprintFile() — hash_method is 'sha256' or
      // 'name-size' depending on whether Web Crypto was available on that device; a
      // 'name-size' fingerprint is a weaker signal and callers should treat it that way.
      content_hash: null,
      hash_method: null,
      is_duplicate: false,
      duplicate_group_id: null,
      original_record_id: null,
      duplicate_reason: null,
      // Gate 10: optional link to one Schedule activity — see newRisk()'s comment.
      activity_id: "",
      // Gate 16 (Document Control 3: Classification). All optional, additive on top of
      // the existing `category` field above (untouched, still what upload-form/list
      // filtering use) — reconciling the two into one classification scheme is a later
      // gate's job, not this one. `document_type_id` links to Gate 14's master
      // repository; `criticality` defaults from that type's own default_criticality at
      // upload time (documents.js) but stays independently editable per document, same
      // "suggested, not enforced" relationship Gate 15's templates have with the master
      // repository. `package`/`contract_or_po` are free text — no Package/Contract/PO
      // entity exists anywhere in this app yet, and inventing one is out of scope for a
      // classification gate; free text is the honest choice until/unless a real Package
      // or Commercial module makes it worth modeling properly.
      document_type_id: "",
      discipline: "",
      document_number: "",
      revision: "00",
      package: "",
      contract_or_po: "",
      vendor_id: "",
      priority: "medium",
      criticality: "",
      remarks: "",
      // Gate 17 (Document Control 4: Status + Version Control). `status` is a plain
      // select, not an enforced workflow — see DOCUMENT_STATUSES's own comment.
      // `document_group_id`/`revision_number` are the exact same version-history
      // convention Vendor Management's vendor_documents already established (Gate 13):
      // every upload is its own row; a "new revision" upload creates a NEW row sharing
      // this document's document_group_id with revision_number incremented, never
      // overwriting the previous row. document_group_id defaults to this record's own
      // id below when not explicitly supplied (first upload in a group), same "default
      // to your own id" pattern newVendorDocument() uses.
      status: "draft",
      document_group_id: "",
      revision_number: 1,
    };
    var doc = Object.assign(base, overrides || {});
    if (!doc.document_group_id) doc.document_group_id = doc.id;
    return doc;
  }

  function newDailyLogId() {
    return "dl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newDailyLogPhotoId() {
    return "dlp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** A photo attached to a Daily Log entry. Stored as a base64 data URI in `file_data`,
   * same approach Documents already uses for uploaded files \u2014 no external folder
   * dependency, survives the JSON export/import round trip intact. */
  function newDailyLogPhoto(overrides) {
    var base = {
      id: newDailyLogPhotoId(),
      filename: "",
      file_data: null,
      file_size: 0,
      caption: "",
      added_at: new Date().toISOString(),
    };
    return Object.assign(base, overrides || {});
  }

  /** One entry per project per day. `incident_flag` is derived at save time from
   * whether `incidents` is non-empty, so the list view can badge it without re-parsing
   * text every render. */
  function newDailyLog(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newDailyLogId(),
      project_id: "",
      log_date: now.slice(0, 10),
      weather: "",
      manpower: "",
      equipment: "",
      visitors: "",
      deliveries: "",
      activities: "",
      safety_notes: "",
      incidents: "",
      notes: "",
      photos: [],
      // Gate 10: optional link to one Schedule activity — see newRisk()'s comment.
      // Deliberately a single pointer, same simplification every other register's
      // activity link makes, even though a day's log realistically touches several
      // activities: modeling a many-to-many here would be the only such relationship
      // in the app, and this still covers the common "log against the activity this
      // entry is mainly about" case.
      activity_id: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newRiskId() {
    return "r_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  var RISK_TYPES = ["risk", "issue", "opportunity"];
  var RISK_STATUSES = ["open", "mitigating", "closed"];
  var RISK_LEVELS = ["low", "medium", "high"]; // used for both probability and impact

  /** A unified Risk/Issue/Opportunity register entry — one shape, distinguished by
   * `type`, rather than three separate CRUD modules with near-identical fields. */
  function newRisk(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newRiskId(),
      project_id: "",
      type: "risk",
      title: "",
      description: "",
      probability: "medium",
      impact: "medium",
      status: "open",
      owner: "",
      mitigation: "",
      source_meeting_id: "",
      // Gate 10: optional link to one Schedule activity, same many-to-one shape as
      // cost_budget_items.activity_id (Gate 7) — several risks may point at the same
      // activity, one risk can't span several. Unlinked is fully valid.
      activity_id: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newMeetingId() {
    return "m_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newActionId() {
    return "a_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** An action item belongs to exactly one meeting. `status` of "open" past `due_date`
   * is what "overdue" means — computed at render time, not stored, so it's always
   * correct relative to today rather than going stale. */
  function newMeetingAction(overrides) {
    var base = {
      id: newActionId(),
      description: "",
      owner: "",
      due_date: "",
      status: "open",
    };
    return Object.assign(base, overrides || {});
  }

  function newRecordingId() {
    return "rec_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** Recordings are reference-only by design: an audio/video file can easily be tens or
   * hundreds of MB, which would blow past the browser's ~5-10MB total storage budget on
   * its own. Only metadata is tracked here — the actual file has to be placed in /files
   * manually, the same as any file the app doesn't embed. */
  function newMeetingRecording(overrides) {
    var base = {
      id: newRecordingId(),
      filename: "",
      duration: "",
      uploaded_by: "",
      uploaded_at: new Date().toISOString(),
    };
    return Object.assign(base, overrides || {});
  }

  function newMeeting(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newMeetingId(),
      project_id: "",
      title: "",
      meeting_date: now.slice(0, 10),
      attendees: "",
      agenda: "",
      minutes: "",
      actions: [],
      recordings: [],
      // Gate 10: optional link to one Schedule activity — see newRisk()'s comment for
      // the shape convention this follows.
      activity_id: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newRfiId() {
    return "rf_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newRfiRevisionId() {
    return "rv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  var RFI_TYPES = ["rfi", "technical_query"];
  var RFI_STATUSES = ["open", "answered", "closed"];
  var RFI_PRIORITIES = ["low", "medium", "high"];

  /** Auto-numbered per type (RFI-001, TQ-001, ...), computed from the highest existing
   * number of that type at creation time rather than a simple count, so a deleted entry
   * never causes a number to be reused. */
  function nextRfiNumber(existingRfis, type) {
    var prefix = type === "technical_query" ? "TQ" : "RFI";
    var highest = 0;
    (existingRfis || []).forEach(function (r) {
      if (r.type !== type || !r.number) return;
      var match = /-(\d+)$/.exec(r.number);
      if (match) highest = Math.max(highest, parseInt(match[1], 10));
    });
    var next = highest + 1;
    var padded = next < 100 ? ("00" + next).slice(-3) : String(next);
    return prefix + "-" + padded;
  }

  /** A revision log entry — a free-text audit trail of what happened to an RFI/TQ over
   * time (submitted, re-raised, answered, closed), not a diff of field values. Kept
   * simple deliberately: the fields that matter (status, response) already have their
   * own change tracked via updated_at; this is the human-readable "what happened and
   * when" story the field team actually wants to read back later. */
  function newRfiRevision(overrides) {
    var base = {
      id: newRfiRevisionId(),
      date: new Date().toISOString().slice(0, 10),
      author: "",
      note: "",
    };
    return Object.assign(base, overrides || {});
  }

  /** RFI / Technical Query register entry — one shape, distinguished by `type`, matching
   * the Risk Register pattern rather than building two near-identical modules. Workflow
   * is open (awaiting response) -> answered (response given) -> closed (accepted/closed
   * out). `date_required` drives the same render-time overdue computation as Meetings'
   * action items — never stored as a stale flag. */
  function newRfi(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newRfiId(),
      project_id: "",
      type: "rfi",
      number: "",
      subject: "",
      question: "",
      raised_by: "",
      assigned_to: "",
      date_raised: now.slice(0, 10),
      date_required: "",
      priority: "medium",
      status: "open",
      response: "",
      date_answered: "",
      cost_impact: false,
      schedule_impact: false,
      revisions: [],
      source_meeting_id: "",
      // Gate 10: optional link to one Schedule activity — see newRisk()'s comment.
      activity_id: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newChangeOrderId() {
    return "co_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newChangeOrderRevisionId() {
    return "cov_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  var CHANGE_ORDER_STATUSES = ["pending", "approved", "rejected", "closed"];

  /** Auto-numbered CO-001, CO-002, ... — same non-reuse-after-delete logic as RFI/TQ
   * numbering: computed from the highest existing number, not a simple count. */
  function nextChangeOrderNumber(existingChangeOrders) {
    var highest = 0;
    (existingChangeOrders || []).forEach(function (co) {
      if (!co.number) return;
      var match = /-(\d+)$/.exec(co.number);
      if (match) highest = Math.max(highest, parseInt(match[1], 10));
    });
    var next = highest + 1;
    var padded = next < 100 ? ("00" + next).slice(-3) : String(next);
    return "CO-" + padded;
  }

  /** Approval/decision audit trail entry — same shape and purpose as newRfiRevision:
   * a free-text "what happened and when" log, not a diff of field values. */
  function newChangeOrderRevision(overrides) {
    var base = {
      id: newChangeOrderRevisionId(),
      date: new Date().toISOString().slice(0, 10),
      author: "",
      note: "",
    };
    return Object.assign(base, overrides || {});
  }

  /** Change Order register entry. Deliberately a log only — cost_impact_amount and
   * schedule_impact_days are tracked for reference and reporting, never written back to
   * the project's contract_value in Portfolio. That's a project-owner decision (Aditya,
   * 2026-08-06): budget reconciliation stays a manual, deliberate act, not something a
   * status change silently triggers. source_rfi_id / source_risk_id / source_meeting_id
   * are all optional — a Change Order may originate from an RFI answer, a Risk/Issue, a
   * meeting discussion, or nothing tracked at all. */
  function newChangeOrder(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newChangeOrderId(),
      project_id: "",
      number: "",
      title: "",
      description: "",
      justification: "",
      requested_by: "",
      date_requested: now.slice(0, 10),
      date_decided: "",
      decision_by: "",
      status: "pending",
      cost_impact_amount: null,
      schedule_impact_days: null,
      source_rfi_id: "",
      source_risk_id: "",
      source_meeting_id: "",
      // Gate 10: optional link to one Schedule activity — see newRisk()'s comment.
      activity_id: "",
      revisions: [],
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  // ============================================================
  // GATE 5b (Tier 2 Cost Tracking) — budget line items + actual cost log. Budget vs.
  // actual variance only; no EVM (PV/EV/CPI/SPI), that's a separate, later gate.
  // Deliberately no automatic link to a project's contract_value or to Change Orders'
  // cost_impact_amount — same "reconciliation stays a manual, deliberate act" decision
  // already made for Change Orders (Aditya, 2026-08-06), applied consistently here.
  // ============================================================

  var COST_CATEGORIES = ["labor", "materials", "equipment", "subcontractor", "permits_fees", "other"];

  function newCostBudgetItemId() {
    return "cb_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newCostActualId() {
    return "ca_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** A planned budget line item for a project — one row of "what we expect to spend,
   * in this category, for this scope of work." Actual costs (newCostActual) may
   * optionally reference one via budget_item_id; they don't have to.
   *
   * `activity_id` (Gate 7, EVM) optionally links this item to one Schedule activity —
   * many-to-one, same shape as `budget_item_id` on newCostActual: several budget items
   * may point at the same activity (e.g. separate Labor/Equipment lines for one dig),
   * but one item can't span multiple activities. Unlinked is fully valid; it just means
   * this item has no Planned Value/Earned Value time-phasing (see costEvmEngine.js) —
   * it still counts toward the project's Budget at Completion. */
  function newCostBudgetItem(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newCostBudgetItemId(),
      project_id: "",
      category: "other",
      name: "",
      planned_amount: null,
      activity_id: "",
      notes: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  /** An actual cost incurred against a project. budget_item_id is optional — an
   * unbudgeted/miscellaneous cost is still worth logging, it just won't roll up under
   * a specific budget line on the Summary tab, only under its category and the
   * project's overall actual total. */
  function newCostActual(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newCostActualId(),
      project_id: "",
      budget_item_id: "",
      category: "other",
      description: "",
      amount: null,
      date: now.slice(0, 10),
      vendor: "",
      invoice_ref: "",
      notes: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  // ============================================================
  // GATE 11 — Resource Management (labor/equipment/material) with cross-project
  // resource leveling. Two shapes, deliberately NOT one register with mandatory
  // project assignment like every other module in this app:
  //
  // - A Resource (`newResource`) is a shared, reusable ASSET — a crew type, a crane,
  //   a material stockpile — not an event or artifact that belongs to one project the
  //   way a Risk or a Daily Log entry does. Project assignment being "mandatory on
  //   every register" (a rule enforced consistently everywhere else in this app) was
  //   deliberately NOT applied here: a resource that's shared across the portfolio has
  //   nowhere single to be "assigned" to, and forcing one would be a modeling error,
  //   not consistency.
  // - A ResourceAssignment (`newResourceAssignment`) IS project-scoped, just
  //   transitively — every assignment points at one Schedule activity, and that
  //   activity already carries its own project_id/schedule_id. This is also what
  //   makes real cross-project leveling possible: the same crane can be assigned to
  //   activities in two different projects' schedules, and resourceLevelingEngine.js
  //   can detect the conflict precisely because assignments aren't siloed per project.
  //   No cost linkage this gate (explicit call, Aditya, 2026-08-16) — resource
  //   quantity/availability only; rate x usage feeding Cost Tracking/EVM is deferred,
  //   matching the same "reconciliation stays a deliberate, separate act" pattern
  //   Change Orders and Cost Tracking's Portfolio-budget fallback already established.
  // ============================================================

  var RESOURCE_TYPES = ["labor", "equipment", "material"];

  function newResourceId() {
    return "res_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** `max_availability` is the quantity of this resource available per day (e.g. 5
   * electricians, 2 cranes) — null means "not set," which resourceLevelingEngine.js
   * treats as "unlimited / no over-allocation computable," never as zero capacity. */
  function newResource(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newResourceId(),
      name: "",
      type: "labor",
      unit: "",
      max_availability: null,
      notes: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newResourceAssignmentId() {
    return "asg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** Links one Resource to one Schedule activity for a given quantity (e.g. "3
   * electricians on Rough-In Wiring"). Always tied to exactly one activity — a
   * resource needed across several activities gets several assignment records, same
   * "one link per record" shape every other link in this app uses (cost_budget_items,
   * Gate 10's activity_id fields). */
  function newResourceAssignment(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newResourceAssignmentId(),
      resource_id: "",
      activity_id: "",
      quantity: null,
      notes: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  // ============================================================
  // GATE 9 — Project Executive Center: template-based Executive Summary. Not AI-
  // generated (explicitly out of scope) — executiveCenter.js computes default text for
  // each section from real project data at render time; this record only stores the
  // *edited* override for a section, so a user's rewrite survives even as the underlying
  // data changes. An empty-string override means "still showing the auto-generated text."
  // One record per project (project_id is unique within this array by convention, not
  // enforced by the array shape, same as every other "one row per project" record here).
  // ============================================================

  function newExecutiveSummaryId() {
    return "es_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newExecutiveSummary(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newExecutiveSummaryId(),
      project_id: "",
      status_override: "",
      achievements_override: "",
      challenges_override: "",
      management_attention_override: "",
      upcoming_override: "",
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  // ============================================================
  // GATE 1 — Schedule / WBS / Activity / Relationship data model.
  // Storage and CRUD only. No import parser, no CPM calculation engine \u2014 those are
  // separate, later gates. Fields the calculation engine will eventually populate
  // (early/late start/finish, float) exist on the shape now so Gate 3 never has to
  // migrate the schema again, but they're null here and the UI treats them as
  // "not yet calculated," never as user-editable.
  // ============================================================

  var SCHEDULE_STATUSES = ["draft", "active", "superseded", "archived"];
  var ACTIVITY_TYPES = ["task", "milestone", "summary", "wbs_summary"];
  var ACTIVITY_STATUSES = ["not_started", "in_progress", "complete", "on_hold"];
  var RELATIONSHIP_TYPES = ["FS", "SS", "FF", "SF"]; // Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish

  function newScheduleId() {
    return "sch_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** One schedule revision for a Project. Multiple revisions can coexist \u2014 importing
   * or creating a new one never overwrites an older revision (see Gate 2 import safety
   * requirements); this factory alone doesn't enforce that, callers must not delete/
   * overwrite an existing schedule to make room for a new one. */
  function newSchedule(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newScheduleId(),
      project_id: "",
      name: "",
      revision_number: 0,
      version: "1.0",
      description: "",
      status: "draft",
      import_date: null, // set by the importer in Gate 2; null for schedules built by hand
      data_date: now.slice(0, 10),
      is_baseline: false,
      source_file_name: null,
      // Gate 2: lets checkForDuplicateImport() detect "this exact file was already
      // imported" using the same duplicateService fingerprinting Documents uses \u2014
      // no separate duplicate-detection logic needed for schedules.
      source_file_size: null,
      content_hash: null,
      hash_method: null,
      // Gate 3: configurable near-critical float threshold, per your own spec's
      // requirement that this not be hardcoded. Lives on the schedule (not global)
      // since different schedules/projects may reasonably want different thresholds.
      near_critical_threshold_days: 5,
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newWbsId() {
    return "wbs_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** WBS nodes are flat records with a parent pointer (parent_wbs_id), not a nested
   * tree structure \u2014 same shape convention as everything else in this store. Hierarchy
   * is derived at render time by walking parent_wbs_id, so there's one source of truth
   * for the structure, not a tree object that can drift out of sync with the flat list. */
  function newWbsItem(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newWbsId(),
      project_id: "",
      schedule_id: "",
      code: "",
      name: "",
      parent_wbs_id: null,
      level: 0,
      description: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newActivityId() {
    return "act_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** Every field the CPM engine (Gate 3) and baseline/revision comparison (Gate 4) will
   * eventually need already exists here \u2014 early_start/early_finish/late_start/late_finish/
   * total_float/free_float are always null until that engine runs; nothing in this gate
   * writes to them, and the UI must never expose them as editable inputs. */
  function newActivity(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newActivityId(),
      project_id: "",
      schedule_id: "",
      wbs_id: null,
      name: "",
      activity_type: "task",
      calendar_id: null, // no calendar model yet \u2014 placeholder for a later gate
      duration: null,
      original_duration: null,
      remaining_duration: null,
      planned_start: "",
      planned_finish: "",
      actual_start: "",
      actual_finish: "",
      // Calculated by the CPM engine (Gate 3). Never set directly by user input.
      early_start: null,
      early_finish: null,
      late_start: null,
      late_finish: null,
      total_float: null,
      free_float: null,
      percent_complete: 0,
      physical_progress: 0,
      status: "not_started",
      priority: "medium",
      discipline: "",
      contractor: "",
      responsible_person: "",
      constraint_type: "",
      constraint_date: "",
      notes: "",
      // Gate 2: the Activity ID from the source spreadsheet, preserved for traceability
      // and so a future re-import of a revised file can be matched against what's
      // already here. Null for activities created by hand in Gate 1's CRUD form.
      external_id: null,
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newRelationshipId() {
    return "rel_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** Predecessor/successor link between two activities in the same schedule. Storage
   * only in this gate \u2014 lag/lead are recorded but not yet used in any calculation, and
   * nothing here validates against circular logic (that's a Gate 2/3 concern, once
   * there's an engine to actually walk the graph). */
  function newRelationship(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newRelationshipId(),
      schedule_id: "",
      predecessor_id: "",
      successor_id: "",
      type: "FS",
      lag: 0,
      created_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newScheduleBaselineId() {
    return "bl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** Thin index row for a captured baseline. The full frozen WBS/Activity/Relationship
   * payload is NOT here \u2014 it's written separately to scheduleBaselineStore (IndexedDB)
   * under this same id. This row alone is what baseline list UIs render from, so listing
   * baselines never has to touch IndexedDB. */
  function newScheduleBaseline(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newScheduleBaselineId(),
      schedule_id: "",
      project_id: "",
      name: "",
      schedule_revision_number: null,
      captured_at: now,
      wbs_count: 0,
      activity_count: 0,
      relationship_count: 0,
      notes: "",
      created_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  // ============================================================
  // GATE 9 — Vendor Management. Vendor Master is portfolio-wide (like Projects
  // themselves), not scoped to one project the way Documents/Risk/RFI are — every
  // vendor<->X relationship below is its own flat join array rather than an array-typed
  // field on either side, same "flat records + id references, no nested trees" shape
  // convention this store already uses everywhere else (see wbs_items' parent_wbs_id
  // comment). vendor_meeting_links / vendor_rfi_links / vendor_risk_links deliberately
  // don't add any field to meetings/rfis/risks — see vendors.js for how linking reuses
  // those modules' existing expandMeeting()/expandRfi()/expandRisk() hooks instead.
  // ============================================================

  var VENDOR_STATUSES = ["active", "inactive", "preferred", "blacklisted"];
  // Fixed list per the spec, plus "other" as the escape hatch for "custom categories
  // added later" — see newVendorDocument's custom_category_label below, which avoids a
  // schema change being needed the day someone actually needs a 20th category.
  var VENDOR_DOCUMENT_CATEGORIES = [
    "mom", "boq", "escalation_matrix", "contract", "purchase_order", "quotation",
    "technical_submittal", "material_approval", "drawing", "method_statement",
    "inspection_report", "test_certificate", "quality_document", "safety_document",
    "insurance_document", "bank_details", "invoice", "performance_report", "other",
  ];
  var VENDOR_PROJECT_CONTRACT_STATUSES = ["draft", "active", "completed", "terminated"];

  function newVendorId() {
    return "vn_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** Auto-suggested vendor code (V-0001, V-0002, ...), same "highest existing number + 1"
   * approach as nextRfiNumber/nextChangeOrderNumber so a deleted vendor never causes a
   * code to be reused. Always editable on the form — "auto-generated or manual" per spec. */
  function nextVendorCode(existingVendors) {
    var highest = 0;
    (existingVendors || []).forEach(function (v) {
      var match = /^V-(\d+)$/.exec(v.vendor_code || "");
      if (match) highest = Math.max(highest, parseInt(match[1], 10));
    });
    var next = highest + 1;
    var padded = next < 1000 ? ("000" + next).slice(-4) : String(next);
    return "V-" + padded;
  }

  /** The Vendor Master record itself. Deliberately has NO primary-contact fields of its
   * own (name/mobile/email etc.) even though the spec's "Basic Information" section
   * lists them alongside vendor identity — those live in vendor_contacts (with one
   * marked is_primary) so there's exactly one place contact data can live, not a
   * duplicate copy on the vendor record that could drift out of sync with the Contacts
   * list. vendors.js's vendor form still presents primary-contact fields inline for a
   * one-step "add vendor with its main contact" flow; it upserts into vendor_contacts
   * on save rather than storing them here. category/trade_discipline are free text, not
   * enums — this app already leaves comparably open-ended classification fields
   * (Activity's `discipline`, Cost's category is the exception because Cost Tracking
   * needed a fixed roll-up) as free text rather than guessing a fixed vendor-trade
   * taxonomy the spec didn't actually enumerate. */
  function newVendor(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newVendorId(),
      vendor_code: "",
      vendor_name: "",
      company_name: "",
      category: "",
      trade_discipline: "",
      gst_number: "",
      pan_number: "",
      registration_number: "",
      website: "",
      office_address: "",
      city: "",
      state: "",
      country: "",
      postal_code: "",
      status: "active",
      notes: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newVendorContactId() {
    return "vc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newVendorContact(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newVendorContactId(),
      vendor_id: "",
      name: "",
      designation: "",
      mobile: "",
      email: "",
      is_primary: false,
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newVendorProjectLinkId() {
    return "vpl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** One row per (vendor, project) pairing — a vendor working on 3 projects has 3 of
   * these, each with its own role/scope/contract_status, rather than one vendor record
   * trying to hold three parallel arrays in lockstep. */
  function newVendorProjectLink(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newVendorProjectLinkId(),
      vendor_id: "",
      project_id: "",
      role: "",
      scope_of_work: "",
      contract_status: "active",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newVendorDocumentId() {
    return "vd_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** project_id is OPTIONAL (unlike the mandatory-project rule on Documents/Risk/RFI/
   * Change Orders) — a vendor's GST certificate or insurance policy isn't "for" any one
   * project, but a project-specific PO or M.O.M. genuinely is, so both need to be
   * representable. Version history: every upload is its own record; re-uploading over
   * an existing document creates a NEW row sharing that document's document_group_id
   * (defaulted to this row's own id for a first upload) with revision_number
   * incremented — the "latest" revision is whichever row in a group has the highest
   * revision_number, computed at render time rather than a denormalized "is_latest"
   * flag that could drift. Binary bytes live in blobStore (IndexedDB), keyed by this
   * record's id, same as every other file this app stores. */
  function newVendorDocument(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newVendorDocumentId(),
      vendor_id: "",
      project_id: "",
      document_group_id: "",
      revision_number: 1,
      category: "other",
      custom_category_label: "",
      filename: "",
      file_size: 0,
      mime_type: "",
      upload_date: now,
      uploaded_by: "",
      expiry_date: "",
      tags: "",
      comments: "",
      content_hash: null,
      hash_method: null,
      created_at: now,
      updated_at: now,
    };
    var doc = Object.assign(base, overrides || {});
    if (!doc.document_group_id) doc.document_group_id = doc.id;
    return doc;
  }

  function newVendorMeetingLinkId() {
    return "vml_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newVendorMeetingLink(overrides) {
    var base = {
      id: newVendorMeetingLinkId(),
      vendor_id: "",
      meeting_id: "",
      created_at: new Date().toISOString(),
    };
    return Object.assign(base, overrides || {});
  }

  function newVendorRfiLinkId() {
    return "vrl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newVendorRfiLink(overrides) {
    var base = {
      id: newVendorRfiLinkId(),
      vendor_id: "",
      rfi_id: "",
      created_at: new Date().toISOString(),
    };
    return Object.assign(base, overrides || {});
  }

  function newVendorRiskLinkId() {
    return "vrsk_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newVendorRiskLink(overrides) {
    var base = {
      id: newVendorRiskLinkId(),
      vendor_id: "",
      risk_id: "",
      created_at: new Date().toISOString(),
    };
    return Object.assign(base, overrides || {});
  }

  function newVendorPerformanceId() {
    return "vp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** One row per review (supports "review history" as multiple rows over time, not one
   * mutable record). overall_rating is NOT stored — it's always the average of the four
   * sub-ratings, computed where it's displayed (vendors.js), so it can never disagree
   * with its own inputs the way a separately-editable "overall" field could. Ratings are
   * 1-5 integers (0 = not yet rated), the common default scale absent a spec'd one. */
  function newVendorPerformance(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newVendorPerformanceId(),
      vendor_id: "",
      project_id: "",
      quality_rating: 0,
      delivery_rating: 0,
      communication_rating: 0,
      safety_rating: 0,
      comments: "",
      review_date: now.slice(0, 10),
      reviewed_by: "",
      created_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  function newVendorNoteId() {
    return "vnt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newVendorNote(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newVendorNoteId(),
      vendor_id: "",
      note_text: "",
      author: "",
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  // ============================================================
  // Gate 14 (Document Control 1: Master Document Repository)
  // ============================================================

  var DOCUMENT_TYPE_CRITICALITY_LEVELS = ["critical", "major", "normal", "informational"];

  function newDocumentTypeId() {
    return "dtp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** One row per document TYPE in the master repository — e.g. "Method Statement" or
   * "BOQ" — NOT a document/document requirement itself (those come in later gates).
   * `category` is a free-text grouping bucket (e.g. "Engineering", "Commercial", "HSE"),
   * same convention as Activity's `discipline` and Vendor's `category`/`trade_discipline`
   * — this app leaves open-ended classification fields as free text rather than guessing
   * a fixed taxonomy. `code` is a short optional abbreviation (e.g. "MS", "ITP") for use
   * in a later document-numbering/nomenclature gate; not validated for uniqueness here.
   * `default_criticality` is only ever a suggested starting point for a document
   * requirement created from this type later — never enforced or read for anything in
   * this gate. `active: false` is how a type is deactivated (soft, not deleted) so
   * requirements already referencing it by id keep working; hard delete is also offered
   * in documentTypes.js since nothing references this table yet in this gate. */
  function newDocumentType(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newDocumentTypeId(),
      name: "",
      code: "",
      category: "",
      default_criticality: "normal",
      description: "",
      active: true,
      created_at: now,
      updated_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  /** Starting list for the master repository — from the examples enumerated when this
   * gate was scoped (Contracts, BOQ, Specifications, ... Closeout Documents). Every
   * `default_criticality` is "normal" deliberately: criticality is a project-specific
   * judgment call for the user to set, not something this app should presume on their
   * behalf just because it seeded the type. Fully editable/deactivatable/deletable
   * afterward — this is a starting point, not a locked list. Used by both emptyData()
   * (brand-new install) and the v24->v25 migration (existing install upgrading). */
  /** Gate 18 (Document Control UX refinement): the original Gate 14 seed list read as
   * execution/vendor-submittal-heavy (ITP, Method Statement, Material Submittal, ...)
   * with nothing representing the documents a project itself generates at setup/kickoff
   * before any vendor is even engaged. A separate constant (not folded into the main
   * seed array) so both a fresh install's seedDocumentTypes() and an upgrading
   * install's migration step can reference the exact same list without duplicating it. */
  var PROJECT_SETUP_TYPE_SEED = [
    ["Project Charter", "PC", "Setup"],
    ["Kickoff Checklist", "KOC", "Setup"],
    ["Statutory / Regulatory Approvals", "REG", "Commercial"],
    ["Land / Site Handover", "LSH", "Setup"],
    ["Insurance Documents", "INS", "Commercial"],
    ["Permits & Licenses", "PL", "Commercial"],
    ["Project Organization Chart", "ORG", "Setup"],
    ["Communication Plan", "COMMPLAN", "Setup"],
    ["Project Execution Plan", "PEP", "Planning"],
    ["Project Quality Plan", "PQP", "Quality"],
  ];

  function seedDocumentTypes() {
    var seed = [
      ["Contract", "CTR", "Commercial"],
      ["BOQ", "BOQ", "Commercial"],
      ["Specifications", "SPEC", "Engineering"],
      ["Drawings", "DWG", "Engineering"],
      ["Schedules", "SCH", "Planning"],
      ["Baseline Programme", "BL", "Planning"],
      ["Lookahead", "LA", "Planning"],
      ["Progress Reports", "PR", "Reporting"],
      ["Method Statements", "MS", "Quality"],
      ["ITP", "ITP", "Quality"],
      ["Material Submittals", "MSUB", "Procurement"],
      ["Vendor Documents", "VDOC", "Procurement"],
      ["GA Drawings", "GA", "Engineering"],
      ["Shop Drawings", "SHOP", "Engineering"],
      ["Datasheets", "DS", "Engineering"],
      ["Test Certificates", "TC", "Quality"],
      ["Inspection Reports", "IR", "Quality"],
      ["RFIs", "RFI", "Engineering"],
      ["TQs", "TQ", "Engineering"],
      ["MOM", "MOM", "Meetings"],
      ["Site Reports", "SR", "Reporting"],
      ["Invoices", "INV", "Commercial"],
      ["Commercial Documents", "COM", "Commercial"],
      ["HSE Documents", "HSE", "HSE"],
      ["Commissioning Documents", "COMM", "Commissioning"],
      ["O&M Manuals", "OM", "Closeout"],
      ["As-Built Drawings", "ASB", "Closeout"],
      ["Closeout Documents", "CLO", "Closeout"],
    ].concat(PROJECT_SETUP_TYPE_SEED);
    return seed.map(function (row) {
      return newDocumentType({ name: row[0], code: row[1], category: row[2] });
    });
  }

  // ============================================================
  // Gate 15 (Document Control 2: Project-Specific Document Requirements)
  // ============================================================

  function newProjectDocumentRequirementId() {
    return "pdr_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /** One row per (project, document_type) the user has marked applicable to that
   * project — same "existence of a row = selected" join convention as
   * vendor_project_links, not a boolean flag that could exist in a false/undecided
   * state. `planned_submission_date` (Gate 5: Document Control 5, Schedule Due Dates)
   * is a manual, optional due date — deliberately NOT derived from a linked schedule
   * activity/milestone and no lead-time calculation is applied to it (that's gate 8).
   * `vendor_id` (Gate 6: Document Control 6, Vendor Register) is an optional link to an
   * existing Vendor Management vendor (`vendors`) — which vendor is expected to submit
   * this document. Deliberately reuses the existing vendor register rather than
   * introducing a second one; this app already has exactly one list of vendors.
   * `activity_id` (Gate 7: Document Control 7, Schedule↔Document Linking) is an optional
   * link to one of the project's own Schedule activities — same "one linkable field,
   * cross-module join owned by the new side" pattern Gate 10 established for Documents/
   * Risks/RFIs/etc. Purely a link: it does not read or write `planned_submission_date`
   * in either direction — deriving a due date FROM the linked activity's own dates is
   * explicitly gate 8's job (Schedule-Driven Dates/Lead Time), not this gate's. Beyond
   * that, still no status or criticality on the row itself — those stay later gates'
   * job; this gate only adds "which activity governs it," on top of "who's submitting
   * it," "when is this due," and "does this type apply to this project." */
  function newProjectDocumentRequirement(overrides) {
    var now = new Date().toISOString();
    var base = {
      id: newProjectDocumentRequirementId(),
      project_id: "",
      document_type_id: "",
      planned_submission_date: null,
      vendor_id: "",
      activity_id: "",
      created_at: now,
    };
    return Object.assign(base, overrides || {});
  }

  /** Suggested starting requirement lists per project type, per spec section 2
   * ("Ideally support project templates... Templates should only provide SUGGESTED
   * document requirements. I must still be able to modify them."). Matched against the
   * master repository's document_types BY NAME (case-insensitive) at apply-time in
   * documentTypesPortfolio wiring — never used to create/edit document_types records
   * themselves, so applying a template can never modify the master repository, and a
   * name with no matching active type in a given install is silently skipped rather
   * than fabricating one. These lists are curated suggestions, not requirements enforced
   * anywhere; a user can freely add/remove requirements after applying one. */
  var PROJECT_TEMPLATES = [
    {
      key: "epc",
      label: "EPC",
      suggested_type_names: [
        "Contract", "BOQ", "Specifications", "Drawings", "Schedules", "Baseline Programme",
        "Lookahead", "Progress Reports", "Method Statements", "ITP", "Material Submittals",
        "Vendor Documents", "GA Drawings", "Shop Drawings", "Test Certificates",
        "Inspection Reports", "RFIs", "TQs", "MOM", "HSE Documents",
        "Commissioning Documents", "O&M Manuals", "As-Built Drawings", "Closeout Documents",
      ],
    },
    {
      key: "industrial_construction",
      label: "Industrial Construction",
      suggested_type_names: [
        "Contract", "BOQ", "Drawings", "Schedules", "Method Statements", "ITP",
        "Material Submittals", "GA Drawings", "Shop Drawings", "Test Certificates",
        "Inspection Reports", "RFIs", "MOM", "Site Reports", "HSE Documents",
        "As-Built Drawings", "Closeout Documents",
      ],
    },
    {
      key: "manufacturing",
      label: "Manufacturing",
      suggested_type_names: [
        "Contract", "Specifications", "Datasheets", "Material Submittals",
        "Test Certificates", "Inspection Reports", "MOM", "Progress Reports",
        "HSE Documents", "O&M Manuals",
      ],
    },
    {
      key: "infrastructure",
      label: "Infrastructure",
      suggested_type_names: [
        "Contract", "BOQ", "Drawings", "Schedules", "Baseline Programme", "Lookahead",
        "Method Statements", "ITP", "GA Drawings", "Test Certificates",
        "Inspection Reports", "RFIs", "TQs", "Site Reports", "Progress Reports",
        "HSE Documents", "As-Built Drawings", "Closeout Documents",
      ],
    },
    {
      key: "energy",
      label: "Energy",
      suggested_type_names: [
        "Contract", "BOQ", "Specifications", "Drawings", "Schedules", "Method Statements",
        "ITP", "Material Submittals", "Vendor Documents", "GA Drawings",
        "Test Certificates", "Inspection Reports", "Commissioning Documents",
        "O&M Manuals", "As-Built Drawings", "HSE Documents",
      ],
    },
  ];

  /** Bring older exported/stored data up to the current schema in place. */
  function migrate(loaded) {
    if (!loaded.schema_version) loaded.schema_version = 1;

    if (loaded.schema_version < 2) {
      (loaded.projects || []).forEach(function (p) {
        if (p.archived === undefined) p.archived = false;
        if (!p.attachments) p.attachments = [];
        if (p.progress === undefined) p.progress = 0;
        if (!p.status || PROJECT_STATUSES.indexOf(p.status) === -1) p.status = "on_track";
      });
      loaded.schema_version = 2;
    }

    if (loaded.schema_version < 3) {
      (loaded.documents || []).forEach(function (d) {
        if (!d.category || DOCUMENT_CATEGORIES.indexOf(d.category) === -1) d.category = "other";
        if (d.extraction === undefined) d.extraction = null;
        if (!d.project_id) d.project_id = "";
      });
      (loaded.projects || []).forEach(function (p) {
        if (!p.attachments) p.attachments = [];
      });
      loaded.schema_version = 3;
    }

    if (loaded.schema_version < 4) {
      (loaded.documents || []).forEach(function (d) {
        if (d.file_data === undefined) d.file_data = null;
      });
      loaded.schema_version = 4;
    }

    if (loaded.schema_version < 5) {
      if (!loaded.daily_logs) loaded.daily_logs = [];
      loaded.schema_version = 5;
    }

    if (loaded.schema_version < 6) {
      (loaded.risks || []).forEach(function (r) {
        if (!r.type || RISK_TYPES.indexOf(r.type) === -1) r.type = "risk";
        if (!r.status || RISK_STATUSES.indexOf(r.status) === -1) r.status = "open";
        if (!r.probability || RISK_LEVELS.indexOf(r.probability) === -1) r.probability = "medium";
        if (!r.impact || RISK_LEVELS.indexOf(r.impact) === -1) r.impact = "medium";
        if (!r.project_id) r.project_id = "";
      });
      loaded.schema_version = 6;
    }

    if (loaded.schema_version < 7) {
      if (!loaded.meetings) loaded.meetings = [];
      loaded.meetings.forEach(function (m) {
        if (!m.actions) m.actions = [];
        if (!m.project_id) m.project_id = "";
      });
      loaded.schema_version = 7;
    }

    if (loaded.schema_version < 8) {
      (loaded.risks || []).forEach(function (r) {
        if (r.source_meeting_id === undefined) r.source_meeting_id = "";
      });
      (loaded.documents || []).forEach(function (d) {
        if (d.meeting_id === undefined) d.meeting_id = "";
      });
      loaded.schema_version = 8;
    }

    if (loaded.schema_version < 9) {
      (loaded.meetings || []).forEach(function (m) {
        if (!m.recordings) m.recordings = [];
      });
      loaded.schema_version = 9;
    }

    if (loaded.schema_version < 10) {
      if (!loaded.rfis) loaded.rfis = [];
      loaded.rfis.forEach(function (r) {
        if (!r.type || RFI_TYPES.indexOf(r.type) === -1) r.type = "rfi";
        if (!r.status || RFI_STATUSES.indexOf(r.status) === -1) r.status = "open";
        if (!r.priority || RFI_PRIORITIES.indexOf(r.priority) === -1) r.priority = "medium";
        if (!r.project_id) r.project_id = "";
        if (!r.revisions) r.revisions = [];
        if (r.cost_impact === undefined) r.cost_impact = false;
        if (r.schedule_impact === undefined) r.schedule_impact = false;
        if (r.source_meeting_id === undefined) r.source_meeting_id = "";
      });
      loaded.schema_version = 10;
    }

    if (loaded.schema_version < 11) {
      if (!loaded.change_orders) loaded.change_orders = [];
      loaded.change_orders.forEach(function (co) {
        if (!co.status || CHANGE_ORDER_STATUSES.indexOf(co.status) === -1) co.status = "pending";
        if (!co.project_id) co.project_id = "";
        if (!co.revisions) co.revisions = [];
        if (co.cost_impact_amount === undefined) co.cost_impact_amount = null;
        if (co.schedule_impact_days === undefined) co.schedule_impact_days = null;
        if (co.source_rfi_id === undefined) co.source_rfi_id = "";
        if (co.source_risk_id === undefined) co.source_risk_id = "";
        if (co.source_meeting_id === undefined) co.source_meeting_id = "";
      });
      loaded.schema_version = 11;
    }

    if (loaded.schema_version < 12) {
      if (!loaded.meta) loaded.meta = {};
      if (loaded.meta.last_exported_at === undefined) loaded.meta.last_exported_at = null;
      if (!loaded.settings) loaded.settings = {};
      if (loaded.settings.backup_reminder_days === undefined) loaded.settings.backup_reminder_days = 7;
      if (loaded.settings.backup_nudge_dismissed_at === undefined) loaded.settings.backup_nudge_dismissed_at = null;
      loaded.schema_version = 12;
    }

    if (loaded.schema_version < 13) {
      (loaded.daily_logs || []).forEach(function (log) {
        if (!log.photos) log.photos = [];
      });
      loaded.schema_version = 13;
    }

    if (loaded.schema_version < 14) {
      // Duplicate-detection fields, Documents module only for now (see project notes —
      // rolling out module by module with a real-device confirmation gate between each).
      // Existing documents predate fingerprinting, so they get null/false defaults
      // rather than a retroactively computed hash — nothing here re-reads stored files.
      (loaded.documents || []).forEach(function (d) {
        if (d.content_hash === undefined) d.content_hash = null;
        if (d.hash_method === undefined) d.hash_method = null;
        if (d.is_duplicate === undefined) d.is_duplicate = false;
        if (d.duplicate_group_id === undefined) d.duplicate_group_id = null;
        if (d.original_record_id === undefined) d.original_record_id = null;
        if (d.duplicate_reason === undefined) d.duplicate_reason = null;
      });
      loaded.schema_version = 14;
    }

    if (loaded.schema_version < 15) {
      // Gate 1: Schedule/WBS/Activity/Relationship entities. Brand new arrays, so
      // existing installs just get them initialized empty \u2014 nothing to backfill on
      // records that didn't exist before.
      if (!loaded.schedules) loaded.schedules = [];
      if (!loaded.wbs_items) loaded.wbs_items = [];
      if (!loaded.activities) loaded.activities = [];
      if (!loaded.relationships) loaded.relationships = [];
      loaded.schema_version = 15;
    }

    if (loaded.schema_version < 16) {
      // Gate 2: import metadata on schedules, external_id (source spreadsheet's own
      // Activity ID) on activities. Gate 1 records predate both \u2014 default them rather
      // than guessing, same pattern as every prior migration in this chain.
      (loaded.schedules || []).forEach(function (s) {
        if (s.source_file_size === undefined) s.source_file_size = null;
        if (s.content_hash === undefined) s.content_hash = null;
        if (s.hash_method === undefined) s.hash_method = null;
      });
      (loaded.activities || []).forEach(function (a) {
        if (a.external_id === undefined) a.external_id = null;
      });
      loaded.schema_version = 16;
    }

    if (loaded.schema_version < 17) {
      // Gate 3: configurable near-critical threshold on schedules. Existing schedules
      // get the same default (5 days) newSchedule() uses, so behavior is identical
      // before and after this migration until someone explicitly changes it.
      (loaded.schedules || []).forEach(function (s) {
        if (s.near_critical_threshold_days === undefined) s.near_critical_threshold_days = 5;
      });
      loaded.schema_version = 17;
    }

    if (loaded.schema_version < 18) {
      // Gate 4: baseline snapshots. schedule_baselines is only the thin index (name,
      // captured_at, counts) \u2014 the actual frozen WBS/Activity/Relationship payload
      // lives in IndexedDB (scheduleBaselineStore.js), keyed by the same id, same
      // split blobStore.js already uses for photos/documents. Nothing to backfill:
      // pre-Gate-4 installs simply have no baselines yet.
      if (!loaded.schedule_baselines) loaded.schedule_baselines = [];
      loaded.schema_version = 18;
    }

    if (loaded.schema_version < 19) {
      // Gate 5b: Cost Tracking. Brand new arrays, nothing to backfill on existing
      // records — same as every prior gate that introduced a new register.
      if (!loaded.cost_budget_items) loaded.cost_budget_items = [];
      if (!loaded.cost_actuals) loaded.cost_actuals = [];
      loaded.schema_version = 19;
    }

    if (loaded.schema_version < 20) {
      // Gate 7: EVM engine. activity_id links a budget item to a Schedule activity for
      // time-phased PV/EV — pre-Gate-7 budget items simply have none, same as every
      // prior migration in this chain.
      (loaded.cost_budget_items || []).forEach(function (b) {
        if (b.activity_id === undefined) b.activity_id = "";
      });
      loaded.schema_version = 20;
    }

    if (loaded.schema_version < 21) {
      // Gate 9: Project Executive Center. New array + project fields, nothing to
      // backfill on existing records — same as every prior gate that added a register
      // or a handful of new project-level fields (defaults below match newProject()'s
      // own defaults so an old project reads identically to a brand-new one).
      if (!loaded.executive_summaries) loaded.executive_summaries = [];
      (loaded.projects || []).forEach(function (p) {
        if (p.project_type === undefined) p.project_type = "";
        if (p.current_phase === undefined) p.current_phase = "";
        if (p.forecast_finish_date === undefined) p.forecast_finish_date = "";
      });
      if (loaded.settings && !loaded.settings.health_score_weights) {
        loaded.settings.health_score_weights = {
          schedule: 25,
          cost: 20,
          risk: 20,
          issue: 10,
          rfi: 15,
          change: 10,
        };
      }
      loaded.schema_version = 21;
    }

    if (loaded.schema_version < 22) {
      // Gate 10: activity linking. Backfills activity_id: "" (unlinked) onto every
      // existing record in the six registers that can now optionally point at one
      // Schedule activity — nothing to migrate beyond the default, same as every prior
      // gate that added an optional link field.
      (loaded.risks || []).forEach(function (r) { if (r.activity_id === undefined) r.activity_id = ""; });
      (loaded.rfis || []).forEach(function (r) { if (r.activity_id === undefined) r.activity_id = ""; });
      (loaded.meetings || []).forEach(function (m) { if (m.activity_id === undefined) m.activity_id = ""; });
      (loaded.documents || []).forEach(function (d) { if (d.activity_id === undefined) d.activity_id = ""; });
      (loaded.daily_logs || []).forEach(function (l) { if (l.activity_id === undefined) l.activity_id = ""; });
      (loaded.change_orders || []).forEach(function (co) { if (co.activity_id === undefined) co.activity_id = ""; });
      loaded.schema_version = 22;
    }

    if (loaded.schema_version < 23) {
      // Gate 11: Resource Management. Brand new arrays, nothing to backfill on
      // existing records — same as every prior gate that introduced a new register.
      if (!loaded.resources) loaded.resources = [];
      if (!loaded.resource_assignments) loaded.resource_assignments = [];
      loaded.schema_version = 23;
    }

    if (loaded.schema_version < 24) {
      // Gate 13: Vendor Management. Nine brand new arrays, nothing to backfill on
      // existing records — same as every prior gate that introduced a new register.
      // (Originally built as this branch's "Gate 9" against schema v21 in a parallel
      // session; renumbered to Gate 13 / v24 when reconciled into main alongside
      // Gates 9-11 above, which had independently claimed v21-v23 in the meantime.)
      if (!loaded.vendors) loaded.vendors = [];
      if (!loaded.vendor_contacts) loaded.vendor_contacts = [];
      if (!loaded.vendor_project_links) loaded.vendor_project_links = [];
      if (!loaded.vendor_documents) loaded.vendor_documents = [];
      if (!loaded.vendor_meeting_links) loaded.vendor_meeting_links = [];
      if (!loaded.vendor_rfi_links) loaded.vendor_rfi_links = [];
      if (!loaded.vendor_risk_links) loaded.vendor_risk_links = [];
      if (!loaded.vendor_performance) loaded.vendor_performance = [];
      if (!loaded.vendor_notes) loaded.vendor_notes = [];
      loaded.schema_version = 24;
    }

    if (loaded.schema_version < 25) {
      // Gate 14 (Document Control 1): Master Document Repository. A brand new array,
      // seeded with a starting list of document types on upgrade (not left empty) so an
      // existing install gets the same usable starting point a fresh install does —
      // same treatment as every prior gate that introduced a new register, plus seed
      // data since an empty repository would be confusing on day one of the feature.
      if (!loaded.document_types) loaded.document_types = seedDocumentTypes();
      loaded.schema_version = 25;
    }

    if (loaded.schema_version < 26) {
      // Gate 15 (Document Control 2): Project-Specific Document Requirements. A brand
      // new join array, nothing to backfill — an existing project simply has no
      // requirements selected yet, same as a brand-new project would, rather than this
      // gate guessing which of its documents "count" as requirements.
      if (!loaded.project_document_requirements) loaded.project_document_requirements = [];
      loaded.schema_version = 26;
    }

    if (loaded.schema_version < 27) {
      // Gate 16 (Document Control 3): Classification + Nomenclature. Backfills the new
      // optional classification fields onto every existing document (empty/default —
      // nothing to infer from an old record), project_code onto every existing project,
      // and the nomenclature settings — same "" / default treatment as every prior gate
      // that added optional fields to an existing register.
      (loaded.projects || []).forEach(function (p) {
        if (p.project_code === undefined) p.project_code = "";
      });
      (loaded.documents || []).forEach(function (d) {
        if (d.document_type_id === undefined) d.document_type_id = "";
        if (d.discipline === undefined) d.discipline = "";
        if (d.document_number === undefined) d.document_number = "";
        if (d.revision === undefined) d.revision = "00";
        if (d.package === undefined) d.package = "";
        if (d.contract_or_po === undefined) d.contract_or_po = "";
        if (d.vendor_id === undefined) d.vendor_id = "";
        if (d.priority === undefined) d.priority = "medium";
        if (d.criticality === undefined) d.criticality = "";
        if (d.remarks === undefined) d.remarks = "";
      });
      if (loaded.settings && loaded.settings.document_nomenclature_pattern === undefined) {
        loaded.settings.document_nomenclature_pattern = "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV";
      }
      if (loaded.settings && loaded.settings.document_nomenclature_enabled === undefined) {
        loaded.settings.document_nomenclature_enabled = true;
      }
      loaded.schema_version = 27;
    }

    if (loaded.schema_version < 28) {
      // Gate 17 (Document Control 4): Status + Version Control. Every existing document
      // becomes its own single-revision group (document_group_id defaults to its own
      // id, revision_number 1) — there's no way to infer which pre-Gate-17 documents
      // were actually different revisions of the same thing, so each stays independent
      // rather than this migration guessing at groupings. status defaults to "draft" —
      // not a claim about where any given document actually sits in review; the user
      // can update it once actual status data matters to them.
      (loaded.documents || []).forEach(function (d) {
        if (d.status === undefined) d.status = "draft";
        if (d.document_group_id === undefined || !d.document_group_id) d.document_group_id = d.id;
        if (d.revision_number === undefined) d.revision_number = 1;
      });
      loaded.schema_version = 28;
    }

    if (loaded.schema_version < 29) {
      // Gate 18 (Document Control UX refinement): add the project-setup-flavored
      // document types (see PROJECT_SETUP_TYPE_SEED's own comment) to an existing
      // install's master repository, same as a fresh install gets from
      // seedDocumentTypes(). Skips any name the user already has (either because they
      // added it by hand, or a future re-run of this exact migration step) rather than
      // creating a duplicate.
      var existingTypeNames = {};
      (loaded.document_types || []).forEach(function (t) {
        existingTypeNames[(t.name || "").toLowerCase()] = true;
      });
      PROJECT_SETUP_TYPE_SEED.forEach(function (row) {
        if (!existingTypeNames[row[0].toLowerCase()]) {
          loaded.document_types.push(newDocumentType({ name: row[0], code: row[1], category: row[2] }));
        }
      });
      loaded.schema_version = 29;
    }

    if (loaded.schema_version < 30) {
      // Gate 5 (Document Control 5: Schedule Due Dates). Adds an optional, manual
      // planned_submission_date to every existing requirement row — null (not a guessed
      // date) since there's nothing to infer it from; the user sets it going forward.
      (loaded.project_document_requirements || []).forEach(function (r) {
        if (r.planned_submission_date === undefined) r.planned_submission_date = null;
      });
      loaded.schema_version = 30;
    }

    if (loaded.schema_version < 31) {
      // Gate 6 (Document Control 6: Vendor Register). Adds an optional vendor_id to
      // every existing requirement row — "" (unassigned), same treatment activity_id
      // got on every linkable register back at Gate 10, since there's no way to infer
      // who's expected to submit a pre-Gate-6 requirement.
      (loaded.project_document_requirements || []).forEach(function (r) {
        if (r.vendor_id === undefined) r.vendor_id = "";
      });
      loaded.schema_version = 31;
    }

    if (loaded.schema_version < 32) {
      // Gate 7 (Document Control 7: Schedule↔Document Linking). Adds an optional
      // activity_id to every existing requirement row — "" (unlinked), same treatment
      // every linkable register got at Gate 10, since there's no way to infer which
      // Schedule activity a pre-Gate-7 requirement should be tied to.
      (loaded.project_document_requirements || []).forEach(function (r) {
        if (r.activity_id === undefined) r.activity_id = "";
      });
      loaded.schema_version = 32;
    }

    return loaded;
  }

  var data = null;
  var listeners = [];
  var saveTimer = null;
  var corruptionRecovery = null; // { key, timestamp } set once, only if load() hits unparseable JSON

  var CORRUPTED_BACKUP_PREFIX = "pcc_corrupted_backup_";

  function notifyListeners() {
    listeners.forEach(function (fn) {
      try {
        fn(data);
      } catch (e) {
        console.error("PCC store listener error", e);
      }
    });
  }

  function persistToLocalStorage() {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
      data.meta.last_saved_at = new Date().toISOString();
    } catch (e) {
      console.error("Could not save to browser storage", e);
      if (window.PCC.notify) {
        window.PCC.notify(
          "Could not autosave to this browser (storage may be full or blocked). Export your data now to be safe.",
          "error"
        );
      }
    }
  }

  function scheduleSave() {
    notifyListeners();
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistToLocalStorage, 250);
  }

  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    } catch (e) {
      console.error("Could not read browser storage", e);
    }
    if (raw) {
      try {
        data = migrate(JSON.parse(raw));
        return;
      } catch (e) {
        console.error("Stored data was corrupted, starting fresh.", e);
        // Preserve the raw unparseable string under its own key immediately, before
        // anything else touches storage, so it survives regardless of what the person
        // does next (including if they never see or dismiss the recovery banner). Kept
        // separate from LOCAL_STORAGE_KEY so a future normal save can never overwrite it.
        try {
          var recoveryKey = CORRUPTED_BACKUP_PREFIX + Date.now();
          window.localStorage.setItem(recoveryKey, raw);
          corruptionRecovery = { key: recoveryKey, timestamp: new Date().toISOString() };
        } catch (e2) {
          console.error("Could not preserve corrupted backup separately", e2);
          corruptionRecovery = { key: null, timestamp: new Date().toISOString() };
        }
      }
    }
    data = emptyData();
  }

  function get() {
    return data;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  /** Mutate data via a callback, then autosave + notify. */
  function update(mutator) {
    mutator(data);
    scheduleSave();
  }

  /** Every place a binary blob can currently live: Documents' `file_data`, and each
   * Daily Log entry's `photos[].file_data`. Returns get/set accessors rather than raw
   * values so callers can read AND write back into the same object graph \u2014 used by
   * export (read), import (write), and the one-time legacy-blob migration (both). */
  function collectBlobRefs(d) {
    var refs = [];
    (d.documents || []).forEach(function (doc) {
      refs.push({
        id: doc.id,
        get: function () {
          return doc.file_data;
        },
        set: function (v) {
          doc.file_data = v;
        },
      });
    });
    (d.daily_logs || []).forEach(function (log) {
      (log.photos || []).forEach(function (photo) {
        refs.push({
          id: photo.id,
          get: function () {
            return photo.file_data;
          },
          set: function (v) {
            photo.file_data = v;
          },
        });
      });
    });
    return refs;
  }

  /** One-time migration for data saved before blobs moved to IndexedDB: finds any
   * document/photo still carrying its file bytes inline in `file_data`, writes each to
   * IndexedDB, and nulls the field once that write succeeds \u2014 shrinking what
   * persistToLocalStorage() has to write from then on. Mutates the live `data` object
   * directly and persists when done, unlike exportToFile()'s deep-clone approach, since
   * this genuinely IS the migration of the live data, not a one-off snapshot of it.
   * Safe to call on data with nothing to migrate (resolves immediately, no-op). */
  function migrateLegacyInlineBlobsToIndexedDb() {
    var refs = collectBlobRefs(data).filter(function (r) {
      return !!r.get();
    });
    if (refs.length === 0) return Promise.resolve({ migrated: 0 });
    var writes = refs.map(function (r) {
      var val = r.get();
      return window.PCC.blobStore.putBlob(r.id, val).then(function () {
        r.set(null);
      });
    });
    return Promise.all(writes).then(function () {
      persistToLocalStorage();
      notifyListeners();
      return { migrated: refs.length };
    });
  }

  /** Async: gathers every blob (from IndexedDB, or inline for any not-yet-migrated
   * legacy record) into a deep-cloned copy of `data` and downloads that as the export
   * file \u2014 so the exported JSON stays fully self-contained and portable, same as
   * before this migration, even though the live in-memory/localStorage copy no longer
   * carries blobs inline. Never mutates the live `data`; persistToLocalStorage() at the
   * end still persists the original blob-free object. */
  function exportToFile() {
    data.meta.last_exported_at = new Date().toISOString();
    var clone = JSON.parse(JSON.stringify(data));
    var refs = collectBlobRefs(clone).filter(function (r) {
      return !r.get();
    });
    var fetches = refs.map(function (r) {
      return window.PCC.blobStore
        .getBlob(r.id)
        .then(function (val) {
          r.set(val);
        })
        .catch(function () {
          r.set(null); // missing one photo shouldn't block the whole export
        });
    });
    return Promise.all(fetches).then(function () {
      var blob = new Blob([JSON.stringify(clone, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = "project-data-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      persistToLocalStorage();
      notifyListeners();
    });
  }

  function getCorruptionRecovery() {
    return corruptionRecovery;
  }

  /** Lists any preserved corrupted-backup snapshots left in localStorage, newest first.
   * These accumulate — one per corruption event — and are only ever removed by explicit
   * user action via deleteRecoveryBackup(), never automatically, since silently pruning
   * a person's last copy of lost data would defeat the entire point of this. */
  function listRecoveryBackups() {
    var keys = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(CORRUPTED_BACKUP_PREFIX) === 0) keys.push(k);
      }
    } catch (e) {
      console.error("Could not list recovery backups", e);
    }
    return keys.sort().reverse();
  }

  function downloadRecoveryBackup(key) {
    var raw;
    try {
      raw = window.localStorage.getItem(key);
    } catch (e) {
      raw = null;
    }
    if (raw === null || raw === undefined) return false;
    var blob = new Blob([raw], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = key + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  function deleteRecoveryBackup(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.error("Could not delete recovery backup", e);
    }
  }

  /** Callback-based, same public shape as before. Internally: an imported file still
   * carries blobs inline (exportToFile() always embeds them for portability), so each
   * one gets written to IndexedDB and nulled out of the record before it's committed to
   * `data` \u2014 otherwise import would re-inflate localStorage right back to the size
   * problem this whole migration exists to fix. */
  function importFromFile(file, callback) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object" || !("schema_version" in parsed)) {
          throw new Error("This doesn't look like a Project Control Center data file.");
        }
      } catch (e) {
        callback(e);
        return;
      }

      var migrated;
      try {
        migrated = migrate(parsed);
      } catch (e) {
        callback(e);
        return;
      }

      var refs = collectBlobRefs(migrated).filter(function (r) {
        return !!r.get();
      });
      var writes = refs.map(function (r) {
        var val = r.get();
        return window.PCC.blobStore.putBlob(r.id, val).then(function () {
          r.set(null);
        });
      });

      Promise.all(writes)
        .then(function () {
          data = migrated;
          persistToLocalStorage();
          notifyListeners();
          callback(null);
        })
        .catch(function (e) {
          callback(new Error("Import partially failed while saving attached files: " + e.message));
        });
    };
    reader.onerror = function () {
      callback(new Error("Could not read that file."));
    };
    reader.readAsText(file);
  }

  function resetAll() {
    data = emptyData();
    persistToLocalStorage();
    notifyListeners();
  }

  load();

  window.PCC.store = {
    get: get,
    update: update,
    onChange: onChange,
    exportToFile: exportToFile,
    migrateLegacyInlineBlobsToIndexedDb: migrateLegacyInlineBlobsToIndexedDb,
    getCorruptionRecovery: getCorruptionRecovery,
    listRecoveryBackups: listRecoveryBackups,
    downloadRecoveryBackup: downloadRecoveryBackup,
    deleteRecoveryBackup: deleteRecoveryBackup,
    importFromFile: importFromFile,
    resetAll: resetAll,
    newProject: newProject,
    PROJECT_STATUSES: PROJECT_STATUSES,
    newDocument: newDocument,
    DOCUMENT_CATEGORIES: DOCUMENT_CATEGORIES,
    DOCUMENT_STATUSES: DOCUMENT_STATUSES,
    newDailyLog: newDailyLog,
    newDailyLogPhoto: newDailyLogPhoto,
    newRisk: newRisk,
    newMeeting: newMeeting,
    newMeetingAction: newMeetingAction,
    newMeetingRecording: newMeetingRecording,
    RISK_TYPES: RISK_TYPES,
    RISK_STATUSES: RISK_STATUSES,
    RISK_LEVELS: RISK_LEVELS,
    newRfi: newRfi,
    newRfiRevision: newRfiRevision,
    nextRfiNumber: nextRfiNumber,
    RFI_TYPES: RFI_TYPES,
    RFI_STATUSES: RFI_STATUSES,
    RFI_PRIORITIES: RFI_PRIORITIES,
    newChangeOrder: newChangeOrder,
    newChangeOrderRevision: newChangeOrderRevision,
    nextChangeOrderNumber: nextChangeOrderNumber,
    CHANGE_ORDER_STATUSES: CHANGE_ORDER_STATUSES,
    newSchedule: newSchedule,
    newWbsItem: newWbsItem,
    newActivity: newActivity,
    newRelationship: newRelationship,
    newScheduleBaseline: newScheduleBaseline,
    SCHEDULE_STATUSES: SCHEDULE_STATUSES,
    ACTIVITY_TYPES: ACTIVITY_TYPES,
    ACTIVITY_STATUSES: ACTIVITY_STATUSES,
    RELATIONSHIP_TYPES: RELATIONSHIP_TYPES,
    newCostBudgetItem: newCostBudgetItem,
    newCostActual: newCostActual,
    COST_CATEGORIES: COST_CATEGORIES,
    newExecutiveSummary: newExecutiveSummary,
    newResource: newResource,
    newResourceAssignment: newResourceAssignment,
    RESOURCE_TYPES: RESOURCE_TYPES,
    newVendor: newVendor,
    nextVendorCode: nextVendorCode,
    VENDOR_STATUSES: VENDOR_STATUSES,
    newVendorContact: newVendorContact,
    newVendorProjectLink: newVendorProjectLink,
    VENDOR_PROJECT_CONTRACT_STATUSES: VENDOR_PROJECT_CONTRACT_STATUSES,
    newVendorDocument: newVendorDocument,
    VENDOR_DOCUMENT_CATEGORIES: VENDOR_DOCUMENT_CATEGORIES,
    newVendorMeetingLink: newVendorMeetingLink,
    newVendorRfiLink: newVendorRfiLink,
    newVendorRiskLink: newVendorRiskLink,
    newVendorPerformance: newVendorPerformance,
    newVendorNote: newVendorNote,
    newDocumentType: newDocumentType,
    DOCUMENT_TYPE_CRITICALITY_LEVELS: DOCUMENT_TYPE_CRITICALITY_LEVELS,
    newProjectDocumentRequirement: newProjectDocumentRequirement,
    PROJECT_TEMPLATES: PROJECT_TEMPLATES,
  };
})();
