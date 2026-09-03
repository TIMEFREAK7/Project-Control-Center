/* Reports, migrated to React as part of the page-by-page migration (Post-Phase-5
 * Engineering Evolution). Reproduces the prior vanilla page's exact text, toolbar/
 * template-panel structure and CSS class names (toolbar/panel/report-doc/btn) — same
 * visual result, only the implementation moved. See src/js/pages/reports.js (now a
 * ~10-line stub) for the router registration; there is no public API to preserve.
 *
 * The toolbar, template CRUD panel, section checkboxes, and per-section day-window
 * selects below are real interactive JSX. The assembled report DOCUMENT itself
 * (buildProjectReport()/buildPortfolioReport() in reportsService.js) stays a plain
 * DOM-building function, unchanged from the vanilla page — it's a read-only, printable
 * table layout with no interactive elements, so translating ~500 lines of table-building
 * logic to JSX would add transcription risk with no functional benefit. ReportViewer
 * embeds the returned DOM node via a ref + useEffect that reruns whenever any input the
 * report depends on actually changes (reportType/project/sections/sectionDays/data) —
 * unlike Dashboard.jsx's context-switcher effect (which runs once on mount only), this
 * one legitimately needs to rerun on every relevant state change, so (like any non-initial
 * effect) it commits asynchronously — tests must await flush() after toggling a section
 * checkbox or switching report type before reading the assembled report's content.
 */
import React, { useState, useRef, useEffect } from "react";
import {
  PROJECT_SECTIONS,
  PORTFOLIO_SECTIONS,
  allSectionsOn,
  REPORT_DAY_WINDOW_OPTIONS,
  REPORT_DAY_SECTION_LABELS,
  buildProjectReport,
  buildPortfolioReport,
  getData,
  getProjectContext,
  setProjectContext,
  saveTemplateChanges,
  saveNewTemplate,
  deleteTemplate,
  notify,
  printPage,
} from "../services/reportsService.js";

function ReportViewer({ reportType, project, data, sections, sectionDays }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    container.innerHTML = "";
    let doc;
    if (reportType === "project") {
      if (!project) {
        const p = document.createElement("p");
        p.className = "text-secondary";
        p.style.fontSize = "12px";
        p.style.margin = "4px 0 0";
        p.textContent = "Add a project in Portfolio first to generate a status report.";
        container.appendChild(p);
        return;
      }
      doc = buildProjectReport(project, data, sections, sectionDays);
    } else {
      doc = buildPortfolioReport(data, sections);
    }
    container.appendChild(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, project, data, sections, sectionDays]);

  return <div ref={containerRef} />;
}

export default function ReportsPage() {
  const [data, setData] = useState(() => getData());
  const [reportType, setReportType] = useState("project");
  const [projectId, setProjectId] = useState(() => {
    const ctxProjectId = getProjectContext();
    if (ctxProjectId && data.projects.some((p) => p.id === ctxProjectId)) return ctxProjectId;
    return data.projects.length > 0 ? data.projects[0].id : "";
  });
  const [sections, setSections] = useState({ project: allSectionsOn(PROJECT_SECTIONS), portfolio: allSectionsOn(PORTFOLIO_SECTIONS) });
  const [selectedTemplateId, setSelectedTemplateId] = useState({ project: "", portfolio: "" });
  const [savingAsNew, setSavingAsNew] = useState(false);
  const [reportSectionDays, setReportSectionDays] = useState({ dailyLog: "", meetings: "", documents: "" });

  function refresh() {
    setData(getData());
  }

  const newTemplateNameRef = useRef(null);

  const projects = data.projects;
  const sectionKeys = reportType === "project" ? PROJECT_SECTIONS : PORTFOLIO_SECTIONS;
  const currentTemplates = data.report_templates.filter((t) => t.report_type === reportType);
  const currentTemplate = currentTemplates.find((t) => t.id === selectedTemplateId[reportType]);
  const project = projects.find((p) => p.id === projectId) || projects[0];

  function handleReportTypeChange(value) {
    setReportType(value);
  }

  function handleProjectChange(value) {
    setProjectId(value);
    setProjectContext(value);
  }

  function handleTemplateChange(value) {
    const chosen = currentTemplates.find((t) => t.id === value);
    if (chosen) {
      const applied = {};
      Object.keys(sectionKeys).forEach((k) => {
        applied[k] = chosen.sections[k] !== false;
      });
      setSections((prev) => Object.assign({}, prev, { [reportType]: applied }));
      setSelectedTemplateId((prev) => Object.assign({}, prev, { [reportType]: chosen.id }));
    } else {
      setSelectedTemplateId((prev) => Object.assign({}, prev, { [reportType]: "" }));
    }
  }

  function handleSaveChanges() {
    saveTemplateChanges(currentTemplate.id, sections[reportType]);
    notify("Template updated.", "success");
    refresh();
  }

  function handleDeleteTemplate() {
    if (!window.confirm('Delete the template "' + currentTemplate.name + '"? This can\'t be undone.')) return;
    deleteTemplate(currentTemplate.id);
    setSelectedTemplateId((prev) => Object.assign({}, prev, { [reportType]: "" }));
    notify("Template deleted.", "info");
    refresh();
  }

  function handleConfirmSaveNew() {
    const name = newTemplateNameRef.current.value.trim();
    if (!name) {
      notify("Enter a template name.", "warning");
      return;
    }
    const newTemplate = saveNewTemplate(reportType, name, sections[reportType]);
    setSelectedTemplateId((prev) => Object.assign({}, prev, { [reportType]: newTemplate.id }));
    setSavingAsNew(false);
    notify("Template saved.", "success");
    refresh();
  }

  function handleToggleSection(key) {
    setSections((prev) =>
      Object.assign({}, prev, { [reportType]: Object.assign({}, prev[reportType], { [key]: !prev[reportType][key] }) })
    );
  }

  return (
    <>
      <h2 className="focus-mode-hide" style={{ marginBottom: 16 }}>
        Reports
      </h2>

      <div className="toolbar no-print">
        <select value={reportType} onChange={(e) => handleReportTypeChange(e.target.value)}>
          <option value="project">Project Status Report</option>
          <option value="portfolio">Portfolio Summary Report</option>
        </select>

        <select value={projectId} style={{ display: reportType === "project" ? "" : "none" }} onChange={(e) => handleProjectChange(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "(unnamed project)"}
            </option>
          ))}
        </select>

        <div className="toolbar__spacer" />

        <button className="btn btn--primary" onClick={printPage}>
          Print / Save as PDF
        </button>
      </div>

      <div className="panel no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13 }}>Template:</span>
          <select value={selectedTemplateId[reportType]} onChange={(e) => handleTemplateChange(e.target.value)}>
            <option value="">— Custom selection —</option>
            {currentTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {currentTemplate ? (
            <>
              <button className="btn btn--ghost" onClick={handleSaveChanges}>
                Save Changes
              </button>
              <button className="btn btn--ghost" onClick={handleDeleteTemplate}>
                Delete Template
              </button>
            </>
          ) : null}

          <button
            className="btn btn--ghost"
            onClick={() => {
              setSavingAsNew(true);
            }}
          >
            Save as New…
          </button>
        </div>

        {savingAsNew ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input type="text" placeholder="Template name, e.g. “Client Report”" defaultValue="" ref={newTemplateNameRef} />
            <button className="btn btn--primary" onClick={handleConfirmSaveNew}>
              Save
            </button>
            <button className="btn btn--ghost" onClick={() => setSavingAsNew(false)}>
              Cancel
            </button>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 6,
            marginTop: 10,
          }}
        >
          {Object.keys(sectionKeys).map((key) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={!!sections[reportType][key]} onChange={() => handleToggleSection(key)} />
              {sectionKeys[key]}
            </label>
          ))}
        </div>

        {reportType === "project" ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--divider)",
            }}
          >
            {Object.keys(REPORT_DAY_SECTION_LABELS).map((key) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span>{REPORT_DAY_SECTION_LABELS[key]}:</span>
                <select
                  value={reportSectionDays[key]}
                  disabled={!sections.project[key]}
                  onChange={(e) => setReportSectionDays((prev) => Object.assign({}, prev, { [key]: e.target.value }))}
                >
                  {REPORT_DAY_WINDOW_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <div className="panel">
        <ReportViewer reportType={reportType} project={project} data={data} sections={sections[reportType]} sectionDays={reportSectionDays} />
      </div>
    </>
  );
}
