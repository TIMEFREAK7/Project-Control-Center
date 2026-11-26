# Gate 6.3 rules checklist (2026-11-26)

Every rule bullet and paragraph in the previous CLAUDE.md (now `docs/GOTCHAS.md`, unedited;
line numbers below are GOTCHAS.md lines) and where it lives now. "CLAUDE §X" = the new CLAUDE.md
section. "Story only" = descriptive history with no standing rule beyond what's listed; the full
text is still in GOTCHAS.md. Nothing was deleted from GOTCHAS.md.

| GOTCHAS line | Old rule (short) | Now |
|---|---|---|
| 11 | Next work in DEFERRED_ROADMAP; update Status lines | CLAUDE intro |
| 16 | `src/` is source, never hand-edit index.html | CLAUDE §Architecture |
| 19 | `node build.js`, JS_ORDER, new files must be added | CLAUDE §Architecture + §Commands |
| 23 | Vanilla + hash routing; one dependency-free index.html goal | CLAUDE §Architecture |
| 30 | React source in react/, bundled by build.js, no runtime npm | CLAUDE §Architecture + §Commands |
| 39 | Migrating a page: component + thin service + stub | CLAUDE §Architecture |
| 50 | reactBridge is the only React↔router file | CLAUDE §Architecture |
| 55 | react-bundle before jszip in JS_ORDER | CLAUDE §Architecture |
| 62 | Fresh wrapper from snapshot services | CLAUDE §Architecture |
| 78–88 | Testing controlled inputs / checkboxes | CLAUDE §Architecture |
| 92 | One-shot pending prop in initial state, not useEffect | CLAUDE §Architecture |
| 102 | suppressNextHashRender single flag; don't fix router | CLAUDE §Architecture |
| 116 | `await flush()` after every go(), across check blocks | CLAUDE §Architecture |
| 134 | React state resets on remount | CLAUDE §Architecture |
| 142 | Initial render forced sync via flushSync | CLAUDE §Architecture |
| 155 | Later updates async → await flush() | CLAUDE §Architecture |
| 166 | Data layer: store.js, localStorage, migrate chain | CLAUDE §Architecture + §Data |
| 169 | Three apps from one repo | CLAUDE §Mirror app; README "The three apps" |
| 175 | Blobs in IndexedDB, binary only | CLAUDE §Architecture |
| 180 | One IDB database `pcc_data_v1`, three stores | CLAUDE §Architecture |
| 187 | Register "type" pattern | CLAUDE §Architecture |
| 190 | delayImpactEngine read-only; single-delay CPM call | CLAUDE §Architecture |
| 198 | No Delay Registry collection | CLAUDE §Architecture |
| 204 | Delay labels duplicated on purpose; change both | CLAUDE §Architecture |
| 215 | delay_records comments/auto_generated; `|| []` | CLAUDE §Architecture |
| 223 | runAutoDelayDetection touches only auto records | CLAUDE §Architecture |
| 239 | "⋯" menu density convention | CLAUDE §Architecture |
| 249 | Every modal via modalA11y; fallbackFocus | CLAUDE §Architecture |
| 261 | Command palette hand-offs; window.PCC.files; decoy tests | CLAUDE §Architecture |
| 283 | Header space at phone width used up | CLAUDE §Architecture |
| 289 | Untrusted file HTML → sanitizePreviewHtml | CLAUDE §Security |
| 295 | Electron never leaves the app; no window.open(blob:) | CLAUDE §Security |
| 301 | pdf.js isEvalSupported false | CLAUDE §Security |
| 308 | SheetJS from CDN; ExcelJS kept | CLAUDE §Security + Closed decisions |
| 317 | Mirror IPC filename lock | CLAUDE §Security |
| 322 | flushPendingSave; guarded listeners | CLAUDE §Architecture |
| 326 | "Today" is the local date | CLAUDE §Data |
| 332 | window.PCC.dates, chosen zone, formatDate…; invalid zone → Automatic | CLAUDE §Data (zone fallback: story only) |
| 346 | dateCellToIso device-local | CLAUDE §Data |
| 353 | Pin IST in date-sensitive tests | CLAUDE §Data + §Commands |
| 357 | Newer-build data refused (H.2) | CLAUDE §Data |
| 366 | Storage ceiling + storageFitError (H.3) | CLAUDE §Data |
| 377 | migrate backfill-only net | CLAUDE §Data |
| 383 | Schema bump rules; version 67 | CLAUDE §Data |
| 401 | Three apps, separate codebases sharing components | CLAUDE §Mirror app |
| 408 | Mirror one-way, read-only, off by default | CLAUDE §Mirror app |
| 417 | mirror-app separate build reusing real pages/services | CLAUDE §Mirror app (bundle-size detail: story only) |
| 430 | One React copy via symlinks, never alias/paths | CLAUDE §Mirror app + §Commands (exFAT method) |
| 441 | shim/pcc.ts map of real vs stubbed | CLAUDE §Mirror app |
| 450 | Write guard deep-clones | CLAUDE §Mirror app |
| 470 | Toast on reverted write; success toasts dropped | CLAUDE §Mirror app |
| 481 | hideWriteButtons; observe .mirror-app-shell | CLAUDE §Mirror app |
| 496 | Folder picker (SAF) plugin | CLAUDE §Mirror app |
| 510 | mirrorRead uses migrate(), not importFromJsonString | CLAUDE §Mirror app |
| 517 | Outlet needs main.page | CLAUDE §Mirror app |
| 525 | android-mirror separate project + keystore | CLAUDE §Mirror app + §Release |
| 534–537 | Adaptive icon: three PNGs; check foreground | CLAUDE §Release |
| 562 | Ollama Electron-only via main-process IPC | CLAUDE §AI |
| 575 | Off by default (settings v66) | CLAUDE §AI |
| 580 | ollamaService.js single gate, clear messages | CLAUDE §AI |
| 587 | Prompt builders read computed data only | CLAUDE §AI |
| 600–606 | Summarize Schedule pilot; Settings panel | Story only (features, no rule) |
| 611 | Ollama testing: mocked fetch, stub PCC_ELECTRON, capture prompt | CLAUDE §AI |
| 622 | Commands | CLAUDE §Commands |
| 647 | Two Android projects, each bump + keystore | CLAUDE §Release |
| 657–664 | Windows build deps; wine on Linux | CLAUDE §Release (libgd3 pin: story only) |
| 667 | Build with npm run electron:build | CLAUDE §Release |
| 674 | No code-signing cert | CLAUDE §Release |
| 676 | Verify asar index.html byte-identical | CLAUDE §Release |
| 678 | Electron drivable with Playwright `_electron` | Story only |
| 687 | JDK 21 + Android SDK bootstrap | Story only (exact commands) |
| 693 | Real keystore required | CLAUDE §Release |
| 699 | Bump versionCode | CLAUDE §Release |
| 701 | android:build:release command | Story only (command) |
| 703 | Maven 429 → Google mirror | CLAUDE §Release |
| 712 | gradlew \| tee exit code | CLAUDE §Release |
| 716 | apksigner + zipalign verify | CLAUDE §Release |
| 720 | Mirror APK: second time, own keystore, mirror build first | CLAUDE §Release |
| 731 | Delivery sha256 + split | CLAUDE §Release |
| 737 | Full suite before shipping | CLAUDE §Commands + §Testing |
| 740 | Tests run real code | CLAUDE §Testing |
| 743 | fake-indexeddb; FileReader stub | CLAUDE §Testing |
| 746 | Real Chromium available | CLAUDE §Testing + §Commands (this PC) |
| 753 | Mirror app verified only in Chromium | CLAUDE §Testing |
| 765 | Project assignment mandatory | CLAUDE §Working |
| 768 | Change Orders never write contract_value | CLAUDE §Working |
| 770 | Reports printable HTML | CLAUDE §Working |
| 772 | No File System Access API | CLAUDE §Working |
| 776 | Scope discipline | CLAUDE §Working |
| 783 | No GitHub CI | CLAUDE Closed decisions + §Commands |
| 785 | Merge comment-free PRs without asking | CLAUDE §Working |
| 789 | Always merge to main after a gate | CLAUDE §Working |
| 795 | Zip after every gate, contents, verify | CLAUDE §Working |
| 807 | Split >30 MB, `cmd /c copy /b` | CLAUDE §Release |
| 818 | Always bump versionCode | CLAUDE §Release |
| 830 | APK must be signed; new keystore = new identity | CLAUDE §Release |
| 848 | Never call electron-builder directly | CLAUDE §Release |
| 858 | Restart branch from main; commit before reset --hard | CLAUDE §Working |
| 864 | Wine setup on Linux | CLAUDE §Release (steps: story only) |
| 877 | Update HANDOFF.md and send it | CLAUDE §Working |
