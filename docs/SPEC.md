# Personal Website Spec — R.A. Bitton / rbitton.com

**Status:** Draft v0.4
**Author:** Raphael Bitton
**Last updated:** 2026-04-24

---

## 1. Purpose

A personal hub that acts as a single canonical point of presence on the web — a landing surface for projects, writing, music, and contact. It should read as unmistakably mine on first impression: technical, Linux-native, composer-adjacent, slightly playful. The site is a portfolio piece in its own right — the experience of using it should communicate taste and competence before any content is read.

Explicitly *not* goals: SEO-optimized growth, a CMS admin panel, analytics tracking users, adoption metrics. This is a personal artifact that happens to live on the public internet.

## 2. Audience

In rough priority order:

1. **Me.** I have to enjoy looking at it. If I'm embarrassed to link it, nothing else matters.
2. **People who just met me** and want to see what I do — recruiters, collaborators, anyone who got my card or saw a talk.
3. **Skylantix-adjacent visitors** who came from the business and want to see the human behind it.
4. **Search crawlers** — low priority, but it should at least render something sensible without JS.

## 3. Content inventory

What actually lives on the site:

- **Identity block** — name, one-line tagline, contact (email, GitHub, Matrix/XMPP handle if I want, Keybase/Signal for verified contact).
- **Projects** — Lantern, zftop, custom kernel work, Skylantix (linked outward), LFS builds, smaller tools. Each with a short description, tech stack, repo link, and optional long-form writeup.
- **Writing** — a small curated set of permalinked essays and technical pieces. Not a blog: no dates, no feed, no implicit commitment to update on a cadence. Things get added when there's something worth saying.
- **Now page** — what I'm currently focused on. Updated manually, no timestamps pretending to be automated.
- **Colophon** — how the site is built, hosted, and why. Fits the aesthetic; doubles as a technical credibility signal.
- **CV / résumé** — downloadable PDF, plus a plaintext version reachable via the terminal.

## 4. The terminal concept

The visual hook. A terminal occupies the viewport on landing and drives the narrative as the user scrolls. It is **not** a decorative SVG of a terminal — it's a real-feeling terminal emulator surface that renders monospace text, handles a cursor, and accepts input.

### 4.1 Concept direction: "boot sequence"

The terminal moves through discrete states. **Phases 1–4 auto-play on page load** (~6 seconds end-to-end) and land the visitor at the interactive `$` prompt. Only phase 5 is scroll-driven. Rationale: arriving at a machine that boots *feels* like logging in. Scroll-gating the boot itself made the whole thing feel inert in the prototype.

1. **POST / boot** — BIOS-style POST lines fly by. Brief. Sets the tone: "this is a real computer."
2. **Kernel messages** — dmesg-style output. Drivers load, ZFS imports the pool (`SPL`, `ZFS: Loaded module ...`, `zfs: importing pool 'tank'`, `zed: ZFS Event Daemon online`), and a handful of lines are quietly personal: `audio0: composer_iface registered`, `flightsim: ILS receiver armed`, `skylantix: fleet interface online`, `rbitton: identity module loaded`. Self-aware but not winking too hard. The kernel version in the `Linux version` line and `uname -a` output is **polled from GitHub's mirror of Greg KH's stable tree** at page load (kernel.org doesn't serve CORS), with a hardcoded fallback — so the site always reflects the current stable patchlevel, tagged as a custom build (`<version>-rbitton-zfs`).
3. **Login prompt** — `rbitton.com login:` auto-fills with `guest`, password `****` auto-types, shell drops to `$`. The `Last login: … from <host>` line shows the **visitor's real IPv4** (via a free IP-echo service behind a short timeout), falling back to `skylantix.lan` if the lookup stalls or is blocked.
4. **MOTD** — the tagline, a fortune-style quote picked at random from a curated pool on each load (same pool as the `fortune` command in §5), and the last-login line from (3).
5. **Interactive shell** (scroll-driven) — from here on, each section corresponds to a "command" the terminal runs. Scrolling past a section boundary auto-types and executes the next command. The command is also a clickable link — clicking re-runs it and smooth-scrolls to the section.

Commands mapped to sections:

- `whoami` → identity block with bio
- `ls ~/projects/` → project grid, each project a `cat projects/lantern.md`-style expansion
- `cat ~/now.txt` → now page
- `ls ~/writing/` → writing section, each piece a `cat writing/<slug>.md`-style expansion
- `man rbitton` → long-form CV, scrollable
- `mail` → contact form rendered as a mutt-like compose screen
- `exit` → footer, with a blinking cursor fading to black

### 4.2 Why this works for the stated goal

It gives every section a distinctive visual identity (different "commands" look different) without fragmenting the aesthetic. The monospace typography stays consistent, but the *content shape* changes — grid for `ls`, prose for `cat`, form for `mail`. That variation is what prevents scroll fatigue in a single-concept site.

It also lets me hide easter eggs in places a normal site can't: a `sudo` command that demands a password, a `history` command that shows past projects, a `fortune` that actually works. These aren't required for v1, but the architecture should leave room.

### 4.3 Alternatives considered (and rejected, for now)

- **Morphing terminal states (boot → different apps)** — too abstract; hard to map content to. Saved as a fallback.
- **Non-scroll, fully keyboard-driven** — purist and cool, but hostile to mobile and to the 80% of visitors who won't know to type. Rejected.
- **Terminal as hero only, normal site below** — safe but wastes the concept. Rejected.

## 5. Interaction model

Three tiers of engagement, layered so nobody is ever gated:

### 5.1 Spectators (scroll)

Scrolling is primary. Everything on the site is reachable by scrolling top to bottom on any device. As the viewport crosses each section boundary, the terminal auto-types and runs the corresponding command, so the shape of the site teaches itself without any action required.

### 5.2 Clickers (auto-help menu + clickable commands)

Immediately after MOTD, the shell auto-types `help` and prints a human-labeled menu. The menu uses plain-English descriptions on the right so it reads as navigation to a non-terminal-native visitor, while still *looking* like a real `--help` output:

```
$ help
  whoami              about me
  projects            what I've built
  now                 what I'm up to this season
  writing             essays and technical pieces
  cv                  long-form résumé
  mail                get in touch
  theme <name>        switch color scheme

  scroll to explore, or click any line to jump.
```

Each line is a clickable link that jumps to the corresponding section and re-runs the command's type-out animation. The full Unix-y forms (`ls ~/projects/`, `man rbitton`, `cat ~/now.txt`) are what each scroll-section *does*, but they don't appear in `help` — the friendly names are enough for navigation.

### 5.3 Typers (optional REPL)

On desktop, the blinking cursor plus a hover hint (`type 'help' for more`) invites power users into an actual REPL. Supported:

- `help` — the menu from §5.2
- `whoami`, `projects`, `now`, `writing`, `cv`, `mail` — jump to sections. Unix-y aliases also accepted: `ls ~/projects/`, `man rbitton`, `cat ~/now.txt`.
- `clear` — resets terminal to top
- `theme <name>` — switch color scheme (gruvbox, nord, solarized-dark, tokyo-night, matrix)
- `sudo <anything>` — "Permission denied. This incident will be reported." (easter egg)
- `uname -a` — real-looking output referencing the actual stack the site runs on
- `fortune` — random quote from a curated list (same pool that feeds the MOTD line at load)
- Anything else: `command not found: <x>. Try 'help'.`

The REPL is entirely opt-in. Scroll and click reach every piece of content without ever typing.

### 5.4 Mobile

No keyboard affordance is shown on touch devices. The auto-help menu still prints after MOTD, with tap-to-run on each line. Scroll drives everything.

### 5.5 Plain version escape hatch

The site serves a plain semantic HTML fallback for no-JS visitors and screen readers (§7.5, §8). To make that fallback accessible to *anyone* overwhelmed by the terminal theater, surface a visible link to it: one dim line, footer or top-right corner, copy like `"not into the terminal? → plain version"`. Points at `/plain/` (or `?plain=1`), which serves the same content as the no-JS render. No JS, no theater, no third-party calls. A one-to-one reader for the entire site, always reachable.

## 6. Design & aesthetic

- **Typography.** Monospace throughout. My preference: **Berkeley Mono** if I'm willing to pay, otherwise **IBM Plex Mono** or **JetBrains Mono**. Fallback to system monospace. Single weight primarily; bold for emphasis only.
- **Color.** Default theme is a dark terminal palette — leaning gruvbox-dark or a custom variant. Theme-switchable via the `theme` command. Respect `prefers-color-scheme` for first paint.
- **Layout.** Full-viewport terminal on landing. Subsequent sections are full-width but constrained inner column (~80ch) to preserve the terminal feel. No card UIs, no gradients, no glassmorphism.
- **No wrap on the terminal.** The terminal font scales dynamically so the widest printed line always fits the viewport — monospace makes this straightforward. On tight mobile the text shrinks rather than wrapping a dmesg line in half, which would break the illusion completely.
- **Motion.** Typing animation for commands (realistic, with a slight random jitter on keystroke timing). Cursor blink. Subtle scanline overlay optional (toggleable, off by default — CRT cosplay is a cliché). No parallax. No scroll-jacking — the page scrolls normally; animations respond to scroll position but don't hijack it.
- **Icons.** None, ideally. If unavoidable (e.g. social links), use Unicode box-drawing or Nerd Font glyphs.

## 7. Architecture

### 7.1 Stack

Hand-coded. No SSG, no framework, no build step beyond maybe minification.

- **HTML.** Plain, semantic, hand-written. One `index.html` for the landing experience; separate pages for writing pieces and project deep-dives.
- **CSS.** Plain CSS. Custom properties for theme variables so `theme <n>` just swaps a `data-theme` attribute on `<html>`. No Tailwind, no preprocessor.
- **JS.** Plain JS, or plain TypeScript compiled with a one-shot `esbuild` step on deploy if I want the state machine typed. No bundler, no framework — ES modules served directly.
- **Terminal component.** Hand-rolled. Plain DOM + a state machine for the scroll-driven sequence. No xterm.js — way too heavy for what this is.
- **Content.** Writing pieces and project deep-dives as hand-written HTML. Not enough of them to justify a Markdown pipeline. If the count grows past ~10 pieces, revisit.

### 7.2 Hosting

Self-hosted, obviously. Options:

- **Skylantix infrastructure** — colocated R740xd, served via the existing nginx/Caddy frontend. Fits the dogfooding story.
- **Separate small VPS** — cleaner separation if I ever want to talk about Skylantix outages without the personal site going down with it.

Leaning toward Skylantix infra with a clear out-of-band fallback (static export mirrored to a second host / Cloudflare Pages as a break-glass).

### 7.3 Build & deploy

- Git push to `main` triggers a GitLab CI pipeline on the existing Skylantix runner.
- Pipeline: optional `esbuild` pass on TS if used → rsync static files to webroot → cache bust.
- Preview deploys for branches, served at `preview-<branch>.rbitton.com`.
- If I skip TS entirely, the pipeline collapses to "rsync the repo to webroot." Which is fine.

### 7.4 Dynamic content, third-party calls

Two small pieces of personalization require at-load fetches to third-party services: the visitor's IP (for the `Last login` line) and the current stable kernel version (for the `Linux version` line and `uname -a`). Neither is analytics — no data about the visitor is sent beyond what the service already sees from the request — but they do cross origins, and the spec is strict about not trusting third-party infra. Both calls are behind short timeouts with graceful fallbacks, so privacy-strict browsers, ad blockers, and flaky networks still get a clean boot. **Longer-term:** once the site is living on Skylantix infra, both should move to small first-party proxy endpoints (nginx + a cache) so the only origin the site touches is `rbitton.com`.

### 7.5 Performance budget

- First contentful paint under 1s on a fast connection; under 2.5s on 3G.
- No-JS fallback renders all content as a plain vertical document with the terminal styled as an HTML `<pre>`. The site must be fully readable with JS disabled.
- Total JS payload for the terminal island under 20KB gzipped. Non-negotiable.
- No web fonts on the critical path if possible — use font-display: swap, and pick a font whose fallback (system monospace) is visually close enough that FOUT isn't jarring.

## 8. Accessibility

- Scroll-driven animations respect `prefers-reduced-motion`: with reduced motion, commands appear instantly, no typing effect, no cursor blink.
- All content reachable without the terminal theater — a "skip to content" link and semantic HTML underneath the styling.
- Color contrast meets WCAG AA at minimum in all themes.
- Keyboard navigable end-to-end. Tab through commands and links in a sensible order.
- Screen reader: the terminal's decorative boot sequence is `aria-hidden`. Section content is announced normally.

## 9. Decisions and remaining questions

**Decided:**

- **Domain.** `rbitton.com` canonical. `rabitton.com`, `raphaelbitton.com`, and any other variants 301-redirect to it.
- **Writing section, not a blog.** No dates, no feed, no comments.
- **No analytics.** No JS for tracking, no self-hosted Plausible, nothing. I don't want the data.
- **No guestbook.** Excessive, spam target.
- **No music on the site.** Dropped from scope. If it comes back later it's a separate subdomain or a single linked-out page, not part of v1.
- **Boot auto-plays on load.** Only the post-shell section (phase 5) is scroll-driven. See §4.1.
- **Kernel version is live.** Polled from GitHub's mirror of Greg KH's stable tree with a hardcoded fallback. Tagged as a custom build (`-rbitton-zfs`).
- **`Last login` shows the visitor's real IP.** Via a free IP-echo service, with a short timeout and a `skylantix.lan` fallback.
- **MOTD fortune is randomized.** Same curated pool as the `fortune` command.

**Still open:**

1. **TypeScript or plain JS for the terminal.** The state machine has enough states and transitions that typing it would catch real bugs. But adding a compile step to an otherwise zero-build site is a taste call. Leaning TS + one-shot `esbuild` on deploy.
2. **CV on the site.** Public plaintext `man rbitton` plus a downloadable PDF, or PDF only behind a mailto? Leaning toward public — the upside of being findable outweighs the downside of recruiter spam.
3. **Contact form or just mailto?** `mail` as a mutt-like compose screen is cute but needs a backend (or a third-party form service, which I don't want). A fake compose screen that drops into `mailto:` on send is probably the honest move — keeps the aesthetic, zero backend.
4. **First-party proxies for dynamic content.** The IP echo and kernel-version lookup (§7.4) currently hit third parties. Not a v1 blocker, but worth moving in-house once the site is on Skylantix infra. Tiny nginx location blocks with short caches; ~20 lines total.

## 10. Scope for v1

Ship in this order:

1. Static scaffold, content pages rendering as plain HTML. No terminal yet.
2. Terminal component with boot sequence + scroll-driven commands. Sections render inline with their "command output."
3. Interactive REPL layered on top. Click-to-run first, then keyboard input.
4. Theme switching.
5. Easter eggs, polish, colophon.

v1 ships when 1–3 are solid. 4 and 5 can trickle in.

---

**Next step suggestion:** before writing any code, mock the landing-page terminal sequence as a static frame-by-frame storyboard (6–8 frames) to pressure-test whether the boot concept actually reads well or ends up feeling gimmicky. If the storyboard is boring, the site will be boring.
