"use strict";

// Files that exist (canonical paths relative to /home/guest).
const FILES = {
  "README.md":            "content/home/guest/README.md",
  "projects/ongoing.md":  "content/home/guest/projects/ongoing.md",
  "projects/personal.md": "content/home/guest/projects/personal.md",
  "projects/past.md":     "content/home/guest/projects/past.md",
};

// Entries per dir, keyed by canonical path relative to /home/guest.
// Single source of truth for `ls` and tab completion.
const TREE = {
  "":            ["README.md", "projects", "meditations"],
  "projects":    ["ongoing.md", "personal.md", "past.md"],
  "meditations": [],
};

export function fileExists(rel) { return Object.prototype.hasOwnProperty.call(FILES, rel); }
export function dirExists(rel)  { return Object.prototype.hasOwnProperty.call(TREE, rel); }

export function listDir(rel, { showHidden = false } = {}) {
  const entries = TREE[rel];
  if (!entries) return null;
  return showHidden ? entries.slice() : entries.filter((n) => !n.startsWith("."));
}

// Current working directory, as a path relative to /home/guest.
// "" = home, "projects" = ~/projects, "meditations" = ~/meditations.
let cwd = "";

export function getCwd() { return cwd; }
export function setCwd(next) { cwd = next; }

// Display label for the prompt: "~" or "~/projects" etc.
export function pathLabel() { return cwd === "" ? "~" : "~/" + cwd; }

// Absolute path for `pwd`.
export function absCwd() { return cwd === "" ? "/home/guest" : "/home/guest/" + cwd; }

const cache = new Map();

export async function fetchFile(rel) {
  const url = FILES[rel];
  if (!url) return null;
  if (cache.has(rel)) return cache.get(rel);
  const p = fetch(url).then((r) => (r.ok ? r.text() : null));
  cache.set(rel, p);
  return p;
}

// Resolve a user input to a canonical path relative to /home/guest.
// null if the input refers to anything outside /home/guest.
// Relative inputs (no leading "/", "~", or "/home/guest") resolve
// against the current cwd, so `cat ongoing.md` works from inside
// `~/projects`. Handles `.` and `..` segments; `..` above home → null.
//   "~", "/home/guest"                  → ""
//   "~/about.md"                        → "about.md"
//   "/home/guest/projects/ongoing.md"   → "projects/ongoing.md"
//   "about.md"            (cwd="")      → "about.md"
//   "ongoing.md"          (cwd="projects") → "projects/ongoing.md"
//   ".."                  (cwd="projects") → ""
//   ".."                  (cwd="")      → null
//   "/etc/foo"                          → null
export function resolveInHome(input) {
  if (input === "~" || input === "/home/guest") return "";
  let p = input || ".";
  if (p.startsWith("~/")) p = p.slice(2);
  else if (p.startsWith("/home/guest/")) p = p.slice("/home/guest/".length);
  else if (p.startsWith("/")) return null;
  else {
    // Relative - resolve against cwd
    p = cwd === "" ? p : cwd + "/" + p;
  }
  // Walk segments, collapsing . and .. - reject any walk above home.
  const parts = p.split("/").filter(Boolean);
  const stack = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}
