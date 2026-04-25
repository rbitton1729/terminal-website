"use strict";

import { register } from "./index.js";
import {
  resolveInHome, fileExists, dirExists, listDir, fetchFile,
  getCwd, setCwd, absCwd,
} from "../content.js";
import { renderMarkdown } from "../markdown.js";

const DIR_NAMES = new Set(["projects", "meditations"]);

async function pwdCmd(s) {
  await s.streamLine(absCwd());
  await s.line("");
}

async function cdCmd(s, raw) {
  const arg = raw.trim().split(/\s+/).slice(1)[0];
  // Bare `cd` → home (matches bash's $HOME default).
  if (!arg) { setCwd(""); return; }
  const rel = resolveInHome(arg);
  if (rel === null) {
    await s.streamLine(`bash: cd: ${arg}: Permission denied`, { className: "err" });
    await s.line("");
    return;
  }
  if (dirExists(rel)) { setCwd(rel); return; }
  if (fileExists(rel)) {
    await s.streamLine(`bash: cd: ${arg}: Not a directory`, { className: "err" });
  } else {
    await s.streamLine(`bash: cd: ${arg}: No such file or directory`, { className: "err" });
  }
  await s.line("");
}

async function emitDirListing(s, names) {
  for (const name of names) {
    if (DIR_NAMES.has(name)) await s.streamLine(name, { className: "prompt-path" });
    else await s.streamLine(name);
  }
}

async function lsCmd(s, raw) {
  const args = raw.trim().split(/\s+/).slice(1);
  let showHidden = false;
  let path = null;
  for (const a of args) {
    if (a === "-a" || a === "-la" || a === "-al") showHidden = true;
    else if (a.startsWith("-")) {
      await s.streamLine(`ls: invalid option -- '${a.slice(1)}'`, { className: "err" });
      await s.line("");
      return;
    } else if (path === null) {
      path = a;
    }
  }

  // Bare `ls` lists cwd. Otherwise resolve the arg.
  const rel = path === null ? getCwd() : resolveInHome(path);

  if (rel === null) {
    await s.streamLine(
      `ls: cannot open directory '${path}': Permission denied`,
      { className: "err" },
    );
    await s.line("");
    return;
  }

  if (dirExists(rel)) {
    await emitDirListing(s, listDir(rel, { showHidden }));
    await s.line("");
    return;
  }

  if (fileExists(rel)) {
    // Real ls of a file just prints the name.
    const slash = rel.lastIndexOf("/");
    await s.streamLine(slash === -1 ? rel : rel.slice(slash + 1));
    await s.line("");
    return;
  }

  await s.streamLine(
    `ls: cannot access '${path}': No such file or directory`,
    { className: "err" },
  );
  await s.line("");
}

async function catCmd(s, raw) {
  const args = raw.trim().split(/\s+/).slice(1);
  if (args.length === 0) {
    await s.line("");
    return;
  }
  for (const arg of args) {
    const rel = resolveInHome(arg);
    if (rel === null) {
      await s.streamLine(`cat: ${arg}: Permission denied`, { className: "err" });
      continue;
    }
    if (rel === "" || dirExists(rel)) {
      await s.streamLine(`cat: ${arg}: Is a directory`, { className: "err" });
      continue;
    }
    if (!fileExists(rel)) {
      await s.streamLine(`cat: ${arg}: No such file or directory`, { className: "err" });
      continue;
    }
    const content = await fetchFile(rel);
    if (content === null) {
      await s.streamLine(`cat: ${arg}: No such file or directory`, { className: "err" });
      continue;
    }
    if (rel.endsWith(".md")) {
      await renderMarkdown(content, s);
    } else {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (i === lines.length - 1 && lines[i] === "") continue;
        await s.streamLine(lines[i]);
      }
    }
  }
  await s.line("");
}

async function treeCmd(s, raw) {
  const args = raw.trim().split(/\s+/).slice(1);
  let showHidden = false;
  let path = null;
  for (const a of args) {
    if (a === "-a") showHidden = true;
    else if (a.startsWith("-")) {
      await s.streamLine(`tree: invalid option -- '${a.slice(1)}'`, { className: "err" });
      await s.line("");
      return;
    } else if (path === null) {
      path = a;
    }
  }

  const rel = path === null ? getCwd() : resolveInHome(path);
  const display = path || ".";

  if (rel === null) {
    await s.streamLine(`${display}  [error opening dir]`, { className: "err" });
    await s.line("");
    return;
  }

  if (!dirExists(rel)) {
    if (fileExists(rel)) {
      await s.streamLine(display);
      await s.line("");
      await s.streamLine("0 directories, 1 file", { className: "dim" });
      await s.line("");
      return;
    }
    await s.streamLine(`${display}  [error opening dir]`, { className: "err" });
    await s.line("");
    return;
  }

  await s.streamLine(display, { className: "prompt-path" });

  let dirCount = 0;
  let fileCount = 0;

  async function walk(dirRel, prefix) {
    const entries = listDir(dirRel, { showHidden }) || [];
    for (let i = 0; i < entries.length; i++) {
      const name = entries[i];
      const childRel = dirRel === "" ? name : dirRel + "/" + name;
      const last = i === entries.length - 1;
      const branch = last ? "└── " : "├── ";
      if (dirExists(childRel)) {
        dirCount++;
        await s.streamLine(prefix + branch + name, { className: "prompt-path" });
        await walk(childRel, prefix + (last ? "    " : "│   "));
      } else {
        fileCount++;
        await s.streamLine(prefix + branch + name);
      }
    }
  }

  await walk(rel, "");
  await s.line("");
  const dWord = dirCount === 1 ? "directory" : "directories";
  const fWord = fileCount === 1 ? "file" : "files";
  await s.streamLine(`${dirCount} ${dWord}, ${fileCount} ${fWord}`, { className: "dim" });
  await s.line("");
}

export function registerNav() {
  register("pwd",  pwdCmd,  "unix");
  register("ls",   lsCmd,   "unix");
  register("cd",   cdCmd,   "unix");
  register("cat",  catCmd,  "unix");
  register("tree", treeCmd, "unix");
}
