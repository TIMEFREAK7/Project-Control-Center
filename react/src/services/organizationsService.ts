/* Service boundary for the Companies & Clients page (master prompt §9: React must not own
 * core calculations — thin wrapper over the same store globals the vanilla page used).
 *
 * getData() returns a FRESH top-level object reference (Object.assign({}, store.get()))
 * for the same reason every other migrated service does — see CLAUDE.md's React
 * migration notes on the fresh-object-reference rule.
 */
import type { PCCStoreData, PCCProject, PCCCompany, PCCClient } from "../types/pcc";

export var STATUS_LABELS: { [status: string]: string } = { on_track: "On Track", at_risk: "At Risk", critical: "Critical", complete: "Complete" };
export var STATUS_BADGE_CLASS: { [status: string]: string } = { on_track: "on_track", at_risk: "at_risk", critical: "critical", complete: "info" };

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function clientsOf(data: PCCStoreData, companyId: string): PCCClient[] {
  return data.clients
    .filter(function (c) {
      return c.company_id === companyId;
    })
    .slice()
    .sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
}

export function projectsOf(data: PCCStoreData, companyId: string, clientId: string): PCCProject[] {
  return data.projects
    .filter(function (p) {
      return p.company_id === companyId && p.client_id === clientId;
    })
    .slice()
    .sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
}

export function newCompany(prefill?: Partial<PCCCompany>): PCCCompany {
  return window.PCC.store.newCompany(prefill || {});
}

export function newClient(prefill?: Partial<PCCClient>): PCCClient {
  return window.PCC.store.newClient(prefill || {});
}

export function saveCompany(isNew: boolean, companyId: string | undefined, values: Partial<PCCCompany>): void {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.companies.push(window.PCC.store.newCompany(values));
    } else {
      var existing = d.companies.find(function (c) {
        return c.id === companyId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Company added." : "Company updated.", "success");
}

export function saveClient(isNew: boolean, clientId: string | undefined, companyId: string, values: Partial<PCCClient>): void {
  window.PCC.store.update(function (d) {
    if (isNew) {
      var record = Object.assign({}, values, { company_id: companyId });
      d.clients.push(window.PCC.store.newClient(record));
    } else {
      var existing = d.clients.find(function (c) {
        return c.id === clientId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Client added." : "Client updated.", "success");
}

export function toggleCompanyArchived(companyId: string, wasArchived: boolean | undefined): void {
  window.PCC.store.update(function (d) {
    var existing = d.companies.find(function (c) {
      return c.id === companyId;
    });
    if (existing) {
      existing.archived = !existing.archived;
      existing.updated_at = new Date().toISOString();
    }
  });
  window.PCC.notify(
    wasArchived ? "Company unarchived." : "Company archived. Its clients and projects remain intact and accessible.",
    "info"
  );
}

export function toggleClientArchived(clientId: string, wasArchived: boolean | undefined): void {
  window.PCC.store.update(function (d) {
    var existing = d.clients.find(function (c) {
      return c.id === clientId;
    });
    if (existing) {
      existing.archived = !existing.archived;
      existing.updated_at = new Date().toISOString();
    }
  });
  window.PCC.notify(wasArchived ? "Client unarchived." : "Client archived. Its projects and their data remain intact.", "info");
}

export function openProjectWorkspace(projectId: string): void {
  window.PCC.projectContext.set(projectId);
  window.PCC.router.go("projectWorkspace");
}

/** Spec point 5B (Relationship-Based Creation): hand off to Portfolio's own "+ Add
 * Project" flow with Company/Client already chosen, rather than duplicating the full
 * project form here — same window.PCC.pendingProjectPrefill global handoff the vanilla
 * page used, which Portfolio (still vanilla) reads on its own. */
export function newProjectHandoff(companyId: string, clientId: string): void {
  window.PCC.pendingProjectPrefill = { company_id: companyId, client_id: clientId };
  window.PCC.router.go("portfolio");
}
