/* Service boundary for the Daily Log page (master prompt §9). Thin wrapper over the
 * existing store/blobStore globals, unchanged from the vanilla page. getData() returns a
 * FRESH top-level object reference (see CLAUDE.md's React migration notes).
 */

export var FIELD_CONFIG = [
  { key: "log_date", label: "Date", type: "date", required: true },
  { key: "weather", label: "Weather", type: "text", placeholder: "e.g. Sunny, 32°C" },
  { key: "manpower", label: "Manpower", type: "text", placeholder: "e.g. Direct: 45, Contractor: 120" },
  { key: "equipment", label: "Equipment on site", type: "text" },
  { key: "visitors", label: "Visitors", type: "text" },
  { key: "deliveries", label: "Deliveries", type: "text" },
  { key: "activities", label: "Activities", type: "textarea" },
  { key: "safety_notes", label: "Safety notes", type: "textarea" },
  { key: "incidents", label: "Incidents", type: "textarea" },
  { key: "notes", label: "General notes", type: "textarea" },
];
export var DETAIL_FIELDS = FIELD_CONFIG.filter(function (f) {
  return f.key !== "log_date";
});

export var LARGE_PHOTO_WARNING_BYTES = 8 * 1024 * 1024;

export var DAILY_LOG_DELAY_CATEGORY_LABELS = {
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
  resource_shortage: "Resource Shortage (Labour Shortage)",
  equipment_shortage: "Equipment Shortage",
  site_access: "Site Access Restriction",
  site_constraint: "Site Constraint (Workfront Unavailable)",
  interface_issue: "Interface Issue",
  weather: "Weather Interruption",
  procurement: "Procurement",
  quality_issue: "Quality Issue",
  rework: "Rework",
  change_variation: "Change / Variation",
  other: "Other",
};

export function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  var kb = bytes / 1024;
  if (kb < 1024) return Math.round(kb) + " KB";
  return (kb / 1024).toFixed(1) + " MB";
}

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(projects, projectId) {
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : null;
}

export function activitiesForProject(data, projectId) {
  var scheduleNameById = {};
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

export function newDailyLog(prefill) {
  return window.PCC.store.newDailyLog(prefill || {});
}

export function findDuplicateLog(projectId, logDate) {
  return window.PCC.store.get().daily_logs.find(function (d) {
    return d.project_id === projectId && d.log_date === logDate;
  });
}

export function saveDailyLog(isNew, logId, values) {
  window.PCC.store.update(function (data) {
    if (isNew) {
      data.daily_logs.push(window.PCC.store.newDailyLog(values));
    } else {
      var existing = data.daily_logs.find(function (d) {
        return d.id === logId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Daily log added." : "Daily log updated.", "success");
}

export function deleteDailyLog(id) {
  window.PCC.store.update(function (data) {
    data.daily_logs = data.daily_logs.filter(function (d) {
      return d.id !== id;
    });
  });
  window.PCC.notify("Daily log deleted.", "info");
}

export function getProjectContext() {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId) {
  window.PCC.projectContext.set(projectId);
}

export function viewActivityInSchedule(projectId, scheduleId, activityId) {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}

export function viewActivityForDelay(projectId, activityId, data) {
  var act = data.activities.find(function (a) {
    return a.id === activityId;
  });
  if (act && window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, act.schedule_id, act.id);
  window.PCC.router.go("schedule");
}

/** Blob written FIRST, metadata only committed once that succeeds — same "never orphan a
 * reference" rule Documents' own delete already establishes. */
export function openPhotoFullSize(photo) {
  window.PCC.loadingIndicator.show("Opening photo…");
  window.PCC.blobStore
    .resolve(photo.id, photo.file_data)
    .then(function (fileData) {
      window.PCC.loadingIndicator.hide();
      if (!fileData) {
        window.PCC.notify("No image data stored for this photo.", "warning");
        return;
      }
      var commaIdx = fileData.indexOf(",");
      var meta = fileData.slice(0, commaIdx);
      var b64 = fileData.slice(commaIdx + 1);
      var mimeMatch = /data:(.*);base64/.exec(meta);
      var mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      var binary = atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var blob = new Blob([bytes], { type: mime });
      var filename = (photo.caption || "photo").replace(/[\\/:*?"<>|]/g, "-") + ".jpg";
      window.PCC.fileViewer.open({ filename: filename, mimeType: mime, blob: blob });
    })
    .catch(function (e) {
      window.PCC.loadingIndicator.hide();
      window.PCC.notify("Could not open this photo: " + e.message, "error");
    });
}

export function resolvePhotoThumbnail(photo) {
  return window.PCC.blobStore.resolve(photo.id, photo.file_data);
}

export function updatePhotoCaption(logId, photoId, caption) {
  window.PCC.store.update(function (data) {
    var existingLog = data.daily_logs.find(function (d) {
      return d.id === logId;
    });
    var existingPhoto = existingLog && existingLog.photos.find(function (p) {
      return p.id === photoId;
    });
    if (existingPhoto) existingPhoto.caption = caption;
  });
}

export function removePhoto(logId, photoId) {
  window.PCC.store.update(function (data) {
    var existingLog = data.daily_logs.find(function (d) {
      return d.id === logId;
    });
    if (existingLog) {
      existingLog.photos = existingLog.photos.filter(function (p) {
        return p.id !== photoId;
      });
      existingLog.updated_at = new Date().toISOString();
    }
  });
  window.PCC.blobStore.deleteBlob(photoId).catch(function () {});
}

/** Sequential, not parallel: keeps behavior predictable and avoids many concurrent
 * IndexedDB writes plus many concurrent store.update() calls racing each other. Returns a
 * promise resolving to { anyLarge, anyFailed } once every file has been processed. */
export function addPhotos(logId, files) {
  var anyLarge = false;
  var anyFailed = false;

  var chain = files.reduce(function (chainAcc, file) {
    return chainAcc.then(function () {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () {
          if (file.size > LARGE_PHOTO_WARNING_BYTES) anyLarge = true;
          var photo = window.PCC.store.newDailyLogPhoto({
            filename: file.name,
            file_data: null,
            file_size: file.size,
          });
          window.PCC.blobStore
            .putBlob(photo.id, reader.result)
            .then(function () {
              window.PCC.store.update(function (data) {
                var existingLog = data.daily_logs.find(function (d) {
                  return d.id === logId;
                });
                if (existingLog) {
                  existingLog.photos.push(photo);
                  existingLog.updated_at = new Date().toISOString();
                }
              });
              resolve();
            })
            .catch(function () {
              anyFailed = true;
              resolve();
            });
        };
        reader.onerror = function () {
          anyFailed = true;
          window.PCC.notify("Couldn't read “" + file.name + "”.", "error");
          resolve();
        };
        reader.readAsDataURL(file);
      });
    });
  }, Promise.resolve());

  return chain.then(function () {
    return { anyLarge: anyLarge, anyFailed: anyFailed };
  });
}

export function createDelayFromLog(logId, categoryValue, daysValue, descriptionValue) {
  var linkedToActivity = false;
  window.PCC.store.update(function (d) {
    var freshLog = d.daily_logs.find(function (x) {
      return x.id === logId;
    });
    if (!freshLog) return;
    var activity = freshLog.activity_id
      ? d.activities.find(function (a) {
          return a.id === freshLog.activity_id;
        })
      : null;
    var created = window.PCC.store.newDelayRecord({
      activity_id: freshLog.activity_id || "",
      project_id: freshLog.project_id,
      daily_log_id: freshLog.id,
      identified_date: freshLog.log_date,
      delay_category: categoryValue,
      delay_days: daysValue === "" ? null : Number(daysValue),
      description: descriptionValue.trim(),
    });
    created.status_history = [{ status: "open", changed_at: created.created_at, note: "Delay identified from Daily Log." }];
    d.delay_records.push(created);
    if (activity) {
      linkedToActivity = true;
      d.delay_activity_links.push(
        window.PCC.store.newDelayActivityLink({
          delay_id: created.id,
          activity_id: activity.id,
          project_id: activity.project_id,
          original_planned_start: activity.planned_start || "",
          original_planned_finish: activity.planned_finish || "",
          original_total_float: activity.total_float != null ? activity.total_float : null,
        })
      );
    }
  });
  window.PCC.notify(
    linkedToActivity
      ? "Delay logged and linked to the Schedule activity."
      : "Delay logged — Schedule Impact Not Yet Assessed until an activity is linked (edit the delay from Schedule to add one).",
    "success"
  );
}
