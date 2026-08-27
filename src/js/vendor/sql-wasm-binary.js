/* Placeholder replaced at build time (see build.js's inlineSqlWasm()) with the actual
 * base64-encoded contents of sql-wasm.wasm — same "embed everything, no runtime fetch"
 * approach build.js already uses for fonts (inlineFonts()). This keeps the raw .wasm
 * binary as a real, readable source file in src/js/vendor/ (the source of truth) while
 * the shipped index.html carries it inlined as a string, so sql.js never needs to
 * fetch a separate file at runtime — consistent with PCC being one self-contained file
 * that must work identically via file://, in Electron, and in the Android WebView. */
window.PCC_SQL_WASM_BASE64 = "__SQL_WASM_BASE64__";
