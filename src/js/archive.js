(function () {
  "use strict";
  window.PCC = window.PCC || {};

  function sanitizeName(name) {
    var cleaned = (name || "Untitled").replace(/[\\/:*?"<>|]/g, "-").trim();
    return cleaned || "Untitled";
  }

  function base64OfDataUri(dataUri) {
    var commaIdx = dataUri.indexOf(",");
    return dataUri.slice(commaIdx + 1);
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 30000);
  }

  /** Adds each document's file into `folder` (a JSZip folder object), resolving each
   * one's bytes via blobStore.resolve() \u2014 inline for legacy records, from IndexedDB
   * otherwise. Sequential, not parallel: filename de-duplication depends on processing
   * `docs` in a stable order, and a parallel Promise.all here would make which document
   * gets the "-1" suffix a race condition. Documents with no resolvable file (missing
   * blob) are skipped and counted so the caller can tell the person how many were left
   * out. Duplicate filenames within the same folder get a numeric suffix so nothing
   * overwrites. Returns a Promise resolving to the skipped count. */
  function addDocsToFolder(folder, docs) {
    var usedNames = {};
    var skipped = 0;
    return docs
      .reduce(function (chain, doc) {
        return chain.then(function () {
          return window.PCC.blobStore
            .resolve(doc.id, doc.file_data)
            .then(function (fileData) {
              if (!fileData) {
                skipped++;
                return;
              }
              var name = doc.filename || "file";
              if (usedNames[name] !== undefined) {
                usedNames[name]++;
                var dot = name.lastIndexOf(".");
                name = dot === -1 ? name + "-" + usedNames[name] : name.slice(0, dot) + "-" + usedNames[name] + name.slice(dot);
              } else {
                usedNames[name] = 0;
              }
              folder.file(name, base64OfDataUri(fileData), { base64: true });
            })
            .catch(function () {
              skipped++;
            });
        });
      }, Promise.resolve())
      .then(function () {
        return skipped;
      });
  }

  /** Zips one project's attached documents into a single top-level folder named after
   * the project, and downloads it as <ProjectName>-archive.zip. */
  function exportProjectArchive(project, allDocuments) {
    var docs = allDocuments.filter(function (d) {
      return d.project_id === project.id;
    });
    if (docs.length === 0) {
      window.PCC.notify("This project has no attached documents to archive.", "info");
      return;
    }
    var zip = new window.JSZip();
    var folderName = sanitizeName(project.name);
    var folder = zip.folder(folderName);

    addDocsToFolder(folder, docs)
      .then(function (skipped) {
        return zip.generateAsync({ type: "blob" }).then(function (blob) {
          triggerDownload(blob, folderName + "-archive.zip");
          var included = docs.length - skipped;
          var msg = "Archive downloaded (" + included + " file" + (included === 1 ? "" : "s") + ").";
          if (skipped > 0) {
            msg += " " + skipped + " document" + (skipped === 1 ? "" : "s") + " had no stored file and " + (skipped === 1 ? "was" : "were") + " skipped.";
          }
          window.PCC.notify(msg, "success");
        });
      })
      .catch(function (e) {
        window.PCC.notify("Could not build the archive: " + e.message, "error");
      });
  }

  /** Zips every document across every project, one folder per project (plus an
   * "Unassigned" folder for documents not linked to a project), and downloads it. */
  function exportAllArchive(projects, allDocuments) {
    if (allDocuments.length === 0) {
      window.PCC.notify("No documents to archive yet.", "info");
      return;
    }
    var zip = new window.JSZip();
    var totalSkipped = 0;
    var totalIncluded = 0;

    var chain = projects.reduce(function (chainAcc, project) {
      return chainAcc.then(function () {
        var docs = allDocuments.filter(function (d) {
          return d.project_id === project.id;
        });
        if (docs.length === 0) return;
        var folder = zip.folder(sanitizeName(project.name));
        return addDocsToFolder(folder, docs).then(function (skipped) {
          totalSkipped += skipped;
          totalIncluded += docs.length - skipped;
        });
      });
    }, Promise.resolve());

    chain
      .then(function () {
        var unassigned = allDocuments.filter(function (d) {
          return !d.project_id;
        });
        if (unassigned.length === 0) return;
        var unassignedFolder = zip.folder("Unassigned");
        return addDocsToFolder(unassignedFolder, unassigned).then(function (skippedU) {
          totalSkipped += skippedU;
          totalIncluded += unassigned.length - skippedU;
        });
      })
      .then(function () {
        if (totalIncluded === 0) {
          window.PCC.notify("No documents with stored files to archive.", "info");
          return;
        }
        var stamp = new Date().toISOString().slice(0, 10);
        return zip.generateAsync({ type: "blob" }).then(function (blob) {
          triggerDownload(blob, "project-control-center-archive-" + stamp + ".zip");
          var msg =
            "Archive downloaded (" + totalIncluded + " file" + (totalIncluded === 1 ? "" : "s") + " across " + projects.length + " project folder" + (projects.length === 1 ? "" : "s") + ").";
          if (totalSkipped > 0) {
            msg += " " + totalSkipped + " document" + (totalSkipped === 1 ? "" : "s") + " had no stored file and " + (totalSkipped === 1 ? "was" : "were") + " skipped.";
          }
          window.PCC.notify(msg, "success");
        });
      })
      .catch(function (e) {
        window.PCC.notify("Could not build the archive: " + e.message, "error");
      });
  }

  window.PCC.archive = {
    exportProject: exportProjectArchive,
    exportAll: exportAllArchive,
  };
})();
