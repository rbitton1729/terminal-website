"use strict";

import { listCommands } from "./index.js";
import { listDir, dirExists, getCwd } from "../content.js";

// Returns one of:
//   { kind: "single", replacement }   // input becomes `replacement`
//   { kind: "multi", matches }        // matches to print, input unchanged
//   { kind: "none" }                  // no completion possible
export function completeInput(input) {
  if (input === "" || /^\s+$/.test(input)) return { kind: "none" };
  // First token (no space yet) → command name. After a space → path.
  return input.includes(" ") ? completePath(input) : completeCommand(input);
}

function completeCommand(prefix) {
  const matches = listCommands().filter((n) => n.startsWith(prefix));
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) {
    return { kind: "single", replacement: matches[0] + " " };
  }
  const lcp = longestCommonPrefix(matches);
  if (lcp.length > prefix.length) return { kind: "single", replacement: lcp };
  return { kind: "multi", matches };
}

function completePath(input) {
  const lastSpace = input.lastIndexOf(" ");
  const head = input.slice(0, lastSpace + 1); // includes trailing space
  const arg = input.slice(lastSpace + 1);

  // Split on last "/" - the part before is the dir we're listing,
  // the part after is the filename prefix we're matching.
  const slash = arg.lastIndexOf("/");
  const dirPart = slash === -1 ? "" : arg.slice(0, slash + 1);
  const filePart = slash === -1 ? arg : arg.slice(slash + 1);

  // Resolve dirPart to a canonical relative dir within /home/guest.
  // Anything outside (e.g. "/etc/") gets no completion, since the
  // canned ls/cd already reject those.
  let canonicalDir;
  if (dirPart === "") canonicalDir = getCwd();
  else if (dirPart === "~/" || dirPart === "/home/guest/") canonicalDir = "";
  else if (dirPart.startsWith("~/")) canonicalDir = dirPart.slice(2, -1);
  else if (dirPart.startsWith("/home/guest/")) canonicalDir = dirPart.slice("/home/guest/".length, -1);
  else if (dirPart.startsWith("/")) return { kind: "none" };
  else canonicalDir = (getCwd() === "" ? "" : getCwd() + "/") + dirPart.slice(0, -1);

  if (!dirExists(canonicalDir)) return { kind: "none" };

  // Hide dotfiles unless the user has already typed a leading "."
  const showHidden = filePart.startsWith(".");
  const entries = listDir(canonicalDir, { showHidden }) || [];
  const matches = entries.filter((n) => n.startsWith(filePart));
  if (matches.length === 0) return { kind: "none" };

  // For a single match, append "/" if it's a dir, " " if it's a file.
  if (matches.length === 1) {
    const name = matches[0];
    const childRel = canonicalDir === "" ? name : canonicalDir + "/" + name;
    const tail = dirExists(childRel) ? "/" : " ";
    return { kind: "single", replacement: head + dirPart + name + tail };
  }

  const lcp = longestCommonPrefix(matches);
  if (lcp.length > filePart.length) {
    return { kind: "single", replacement: head + dirPart + lcp };
  }
  return { kind: "multi", matches };
}

function longestCommonPrefix(strs) {
  if (strs.length === 0) return "";
  let prefix = strs[0];
  for (const s of strs) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) return "";
  }
  return prefix;
}
