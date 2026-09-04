/* Service boundary for the Vendor Management page (master prompt §9). Thin wrapper
 * over the existing store/blobStore/fileViewer/duplicateService globals — never
 * reimplemented here. getData() returns a FRESH top-level object reference (see
 * CLAUDE.md's React migration notes).
 */
import type {
  PCCStoreData,
  PCCProject,
  PCCVendor,
  PCCVendorContact,
  PCCVendorProjectLink,
  PCCVendorDocument,
  PCCVendorPerformance,
  PCCDelayActivityLink,
} from "../types/pcc";

export var VENDOR_STATUS_LABELS: { [status: string]: string } = { active: "Active", inactive: "Inactive", preferred: "Preferred Vendor", blacklisted: "Blacklisted" };
export var CONTRACT_STATUS_LABELS: { [status: string]: string } = { draft: "Draft", active: "Active", completed: "Completed", terminated: "Terminated" };
export var VENDOR_DOCUMENT_CATEGORY_LABELS: { [category: string]: string } = {
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
export var RFI_TYPE_LABELS: { [type: string]: string } = { rfi: "RFI", technical_query: "Technical Query" };
export var RFI_STATUS_LABELS: { [status: string]: string } = { open: "Open", answered: "Answered", closed: "Closed" };
export var EXPIRING_SOON_DAYS = 30;
export var REQUIREMENT_STATUS_BADGE: { [status: string]: { className: string; label: string } } = {
  available: { className: "complete", label: "Available" },
  overdue: { className: "critical", label: "Overdue" },
  required: { className: "at_risk", label: "Required" },
};

export var VENDOR_DELAY_CATEGORY_LABELS: { [category: string]: string } = {
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

export interface FieldConfig {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  labels?: { [value: string]: string };
}

export var VENDOR_FIELD_CONFIG: FieldConfig[] = [
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
export var VENDOR_ADDRESS_FIELD_CONFIG: FieldConfig[] = [
  { key: "office_address", label: "Office Address", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "country", label: "Country", type: "text" },
  { key: "postal_code", label: "Postal Code", type: "text" },
];

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "0 KB";
  var kb = bytes / 1024;
  if (kb < 1024) return Math.round(kb) + " KB";
  return (kb / 1024).toFixed(1) + " MB";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  var bytes = new Uint8Array(buffer);
  var chunkSize = 8192;
  var chunks: string[] = [];
  for (var i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize))));
  }
  return btoa(chunks.join(""));
}

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(projects: PCCProject[], projectId: string | undefined): string {
  if (!projectId) return "—";
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "(deleted project)";
}

export function vendorName(vendors: PCCVendor[], vendorId: string | undefined): string {
  var v = vendors.find(function (x) {
    return x.id === vendorId;
  });
  return v ? v.vendor_name || "(unnamed vendor)" : "(deleted vendor)";
}

export function daysUntil(isoDate: string | undefined): number | null {
  if (!isoDate) return null;
  var ms = new Date(isoDate + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function overallRating(perf: PCCVendorPerformance): number {
  var vals = [perf.quality_rating, perf.delivery_rating, perf.communication_rating, perf.safety_rating].filter(function (v): v is number {
    return !!v && v > 0;
  });
  if (vals.length === 0) return 0;
  var sum = vals.reduce(function (a, b) {
    return a + b;
  }, 0);
  return Math.round((sum / vals.length) * 10) / 10;
}

export function ratingText(n: number): string {
  return n > 0 ? n.toFixed(1).replace(/\.0$/, "") + " / 5" : "Not rated";
}

export function latestDocumentsForVendor(allVendorDocs: PCCVendorDocument[], vendorId: string): PCCVendorDocument[] {
  var groups: { [key: string]: PCCVendorDocument } = {};
  allVendorDocs
    .filter(function (d) {
      return d.vendor_id === vendorId;
    })
    .forEach(function (d) {
      var key = d.document_group_id || d.id;
      if (!groups[key] || (d.revision_number || 0) > (groups[key].revision_number || 0)) groups[key] = d;
    });
  return Object.keys(groups)
    .map(function (k) {
      return groups[k];
    })
    .sort(function (a, b) {
      return (b.upload_date || "").localeCompare(a.upload_date || "");
    });
}

export function documentLabel(doc: PCCVendorDocument): string {
  if (doc.category === "other" && doc.custom_category_label) return doc.custom_category_label;
  return VENDOR_DOCUMENT_CATEGORY_LABELS[doc.category || ""] || doc.category || "";
}

export function openStoredVendorDocument(doc: PCCVendorDocument): void {
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
      window.PCC.fileViewer.open({ filename: doc.filename || "", mimeType: mime, blob: blob });
    })
    .catch(function (e) {
      window.PCC.loadingIndicator.hide();
      window.PCC.notify("Could not open this file: " + e.message, "error");
    });
}

export interface VendorDelayStats {
  totalEvents: number;
  openCount: number;
  criticalCount: number;
  totalDelayDays: number;
  recoveryActionsCount: number;
  repeatedCauses: string[];
}

export function computeVendorDelayStats(vendor: PCCVendor, data: PCCStoreData): VendorDelayStats {
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
  var causeCounts: { [category: string]: number } = {};
  vendorDelays.forEach(function (r) {
    var links: PCCDelayActivityLink[] = data.delay_activity_links.filter(function (l) {
      return l.delay_id === r.id;
    });
    var impact = window.PCC.delayImpactEngine.computeDelayImpact(r, links, data);
    if (impact.overall_criticality === "critical") criticalCount++;
    var cat = r.delay_category || "other";
    causeCounts[cat] = (causeCounts[cat] || 0) + 1;
  });
  var delayIds: { [id: string]: boolean } = {};
  vendorDelays.forEach(function (r) {
    delayIds[r.id] = true;
  });
  var recoveryActionsCount = data.recovery_actions.filter(function (ra) {
    return !!ra.delay_id && !!delayIds[ra.delay_id];
  }).length;
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

export function vendorHaystack(v: PCCVendor, data: PCCStoreData): string {
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

export interface VendorFilters {
  statusFilter: string;
  projectFilter: string;
  tradeFilter: string;
  docTypeFilter: string;
  search: string;
}

export function vendorMatchesFilters(v: PCCVendor, data: PCCStoreData, filters: VendorFilters): boolean {
  if (filters.statusFilter && v.status !== filters.statusFilter) return false;
  if (filters.projectFilter) {
    var hasProject = data.vendor_project_links.some(function (l) {
      return l.vendor_id === v.id && l.project_id === filters.projectFilter;
    });
    if (!hasProject) return false;
  }
  if (filters.tradeFilter && (v.trade_discipline || "").toLowerCase() !== filters.tradeFilter.toLowerCase()) return false;
  if (filters.docTypeFilter) {
    var hasDocType = data.vendor_documents.some(function (d) {
      return d.vendor_id === v.id && d.category === filters.docTypeFilter;
    });
    if (!hasDocType) return false;
  }
  if (filters.search) {
    if (vendorHaystack(v, data).indexOf(filters.search.toLowerCase()) === -1) return false;
  }
  return true;
}

export function newVendor(): PCCVendor {
  return window.PCC.store.newVendor({ vendor_code: window.PCC.store.nextVendorCode(window.PCC.store.get().vendors) });
}

export interface ContactValues {
  name: string;
  designation: string;
  mobile: string;
  email: string;
}

export function saveVendor(isNew: boolean, vendorId: string | undefined, values: Partial<PCCVendor>, contactValues: ContactValues): string {
  var savedVendorId!: string;
  var contactProvided = contactValues.name || contactValues.designation || contactValues.mobile || contactValues.email;
  window.PCC.store.update(function (d) {
    if (isNew) {
      var newV = window.PCC.store.newVendor(values);
      d.vendors.push(newV);
      savedVendorId = newV.id;
    } else {
      var existing = d.vendors.find(function (v) {
        return v.id === vendorId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
      savedVendorId = vendorId as string;
    }

    if (contactProvided) {
      var primary = d.vendor_contacts.find(function (c) {
        return c.vendor_id === savedVendorId && c.is_primary;
      });
      if (primary) {
        Object.assign(primary, contactValues);
        primary.updated_at = new Date().toISOString();
      } else {
        d.vendor_contacts.push(window.PCC.store.newVendorContact(Object.assign({ vendor_id: savedVendorId, is_primary: true }, contactValues)));
      }
    }
  });
  window.PCC.notify(isNew ? "Vendor added." : "Vendor updated.", "success");
  return savedVendorId;
}

export function deleteVendor(vendorId: string): void {
  var data = window.PCC.store.get();
  var docIds = data.vendor_documents.filter(function (d) { return d.vendor_id === vendorId; }).map(function (d) { return d.id; });
  window.PCC.store.update(function (d) {
    d.vendors = d.vendors.filter(function (x) { return x.id !== vendorId; });
    d.vendor_contacts = d.vendor_contacts.filter(function (x) { return x.vendor_id !== vendorId; });
    d.vendor_project_links = d.vendor_project_links.filter(function (x) { return x.vendor_id !== vendorId; });
    d.vendor_documents = d.vendor_documents.filter(function (x) { return x.vendor_id !== vendorId; });
    d.vendor_meeting_links = d.vendor_meeting_links.filter(function (x) { return x.vendor_id !== vendorId; });
    d.vendor_rfi_links = d.vendor_rfi_links.filter(function (x) { return x.vendor_id !== vendorId; });
    d.vendor_risk_links = d.vendor_risk_links.filter(function (x) { return x.vendor_id !== vendorId; });
    d.vendor_performance = d.vendor_performance.filter(function (x) { return x.vendor_id !== vendorId; });
    d.vendor_notes = d.vendor_notes.filter(function (x) { return x.vendor_id !== vendorId; });
  });
  docIds.forEach(function (id) {
    window.PCC.blobStore.deleteBlob(id).catch(function () {});
  });
  window.PCC.notify("Vendor deleted.", "success");
}

export function newProjectLink(vendorId: string): PCCVendorProjectLink {
  return window.PCC.store.newVendorProjectLink({ vendor_id: vendorId });
}
export function saveProjectLink(isNew: boolean, linkId: string | undefined, vendorId: string, values: Partial<PCCVendorProjectLink>): void {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.vendor_project_links.push(window.PCC.store.newVendorProjectLink(Object.assign({ vendor_id: vendorId }, values)));
    } else {
      var existing = d.vendor_project_links.find(function (l) { return l.id === linkId; });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify("Project link saved.", "success");
}
export function deleteProjectLink(linkId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_project_links = d.vendor_project_links.filter(function (x) { return x.id !== linkId; });
  });
}

export function newContact(vendorId: string): PCCVendorContact {
  return window.PCC.store.newVendorContact({ vendor_id: vendorId });
}
export function saveContact(isNew: boolean, contactId: string | undefined, vendorId: string, values: Partial<PCCVendorContact>): void {
  window.PCC.store.update(function (d) {
    if (values.is_primary) {
      d.vendor_contacts.forEach(function (c) {
        if (c.vendor_id === vendorId && c.id !== contactId) c.is_primary = false;
      });
    }
    if (isNew) {
      d.vendor_contacts.push(window.PCC.store.newVendorContact(Object.assign({ vendor_id: vendorId }, values)));
    } else {
      var existing = d.vendor_contacts.find(function (c) { return c.id === contactId; });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify("Contact saved.", "success");
}
export function deleteContact(contactId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_contacts = d.vendor_contacts.filter(function (x) { return x.id !== contactId; });
  });
}

export interface PendingFile {
  name: string;
  size: number;
  type: string;
  fileData: string;
  hash: string;
  hashMethod: string;
}

export function readAndFingerprintFile(file: File): Promise<PendingFile> {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function () {
      reject(new Error("Could not read that file."));
    };
    reader.onload = function () {
      var buffer = reader.result as ArrayBuffer;
      var mimeType = file.type || "application/octet-stream";
      var fileDataUri = "data:" + mimeType + ";base64," + arrayBufferToBase64(buffer);
      window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
        resolve({ name: file.name, size: file.size, type: mimeType, fileData: fileDataUri, hash: fp.hash, hashMethod: fp.method });
      }, reject);
    };
    reader.readAsArrayBuffer(file);
  });
}

export interface VendorDocumentValues {
  project_id: string;
  category: string;
  custom_category_label: string;
  expiry_date: string;
  tags: string;
  comments: string;
}

export function saveVendorDocument(vendor: PCCVendor, pendingDocFile: PendingFile | null, values: VendorDocumentValues, pendingDocGroupId: string | null): Promise<void> {
  var data = window.PCC.store.get();
  var revisionNumber = 1;
  if (pendingDocGroupId) {
    var siblings = data.vendor_documents.filter(function (d) {
      return d.document_group_id === pendingDocGroupId;
    });
    revisionNumber = 1 + siblings.reduce(function (max, d) { return Math.max(max, d.revision_number || 0); }, 0);
  }

  var newDoc = window.PCC.store.newVendorDocument({
    vendor_id: vendor.id,
    document_group_id: pendingDocGroupId || "",
    revision_number: revisionNumber,
    project_id: values.project_id,
    category: values.category,
    custom_category_label: values.custom_category_label,
    filename: pendingDocFile!.name,
    file_size: pendingDocFile!.size,
    mime_type: pendingDocFile!.type,
    expiry_date: values.expiry_date,
    tags: values.tags,
    comments: values.comments,
    content_hash: pendingDocFile!.hash,
    hash_method: pendingDocFile!.hashMethod,
  });

  return window.PCC.blobStore.putBlob(newDoc.id, pendingDocFile!.fileData).then(function () {
    window.PCC.store.update(function (d) {
      d.vendor_documents.push(newDoc);
    });
    window.PCC.notify("Document saved.", "success");
  });
}

export function deleteVendorDocumentGroup(ids: string[]): void {
  window.PCC.store.update(function (d) {
    d.vendor_documents = d.vendor_documents.filter(function (x) { return ids.indexOf(x.id) === -1; });
  });
  ids.forEach(function (id) {
    window.PCC.blobStore.deleteBlob(id).catch(function () {});
  });
}

export function linkMeeting(vendorId: string, meetingId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_meeting_links.push(window.PCC.store.newVendorMeetingLink({ vendor_id: vendorId, meeting_id: meetingId }));
  });
}
export function unlinkMeeting(linkId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_meeting_links = d.vendor_meeting_links.filter(function (x) { return x.id !== linkId; });
  });
}
export function viewMeeting(meetingId: string): void {
  window.PCC.router.go("meetings");
  if (window.PCC.meetings) window.PCC.meetings.expandMeeting(meetingId);
  window.PCC.router.render();
}

export function linkRfi(vendorId: string, rfiId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_rfi_links.push(window.PCC.store.newVendorRfiLink({ vendor_id: vendorId, rfi_id: rfiId }));
  });
}
export function unlinkRfi(linkId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_rfi_links = d.vendor_rfi_links.filter(function (x) { return x.id !== linkId; });
  });
}
export function viewRfi(rfiId: string): void {
  window.PCC.router.go("rfis");
  if (window.PCC.rfis) window.PCC.rfis.expandRfi(rfiId);
  window.PCC.router.render();
}

export function linkRisk(vendorId: string, riskId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_risk_links.push(window.PCC.store.newVendorRiskLink({ vendor_id: vendorId, risk_id: riskId }));
  });
}
export function unlinkRisk(linkId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_risk_links = d.vendor_risk_links.filter(function (x) { return x.id !== linkId; });
  });
}
export function viewRisk(riskId: string): void {
  window.PCC.router.go("risks");
  if (window.PCC.risks) window.PCC.risks.expandRisk(riskId);
  window.PCC.router.render();
}

export function viewActivityInSchedule(projectId: string, scheduleId: string, activityId: string): void {
  window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}

export function newPerformance(vendorId: string): PCCVendorPerformance {
  return window.PCC.store.newVendorPerformance({ vendor_id: vendorId });
}
export function savePerformance(isNew: boolean, perfId: string | undefined, vendorId: string, values: Partial<PCCVendorPerformance>): void {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.vendor_performance.push(window.PCC.store.newVendorPerformance(Object.assign({ vendor_id: vendorId }, values)));
    } else {
      var existing = d.vendor_performance.find(function (p) { return p.id === perfId; });
      if (existing) Object.assign(existing, values);
    }
  });
  window.PCC.notify("Performance review saved.", "success");
}
export function deletePerformance(perfId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_performance = d.vendor_performance.filter(function (x) { return x.id !== perfId; });
  });
}

export function addNote(vendorId: string, text: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_notes.push(window.PCC.store.newVendorNote({ vendor_id: vendorId, note_text: text }));
  });
}
export function deleteNote(noteId: string): void {
  window.PCC.store.update(function (d) {
    d.vendor_notes = d.vendor_notes.filter(function (x) { return x.id !== noteId; });
  });
}

export function computeRequirementStatus(data: PCCStoreData, projectId: string, documentTypeId: string, plannedDate: string | null | undefined): string {
  var available = data.documents.some(function (d) {
    return d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at;
  });
  if (available) return "available";
  if (plannedDate && plannedDate < today()) return "overdue";
  return "required";
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}
