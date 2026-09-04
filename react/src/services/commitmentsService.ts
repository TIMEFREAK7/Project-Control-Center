/* Service boundary for the Commitment Management page (master prompt §9). Thin wrapper
 * over the existing store globals, unchanged from the vanilla page. getData() returns a
 * FRESH top-level object reference (see CLAUDE.md's React migration notes).
 */
import type { PCCStoreData, PCCProject, PCCVendor, PCCPackage, PCCCommitment, PCCActivity } from "../types/pcc";

export var TYPE_LABELS: { [type: string]: string } = {
  purchase_order: "Purchase Order",
  subcontract: "Subcontract",
  vendor_commitment: "Vendor Commitment",
  material_commitment: "Material Commitment",
  service_commitment: "Service Commitment",
  approved_commercial_commitment: "Approved Commercial Commitment",
};
export var STATUS_LABELS: { [status: string]: string } = { draft: "Draft", issued: "Issued", approved: "Approved", closed: "Closed", cancelled: "Cancelled" };

export var COMMITMENT_RISK_WINDOW_DAYS = 7;

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(projects: PCCProject[], projectId: string | undefined): string {
  var p = projects.find(function (x) {
    return x.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "(project removed)";
}
export function vendorName(vendors: PCCVendor[], vendorId: string | undefined): string {
  if (!vendorId) return "";
  var v = vendors.find(function (x) {
    return x.id === vendorId;
  });
  return v ? v.vendor_name || "(unnamed vendor)" : "(vendor deleted)";
}
export function packageName(packages: PCCPackage[], packageId: string | undefined): string {
  if (!packageId) return "";
  var p = packages.find(function (x) {
    return x.id === packageId;
  });
  return p ? p.name || "(unnamed package)" : "(package deleted)";
}

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  var n = Number(value);
  if (isNaN(n)) return "—";
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function actualValueFor(data: PCCStoreData, commitmentId: string): number {
  return data.cost_actuals
    .filter(function (a) {
      return a.commitment_id === commitmentId;
    })
    .reduce(function (sum, a) {
      return sum + (Number(a.amount) || 0);
    }, 0);
}

export function remainingFor(committedValue: number | null | undefined, actual: number): number | null {
  if (committedValue === null || committedValue === undefined) return null;
  return Number(committedValue) - actual;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(isoDateStr: string, days: number): string {
  var d = new Date(isoDateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function activityEffectiveStart(activity: PCCActivity | undefined): string | null {
  if (!activity || activity.activity_type === "milestone") return null;
  return activity.early_start || activity.planned_start || null;
}

export function commitmentIsAtRisk(c: PCCCommitment, data: PCCStoreData): boolean {
  if (!c.activity_id || c.status === "approved" || c.status === "closed" || c.status === "cancelled") return false;
  var activity = data.activities.find(function (a) {
    return a.id === c.activity_id;
  });
  var start = activityEffectiveStart(activity);
  if (!start) return false;
  return start <= addDaysIso(todayIso(), COMMITMENT_RISK_WINDOW_DAYS);
}

export interface ActivityOption {
  id: string;
  label: string;
}

export function activitiesForProject(data: PCCStoreData, projectId: string): ActivityOption[] {
  if (!projectId) return [];
  var scheduleNameById: { [id: string]: string | undefined } = {};
  data.schedules
    .filter(function (s) {
      return s.project_id === projectId;
    })
    .forEach(function (s) {
      scheduleNameById[s.id] = s.name;
    });
  return data.activities
    .filter(function (a) {
      return a.project_id === projectId;
    })
    .map(function (a) {
      return { id: a.id, label: (scheduleNameById[a.schedule_id] || "(schedule)") + ": " + (a.name || "(unnamed activity)") };
    });
}

export interface BudgetItemOption {
  id: string;
  label: string;
}

export function budgetItemsForProject(data: PCCStoreData, projectId: string): BudgetItemOption[] {
  if (!projectId) return [];
  return data.cost_budget_items
    .filter(function (b) {
      return b.project_id === projectId;
    })
    .map(function (b) {
      return { id: b.id, label: b.name || "(unnamed budget item)" };
    });
}

export function newCommitment(prefill?: Partial<PCCCommitment> | null): PCCCommitment {
  return window.PCC.store.newCommitment(prefill || {});
}
export function saveCommitment(isNew: boolean, commitmentId: string | undefined, values: Partial<PCCCommitment>): void {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.commitments.push(window.PCC.store.newCommitment(values));
    } else {
      var existing = d.commitments.find(function (c) {
        return c.id === commitmentId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Commitment added." : "Commitment updated.", "success");
}
export function deleteCommitment(id: string): void {
  window.PCC.store.update(function (d) {
    d.commitments = d.commitments.filter(function (item) {
      return item.id !== id;
    });
    d.cost_actuals.forEach(function (a) {
      if (a.commitment_id === id) a.commitment_id = "";
    });
  });
  window.PCC.notify("Commitment deleted.", "success");
}

export function newPackage(prefill?: Partial<PCCPackage> | null): PCCPackage {
  return window.PCC.store.newPackage(prefill || {});
}
export function savePackage(isNew: boolean, packageId: string | undefined, values: Partial<PCCPackage>): void {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.packages.push(window.PCC.store.newPackage(values));
    } else {
      var existing = d.packages.find(function (p) {
        return p.id === packageId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Package added." : "Package updated.", "success");
}
export function deletePackage(id: string): void {
  window.PCC.store.update(function (d) {
    d.packages = d.packages.filter(function (item) {
      return item.id !== id;
    });
    d.commitments.forEach(function (c) {
      if (c.package_id === id) c.package_id = "";
    });
    d.documents.forEach(function (doc) {
      if (doc.package_id === id) doc.package_id = "";
    });
  });
  window.PCC.notify("Package deleted.", "success");
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

export function viewActivityInSchedule(activity: PCCActivity): void {
  if (window.PCC.schedule) {
    window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
    window.PCC.router.go("schedule");
  }
}
