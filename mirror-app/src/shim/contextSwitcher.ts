/* Company/Client/Project "CURRENT CONTEXT" switcher — ported forward from
 * src/js/layout.js's buildContextSwitcherGroup()/populateCompanySelect()/
 * populateClientSelect()/populateProjectSelect()/optionForProject(), byte-for-byte
 * identical cascading logic (same option grouping, same "Pinned" optgroup, same
 * scoping rules), NOT a reimplementation from scratch. Real code, minimally adapted for
 * this app's one difference from the main app: there is only ever ONE switcher instance
 * on screen (Dashboard's own embedded copy — mirror-app has no persistent shell header),
 * so the original's multi-instance CONTEXT_SWITCHER_ID_PREFIXES refresh loop collapses
 * to refreshing whichever single instance was actually built.
 *
 * This is real, not a no-op stub, because unlike the "jump to full record" navigation
 * buttons this shim otherwise stubs out, switching Company/Client/Project genuinely
 * changes what every page displays (window.PCC.projectContext.get(), reused unmodified
 * from src/js/projectContext.js) — it has to actually work.
 */
import type { PCCStoreData, PCCProject, PCCClient, PCCCompany } from "../../../react/src/types/pcc";

interface Selects {
  company: HTMLSelectElement;
  client: HTMLSelectElement;
  project: HTMLSelectElement;
}

const instances: { [idPrefix: string]: Selects } = {};

/* The shared pcc.d.ts ambient type only declares the 4 projectContext methods the main
 * app's own React pages currently call (get/set/isPinned/togglePin) -- the real, reused
 * src/js/projectContext.js has always exposed more (getPinnedIds/getCompany/getClient/
 * setCompany/setClient/activeCompanies/clientsForCompany/projectsForCompanyClient, all
 * ported from src/js/layout.js's own use of them). Typed locally here rather than
 * widening the shared ambient interface, since only this file needs them. */
interface FullProjectContext {
  get(): string;
  set(projectId: string): void;
  isPinned(projectId: string): boolean;
  togglePin(projectId: string): void;
  getPinnedIds(): string[];
  getCompany(): string;
  getClient(): string;
  setCompany(companyId: string): void;
  setClient(clientId: string): void;
  activeCompanies(data: PCCStoreData): PCCCompany[];
  clientsForCompany(data: PCCStoreData, companyId: string): PCCClient[];
  projectsForCompanyClient(data: PCCStoreData, companyId: string, clientId: string): PCCProject[];
}

function pc(): FullProjectContext {
  return window.PCC.projectContext as unknown as FullProjectContext;
}

function optionForProject(p: PCCProject): HTMLOptionElement {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.name || "(unnamed project)";
  return opt;
}

function populateProjectSelect(select: HTMLSelectElement, data: PCCStoreData, companyId: string, clientId: string) {
  const context = pc();
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All Projects";
  select.appendChild(allOpt);

  const scopedProjects = (
    companyId && clientId
      ? context.projectsForCompanyClient(data, companyId, clientId)
      : data.projects.filter((p) => !p.archived)
  ).sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));

  const pinnedIds = context.getPinnedIds();
  const scopedIdSet: { [id: string]: boolean } = {};
  scopedProjects.forEach((p) => {
    scopedIdSet[p.id] = true;
  });
  const scopedPinnedIds = pinnedIds.filter((id) => scopedIdSet[id]);
  if (scopedPinnedIds.length > 0) {
    const pinnedGroup = document.createElement("optgroup");
    pinnedGroup.label = "Pinned";
    scopedPinnedIds.forEach((id) => {
      const p = scopedProjects.find((proj) => proj.id === id);
      if (p) pinnedGroup.appendChild(optionForProject(p));
    });
    select.appendChild(pinnedGroup);
  }

  const pinnedIdSet: { [id: string]: boolean } = {};
  scopedPinnedIds.forEach((id) => {
    pinnedIdSet[id] = true;
  });
  const unpinnedProjects = scopedProjects.filter((p) => !pinnedIdSet[p.id]);
  if (unpinnedProjects.length > 0) {
    const restGroup = scopedPinnedIds.length > 0 ? document.createElement("optgroup") : null;
    if (restGroup) restGroup.label = "All Projects";
    const target: HTMLElement = restGroup || select;
    unpinnedProjects.forEach((p) => target.appendChild(optionForProject(p)));
    if (restGroup) select.appendChild(restGroup);
  }

  select.value = context.get();
}

function populateClientSelect(select: HTMLSelectElement, data: PCCStoreData, companyId: string) {
  const context = pc();
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All Clients";
  select.appendChild(allOpt);
  select.disabled = !companyId;
  if (companyId) {
    context
      .clientsForCompany(data, companyId)
      .slice()
      .sort((a: PCCClient, b: PCCClient) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()))
      .forEach((c: PCCClient) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name || "(unnamed client)";
        select.appendChild(opt);
      });
  }
  select.value = context.getClient();
}

function populateCompanySelect(select: HTMLSelectElement, data: PCCStoreData) {
  const context = pc();
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All Companies";
  select.appendChild(allOpt);
  context
    .activeCompanies(data)
    .slice()
    .sort((a: any, b: any) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()))
    .forEach((c: any) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name || "(unnamed company)";
      select.appendChild(opt);
    });
  select.value = context.getCompany();
}

function refreshInstance(idPrefix: string) {
  const selects = instances[idPrefix];
  if (!selects) return;
  const data = window.PCC.store.get();
  populateCompanySelect(selects.company, data);
  populateClientSelect(selects.client, data, pc().getCompany());
  populateProjectSelect(selects.project, data, pc().getCompany(), pc().getClient());
}

function refreshAllInstances() {
  Object.keys(instances).forEach(refreshInstance);
}

function makeCell(
  idPrefix: string,
  key: keyof Selects,
  label: string,
  id: string,
  title: string,
  onChange: (v: string) => void
): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "title-block__cell";
  const lab = document.createElement("span");
  lab.className = "title-block__label";
  lab.textContent = label;
  div.appendChild(lab);
  const select = document.createElement("select");
  select.className = "title-block__project-select";
  select.id = id;
  select.title = title;
  select.onchange = () => {
    onChange(select.value);
    refreshAllInstances();
    window.PCC.router.render();
  };
  div.appendChild(select);
  instances[idPrefix] = instances[idPrefix] || ({} as Selects);
  instances[idPrefix][key] = select;
  return div;
}

export function buildContextSwitcher(idPrefix: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "title-block__context-group";

  wrap.appendChild(
    makeCell(idPrefix, "company", "COMPANY", idPrefix + "-company-select", "Current Company context — filters Client and Project below", (v) => {
      pc().setCompany(v);
    })
  );
  wrap.appendChild(
    makeCell(idPrefix, "client", "CLIENT", idPrefix + "-client-select", "Current Client context — filters Project below", (v) => {
      pc().setClient(v);
    })
  );
  wrap.appendChild(
    makeCell(idPrefix, "project", "PROJECT", idPrefix + "-project-select", "Current project context — carries across every project-scoped page", (v) => {
      pc().set(v);
    })
  );

  refreshInstance(idPrefix);
  return wrap;
}
