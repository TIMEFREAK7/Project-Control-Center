// The current SCHEMA_VERSION, read from src/js/store.js so a schema bump doesn't break boot
// checks that only care about "migrated to current". Exact numbers stay in the migration test.
"use strict";
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "store.js"), "utf8");
const match = src.match(/var SCHEMA_VERSION = (\d+);/);
if (!match) throw new Error("schemaVersion.js: SCHEMA_VERSION not found in src/js/store.js");
module.exports = Number(match[1]);
