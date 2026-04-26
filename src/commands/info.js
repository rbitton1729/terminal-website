"use strict";

import { register } from "./index.js";
import { fetchFile } from "../content.js";
import { renderMarkdown } from "../markdown.js";

async function renderRel(s, rel) {
  const content = await fetchFile(rel);
  if (content === null) {
    await s.streamLine(`error reading ${rel}: not found`, { className: "err" });
    await s.line("");
    return;
  }
  if (rel.endsWith(".md")) await renderMarkdown(content, s);
  else for (const ln of content.split("\n")) await s.streamLine(ln);
  await s.line("");
}

async function whoamiCmd(s) { await renderRel(s, "about.md"); }

async function projectsCmd(s) {
  await renderRel(s, "projects/ongoing.md");
  await renderRel(s, "projects/personal.md");
  await renderRel(s, "projects/past.md");
}

// meditations/ has no published files yet. When a file lands, add it to
// FILES in content.js and add a `await renderRel(s, "meditations/<name>.md")` here.
async function meditationsCmd(s) {
  await s.streamLine("(nothing here yet.)", { className: "dim" });
  await s.line("");
}

async function mailCmd(s) {
  window.location.href = "mailto:raphael@rbitton.com";
  s.append("-> ", "dim");
  s.emitLink("raphael@rbitton.com", "mailto:raphael@rbitton.com");
  s.append("\n");
  await s.line("", { gap: 40 });
}

async function paperCmd(s) {
  // Force download via a hidden anchor; otherwise the browser would
  // navigate to and inline-render the PDF, which is the wrong UX here.
  const a = document.createElement("a");
  a.href = "paper.pdf";
  a.download = "paper.pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  s.append("-> ", "dim");
  s.emitLink("paper.pdf", "paper.pdf");
  s.append("  (downloading)\n", "dim");
  await s.line("", { gap: 40 });
}

export function registerInfo() {
  register("whoami",      whoamiCmd,      "core");
  register("projects",    projectsCmd,    "core");
  register("meditations", meditationsCmd, "core");
  register("mail",        mailCmd,        "core");
  register("paper",       paperCmd,       "core");
}
