/* Vendor Management — Gate 9.
 *
 * The "single source of truth" for vendor information across all projects. Vendor
 * Master is portfolio-wide (like Projects themselves), not scoped to a single project
 * the way Documents/Risk/RFI/Change Orders are — see store.js's Gate 9 section header
 * for why every vendor<->X relationship here is its own flat join array. Meetings/
 * RFIs/Risks are linked to a vendor entirely from this module's side: linking never
 * touches meetings.js/rfis.js/risks.js's own schemas, and "open the real record"
 * reuses their existing public expandMeeting()/expandRfi()/expandRisk() hooks (the
 * same hooks Risk's own "raise from meeting" flow already uses) instead of adding new
 * fields there.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var VENDOR_STATUS_LABELS = { active: "Active", inactive: "Inactive", preferred: "Preferred Vendor", blacklisted: "Blacklisted" };
  var CONTRACT_STATUS_LABELS = { draft: "Draft", active: "Active", completed: "Completed", terminated: "Terminated" };
  var VENDOR_DOCUMENT_CATEGORY_LABELS = {
    mom: "Minutes of Meeting (M.O.M.)",
    boq: "BOQ (Bill of Quantities)",
    escalation_matrix: "Escalation Matrix",
    contract: "Contract",
    purchase_order: "Purchase Order",
    quotation: "Quotation",
    technical_submittal: "Technical Submittal",
    material_approval: "Material Approval",
    drawing: "Drawing",
    method_statement: "Method Statement",
    inspection_report: "Inspection Report",
    test_certificate: "Test Certificate",
    quality_document: "Quality Document",
    safety_document: "Safety Document",
    insurance_document: "Insurance Document",
    bank_details: "Bank Details",
    invoice: "Invoice",
    performance_report: "Performance Report",
    other: "Other",
  };
  var RFI_TYPE_LABELS = { rfi: "RFI", technical_query: "Technical Query" };
  var RFI_STATUS_LABELS = { open: "Open", answered: "Answered", closed: "Closed" };
  var EXPIRING_SOON_DAYS = 30;

  // Gate E (Planning & Scheduling-Centric Delay Management, spec point 24 — Vendor
  // Integration). Same category keys/labels schedule.js's own DELAY_CATEGORY_LABELS
  // uses, duplicated per this app's established per-module-helpers convention (see this
  // file's own header comment on why every vendor<->X view stays self-contained).
  var VENDOR_DELAY_CATEGORY_LABELS = {
    late_material: "Late Material",
    late_vendor_submission: "Late Vendor Submission",
    late_drawing: "Late Drawing",
    design_change: "Design Change",
    client_delay: "Client Delay",
    consultant_delay: "Consultant Delay",
    vendor_delay: "Vendor Delay",
    contractor_delay: "Contractor Delay",
    approval_delay: "Approval Delay",
    rfi_delay: "RFI Delay",
    resource_shortage: "Resource Shortage",
    equipment_shortage: "Equipment Shortage",
    site_access: "Site Access",
    site_constraint: "Site Constraint",
    interface_issue: "Interface Issue",
    weather: "Weather",
    procurement: "Procurement",
    quality_issue: "Quality Issue",
    rework: "Rework",
    change_variation: "Change / Variation",
    other: "Other",
  };

  /** Gate E (spec point 24): "Vendor information should support delay analysis... Open
   * Delays, Critical, Delay Events, Total Delay Days" — computed fresh from
   * data.delay_records/delay_activity_links every time, never a stored/cached score.
   * Deliberately NO invented performance score here (spec's own explicit instruction:
   * "Do NOT create an arbitrary vendor performance score unless its methodology is
   * explicitly defined") — every number below is a plain, explainable count or sum. */
  function computeVendorDelayStats(vendor, data) {
    var vendorDelays = data.delay_records.filter(function (r) {
      return r.vendor_id === vendor.id;
    });
    var openCount = vendorDelays.filter(function (r) {
      return r.status !== "closed" && r.status !== "recovered";
    }).length;
    var totalDelayDays = vendorDelays.reduce(function (sum, r) {
      return sum + (r.delay_days || 0);
    }, 0);
    var criticalCount = 0;
    var causeCounts = {};
    vendorDelays.forEach(function (r) {
      var links = data.delay_activity_links.filter(function (l) {
        return l.delay_id === r.id;
      });
      var impact = window.PCC.delayImpactEngine.computeDelayImpact(r, links, data);
      if (impact.overall_criticality === "critical") criticalCount++;
      var cat = r.delay_category || "other";
      causeCounts[cat] = (causeCounts[cat] || 0) + 1;
    });
    var delayIds = {};
    vendorDelays.forEach(function (r) {
      delayIds[r.id] = true;
    });
    var recoveryActionsCount = data.recovery_actions.filter(function (ra) {
      return ra.delay_id && delayIds[ra.delay_id];
    }).length;
    // "Repeated" causes only — a single one-off event isn't a pattern worth flagging.
    var repeatedCauses = Object.keys(causeCounts)
      .filter(function (k) {
        return causeCounts[k] > 1;
      })
      .sort(function (a, b) {
        return causeCounts[b] - causeCounts[a];
      })
      .map(function (k) {
        return (VENDOR_DELAY_CATEGORY_LABELS[k] || k) + " (" + causeCounts[k] + ")";
      });
    return {
      totalEvents: vendorDelays.length,
      openCount: openCount,
      criticalCount: criticalCount,
      totalDelayDays: totalDelayDays,
      recoveryActionsCount: recoveryActionsCount,
      repeatedCauses: repeatedCauses,
    };
  }

  var VENDOR_FIELD_CONFIG = [
    { key: "vendor_code", label: "Vendor Code", type: "text" },
    { key: "vendor_name", label: "Vendor Name", type: "text", required: true },
    { key: "company_name", label: "Company Name", type: "text" },
    { key: "category", label: "Vendor Category", type: "text" },
    { key: "trade_discipline", label: "Trade / Discipline", type: "text" },
    { key: "gst_number", label: "GST Number", type: "text" },
    { key: "pan_number", label: "PAN Number", type: "text" },
    { key: "registration_number", label: "Registration Number", type: "text" },
    { key: "website", label: "Website", type: "text" },
  ];
  var VENDOR_ADDRESS_FIELD_CONFIG = [
    { key: "office_address", label: "Office Address", type: "text" },
    { key: "city", label: "City", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "country", label: "Country", type: "text" },
    { key: "postal_code", label: "Postal Code", type: "text" },
  ];

  var uiState = {
    view: "dashboard", // 'dashboard' | 'list' | 'profile'
    // Master list
    search: "",
    statusFilter: "",
    projectFilter: "",
    // Redesign Gate 6 (Global Project Context): see risks.js's own uiState comment.
    projectFilterInitialized: false,
    tradeFilter: "",
    docTypeFilter: "",
    editingVendorId: null, // vendor id, 'new', or null
    // Profile
    profileVendorId: null,
    profileTab: "overview",
    editingContactId: null,
    editingProjectLinkId: null,
    editingPerformanceId: null,
    editingNoteId: null,
    noteDraftText: "",
    // Documents tab
    uploadFormOpen: false,
    pendingDocFile: null, // { name, size, type, fileData, hash, hashMethod }
    pendingDocCategory: "other",
    pendingDocCustomCategory: "",
    pendingDocProjectId: "",
    pendingDocExpiry: "",
    pendingDocTags: "",
    pendingDocComments: "",
    pendingDocGroupId: null, // set when uploading a new revision of an existing document
    pendingDocReadError: null,
    expandedDocGroupId: null,
    // Link pickers (Meetings / RFIs / Risks tabs)
    meetingPickerOpen: false,
    rfiPickerOpen: false,
    riskPickerOpen: false,
  };

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    var kb = bytes / 1024;
    if (kb < 1024) return Math.round(kb) + " KB";
    return (kb / 1024).toFixed(1) + " MB";
  }

  /** Base64-encodes an ArrayBuffer in fixed-size chunks — same approach documents.js
   * and schedule.js already each keep their own copy of, matching this codebase's
   * per-module-copy convention over a shared utils file. */
  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunkSize = 8192;
    var chunks = [];
    for (var i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
    }
    return btoa(chunks.join(""));
  }

  function projectName(projects, projectId) {
    if (!projectId) return "—";
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "(deleted project)";
  }

  function vendorName(vendors, vendorId) {
    var v = vendors.find(function (x) {
      return x.id === vendorId;
    });
    return v ? v.vendor_name || "(unnamed vendor)" : "(deleted vendor)";
  }

  function daysUntil(isoDate) {
    if (!isoDate) return null;
    var ms = new Date(isoDate + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  /** The four sub-ratings are the only stored values — overall is always their average,
   * computed here rather than trusted from a separately-editable field (see
   * newVendorPerformance's comment in store.js). Ratings of 0 mean "not rated" and are
   * excluded from the average so an unrated category doesn't drag the score toward 0. */
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

  function latestDocumentsForVendor(allVendorDocs, vendorId) {
    var groups = {};
    allVendorDocs
      .filter(function (d) {
        return d.vendor_id === vendorId;
      })
      .forEach(function (d) {
        var key = d.document_group_id || d.id;
        if (!groups[key] || d.revision_number > groups[key].revision_number) groups[key] = d;
      });
    return Object.keys(groups)
      .map(function (k) {
        return groups[k];
      })
      .sort(function (a, b) {
        return (b.upload_date || "").localeCompare(a.upload_date || "");
      });
  }

  function documentLabel(doc) {
    if (doc.category === "other" && doc.custom_category_label) return doc.custom_category_label;
    return VENDOR_DOCUMENT_CATEGORY_LABELS[doc.category] || doc.category;
  }

  /** Reconstructs a stored vendor document from blobStore and opens it in the shared
   * in-app viewer (fileViewer.js) — same approach documents.js and dailyLog.js use, kept
   * consistent app-wide rather than building a separate preview here. */
  function openStoredVendorDocument(doc) {
    window.PCC.loadingIndicator.show("Opening file…");
    window.PCC.blobStore
      .getBlob(doc.id)
      .then(function (fileData) {
        window.PCC.loadingIndicator.hide();
        if (!fileData) {
          window.PCC.notify("No file was stored for this document.", "warning");
          return;
        }
        var commaIdx = fileData.indexOf(",");
        var meta = fileData.slice(0, commaIdx);
        var b64 = fileData.slice(commaIdx + 1);
        var mimeMatch = /data:(.*);base64/.exec(meta);
        var mime = mimeMatch ? mimeMatch[1] : doc.mime_type || "application/octet-stream";
        var binary = atob(b64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var blob = new Blob([bytes], { type: mime });
        window.PCC.fileViewer.open({ filename: doc.filename, mimeType: mime, blob: blob });
      })
      .catch(function (e) {
        window.PCC.loadingIndicator.hide();
        window.PCC.notify("Could not open this file: " + e.message, "error");
      });
  }

  // ---------------------------------------------------------------------------------
  // Vendor Master form
  // ---------------------------------------------------------------------------------

  function buildField(cfg, record, idPrefix) {
    var field = document.createElement("div");
    field.className = "field";
    var label = document.createElement("label");
    label.textContent = cfg.label + (cfg.required ? " *" : "");
    label.setAttribute("for", idPrefix + cfg.key);
    field.appendChild(label);

    var input;
    if (cfg.type === "select") {
      input = document.createElement("select");
      cfg.options.forEach(function (val) {
        var opt = document.createElement("option");
        opt.value = val;
        opt.textContent = cfg.labels[val] || val;
        input.appendChild(opt);
      });
      input.value = record[cfg.key] || cfg.options[0];
    } else if (cfg.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
      input.value = record[cfg.key] || "";
    } else {
      input = document.createElement("input");
      input.type = cfg.type;
      input.value = record[cfg.key] || "";
    }
    input.id = idPrefix + cfg.key;
    input.name = cfg.key;
    if (cfg.required) input.required = true;
    field.appendChild(input);
    return field;
  }

  function readFieldValues(formEl, fieldConfig, idPrefix) {
    var values = {};
    fieldConfig.forEach(function (cfg) {
      var el = formEl.querySelector("#" + idPrefix + cfg.key);
      if (el) values[cfg.key] = el.value;
    });
    return values;
  }

  function renderVendorForm(container, vendor, data, rerender) {
    var isNew = uiState.editingVendorId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
    heading.textContent = isNew ? "Add Vendor" : "Edit Vendor";
    panel.appendChild(heading);

    var form = document.createElement("form");

    var basicHeading = document.createElement("p");
    basicHeading.className = "text-secondary";
    basicHeading.style.fontSize = "var(--text-sm)";
    basicHeading.style.fontWeight = "600";
    basicHeading.style.marginBottom = "var(--space-2)";
    basicHeading.textContent = "BASIC INFORMATION";
    form.appendChild(basicHeading);

    var basicGrid = document.createElement("div");
    basicGrid.className = "form-grid";
    VENDOR_FIELD_CONFIG.forEach(function (cfg) {
      basicGrid.appendChild(buildField(cfg, vendor, "vendorfield-"));
    });
    form.appendChild(basicGrid);

    var existingPrimaryContact = data.vendor_contacts.find(function (c) {
      return c.vendor_id === vendor.id && c.is_primary;
    }) || { name: "", designation: "", mobile: "", email: "" };

    var contactHeading = document.createElement("p");
    contactHeading.className = "text-secondary";
    contactHeading.style.fontSize = "var(--text-sm)";
    contactHeading.style.fontWeight = "600";
    contactHeading.style.marginTop = "var(--space-4)";
    contactHeading.style.marginBottom = "var(--space-2)";
    contactHeading.textContent = "PRIMARY CONTACT (more contacts can be added from the vendor's Contacts tab after saving)";
    form.appendChild(contactHeading);

    var contactGrid = document.createElement("div");
    contactGrid.className = "form-grid";
    var contactFields = [
      { key: "name", label: "Contact Person" },
      { key: "designation", label: "Designation" },
      { key: "mobile", label: "Mobile Number" },
      { key: "email", label: "Email Address" },
    ];
    contactFields.forEach(function (cfg) {
      contactGrid.appendChild(
        buildField({ key: cfg.key, label: cfg.label, type: cfg.key === "email" ? "email" : "text" }, existingPrimaryContact, "vendorfield-contact-")
      );
    });
    form.appendChild(contactGrid);

    var addressHeading = document.createElement("p");
    addressHeading.className = "text-secondary";
    addressHeading.style.fontSize = "var(--text-sm)";
    addressHeading.style.fontWeight = "600";
    addressHeading.style.marginTop = "var(--space-4)";
    addressHeading.style.marginBottom = "var(--space-2)";
    addressHeading.textContent = "ADDRESS";
    form.appendChild(addressHeading);

    var addressGrid = document.createElement("div");
    addressGrid.className = "form-grid";
    VENDOR_ADDRESS_FIELD_CONFIG.forEach(function (cfg) {
      addressGrid.appendChild(buildField(cfg, vendor, "vendorfield-"));
    });
    form.appendChild(addressGrid);

    var statusGrid = document.createElement("div");
    statusGrid.className = "form-grid";
    statusGrid.style.marginTop = "var(--space-4)";
    statusGrid.appendChild(
      buildField({ key: "status", label: "Status", type: "select", options: window.PCC.store.VENDOR_STATUSES, labels: VENDOR_STATUS_LABELS }, vendor, "vendorfield-")
    );
    // PCC Evolution Roadmap, Tier E: Personal Workbench ("Vendor Follow-ups" section) —
    // a manual reminder date, independent of any document due-date computation.
    statusGrid.appendChild(buildField({ key: "next_follow_up_date", label: "Next Follow-up Date", type: "date" }, vendor, "vendorfield-"));
    form.appendChild(statusGrid);

    var notesField = document.createElement("div");
    notesField.className = "field";
    notesField.style.marginTop = "var(--space-3)";
    notesField.innerHTML = "<label>Notes</label>";
    var notesArea = document.createElement("textarea");
    notesArea.id = "vendorfield-notes";
    notesArea.rows = 2;
    notesArea.value = vendor.notes || "";
    notesField.appendChild(notesArea);
    form.appendChild(notesField);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "var(--text-sm)";
    errorMsg.style.display = "none";
    errorMsg.style.marginTop = "var(--space-3)";
    errorMsg.textContent = "Vendor Name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-4)";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Vendor" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingVendorId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var values = readFieldValues(form, VENDOR_FIELD_CONFIG, "vendorfield-");
      Object.assign(values, readFieldValues(form, VENDOR_ADDRESS_FIELD_CONFIG, "vendorfield-"));
      values.status = form.querySelector("#vendorfield-status").value;
      values.next_follow_up_date = form.querySelector("#vendorfield-next_follow_up_date").value;
      values.notes = notesArea.value;

      if (!values.vendor_name || !values.vendor_name.trim()) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var contactValues = {
        name: form.querySelector("#vendorfield-contact-name").value.trim(),
        designation: form.querySelector("#vendorfield-contact-designation").value.trim(),
        mobile: form.querySelector("#vendorfield-contact-mobile").value.trim(),
        email: form.querySelector("#vendorfield-contact-email").value.trim(),
      };
      var contactProvided = contactValues.name || contactValues.designation || contactValues.mobile || contactValues.email;

      window.PCC.store.update(function (d) {
        var vendorId;
        if (isNew) {
          var newV = window.PCC.store.newVendor(values);
          d.vendors.push(newV);
          vendorId = newV.id;
        } else {
          var existing = d.vendors.find(function (v) {
            return v.id === vendor.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
          vendorId = vendor.id;
        }

        if (contactProvided) {
          var primary = d.vendor_contacts.find(function (c) {
            return c.vendor_id === vendorId && c.is_primary;
          });
          if (primary) {
            Object.assign(primary, contactValues);
            primary.updated_at = new Date().toISOString();
          } else {
            d.vendor_contacts.push(window.PCC.store.newVendorContact(Object.assign({ vendor_id: vendorId, is_primary: true }, contactValues)));
          }
        }

        uiState._savedVendorId = vendorId;
      });

      window.PCC.notify(isNew ? "Vendor added." : "Vendor updated.", "success");
      uiState.editingVendorId = null;
      if (isNew) {
        uiState.view = "profile";
        uiState.profileVendorId = uiState._savedVendorId;
        uiState.profileTab = "overview";
      }
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  // ---------------------------------------------------------------------------------
  // Vendor Master list (search + filters)
  // ---------------------------------------------------------------------------------

  function vendorHaystack(v, data) {
    var contacts = data.vendor_contacts.filter(function (c) {
      return c.vendor_id === v.id;
    });
    var projectLinks = data.vendor_project_links.filter(function (l) {
      return l.vendor_id === v.id;
    });
    var docs = data.vendor_documents.filter(function (d) {
      return d.vendor_id === v.id;
    });
    var parts = [
      v.vendor_name, v.company_name, v.category, v.trade_discipline, v.vendor_code,
      contacts.map(function (c) { return c.name; }).join(" "),
      projectLinks.map(function (l) { return projectName(data.projects, l.project_id); }).join(" "),
      docs.map(function (d) { return d.filename; }).join(" "),
    ];
    return parts.join(" ").toLowerCase();
  }

  function vendorMatchesFilters(v, data) {
    if (uiState.statusFilter && v.status !== uiState.statusFilter) return false;
    if (uiState.projectFilter) {
      var hasProject = data.vendor_project_links.some(function (l) {
        return l.vendor_id === v.id && l.project_id === uiState.projectFilter;
      });
      if (!hasProject) return false;
    }
    if (uiState.tradeFilter && (v.trade_discipline || "").toLowerCase() !== uiState.tradeFilter.toLowerCase()) return false;
    if (uiState.docTypeFilter) {
      var hasDocType = data.vendor_documents.some(function (d) {
        return d.vendor_id === v.id && d.category === uiState.docTypeFilter;
      });
      if (!hasDocType) return false;
    }
    if (uiState.search) {
      if (vendorHaystack(v, data).indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function statusBadgeClass(status) {
    if (status === "preferred") return "status-badge status-badge--on_track";
    if (status === "blacklisted") return "status-badge status-badge--critical";
    if (status === "inactive") return "status-badge status-badge--complete";
    return "status-badge status-badge--info"; // active
  }

  function renderVendorCard(v, data, rerender) {
    var card = document.createElement("div");
    card.className = "project-card";

    var top = document.createElement("div");
    top.style.display = "flex";
    top.style.justifyContent = "space-between";
    top.style.alignItems = "flex-start";
    top.style.gap = "var(--space-3)";

    var titleBlock = document.createElement("div");
    var titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.alignItems = "center";
    titleRow.style.gap = "var(--space-2)";
    var name = document.createElement("strong");
    name.textContent = v.vendor_name || "(unnamed vendor)";
    titleRow.appendChild(name);
    var badge = document.createElement("span");
    badge.className = statusBadgeClass(v.status);
    badge.textContent = VENDOR_STATUS_LABELS[v.status] || v.status;
    titleRow.appendChild(badge);
    titleBlock.appendChild(titleRow);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.fontSize = "var(--text-sm)";
    sub.style.margin = "var(--space-1) 0 0";
    var projectCount = data.vendor_project_links.filter(function (l) {
      return l.vendor_id === v.id;
    }).length;
    sub.textContent =
      [v.vendor_code, v.company_name, v.trade_discipline].filter(Boolean).join(" · ") +
      (v.vendor_code || v.company_name || v.trade_discipline ? " · " : "") +
      projectCount + " project" + (projectCount === 1 ? "" : "s");
    titleBlock.appendChild(sub);
    top.appendChild(titleBlock);

    var btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "var(--space-2)";
    btnRow.style.flexShrink = "0";

    var viewBtn = document.createElement("button");
    viewBtn.className = "btn btn--primary";
    viewBtn.textContent = "View Profile";
    viewBtn.onclick = function () {
      uiState.view = "profile";
      uiState.profileVendorId = v.id;
      uiState.profileTab = "overview";
      rerender();
    };
    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingVendorId = v.id;
      rerender();
    };
    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      if (!window.confirm('Delete vendor "' + v.vendor_name + '"? This also removes its contacts, project links, documents, and performance/notes history. This can\'t be undone.')) return;
      var docIds = data.vendor_documents.filter(function (d) { return d.vendor_id === v.id; }).map(function (d) { return d.id; });
      window.PCC.store.update(function (d) {
        d.vendors = d.vendors.filter(function (x) { return x.id !== v.id; });
        d.vendor_contacts = d.vendor_contacts.filter(function (x) { return x.vendor_id !== v.id; });
        d.vendor_project_links = d.vendor_project_links.filter(function (x) { return x.vendor_id !== v.id; });
        d.vendor_documents = d.vendor_documents.filter(function (x) { return x.vendor_id !== v.id; });
        d.vendor_meeting_links = d.vendor_meeting_links.filter(function (x) { return x.vendor_id !== v.id; });
        d.vendor_rfi_links = d.vendor_rfi_links.filter(function (x) { return x.vendor_id !== v.id; });
        d.vendor_risk_links = d.vendor_risk_links.filter(function (x) { return x.vendor_id !== v.id; });
        d.vendor_performance = d.vendor_performance.filter(function (x) { return x.vendor_id !== v.id; });
        d.vendor_notes = d.vendor_notes.filter(function (x) { return x.vendor_id !== v.id; });
      });
      docIds.forEach(function (id) {
        window.PCC.blobStore.deleteBlob(id).catch(function () {});
      });
      window.PCC.notify("Vendor deleted.", "success");
      if (uiState.profileVendorId === v.id) {
        uiState.view = "list";
        uiState.profileVendorId = null;
      }
      rerender();
    };
    btnRow.appendChild(viewBtn);
    btnRow.appendChild(editBtn);
    btnRow.appendChild(deleteBtn);
    top.appendChild(btnRow);

    card.appendChild(top);
    return card;
  }

  function renderVendorList(container, data, rerender) {
    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search vendor, company, contact, trade, project, document…";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      renderList();
    };

    var statusSelect = document.createElement("select");
    var allStatusOpt = document.createElement("option");
    allStatusOpt.value = "";
    allStatusOpt.textContent = "All statuses";
    statusSelect.appendChild(allStatusOpt);
    window.PCC.store.VENDOR_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = VENDOR_STATUS_LABELS[s];
      statusSelect.appendChild(opt);
    });
    statusSelect.value = uiState.statusFilter;
    statusSelect.onchange = function () {
      uiState.statusFilter = statusSelect.value;
      renderList();
    };

    var projSelect = document.createElement("select");
    var allProjOpt = document.createElement("option");
    allProjOpt.value = "";
    allProjOpt.textContent = "All projects";
    projSelect.appendChild(allProjOpt);
    data.projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projSelect.appendChild(opt);
    });
    projSelect.value = uiState.projectFilter;
    projSelect.onchange = function () {
      uiState.projectFilter = projSelect.value;
      if (uiState.projectFilter) window.PCC.projectContext.set(uiState.projectFilter);
      renderList();
    };

    var tradeSelect = document.createElement("select");
    var allTradeOpt = document.createElement("option");
    allTradeOpt.value = "";
    allTradeOpt.textContent = "All trades";
    tradeSelect.appendChild(allTradeOpt);
    var distinctTrades = Array.from(
      new Set(data.vendors.map(function (v) { return (v.trade_discipline || "").trim(); }).filter(Boolean))
    ).sort();
    distinctTrades.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      tradeSelect.appendChild(opt);
    });
    tradeSelect.value = uiState.tradeFilter;
    tradeSelect.onchange = function () {
      uiState.tradeFilter = tradeSelect.value;
      renderList();
    };

    var docTypeSelect = document.createElement("select");
    var allDocTypeOpt = document.createElement("option");
    allDocTypeOpt.value = "";
    allDocTypeOpt.textContent = "All document types";
    docTypeSelect.appendChild(allDocTypeOpt);
    window.PCC.store.VENDOR_DOCUMENT_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = VENDOR_DOCUMENT_CATEGORY_LABELS[c];
      docTypeSelect.appendChild(opt);
    });
    docTypeSelect.value = uiState.docTypeFilter;
    docTypeSelect.onchange = function () {
      uiState.docTypeFilter = docTypeSelect.value;
      renderList();
    };

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Vendor";
    addBtn.onclick = function () {
      uiState.editingVendorId = "new";
      rerender();
    };

    toolbar.appendChild(searchInput);
    toolbar.appendChild(statusSelect);
    toolbar.appendChild(projSelect);
    toolbar.appendChild(tradeSelect);
    toolbar.appendChild(docTypeSelect);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    if (uiState.editingVendorId) {
      var vendorBeingEdited =
        uiState.editingVendorId === "new"
          ? window.PCC.store.newVendor({ vendor_code: window.PCC.store.nextVendorCode(data.vendors) })
          : data.vendors.find(function (v) {
              return v.id === uiState.editingVendorId;
            });
      if (vendorBeingEdited) renderVendorForm(container, vendorBeingEdited, data, rerender);
    }

    var listWrap = document.createElement("div");
    container.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.vendors.filter(function (v) {
        return vendorMatchesFilters(v, data);
      });

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent = data.vendors.length === 0 ? "No vendors yet. Click “+ Add Vendor” to create your first one." : "No vendors match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (v) {
        list.appendChild(renderVendorCard(v, data, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  // ---------------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------------

  function summaryCard(label, value, sub) {
    var card = document.createElement("div");
    card.className = "panel";
    var lab = document.createElement("p");
    lab.className = "text-secondary";
    lab.style.fontSize = "var(--text-xs)";
    lab.style.marginBottom = "var(--space-2)";
    lab.textContent = label.toUpperCase();
    card.appendChild(lab);
    var val = document.createElement("p");
    val.style.fontSize = "var(--text-2xl)";
    val.style.fontWeight = "600";
    val.style.margin = "0";
    val.textContent = value;
    card.appendChild(val);
    if (sub) {
      var subEl = document.createElement("div");
      subEl.style.marginTop = "var(--space-2)";
      if (typeof sub === "string") {
        subEl.className = "text-secondary";
        subEl.style.fontSize = "var(--text-sm)";
        subEl.textContent = sub;
      } else {
        subEl.appendChild(sub);
      }
      card.appendChild(subEl);
    }
    return card;
  }

  function miniList(items) {
    var wrap = document.createElement("div");
    if (items.length === 0) {
      var none = document.createElement("p");
      none.className = "text-secondary";
      none.style.fontSize = "var(--text-sm)";
      none.textContent = "None.";
      wrap.appendChild(none);
      return wrap;
    }
    items.forEach(function (text) {
      var p = document.createElement("p");
      p.style.fontSize = "var(--text-sm)";
      p.style.margin = "0 0 var(--space-1)";
      p.textContent = text;
      wrap.appendChild(p);
    });
    return wrap;
  }

  function renderDashboard(container, data, rerender) {
    var h3 = document.createElement("h3");
    h3.style.marginBottom = "var(--space-3)";
    h3.textContent = "Vendor Dashboard";
    container.appendChild(h3);

    var cardsGrid = document.createElement("div");
    cardsGrid.style.display = "grid";
    cardsGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 1fr))";
    cardsGrid.style.gap = "var(--space-3)";
    cardsGrid.style.marginBottom = "var(--space-5)";

    var activeCount = data.vendors.filter(function (v) { return v.status === "active"; }).length;
    var preferredCount = data.vendors.filter(function (v) { return v.status === "preferred"; }).length;

    var perProject = {};
    data.vendor_project_links.forEach(function (l) {
      perProject[l.project_id] = perProject[l.project_id] || {};
      perProject[l.project_id][l.vendor_id] = true;
    });
    var perProjectRows = Object.keys(perProject)
      .map(function (pid) {
        return { projectId: pid, count: Object.keys(perProject[pid]).length };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, 5)
      .map(function (row) {
        return projectName(data.projects, row.projectId) + " — " + row.count + " vendor" + (row.count === 1 ? "" : "s");
      });

    var allLatestByVendor = [];
    data.vendors.forEach(function (v) {
      allLatestByVendor = allLatestByVendor.concat(latestDocumentsForVendor(data.vendor_documents, v.id));
    });

    var expiring = allLatestByVendor
      .filter(function (d) {
        if (!d.expiry_date) return false;
        var diff = daysUntil(d.expiry_date);
        return diff !== null && diff <= EXPIRING_SOON_DAYS;
      })
      .sort(function (a, b) {
        return a.expiry_date.localeCompare(b.expiry_date);
      });

    var recentUploads = data.vendor_documents
      .slice()
      .sort(function (a, b) {
        return (b.upload_date || "").localeCompare(a.upload_date || "");
      })
      .slice(0, 5);

    cardsGrid.appendChild(summaryCard("Total Vendors", data.vendors.length));
    cardsGrid.appendChild(summaryCard("Active Vendors", activeCount));
    cardsGrid.appendChild(summaryCard("Preferred Vendors", preferredCount));
    cardsGrid.appendChild(summaryCard("Vendors per Project", perProjectRows.length, miniList(perProjectRows)));
    cardsGrid.appendChild(
      summaryCard(
        "Expiring Documents (≤" + EXPIRING_SOON_DAYS + "d)",
        expiring.length,
        miniList(
          expiring.slice(0, 5).map(function (d) {
            var diff = daysUntil(d.expiry_date);
            return vendorName(data.vendors, d.vendor_id) + " — " + documentLabel(d) + " — " + (diff < 0 ? "expired " + Math.abs(diff) + "d ago" : diff + "d left");
          })
        )
      )
    );
    cardsGrid.appendChild(
      summaryCard(
        "Recently Uploaded Documents",
        recentUploads.length,
        miniList(
          recentUploads.map(function (d) {
            return vendorName(data.vendors, d.vendor_id) + " — " + documentLabel(d);
          })
        )
      )
    );
    container.appendChild(cardsGrid);

    var activityPanel = document.createElement("div");
    activityPanel.className = "panel";
    var activityHeading = document.createElement("h3");
    activityHeading.style.marginBottom = "var(--space-3)";
    activityHeading.textContent = "Recent Activity";
    activityPanel.appendChild(activityHeading);

    var activityGrid = document.createElement("div");
    activityGrid.style.display = "grid";
    activityGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 1fr))";
    activityGrid.style.gap = "var(--space-4)";

    function activityColumn(title, items) {
      var col = document.createElement("div");
      var t = document.createElement("p");
      t.style.fontSize = "var(--text-sm)";
      t.style.fontWeight = "600";
      t.style.marginBottom = "var(--space-2)";
      t.textContent = title;
      col.appendChild(t);
      col.appendChild(miniList(items));
      return col;
    }

    var recentVendors = data.vendors
      .slice()
      .sort(function (a, b) {
        return (b.created_at || "").localeCompare(a.created_at || "");
      })
      .slice(0, 5)
      .map(function (v) {
        return v.vendor_name + " (" + new Date(v.created_at).toLocaleDateString() + ")";
      });

    var recentlyUpdated = data.vendors
      .filter(function (v) {
        return v.updated_at !== v.created_at;
      })
      .sort(function (a, b) {
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      })
      .slice(0, 5)
      .map(function (v) {
        return v.vendor_name + " (" + new Date(v.updated_at).toLocaleDateString() + ")";
      });

    activityGrid.appendChild(activityColumn("Recently Added Vendors", recentVendors));
    activityGrid.appendChild(
      activityColumn(
        "Recently Uploaded Documents",
        recentUploads.map(function (d) {
          return vendorName(data.vendors, d.vendor_id) + " — " + documentLabel(d) + " (" + (d.upload_date || "").slice(0, 10) + ")";
        })
      )
    );
    activityGrid.appendChild(activityColumn("Recently Updated Vendor Information", recentlyUpdated));

    activityPanel.appendChild(activityGrid);
    container.appendChild(activityPanel);
  }

  // ---------------------------------------------------------------------------------
  // Vendor Profile
  // ---------------------------------------------------------------------------------

  function profileTabBar(vendor, container, rerender) {
    var bar = document.createElement("div");
    bar.className = "tab-bar";
    bar.style.marginTop = "var(--space-4)";
    bar.style.marginBottom = "var(--space-4)";
    [
      { key: "overview", label: "Overview" },
      { key: "projects", label: "Projects" },
      { key: "contacts", label: "Contacts" },
      { key: "documents", label: "Documents" },
      { key: "meetings", label: "Meetings" },
      { key: "rfis", label: "RFI / TQ" },
      { key: "risks", label: "Risks" },
      { key: "performance", label: "Performance" },
      { key: "notes", label: "Notes" },
      { key: "lookahead", label: "Document Lookahead" },
      { key: "activities", label: "Activities" },
    ].forEach(function (t) {
      var btn = document.createElement("button");
      btn.className = "tab-btn" + (uiState.profileTab === t.key ? " tab-btn--active" : "");
      btn.textContent = t.label;
      btn.onclick = function () {
        uiState.profileTab = t.key;
        rerender();
      };
      bar.appendChild(btn);
    });
    container.appendChild(bar);
  }

  function renderOverviewTab(container, vendor, data) {
    var panel = document.createElement("div");
    panel.className = "panel";

    var grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
    grid.style.gap = "var(--space-4)";

    function row(label, value) {
      var d = document.createElement("div");
      var l = document.createElement("p");
      l.className = "text-secondary";
      l.style.fontSize = "var(--text-xs)";
      l.style.marginBottom = "2px";
      l.textContent = label.toUpperCase();
      var v = document.createElement("p");
      v.style.margin = "0";
      v.textContent = value || "—";
      d.appendChild(l);
      d.appendChild(v);
      return d;
    }

    grid.appendChild(row("Vendor Code", vendor.vendor_code));
    grid.appendChild(row("Company Name", vendor.company_name));
    grid.appendChild(row("Category", vendor.category));
    grid.appendChild(row("Trade / Discipline", vendor.trade_discipline));
    grid.appendChild(row("GST Number", vendor.gst_number));
    grid.appendChild(row("PAN Number", vendor.pan_number));
    grid.appendChild(row("Registration Number", vendor.registration_number));
    grid.appendChild(row("Website", vendor.website));
    grid.appendChild(
      row("Address", [vendor.office_address, vendor.city, vendor.state, vendor.country, vendor.postal_code].filter(Boolean).join(", "))
    );
    grid.appendChild(row("Next Follow-up Date", vendor.next_follow_up_date));
    panel.appendChild(grid);

    if (vendor.notes) {
      var notesP = document.createElement("p");
      notesP.style.marginTop = "var(--space-4)";
      notesP.style.whiteSpace = "pre-wrap";
      notesP.textContent = vendor.notes;
      panel.appendChild(notesP);
    }

    var statsRow = document.createElement("div");
    statsRow.style.display = "flex";
    statsRow.style.gap = "var(--space-5)";
    statsRow.style.marginTop = "var(--space-4)";
    statsRow.style.flexWrap = "wrap";

    function stat(label, count) {
      var s = document.createElement("div");
      s.innerHTML = "<strong>" + count + "</strong> <span class='text-secondary' style='font-size:12px'>" + label + "</span>";
      return s;
    }
    statsRow.appendChild(stat("Projects", data.vendor_project_links.filter(function (l) { return l.vendor_id === vendor.id; }).length));
    statsRow.appendChild(stat("Contacts", data.vendor_contacts.filter(function (c) { return c.vendor_id === vendor.id; }).length));
    statsRow.appendChild(stat("Documents", latestDocumentsForVendor(data.vendor_documents, vendor.id).length));
    statsRow.appendChild(stat("Meetings", data.vendor_meeting_links.filter(function (l) { return l.vendor_id === vendor.id; }).length));
    statsRow.appendChild(stat("RFI / TQ", data.vendor_rfi_links.filter(function (l) { return l.vendor_id === vendor.id; }).length));
    statsRow.appendChild(stat("Risks", data.vendor_risk_links.filter(function (l) { return l.vendor_id === vendor.id; }).length));
    panel.appendChild(statsRow);

    // Gate E (Delay Management, spec point 24): shown only when this vendor actually
    // has delay history — an empty section for every vendor that's never caused one
    // would just be clutter, not information.
    var delayStats = computeVendorDelayStats(vendor, data);
    if (delayStats.totalEvents > 0) {
      var delayHeading = document.createElement("p");
      delayHeading.className = "text-secondary";
      delayHeading.style.fontSize = "11px";
      delayHeading.style.fontWeight = "600";
      delayHeading.style.letterSpacing = "0.4px";
      delayHeading.style.margin = "var(--space-4) 0 var(--space-2)";
      delayHeading.textContent = "DELAY ANALYSIS";
      panel.appendChild(delayHeading);

      var delayStatsRow = document.createElement("div");
      delayStatsRow.style.display = "flex";
      delayStatsRow.style.gap = "var(--space-5)";
      delayStatsRow.style.flexWrap = "wrap";
      delayStatsRow.appendChild(stat("Delay Events", delayStats.totalEvents));
      delayStatsRow.appendChild(stat("Open Delays", delayStats.openCount));
      delayStatsRow.appendChild(stat("Critical", delayStats.criticalCount));
      delayStatsRow.appendChild(stat("Total Delay Days", delayStats.totalDelayDays));
      delayStatsRow.appendChild(stat("Recovery Actions", delayStats.recoveryActionsCount));
      panel.appendChild(delayStatsRow);

      if (delayStats.repeatedCauses.length > 0) {
        var repeatedP = document.createElement("p");
        repeatedP.className = "text-secondary";
        repeatedP.style.fontSize = "12px";
        repeatedP.style.marginTop = "var(--space-2)";
        repeatedP.textContent = "Repeated causes: " + delayStats.repeatedCauses.join(", ");
        panel.appendChild(repeatedP);
      }
    }

    container.appendChild(panel);
  }

  function renderProjectsTab(container, vendor, data, rerender) {
    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.style.marginBottom = "var(--space-3)";
    addBtn.textContent = "+ Link Project";
    addBtn.disabled = data.projects.filter(function (p) { return !p.archived; }).length === 0;
    addBtn.onclick = function () {
      uiState.editingProjectLinkId = "new";
      rerender();
    };
    container.appendChild(addBtn);

    if (uiState.editingProjectLinkId) {
      var link =
        uiState.editingProjectLinkId === "new"
          ? window.PCC.store.newVendorProjectLink({ vendor_id: vendor.id })
          : data.vendor_project_links.find(function (l) {
              return l.id === uiState.editingProjectLinkId;
            });
      if (link) {
        var panel = document.createElement("div");
        panel.className = "panel";
        panel.style.marginBottom = "var(--space-3)";
        var form = document.createElement("form");

        var projField = document.createElement("div");
        projField.className = "field";
        projField.innerHTML = "<label>Project *</label>";
        var projSelect = document.createElement("select");
        var activeProjects = data.projects.filter(function (p) { return !p.archived; });
        activeProjects.forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name || "(unnamed project)";
          projSelect.appendChild(opt);
        });
        projSelect.value = link.project_id || (activeProjects[0] && activeProjects[0].id) || "";
        projField.appendChild(projSelect);
        form.appendChild(projField);

        var grid = document.createElement("div");
        grid.className = "form-grid";
        grid.appendChild(buildField({ key: "role", label: "Vendor Role", type: "text" }, link, "vplfield-"));
        grid.appendChild(
          buildField(
            { key: "contract_status", label: "Contract Status", type: "select", options: window.PCC.store.VENDOR_PROJECT_CONTRACT_STATUSES, labels: CONTRACT_STATUS_LABELS },
            link,
            "vplfield-"
          )
        );
        form.appendChild(grid);

        var scopeField = document.createElement("div");
        scopeField.className = "field";
        scopeField.innerHTML = "<label>Scope of Work</label>";
        var scopeArea = document.createElement("textarea");
        scopeArea.id = "vplfield-scope_of_work";
        scopeArea.rows = 2;
        scopeArea.value = link.scope_of_work || "";
        scopeField.appendChild(scopeArea);
        form.appendChild(scopeField);

        var actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "var(--space-3)";
        actions.style.marginTop = "var(--space-3)";
        var saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "btn btn--primary";
        saveBtn.textContent = uiState.editingProjectLinkId === "new" ? "Link Project" : "Save Changes";
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn--ghost";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = function () {
          uiState.editingProjectLinkId = null;
          rerender();
        };
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        form.appendChild(actions);

        form.onsubmit = function (e) {
          e.preventDefault();
          var values = {
            project_id: projSelect.value,
            role: form.querySelector("#vplfield-role").value,
            contract_status: form.querySelector("#vplfield-contract_status").value,
            scope_of_work: scopeArea.value,
          };
          window.PCC.store.update(function (d) {
            if (uiState.editingProjectLinkId === "new") {
              d.vendor_project_links.push(window.PCC.store.newVendorProjectLink(Object.assign({ vendor_id: vendor.id }, values)));
            } else {
              var existing = d.vendor_project_links.find(function (l) { return l.id === link.id; });
              if (existing) {
                Object.assign(existing, values);
                existing.updated_at = new Date().toISOString();
              }
            }
          });
          window.PCC.notify("Project link saved.", "success");
          uiState.editingProjectLinkId = null;
          rerender();
        };

        panel.appendChild(form);
        container.appendChild(panel);
      }
    }

    var links = data.vendor_project_links.filter(function (l) {
      return l.vendor_id === vendor.id;
    });
    if (links.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "No projects linked yet.";
      container.appendChild(empty);
      return;
    }

    links.forEach(function (l) {
      var card = document.createElement("div");
      card.className = "project-card";
      var top = document.createElement("div");
      top.style.display = "flex";
      top.style.justifyContent = "space-between";
      top.style.alignItems = "flex-start";
      var left = document.createElement("div");
      left.innerHTML =
        "<strong>" + projectName(data.projects, l.project_id) + "</strong>" +
        "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
        (l.role ? "Role: " + l.role + " — " : "") +
        "Contract: " + (CONTRACT_STATUS_LABELS[l.contract_status] || l.contract_status) +
        "</p>" +
        (l.scope_of_work ? "<p style='font-size:13px;margin:6px 0 0'>" + l.scope_of_work + "</p>" : "");
      top.appendChild(left);

      var btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "var(--space-2)";
      var editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.textContent = "Edit";
      editBtn.onclick = function () {
        uiState.editingProjectLinkId = l.id;
        rerender();
      };
      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Remove";
      removeBtn.onclick = function () {
        window.PCC.store.update(function (d) {
          d.vendor_project_links = d.vendor_project_links.filter(function (x) { return x.id !== l.id; });
        });
        rerender();
      };
      btnRow.appendChild(editBtn);
      btnRow.appendChild(removeBtn);
      top.appendChild(btnRow);
      card.appendChild(top);
      container.appendChild(card);
    });
  }

  function renderContactsTab(container, vendor, data, rerender) {
    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.style.marginBottom = "var(--space-3)";
    addBtn.textContent = "+ Add Contact";
    addBtn.onclick = function () {
      uiState.editingContactId = "new";
      rerender();
    };
    container.appendChild(addBtn);

    if (uiState.editingContactId) {
      var contact =
        uiState.editingContactId === "new"
          ? window.PCC.store.newVendorContact({ vendor_id: vendor.id })
          : data.vendor_contacts.find(function (c) {
              return c.id === uiState.editingContactId;
            });
      if (contact) {
        var panel = document.createElement("div");
        panel.className = "panel";
        panel.style.marginBottom = "var(--space-3)";
        var form = document.createElement("form");
        var grid = document.createElement("div");
        grid.className = "form-grid";
        grid.appendChild(buildField({ key: "name", label: "Name", type: "text", required: true }, contact, "vcfield-"));
        grid.appendChild(buildField({ key: "designation", label: "Designation", type: "text" }, contact, "vcfield-"));
        grid.appendChild(buildField({ key: "mobile", label: "Mobile", type: "text" }, contact, "vcfield-"));
        grid.appendChild(buildField({ key: "email", label: "Email", type: "email" }, contact, "vcfield-"));
        form.appendChild(grid);

        var primaryField = document.createElement("div");
        primaryField.className = "field";
        var primaryLabel = document.createElement("label");
        primaryLabel.style.display = "flex";
        primaryLabel.style.alignItems = "center";
        primaryLabel.style.gap = "var(--space-2)";
        var primaryCheckbox = document.createElement("input");
        primaryCheckbox.type = "checkbox";
        primaryCheckbox.id = "vcfield-is_primary";
        primaryCheckbox.checked = !!contact.is_primary;
        primaryLabel.appendChild(primaryCheckbox);
        primaryLabel.appendChild(document.createTextNode("Primary contact"));
        primaryField.appendChild(primaryLabel);
        form.appendChild(primaryField);

        var actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "var(--space-3)";
        actions.style.marginTop = "var(--space-3)";
        var saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "btn btn--primary";
        saveBtn.textContent = uiState.editingContactId === "new" ? "Add Contact" : "Save Changes";
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn--ghost";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = function () {
          uiState.editingContactId = null;
          rerender();
        };
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        form.appendChild(actions);

        form.onsubmit = function (e) {
          e.preventDefault();
          var values = readFieldValues(form, [{ key: "name" }, { key: "designation" }, { key: "mobile" }, { key: "email" }], "vcfield-");
          values.is_primary = primaryCheckbox.checked;
          if (!values.name || !values.name.trim()) return;

          window.PCC.store.update(function (d) {
            if (values.is_primary) {
              d.vendor_contacts.forEach(function (c) {
                if (c.vendor_id === vendor.id && c.id !== contact.id) c.is_primary = false;
              });
            }
            if (uiState.editingContactId === "new") {
              d.vendor_contacts.push(window.PCC.store.newVendorContact(Object.assign({ vendor_id: vendor.id }, values)));
            } else {
              var existing = d.vendor_contacts.find(function (c) { return c.id === contact.id; });
              if (existing) {
                Object.assign(existing, values);
                existing.updated_at = new Date().toISOString();
              }
            }
          });
          window.PCC.notify("Contact saved.", "success");
          uiState.editingContactId = null;
          rerender();
        };

        panel.appendChild(form);
        container.appendChild(panel);
      }
    }

    var contacts = data.vendor_contacts.filter(function (c) {
      return c.vendor_id === vendor.id;
    });
    if (contacts.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "No contacts added yet.";
      container.appendChild(empty);
      return;
    }

    contacts.forEach(function (c) {
      var card = document.createElement("div");
      card.className = "project-card";
      var top = document.createElement("div");
      top.style.display = "flex";
      top.style.justifyContent = "space-between";
      top.style.alignItems = "flex-start";
      var left = document.createElement("div");
      left.innerHTML =
        "<strong>" + (c.name || "(unnamed)") + "</strong>" + (c.is_primary ? " <span class='status-badge status-badge--on_track'>Primary</span>" : "") +
        "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
        [c.designation, c.mobile, c.email].filter(Boolean).join(" · ") +
        "</p>";
      top.appendChild(left);
      var btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "var(--space-2)";
      var editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.textContent = "Edit";
      editBtn.onclick = function () {
        uiState.editingContactId = c.id;
        rerender();
      };
      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Remove";
      removeBtn.onclick = function () {
        window.PCC.store.update(function (d) {
          d.vendor_contacts = d.vendor_contacts.filter(function (x) { return x.id !== c.id; });
        });
        rerender();
      };
      btnRow.appendChild(editBtn);
      btnRow.appendChild(removeBtn);
      top.appendChild(btnRow);
      card.appendChild(top);
      container.appendChild(card);
    });
  }

  function resetDocUploadState() {
    uiState.uploadFormOpen = false;
    uiState.pendingDocFile = null;
    uiState.pendingDocCategory = "other";
    uiState.pendingDocCustomCategory = "";
    uiState.pendingDocProjectId = "";
    uiState.pendingDocExpiry = "";
    uiState.pendingDocTags = "";
    uiState.pendingDocComments = "";
    uiState.pendingDocGroupId = null;
    uiState.pendingDocReadError = null;
  }

  function handleDocFileSelected(file, rerender) {
    uiState.pendingDocReadError = null;
    var reader = new FileReader();
    reader.onerror = function () {
      uiState.pendingDocReadError = "Could not read that file.";
      rerender();
    };
    reader.onload = function () {
      var buffer = reader.result;
      var mimeType = file.type || "application/octet-stream";
      var fileDataUri = "data:" + mimeType + ";base64," + arrayBufferToBase64(buffer);
      window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
        uiState.pendingDocFile = { name: file.name, size: file.size, type: mimeType, fileData: fileDataUri, hash: fp.hash, hashMethod: fp.method };
        rerender();
      });
    };
    reader.readAsArrayBuffer(file);
  }

  function renderDocumentUploadForm(container, vendor, data, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-3)";

    var heading = document.createElement("h4");
    heading.style.marginBottom = "var(--space-3)";
    heading.textContent = uiState.pendingDocGroupId ? "Upload New Revision" : "Upload Document";
    panel.appendChild(heading);

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.onchange = function () {
      if (fileInput.files && fileInput.files[0]) handleDocFileSelected(fileInput.files[0], rerender);
    };
    panel.appendChild(fileInput);

    if (uiState.pendingDocReadError) {
      var err = document.createElement("p");
      err.style.color = "var(--status-critical)";
      err.style.fontSize = "var(--text-sm)";
      err.style.marginTop = "var(--space-2)";
      err.textContent = uiState.pendingDocReadError;
      panel.appendChild(err);
    }

    if (uiState.pendingDocFile) {
      var fileInfo = document.createElement("p");
      fileInfo.className = "text-secondary";
      fileInfo.style.fontSize = "var(--text-sm)";
      fileInfo.style.margin = "var(--space-2) 0";
      fileInfo.textContent = uiState.pendingDocFile.name + " · " + formatBytes(uiState.pendingDocFile.size);
      panel.appendChild(fileInfo);
    }

    var grid = document.createElement("div");
    grid.className = "form-grid";
    grid.style.marginTop = "var(--space-3)";

    var catField = document.createElement("div");
    catField.className = "field";
    catField.innerHTML = "<label>Document Category</label>";
    var catSelect = document.createElement("select");
    catSelect.id = "vdocfield-category";
    window.PCC.store.VENDOR_DOCUMENT_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = VENDOR_DOCUMENT_CATEGORY_LABELS[c];
      catSelect.appendChild(opt);
    });
    catSelect.value = uiState.pendingDocCategory;
    catSelect.onchange = function () {
      uiState.pendingDocCategory = catSelect.value;
      rerender();
    };
    catField.appendChild(catSelect);
    grid.appendChild(catField);

    if (uiState.pendingDocCategory === "other") {
      var customField = document.createElement("div");
      customField.className = "field";
      customField.innerHTML = "<label>Custom Category Label</label>";
      var customInput = document.createElement("input");
      customInput.type = "text";
      customInput.id = "vdocfield-custom_category_label";
      customInput.value = uiState.pendingDocCustomCategory;
      customField.appendChild(customInput);
      grid.appendChild(customField);
    }

    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project (optional)</label>";
    var projSelect = document.createElement("select");
    projSelect.id = "vdocfield-project_id";
    var noProjOpt = document.createElement("option");
    noProjOpt.value = "";
    noProjOpt.textContent = "— Not project-specific —";
    projSelect.appendChild(noProjOpt);
    data.projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projSelect.appendChild(opt);
    });
    projSelect.value = uiState.pendingDocProjectId;
    projField.appendChild(projSelect);
    grid.appendChild(projField);

    var expiryField = document.createElement("div");
    expiryField.className = "field";
    expiryField.innerHTML = "<label>Expiry Date (optional)</label>";
    var expiryInput = document.createElement("input");
    expiryInput.type = "date";
    expiryInput.id = "vdocfield-expiry_date";
    expiryInput.value = uiState.pendingDocExpiry;
    expiryField.appendChild(expiryInput);
    grid.appendChild(expiryField);

    var tagsField = document.createElement("div");
    tagsField.className = "field";
    tagsField.innerHTML = "<label>Tags (comma-separated)</label>";
    var tagsInput = document.createElement("input");
    tagsInput.type = "text";
    tagsInput.id = "vdocfield-tags";
    tagsInput.value = uiState.pendingDocTags;
    tagsField.appendChild(tagsInput);
    grid.appendChild(tagsField);

    panel.appendChild(grid);

    var commentsField = document.createElement("div");
    commentsField.className = "field";
    commentsField.style.marginTop = "var(--space-2)";
    commentsField.innerHTML = "<label>Comments</label>";
    var commentsArea = document.createElement("textarea");
    commentsArea.id = "vdocfield-comments";
    commentsArea.rows = 2;
    commentsArea.value = uiState.pendingDocComments;
    commentsField.appendChild(commentsArea);
    panel.appendChild(commentsField);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-3)";

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = "Save Document";
    saveBtn.disabled = !uiState.pendingDocFile;
    saveBtn.onclick = function () {
      if (!uiState.pendingDocFile) return;
      var category = document.getElementById("vdocfield-category").value;
      var customLabelEl = document.getElementById("vdocfield-custom_category_label");
      var revisionNumber = 1;
      if (uiState.pendingDocGroupId) {
        var siblings = data.vendor_documents.filter(function (d) {
          return d.document_group_id === uiState.pendingDocGroupId;
        });
        revisionNumber = 1 + siblings.reduce(function (max, d) { return Math.max(max, d.revision_number); }, 0);
      }

      var newDoc = window.PCC.store.newVendorDocument({
        vendor_id: vendor.id,
        document_group_id: uiState.pendingDocGroupId || "",
        revision_number: revisionNumber,
        project_id: document.getElementById("vdocfield-project_id").value,
        category: category,
        custom_category_label: customLabelEl ? customLabelEl.value.trim() : "",
        filename: uiState.pendingDocFile.name,
        file_size: uiState.pendingDocFile.size,
        mime_type: uiState.pendingDocFile.type,
        expiry_date: document.getElementById("vdocfield-expiry_date").value,
        tags: document.getElementById("vdocfield-tags").value,
        comments: commentsArea.value,
        content_hash: uiState.pendingDocFile.hash,
        hash_method: uiState.pendingDocFile.hashMethod,
      });

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";

      window.PCC.blobStore
        .putBlob(newDoc.id, uiState.pendingDocFile.fileData)
        .then(function () {
          window.PCC.store.update(function (d) {
            d.vendor_documents.push(newDoc);
          });
          window.PCC.notify("Document saved.", "success");
          resetDocUploadState();
          rerender();
        })
        .catch(function (e) {
          window.PCC.notify("Could not store the file: " + e.message, "error");
          saveBtn.disabled = false;
          saveBtn.textContent = "Save Document";
        });
    };

    var cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      resetDocUploadState();
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    panel.appendChild(actions);

    container.appendChild(panel);
  }

  function renderDocumentsTab(container, vendor, data, rerender) {
    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.style.marginBottom = "var(--space-3)";
    addBtn.textContent = "+ Upload Document";
    addBtn.onclick = function () {
      resetDocUploadState();
      uiState.uploadFormOpen = true;
      rerender();
    };
    container.appendChild(addBtn);

    if (uiState.uploadFormOpen) {
      renderDocumentUploadForm(container, vendor, data, rerender);
    }

    var latest = latestDocumentsForVendor(data.vendor_documents, vendor.id);
    if (latest.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "No documents uploaded yet.";
      container.appendChild(empty);
      return;
    }

    latest.forEach(function (doc) {
      var groupId = doc.document_group_id;
      var allRevisions = data.vendor_documents
        .filter(function (d) {
          return d.document_group_id === groupId;
        })
        .sort(function (a, b) {
          return b.revision_number - a.revision_number;
        });

      var card = document.createElement("div");
      card.className = "project-card";

      var top = document.createElement("div");
      top.style.display = "flex";
      top.style.justifyContent = "space-between";
      top.style.alignItems = "flex-start";

      var left = document.createElement("div");
      var expiry = doc.expiry_date ? daysUntil(doc.expiry_date) : null;
      var expiryText = doc.expiry_date
        ? " · Expires " + doc.expiry_date + (expiry !== null && expiry <= EXPIRING_SOON_DAYS ? (expiry < 0 ? " (EXPIRED)" : " (soon)") : "")
        : "";
      left.innerHTML =
        "<strong>" + documentLabel(doc) + "</strong> <span class='status-badge status-badge--info'>Rev " + doc.revision_number + "</span>" +
        "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
        doc.filename + " · " + formatBytes(doc.file_size) + " · " + (doc.upload_date || "").slice(0, 10) +
        (doc.project_id ? " · " + projectName(data.projects, doc.project_id) : "") +
        expiryText +
        "</p>" +
        (doc.tags ? "<p style='font-size:12px;margin:4px 0 0'>Tags: " + doc.tags + "</p>" : "") +
        (doc.comments ? "<p style='font-size:13px;margin:6px 0 0'>" + doc.comments + "</p>" : "");
      top.appendChild(left);

      var btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "var(--space-2)";
      btnRow.style.flexShrink = "0";

      var viewBtn = document.createElement("button");
      viewBtn.className = "btn btn--ghost";
      viewBtn.textContent = "View / Download";
      viewBtn.onclick = function () {
        openStoredVendorDocument(doc);
      };
      var revisionBtn = document.createElement("button");
      revisionBtn.className = "btn btn--ghost";
      revisionBtn.textContent = "New Revision";
      revisionBtn.onclick = function () {
        resetDocUploadState();
        uiState.uploadFormOpen = true;
        uiState.pendingDocGroupId = groupId;
        uiState.pendingDocCategory = doc.category;
        uiState.pendingDocCustomCategory = doc.custom_category_label;
        uiState.pendingDocProjectId = doc.project_id;
        rerender();
      };
      var historyBtn = document.createElement("button");
      historyBtn.className = "btn btn--ghost";
      historyBtn.textContent = allRevisions.length > 1 ? "History (" + allRevisions.length + ")" : "History";
      historyBtn.onclick = function () {
        uiState.expandedDocGroupId = uiState.expandedDocGroupId === groupId ? null : groupId;
        rerender();
      };
      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        if (!window.confirm("Delete this document and all its revisions? This can't be undone.")) return;
        var idsToDelete = allRevisions.map(function (d) { return d.id; });
        window.PCC.store.update(function (d) {
          d.vendor_documents = d.vendor_documents.filter(function (x) { return idsToDelete.indexOf(x.id) === -1; });
        });
        idsToDelete.forEach(function (id) {
          window.PCC.blobStore.deleteBlob(id).catch(function () {});
        });
        rerender();
      };

      btnRow.appendChild(viewBtn);
      btnRow.appendChild(revisionBtn);
      btnRow.appendChild(historyBtn);
      btnRow.appendChild(deleteBtn);
      top.appendChild(btnRow);
      card.appendChild(top);

      if (uiState.expandedDocGroupId === groupId && allRevisions.length > 1) {
        var histWrap = document.createElement("div");
        histWrap.style.marginTop = "var(--space-3)";
        histWrap.style.paddingTop = "var(--space-3)";
        histWrap.style.borderTop = "1px solid var(--divider)";
        allRevisions.slice(1).forEach(function (rev) {
          var revRow = document.createElement("div");
          revRow.style.display = "flex";
          revRow.style.justifyContent = "space-between";
          revRow.style.alignItems = "center";
          revRow.style.fontSize = "var(--text-sm)";
          revRow.style.marginBottom = "var(--space-1)";
          var revLabel = document.createElement("span");
          revLabel.textContent = "Rev " + rev.revision_number + " — " + rev.filename + " · " + (rev.upload_date || "").slice(0, 10);
          var revViewBtn = document.createElement("button");
          revViewBtn.className = "btn btn--ghost";
          revViewBtn.textContent = "View";
          revViewBtn.onclick = function () {
            openStoredVendorDocument(rev);
          };
          revRow.appendChild(revLabel);
          revRow.appendChild(revViewBtn);
          histWrap.appendChild(revRow);
        });
        card.appendChild(histWrap);
      }

      container.appendChild(card);
    });
  }

  function linkPickerPanel(cfg) {
    // cfg: { open, items, itemLabel, onLink, onClose, emptyText, buttonText }
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-3)";
    if (cfg.items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "var(--text-sm)";
      empty.textContent = cfg.emptyText;
      panel.appendChild(empty);
    } else {
      var select = document.createElement("select");
      cfg.items.forEach(function (item) {
        var opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = cfg.itemLabel(item);
        select.appendChild(opt);
      });
      panel.appendChild(select);
      var linkBtn = document.createElement("button");
      linkBtn.className = "btn btn--primary";
      linkBtn.style.marginLeft = "var(--space-3)";
      linkBtn.textContent = cfg.buttonText;
      linkBtn.onclick = function () {
        cfg.onLink(select.value);
      };
      panel.appendChild(linkBtn);
    }
    var cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.style.marginLeft = "var(--space-3)";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = cfg.onClose;
    panel.appendChild(cancelBtn);
    return panel;
  }

  function renderMeetingsTab(container, vendor, data, rerender) {
    var linkedProjectIds = data.vendor_project_links.filter(function (l) { return l.vendor_id === vendor.id; }).map(function (l) { return l.project_id; });
    var linkedMeetingIds = data.vendor_meeting_links.filter(function (l) { return l.vendor_id === vendor.id; }).map(function (l) { return l.meeting_id; });

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.style.marginBottom = "var(--space-3)";
    addBtn.textContent = "+ Link Existing Meeting";
    addBtn.onclick = function () {
      uiState.meetingPickerOpen = true;
      rerender();
    };
    container.appendChild(addBtn);

    if (uiState.meetingPickerOpen) {
      var candidateMeetings = data.meetings.filter(function (m) {
        return linkedMeetingIds.indexOf(m.id) === -1 && (linkedProjectIds.length === 0 || linkedProjectIds.indexOf(m.project_id) !== -1);
      });
      container.appendChild(
        linkPickerPanel({
          items: candidateMeetings,
          itemLabel: function (m) {
            return m.meeting_date + " — " + m.title + " (" + projectName(data.projects, m.project_id) + ")";
          },
          emptyText: "No meetings available to link (from this vendor's linked projects). Link a project first, or add meetings in the Meetings module.",
          buttonText: "Link",
          onLink: function (meetingId) {
            window.PCC.store.update(function (d) {
              d.vendor_meeting_links.push(window.PCC.store.newVendorMeetingLink({ vendor_id: vendor.id, meeting_id: meetingId }));
            });
            uiState.meetingPickerOpen = false;
            rerender();
          },
          onClose: function () {
            uiState.meetingPickerOpen = false;
            rerender();
          },
        })
      );
    }

    var links = data.vendor_meeting_links.filter(function (l) {
      return l.vendor_id === vendor.id;
    });
    if (links.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "No meetings linked yet.";
      container.appendChild(empty);
      return;
    }

    links.forEach(function (l) {
      var m = data.meetings.find(function (x) { return x.id === l.meeting_id; });
      var card = document.createElement("div");
      card.className = "project-card";
      if (!m) {
        card.innerHTML = "<p class='text-secondary'>(linked meeting was deleted)</p>";
        var rm = document.createElement("button");
        rm.className = "btn btn--ghost";
        rm.textContent = "Remove Link";
        rm.onclick = function () {
          window.PCC.store.update(function (d) { d.vendor_meeting_links = d.vendor_meeting_links.filter(function (x) { return x.id !== l.id; }); });
          rerender();
        };
        card.appendChild(rm);
        container.appendChild(card);
        return;
      }
      var attachmentCount = data.documents.filter(function (doc) { return doc.meeting_id === m.id && !doc.trashed_at; }).length;
      var top = document.createElement("div");
      top.style.display = "flex";
      top.style.justifyContent = "space-between";
      top.style.alignItems = "flex-start";
      var left = document.createElement("div");
      left.innerHTML =
        "<strong>" + m.title + "</strong>" +
        "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
        m.meeting_date + " · Participants: " + (m.attendees || "—") + " · " + attachmentCount + " attachment" + (attachmentCount === 1 ? "" : "s") +
        "</p>" +
        (m.minutes ? "<p style='font-size:13px;margin:6px 0 0'>" + m.minutes.slice(0, 200) + (m.minutes.length > 200 ? "…" : "") + "</p>" : "");
      top.appendChild(left);
      var btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "var(--space-2)";
      var openBtn = document.createElement("button");
      openBtn.className = "btn btn--ghost";
      openBtn.textContent = "View Meeting";
      openBtn.onclick = function () {
        window.PCC.router.go("meetings");
        if (window.PCC.meetings) window.PCC.meetings.expandMeeting(m.id);
        window.PCC.router.render();
      };
      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Unlink";
      removeBtn.onclick = function () {
        window.PCC.store.update(function (d) { d.vendor_meeting_links = d.vendor_meeting_links.filter(function (x) { return x.id !== l.id; }); });
        rerender();
      };
      btnRow.appendChild(openBtn);
      btnRow.appendChild(removeBtn);
      top.appendChild(btnRow);
      card.appendChild(top);
      container.appendChild(card);
    });
  }

  function renderRfisTab(container, vendor, data, rerender) {
    var linkedProjectIds = data.vendor_project_links.filter(function (l) { return l.vendor_id === vendor.id; }).map(function (l) { return l.project_id; });
    var linkedRfiIds = data.vendor_rfi_links.filter(function (l) { return l.vendor_id === vendor.id; }).map(function (l) { return l.rfi_id; });
    var linkedRfis = data.rfis.filter(function (r) { return linkedRfiIds.indexOf(r.id) !== -1; });

    var counts = { pending: 0, closed: 0, openTq: 0 };
    linkedRfis.forEach(function (r) {
      if (r.status === "closed") counts.closed++;
      else if (r.type === "technical_query") counts.openTq++;
      else counts.pending++;
    });

    var countsRow = document.createElement("div");
    countsRow.style.display = "flex";
    countsRow.style.gap = "var(--space-5)";
    countsRow.style.marginBottom = "var(--space-3)";
    countsRow.style.fontSize = "var(--text-sm)";
    countsRow.innerHTML =
      "<span><strong>" + counts.pending + "</strong> Pending RFIs</span>" +
      "<span><strong>" + counts.closed + "</strong> Closed</span>" +
      "<span><strong>" + counts.openTq + "</strong> Open Technical Queries</span>";
    container.appendChild(countsRow);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.style.marginBottom = "var(--space-3)";
    addBtn.textContent = "+ Link Existing RFI / TQ";
    addBtn.onclick = function () {
      uiState.rfiPickerOpen = true;
      rerender();
    };
    container.appendChild(addBtn);

    if (uiState.rfiPickerOpen) {
      var candidateRfis = data.rfis.filter(function (r) {
        return linkedRfiIds.indexOf(r.id) === -1 && (linkedProjectIds.length === 0 || linkedProjectIds.indexOf(r.project_id) !== -1);
      });
      container.appendChild(
        linkPickerPanel({
          items: candidateRfis,
          itemLabel: function (r) {
            return r.number + " — " + r.subject + " (" + RFI_TYPE_LABELS[r.type] + ", " + RFI_STATUS_LABELS[r.status] + ")";
          },
          emptyText: "No RFIs/TQs available to link (from this vendor's linked projects). Link a project first, or add entries in the RFI / TQ module.",
          buttonText: "Link",
          onLink: function (rfiId) {
            window.PCC.store.update(function (d) {
              d.vendor_rfi_links.push(window.PCC.store.newVendorRfiLink({ vendor_id: vendor.id, rfi_id: rfiId }));
            });
            uiState.rfiPickerOpen = false;
            rerender();
          },
          onClose: function () {
            uiState.rfiPickerOpen = false;
            rerender();
          },
        })
      );
    }

    var links = data.vendor_rfi_links.filter(function (l) {
      return l.vendor_id === vendor.id;
    });
    if (links.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "No RFIs / Technical Queries linked yet.";
      container.appendChild(empty);
      return;
    }

    links.forEach(function (l) {
      var r = data.rfis.find(function (x) { return x.id === l.rfi_id; });
      var card = document.createElement("div");
      card.className = "project-card";
      if (!r) {
        card.innerHTML = "<p class='text-secondary'>(linked RFI/TQ was deleted)</p>";
        var rm = document.createElement("button");
        rm.className = "btn btn--ghost";
        rm.textContent = "Remove Link";
        rm.onclick = function () {
          window.PCC.store.update(function (d) { d.vendor_rfi_links = d.vendor_rfi_links.filter(function (x) { return x.id !== l.id; }); });
          rerender();
        };
        card.appendChild(rm);
        container.appendChild(card);
        return;
      }
      var top = document.createElement("div");
      top.style.display = "flex";
      top.style.justifyContent = "space-between";
      top.style.alignItems = "flex-start";
      var left = document.createElement("div");
      left.innerHTML =
        "<strong class='mono'>" + r.number + "</strong> " + r.subject + " <span class='status-badge status-badge--info'>" + RFI_TYPE_LABELS[r.type] + "</span>" +
        "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
        "Status: " + RFI_STATUS_LABELS[r.status] + (r.date_required ? " · Response due: " + r.date_required : "") +
        "</p>";
      top.appendChild(left);
      var btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "var(--space-2)";
      var openBtn = document.createElement("button");
      openBtn.className = "btn btn--ghost";
      openBtn.textContent = "View RFI / TQ";
      openBtn.onclick = function () {
        window.PCC.router.go("rfis");
        if (window.PCC.rfis) window.PCC.rfis.expandRfi(r.id);
        window.PCC.router.render();
      };
      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Unlink";
      removeBtn.onclick = function () {
        window.PCC.store.update(function (d) { d.vendor_rfi_links = d.vendor_rfi_links.filter(function (x) { return x.id !== l.id; }); });
        rerender();
      };
      btnRow.appendChild(openBtn);
      btnRow.appendChild(removeBtn);
      top.appendChild(btnRow);
      card.appendChild(top);
      container.appendChild(card);
    });
  }

  function renderRisksTab(container, vendor, data, rerender) {
    var linkedProjectIds = data.vendor_project_links.filter(function (l) { return l.vendor_id === vendor.id; }).map(function (l) { return l.project_id; });
    var linkedRiskIds = data.vendor_risk_links.filter(function (l) { return l.vendor_id === vendor.id; }).map(function (l) { return l.risk_id; });

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.style.marginBottom = "var(--space-3)";
    addBtn.textContent = "+ Link Existing Risk";
    addBtn.onclick = function () {
      uiState.riskPickerOpen = true;
      rerender();
    };
    container.appendChild(addBtn);

    if (uiState.riskPickerOpen) {
      var candidateRisks = data.risks.filter(function (r) {
        return linkedRiskIds.indexOf(r.id) === -1 && (linkedProjectIds.length === 0 || linkedProjectIds.indexOf(r.project_id) !== -1);
      });
      container.appendChild(
        linkPickerPanel({
          items: candidateRisks,
          itemLabel: function (r) {
            return r.title + " (" + r.type + ", " + r.status + ")";
          },
          emptyText: "No risks/issues/opportunities available to link (from this vendor's linked projects). Link a project first, or add entries in the Risk Register.",
          buttonText: "Link",
          onLink: function (riskId) {
            window.PCC.store.update(function (d) {
              d.vendor_risk_links.push(window.PCC.store.newVendorRiskLink({ vendor_id: vendor.id, risk_id: riskId }));
            });
            uiState.riskPickerOpen = false;
            rerender();
          },
          onClose: function () {
            uiState.riskPickerOpen = false;
            rerender();
          },
        })
      );
    }

    var links = data.vendor_risk_links.filter(function (l) {
      return l.vendor_id === vendor.id;
    });
    if (links.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "No risks, issues, or opportunities linked yet.";
      container.appendChild(empty);
      return;
    }

    links.forEach(function (l) {
      var r = data.risks.find(function (x) { return x.id === l.risk_id; });
      var card = document.createElement("div");
      card.className = "project-card";
      if (!r) {
        card.innerHTML = "<p class='text-secondary'>(linked entry was deleted)</p>";
        var rm = document.createElement("button");
        rm.className = "btn btn--ghost";
        rm.textContent = "Remove Link";
        rm.onclick = function () {
          window.PCC.store.update(function (d) { d.vendor_risk_links = d.vendor_risk_links.filter(function (x) { return x.id !== l.id; }); });
          rerender();
        };
        card.appendChild(rm);
        container.appendChild(card);
        return;
      }
      var top = document.createElement("div");
      top.style.display = "flex";
      top.style.justifyContent = "space-between";
      top.style.alignItems = "flex-start";
      var left = document.createElement("div");
      left.innerHTML =
        "<strong>" + r.title + "</strong> <span class='status-badge status-badge--info'>" + r.type + "</span>" +
        "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>Status: " + r.status + "</p>";
      top.appendChild(left);
      var btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "var(--space-2)";
      var openBtn = document.createElement("button");
      openBtn.className = "btn btn--ghost";
      openBtn.textContent = "View Risk";
      openBtn.onclick = function () {
        window.PCC.router.go("risks");
        if (window.PCC.risks) window.PCC.risks.expandRisk(r.id);
        window.PCC.router.render();
      };
      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Unlink";
      removeBtn.onclick = function () {
        window.PCC.store.update(function (d) { d.vendor_risk_links = d.vendor_risk_links.filter(function (x) { return x.id !== l.id; }); });
        rerender();
      };
      btnRow.appendChild(openBtn);
      btnRow.appendChild(removeBtn);
      top.appendChild(btnRow);
      card.appendChild(top);
      container.appendChild(card);
    });
  }

  function renderPerformanceTab(container, vendor, data, rerender) {
    var reviews = data.vendor_performance
      .filter(function (p) { return p.vendor_id === vendor.id; })
      .sort(function (a, b) { return (b.review_date || "").localeCompare(a.review_date || ""); });

    if (reviews.length > 0) {
      var avgPanel = document.createElement("div");
      avgPanel.className = "panel";
      avgPanel.style.marginBottom = "var(--space-3)";
      var runningAvg = Math.round((reviews.reduce(function (sum, r) { return sum + overallRating(r); }, 0) / reviews.length) * 10) / 10;
      avgPanel.innerHTML =
        "<p class='text-secondary' style='font-size:11px;margin-bottom:4px'>OVERALL RATING (" + reviews.length + " review" + (reviews.length === 1 ? "" : "s") + ")</p>" +
        "<p style='font-size:24px;font-weight:600;margin:0'>" + runningAvg.toFixed(1) + " / 5</p>";
      container.appendChild(avgPanel);
    }

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.style.marginBottom = "var(--space-3)";
    addBtn.textContent = "+ Add Review";
    addBtn.onclick = function () {
      uiState.editingPerformanceId = "new";
      rerender();
    };
    container.appendChild(addBtn);

    if (uiState.editingPerformanceId) {
      var perf =
        uiState.editingPerformanceId === "new"
          ? window.PCC.store.newVendorPerformance({ vendor_id: vendor.id })
          : data.vendor_performance.find(function (p) { return p.id === uiState.editingPerformanceId; });
      if (perf) {
        var panel = document.createElement("div");
        panel.className = "panel";
        panel.style.marginBottom = "var(--space-3)";
        var form = document.createElement("form");
        var grid = document.createElement("div");
        grid.className = "form-grid";

        function ratingSelect(key, label) {
          var f = document.createElement("div");
          f.className = "field";
          f.innerHTML = "<label>" + label + "</label>";
          var sel = document.createElement("select");
          sel.id = "vperffield-" + key;
          [0, 1, 2, 3, 4, 5].forEach(function (n) {
            var opt = document.createElement("option");
            opt.value = String(n);
            opt.textContent = n === 0 ? "Not rated" : n + " / 5";
            sel.appendChild(opt);
          });
          sel.value = String(perf[key] || 0);
          f.appendChild(sel);
          return f;
        }
        grid.appendChild(ratingSelect("quality_rating", "Quality Rating"));
        grid.appendChild(ratingSelect("delivery_rating", "Delivery Rating"));
        grid.appendChild(ratingSelect("communication_rating", "Communication Rating"));
        grid.appendChild(ratingSelect("safety_rating", "Safety Rating"));
        grid.appendChild(buildField({ key: "review_date", label: "Review Date", type: "date" }, perf, "vperffield-"));
        grid.appendChild(buildField({ key: "reviewed_by", label: "Reviewed By", type: "text" }, perf, "vperffield-"));
        form.appendChild(grid);

        var commentsField = document.createElement("div");
        commentsField.className = "field";
        commentsField.style.marginTop = "var(--space-2)";
        commentsField.innerHTML = "<label>Comments</label>";
        var commentsArea = document.createElement("textarea");
        commentsArea.id = "vperffield-comments";
        commentsArea.rows = 2;
        commentsArea.value = perf.comments || "";
        commentsField.appendChild(commentsArea);
        form.appendChild(commentsField);

        var actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "var(--space-3)";
        actions.style.marginTop = "var(--space-3)";
        var saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "btn btn--primary";
        saveBtn.textContent = uiState.editingPerformanceId === "new" ? "Add Review" : "Save Changes";
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn--ghost";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = function () {
          uiState.editingPerformanceId = null;
          rerender();
        };
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        form.appendChild(actions);

        form.onsubmit = function (e) {
          e.preventDefault();
          var values = {
            quality_rating: Number(form.querySelector("#vperffield-quality_rating").value),
            delivery_rating: Number(form.querySelector("#vperffield-delivery_rating").value),
            communication_rating: Number(form.querySelector("#vperffield-communication_rating").value),
            safety_rating: Number(form.querySelector("#vperffield-safety_rating").value),
            review_date: form.querySelector("#vperffield-review_date").value,
            reviewed_by: form.querySelector("#vperffield-reviewed_by").value,
            comments: commentsArea.value,
          };
          window.PCC.store.update(function (d) {
            if (uiState.editingPerformanceId === "new") {
              d.vendor_performance.push(window.PCC.store.newVendorPerformance(Object.assign({ vendor_id: vendor.id }, values)));
            } else {
              var existing = d.vendor_performance.find(function (p) { return p.id === perf.id; });
              if (existing) Object.assign(existing, values);
            }
          });
          window.PCC.notify("Performance review saved.", "success");
          uiState.editingPerformanceId = null;
          rerender();
        };

        panel.appendChild(form);
        container.appendChild(panel);
      }
    }

    if (reviews.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "No performance reviews yet.";
      container.appendChild(empty);
      return;
    }

    reviews.forEach(function (r) {
      var card = document.createElement("div");
      card.className = "project-card";
      var top = document.createElement("div");
      top.style.display = "flex";
      top.style.justifyContent = "space-between";
      top.style.alignItems = "flex-start";
      var left = document.createElement("div");
      left.innerHTML =
        "<strong>" + ratingText(overallRating(r)) + " overall</strong>" +
        "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
        r.review_date + (r.reviewed_by ? " · " + r.reviewed_by : "") +
        "</p>" +
        "<p style='font-size:12px;margin:6px 0 0'>Quality: " + ratingText(r.quality_rating) + " · Delivery: " + ratingText(r.delivery_rating) +
        " · Communication: " + ratingText(r.communication_rating) + " · Safety: " + ratingText(r.safety_rating) + "</p>" +
        (r.comments ? "<p style='font-size:13px;margin:6px 0 0'>" + r.comments + "</p>" : "");
      top.appendChild(left);
      var btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "var(--space-2)";
      var editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.textContent = "Edit";
      editBtn.onclick = function () {
        uiState.editingPerformanceId = r.id;
        rerender();
      };
      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Remove";
      removeBtn.onclick = function () {
        window.PCC.store.update(function (d) { d.vendor_performance = d.vendor_performance.filter(function (x) { return x.id !== r.id; }); });
        rerender();
      };
      btnRow.appendChild(editBtn);
      btnRow.appendChild(removeBtn);
      top.appendChild(btnRow);
      card.appendChild(top);
      container.appendChild(card);
    });
  }

  function renderNotesTab(container, vendor, data, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-3)";
    var textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.placeholder = "Add a note…";
    textarea.value = uiState.noteDraftText;
    textarea.oninput = function () {
      uiState.noteDraftText = textarea.value;
    };
    panel.appendChild(textarea);
    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.style.marginTop = "var(--space-2)";
    addBtn.textContent = "Add Note";
    addBtn.onclick = function () {
      if (!textarea.value.trim()) return;
      window.PCC.store.update(function (d) {
        d.vendor_notes.push(window.PCC.store.newVendorNote({ vendor_id: vendor.id, note_text: textarea.value.trim() }));
      });
      uiState.noteDraftText = "";
      rerender();
    };
    panel.appendChild(addBtn);
    container.appendChild(panel);

    var notes = data.vendor_notes
      .filter(function (n) { return n.vendor_id === vendor.id; })
      .sort(function (a, b) { return (b.created_at || "").localeCompare(a.created_at || ""); });

    if (notes.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "No notes yet.";
      container.appendChild(empty);
      return;
    }

    notes.forEach(function (n) {
      var card = document.createElement("div");
      card.className = "project-card";
      var top = document.createElement("div");
      top.style.display = "flex";
      top.style.justifyContent = "space-between";
      top.style.alignItems = "flex-start";
      var left = document.createElement("div");
      left.innerHTML =
        "<p style='margin:0;white-space:pre-wrap'>" + n.note_text + "</p>" +
        "<p class='text-secondary' style='font-size:11px;margin:6px 0 0'>" + new Date(n.created_at).toLocaleString() + "</p>";
      top.appendChild(left);
      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Delete";
      removeBtn.onclick = function () {
        window.PCC.store.update(function (d) { d.vendor_notes = d.vendor_notes.filter(function (x) { return x.id !== n.id; }); });
        rerender();
      };
      top.appendChild(removeBtn);
      card.appendChild(top);
      container.appendChild(card);
    });
  }

  // Gate 9 (Document Control 9: Vendor Lookahead). Same "Available"/"Overdue"/"Required"
  // status computation as pages/portfolio.js's computeRequirementStatus() — duplicated
  // here per this app's per-module-helpers convention rather than sharing a util layer.
  function computeRequirementStatus(data, projectId, documentTypeId, plannedDate) {
    var available = data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at;
    });
    if (available) return "available";
    if (plannedDate && plannedDate < today()) return "overdue";
    return "required";
  }

  var REQUIREMENT_STATUS_BADGE = {
    available: { className: "complete", label: "Available" },
    overdue: { className: "critical", label: "Overdue" },
    required: { className: "at_risk", label: "Required" },
  };

  /** Pure read-only aggregation: every project_document_requirements row assigned to
   * this vendor (Gate 6's vendor_id), across ALL of that vendor's projects — not just
   * ones formally linked via vendor_project_links, since a document requirement
   * assignment (made from Portfolio's Add/Edit Project form) is the source of truth
   * for "is this vendor expected to submit something here," independent of whether a
   * separate project-link record also exists. Nothing is written back; this is purely
   * a lookahead view. Sorted soonest-due-first so the most time-sensitive items surface
   * at the top; requirements with no due date sort last. */
  function renderLookaheadTab(container, vendor, data) {
    var typesById = {};
    data.document_types.forEach(function (t) {
      typesById[t.id] = t;
    });
    var activitiesById = {};
    data.activities.forEach(function (a) {
      activitiesById[a.id] = a;
    });
    var schedulesById = {};
    data.schedules.forEach(function (s) {
      schedulesById[s.id] = s;
    });

    var rows = data.project_document_requirements.filter(function (r) {
      return r.vendor_id === vendor.id && typesById[r.document_type_id];
    });

    if (rows.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent =
        "No document requirements are currently assigned to this vendor. Assign this vendor to a project's document requirements from Portfolio's Add/Edit Project form (Document Requirements section).";
      container.appendChild(empty);
      return;
    }

    var overdueCount = rows.filter(function (r) {
      return computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date) === "overdue";
    }).length;

    var summary = document.createElement("div");
    summary.className = "panel";
    summary.style.marginBottom = "var(--space-3)";
    summary.innerHTML =
      "<p class='text-secondary' style='font-size:11px;margin-bottom:4px'>DOCUMENT LOOKAHEAD</p>" +
      "<p style='font-size:13px;margin:0'>" +
      rows.length +
      " document requirement" +
      (rows.length === 1 ? "" : "s") +
      " assigned across " +
      new Set(rows.map(function (r) { return r.project_id; })).size +
      " project(s)" +
      (overdueCount > 0 ? ", <strong style='color:var(--status-critical)'>" + overdueCount + " overdue</strong>" : "") +
      "</p>";
    container.appendChild(summary);

    rows
      .slice()
      .sort(function (a, b) {
        var da = a.planned_submission_date || "9999-99-99";
        var db = b.planned_submission_date || "9999-99-99";
        return da.localeCompare(db);
      })
      .forEach(function (r) {
        var t = typesById[r.document_type_id];
        var status = computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date);
        var badgeInfo = REQUIREMENT_STATUS_BADGE[status];
        var linkedActivity = r.activity_id ? activitiesById[r.activity_id] : null;
        var linkedSchedule = linkedActivity ? schedulesById[linkedActivity.schedule_id] : null;

        var card = document.createElement("div");
        card.className = "project-card";

        var top = document.createElement("div");
        top.style.display = "flex";
        top.style.justifyContent = "space-between";
        top.style.alignItems = "center";
        top.innerHTML =
          "<strong>" +
          (t.name || "(unnamed type)") +
          (t.code ? " (" + t.code + ")" : "") +
          "</strong> <span class='status-badge status-badge--" +
          badgeInfo.className +
          "'>" +
          badgeInfo.label +
          "</span>";
        card.appendChild(top);

        var meta = document.createElement("p");
        meta.className = "text-secondary";
        meta.style.fontSize = "var(--text-sm)";
        meta.style.margin = "var(--space-1) 0 0";
        meta.textContent =
          "Project: " +
          projectName(data.projects, r.project_id) +
          (r.planned_submission_date ? " · Due " + r.planned_submission_date : " · No due date set") +
          (linkedActivity
            ? " · Linked to " +
              (linkedSchedule ? linkedSchedule.name : "(schedule)") +
              ": " +
              (linkedActivity.name || "(unnamed activity)") +
              (r.lead_time_days ? " (" + r.lead_time_days + "d lead time)" : "")
            : "");
        card.appendChild(meta);

        container.appendChild(card);
      });
  }

  // Gate 32 (PCC Evolution Roadmap, Tier B: Activity → Vendor). Read-only, portfolio-wide:
  // every Schedule activity across ALL of this vendor's projects with a matching
  // `vendor_id` — answers "what exactly is this vendor responsible for?" at the
  // activity level, distinct from the Projects tab's project-level scope_of_work text.
  // Same Critical/Near-Critical/On Track badge convention as projectLookahead.js's own
  // copy, duplicated here per this app's per-module-helpers convention.
  function renderActivitiesTab(container, vendor, data) {
    var schedulesById = {};
    data.schedules.forEach(function (s) {
      schedulesById[s.id] = s;
    });

    var rows = data.activities.filter(function (a) {
      return a.vendor_id === vendor.id;
    });

    if (rows.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent =
        "No Schedule activities are currently assigned to this vendor. Assign this vendor from an activity's Edit form on the Schedule page.";
      container.appendChild(empty);
      return;
    }

    var summary = document.createElement("div");
    summary.className = "panel";
    summary.style.marginBottom = "var(--space-3)";
    summary.innerHTML =
      "<p class='text-secondary' style='font-size:11px;margin-bottom:4px'>ASSIGNED ACTIVITIES</p>" +
      "<p style='font-size:13px;margin:0'>" +
      rows.length +
      " activit" + (rows.length === 1 ? "y" : "ies") +
      " assigned across " +
      new Set(rows.map(function (a) { return a.project_id; })).size +
      " project(s)</p>";
    container.appendChild(summary);

    rows
      .slice()
      .sort(function (a, b) {
        var da = a.early_start || a.planned_start || "9999-99-99";
        var db = b.early_start || b.planned_start || "9999-99-99";
        return da.localeCompare(db);
      })
      .forEach(function (a) {
        var schedule = schedulesById[a.schedule_id];
        var thresholdDays = (schedule && schedule.near_critical_threshold_days) || 5;
        var floatVal = a.total_float;
        var critical = floatVal != null && floatVal <= 0;
        var nearCritical = floatVal != null && floatVal > 0 && floatVal <= thresholdDays;
        var badgeClass = critical ? "critical" : nearCritical ? "at_risk" : "on_track";
        var badgeLabel = critical ? "Critical" : nearCritical ? "Near-Critical" : "On Track";

        var card = document.createElement("div");
        card.className = "project-card";

        var top = document.createElement("div");
        top.style.display = "flex";
        top.style.justifyContent = "space-between";
        top.style.alignItems = "center";
        top.innerHTML =
          "<strong>" + (a.name || "(unnamed activity)") + "</strong> <span class='status-badge status-badge--" + badgeClass + "'>" + badgeLabel + "</span>";
        card.appendChild(top);

        var meta = document.createElement("p");
        meta.className = "text-secondary";
        meta.style.fontSize = "var(--text-sm)";
        meta.style.margin = "var(--space-1) 0 0";
        var date = a.early_start || a.planned_start;
        meta.textContent =
          "Project: " + projectName(data.projects, a.project_id) +
          (schedule ? " · " + schedule.name : "") +
          (date ? " · Starts " + date : " · No date set yet");
        card.appendChild(meta);

        if (window.PCC.schedule) {
          var viewBtn = document.createElement("button");
          viewBtn.className = "btn btn--ghost";
          viewBtn.style.marginTop = "var(--space-2)";
          viewBtn.textContent = "View in Schedule";
          viewBtn.onclick = (function (projectId, scheduleId, activityId) {
            return function () {
              window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
              window.PCC.router.go("schedule");
            };
          })(a.project_id, a.schedule_id, a.id);
          card.appendChild(viewBtn);
        }

        container.appendChild(card);
      });
  }

  function renderProfile(container, data, rerender) {
    var vendor = data.vendors.find(function (v) {
      return v.id === uiState.profileVendorId;
    });
    if (!vendor) {
      uiState.view = "list";
      uiState.profileVendorId = null;
      return;
    }

    var backBtn = document.createElement("button");
    backBtn.className = "btn btn--ghost";
    backBtn.textContent = "← Back to Vendor List";
    backBtn.onclick = function () {
      uiState.view = "list";
      uiState.profileVendorId = null;
      rerender();
    };
    container.appendChild(backBtn);

    var headerRow = document.createElement("div");
    headerRow.style.display = "flex";
    headerRow.style.justifyContent = "space-between";
    headerRow.style.alignItems = "center";
    headerRow.style.marginTop = "var(--space-3)";
    var h3 = document.createElement("h3");
    h3.textContent = vendor.vendor_name;
    var badge = document.createElement("span");
    badge.className = statusBadgeClass(vendor.status);
    badge.style.marginLeft = "var(--space-3)";
    badge.textContent = VENDOR_STATUS_LABELS[vendor.status] || vendor.status;
    var titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.alignItems = "center";
    titleWrap.appendChild(h3);
    titleWrap.appendChild(badge);
    headerRow.appendChild(titleWrap);

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit Vendor";
    editBtn.onclick = function () {
      uiState.editingVendorId = vendor.id;
      uiState.view = "list";
      rerender();
    };
    headerRow.appendChild(editBtn);
    container.appendChild(headerRow);

    profileTabBar(vendor, container, rerender);

    var tabContent = document.createElement("div");
    container.appendChild(tabContent);

    if (uiState.profileTab === "overview") renderOverviewTab(tabContent, vendor, data);
    else if (uiState.profileTab === "projects") renderProjectsTab(tabContent, vendor, data, rerender);
    else if (uiState.profileTab === "contacts") renderContactsTab(tabContent, vendor, data, rerender);
    else if (uiState.profileTab === "documents") renderDocumentsTab(tabContent, vendor, data, rerender);
    else if (uiState.profileTab === "meetings") renderMeetingsTab(tabContent, vendor, data, rerender);
    else if (uiState.profileTab === "rfis") renderRfisTab(tabContent, vendor, data, rerender);
    else if (uiState.profileTab === "risks") renderRisksTab(tabContent, vendor, data, rerender);
    else if (uiState.profileTab === "performance") renderPerformanceTab(tabContent, vendor, data, rerender);
    else if (uiState.profileTab === "notes") renderNotesTab(tabContent, vendor, data, rerender);
    else if (uiState.profileTab === "lookahead") renderLookaheadTab(tabContent, vendor, data);
    else if (uiState.profileTab === "activities") renderActivitiesTab(tabContent, vendor, data);
  }

  // ---------------------------------------------------------------------------------
  // Page entry point
  // ---------------------------------------------------------------------------------

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    // Redesign Gate 6 (Global Project Context): see risks.js's own comment on this
    // exact pattern. renderVendorList()'s own project filter reads uiState.projectFilter
    // directly, so seeding it here once covers it regardless of which view is active.
    if (!uiState.projectFilterInitialized) {
      uiState.projectFilterInitialized = true;
      var ctxProjectId = window.PCC.projectContext.get();
      if (ctxProjectId && data.projects.some(function (p) { return p.id === ctxProjectId; })) {
        uiState.projectFilter = ctxProjectId;
      }
    }

    var h1 = document.createElement("h2");
    h1.textContent = "Vendor Management";
    h1.style.marginBottom = "var(--space-2)";
    outlet.appendChild(h1);

    var subNote = document.createElement("p");
    subNote.className = "text-secondary";
    subNote.style.fontSize = "var(--text-sm)";
    subNote.style.marginBottom = "var(--space-4)";
    subNote.textContent =
      "The single source of truth for vendor information across every project — master list, project links, " +
      "documents, meetings, RFI/TQ, risks, and performance, all from one profile.";
    outlet.appendChild(subNote);

    if (uiState.view !== "profile") {
      var viewToggle = document.createElement("div");
      viewToggle.className = "tab-bar";
      viewToggle.style.marginBottom = "var(--space-4)";
      [
        { key: "dashboard", label: "Dashboard" },
        { key: "list", label: "Vendor List" },
      ].forEach(function (t) {
        var btn = document.createElement("button");
        btn.className = "tab-btn" + (uiState.view === t.key ? " tab-btn--active" : "");
        btn.textContent = t.label;
        btn.onclick = function () {
          uiState.view = t.key;
          rerender();
        };
        viewToggle.appendChild(btn);
      });
      outlet.appendChild(viewToggle);
    }

    if (uiState.view === "dashboard") renderDashboard(outlet, data, rerender);
    else if (uiState.view === "list") renderVendorList(outlet, data, rerender);
    else if (uiState.view === "profile") renderProfile(outlet, data, rerender);
  }

  window.PCC.pages.vendors = render;
  window.PCC.vendors = {
    // Gate (PCC Evolution Roadmap, Tier C: Vendor Performance Centre) — optional second
    // argument lands directly on a specific profile tab, same "land exactly on the linked
    // record" convention as every other reverse-navigation API in this app (e.g. Gate 10's
    // viewActivity landing on the Gantt detail panel). Defaults to "overview" so every
    // existing caller is unaffected.
    openProfile: function (vendorId, tab) {
      uiState.view = "profile";
      uiState.profileVendorId = vendorId;
      uiState.profileTab = tab || "overview";
    },
    // Same "View All" convention every other register exposes (risks.js, meetings.js,
    // etc.) — Portfolio's project details panel calls this before navigating here.
    filterByProject: function (projectId) {
      uiState.view = "list";
      uiState.projectFilter = projectId;
      uiState.projectFilterInitialized = true;
      uiState.search = "";
      uiState.statusFilter = "";
      uiState.tradeFilter = "";
      uiState.docTypeFilter = "";
      window.PCC.projectContext.set(projectId);
    },
  };
})();
