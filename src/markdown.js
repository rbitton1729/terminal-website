"use strict";

// Hand-rolled tiny markdown renderer. Maps to terminal emit primitives.
// Supports: # ## ### headings, **bold**, *italic*, `code`, ```fences,
// > blockquotes, --- hr, - bullets, 1. numbered lists, [text](url) links.
// Does NOT support: tables, nested lists, HTML, image refs, footnotes.

export async function renderMarkdown(markdown, s) {
  const text = markdown.replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];

    // Fenced code block: ```lang ... ```
    if (/^```/.test(ln)) {
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        await s.line(lines[i], { className: "code", gap: 4 });
        i++;
      }
      i++; // skip closing fence
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(ln)) {
      await s.line("─".repeat(60), { className: "dim", gap: 4 });
      i++;
      continue;
    }

    // Headings - match h3 first so "### x" doesn't get caught by # or ##.
    let m;
    if ((m = ln.match(/^### (.*)$/))) {
      await emitInline(m[1], s, "dim");
      s.append("\n");
      i++;
      continue;
    }
    if ((m = ln.match(/^## (.*)$/))) {
      await emitInline(m[1], s, "motd");
      s.append("\n");
      i++;
      continue;
    }
    if ((m = ln.match(/^# (.*)$/))) {
      await emitInline(m[1], s, "motd");
      s.append("\n");
      i++;
      continue;
    }

    // Blockquote
    if ((m = ln.match(/^> ?(.*)$/))) {
      await emitInline(m[1], s, "fortune");
      s.append("\n");
      i++;
      continue;
    }

    // Bullet list
    if ((m = ln.match(/^(\s*)- (.*)$/))) {
      s.append(m[1] + "· ");
      await emitInline(m[2], s);
      s.append("\n");
      i++;
      continue;
    }

    // Numbered list
    if ((m = ln.match(/^(\s*)(\d+)\. (.*)$/))) {
      s.append(m[1] + m[2] + ". ");
      await emitInline(m[3], s);
      s.append("\n");
      i++;
      continue;
    }

    // Plain or blank
    if (ln === "") {
      await s.line("", { gap: 4 });
    } else {
      await emitInline(ln, s);
      s.append("\n");
    }
    i++;
  }
}

// Inline parser. Walks a line, splitting on **bold**, *italic*, `code`,
// and [text](url). `lineClass` colors plain runs (used for headings etc).
async function emitInline(text, s, lineClass) {
  const { append, emitLink } = s;
  let rest = text;
  while (rest.length > 0) {
    // Code: `...`
    let m = rest.match(/^`([^`]+)`/);
    if (m) { append(m[1], "code"); rest = rest.slice(m[0].length); continue; }
    // Bold: **...**  (must come before single-asterisk italic)
    m = rest.match(/^\*\*([^*]+)\*\*/);
    if (m) { append(m[1], "bold"); rest = rest.slice(m[0].length); continue; }
    // Italic: *...*
    m = rest.match(/^\*([^*]+)\*/);
    if (m) { append(m[1], "italic"); rest = rest.slice(m[0].length); continue; }
    // Link: [text](url)
    m = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (m) { emitLink(m[1], m[2]); rest = rest.slice(m[0].length); continue; }
    // Plain run - consume up to the next special-marker char
    m = rest.match(/^([^*`[]+)/);
    if (m) { append(m[0], lineClass); rest = rest.slice(m[0].length); continue; }
    // Stray special char - emit as plain
    append(rest[0], lineClass);
    rest = rest.slice(1);
  }
}
