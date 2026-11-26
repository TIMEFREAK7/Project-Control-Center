# Aditya Abhyankar's Project Control Center

Project Planning, Controls & Portfolio Management System — for one person, fully local, fully portable.

## Open this: `index.html`

That one file is the entire app — HTML, CSS, fonts, and all JavaScript bundled inside it, nothing
external. Double-click it, it opens in your browser. No install, no cmd, no login, no server.

### Why it's bundled into one file (not several, like the first version)

The first version split things into `css/styles.css`, several `js/*.js` files, and font files, all
loaded by reference from `index.html`. That works fine on a laptop's `file://` browsing, but it broke on
Android: when you open a file from a phone's file manager, Android hands the browser a `content://`
reference instead of a real `file://` path (this has been true since Android 7, for security reasons),
and a `content://` reference has no real folder behind it — so every one of those relative file loads
silently failed, leaving a blank white screen. Bundling everything into one file removes the problem at
the root: there's nothing relative left to fail to load.

## How your data works

- Everything autosaves instantly to your browser's local storage as you work — no save button needed
  for normal use.
- To move to another laptop/desktop, or back up before a job/project change: click the **export icon**
  in the header (or Settings → Export data file). This downloads one file,
  `project-data-YYYY-MM-DD.json`, containing everything — move it into the `/data` folder here.
- On the new machine: open `index.html`, click the **import icon**, and pick that file.
- Copy the whole `project-control-center` folder (pen drive, external drive, cloud sync) and it works
  anywhere — no install, nothing to configure.

**One real limitation, worth knowing rather than discovering later:** browsers block pages opened via
`file://` (or `content://` on Android) from silently reading/writing arbitrary files on disk. That's why
export/import is a manual two-click step instead of invisible autosave-to-one-file — there's no way
around that without running a local server, which is exactly what you asked to avoid. Autosave-to-
browser-storage is instant and automatic; the file is what carries your data between machines.

## Documents (contracts, drawings, photos)

Upload Excel/Word/PDF, get the data extracted, and the original file itself is stored with the
record. No `/files` folder needed anymore; everything travels in the one exported JSON.

## Design direction

Industrial / engineering-drawing identity: blueprint navy + graphite in dark mode, cool light paper in
light mode, a single signal-amber accent, Space Grotesk / Inter / IBM Plex Mono type (embedded directly
in the file as base64 — no CDN, works with no internet connection at all), and a title-block header
styled like a technical drawing's title block (sheet name, company, date).

## Backing up your data

- **Export regularly:** the export icon in the header (or Settings → Export data file) saves
  everything, attached files included, as one `project-data-YYYY-MM-DD.json`. The app reminds you
  when it has been a while (Settings → backup reminder).
- **Full Backup (SQLite)** in Settings is a second format, with attached files in a folder beside it.
- **Storage Management** shows how full the app's storage is. Past 80% you get a warning; when
  something would not fit, the app refuses it and says so instead of losing it.
- If saved data can't be read when the app opens, it keeps an untouched copy you can download
  from the banner or from Settings → Data Recovery.
- Data saved by a newer version of the app is never overwritten by an older one: the older app
  asks you to update, and offers "Export this data".

## The three apps

| App | What it is |
|---|---|
| **Windows** | The full app as a desktop program. Also the only one with the optional AI features (local Ollama). |
| **Android** | The full app on a phone or tablet. |
| **At a Glance** (Android) | Read-only: Dashboard, My Work, Action Centre and Portfolio, from a mirror file the Windows app writes to a folder you sync to the phone. |

All three run the same code and work fully offline. The plain `index.html` in this folder is the
same full app, in any browser.

For developers: the full build history is in `docs/BUILD_HISTORY.md`, working rules in
`CLAUDE.md`, current state in `HANDOFF.md`.

