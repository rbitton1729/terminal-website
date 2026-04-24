# Personal Website Spec — R.A. Bitton / rbitton.com

**Status:** Draft v0.5
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

The visual hook. A single fixed pane — a tmux window — fills the viewport and stays there for the entire experience. After an auto-playing boot sequence, the user interacts by typing commands; output prints inline. It is **not** a decorative SVG of a terminal — it's a real-feeling terminal emulator surface that renders monospace text, handles a cursor, and accepts input.

### 4.1 Concept direction: "boot sequence"

One fixed pane fills the visual viewport. On page load, the boot sequence auto-plays (~6 seconds) and ends with the shell auto-typing `help` to reveal the command menu. The user is then at a blinking prompt, and the site behaves like a real shell from there on.

Phases of the auto-play boot:

1. **POST** — BIOS-style POST lines fly by. Brief. Sets the tone: "this is a real computer."
2. **Kernel messages** — dmesg-style output. Drivers load, ZFS imports the pool (`SPL`, `ZFS: Loaded module ...`, `zfs: importing pool 'tank'`, `zed: ZFS Event Daemon online`), and a handful of lines are quietly personal: `audio0: composer_iface registered`, `flightsim: ILS receiver armed`, `skylantix: fleet interface online`, `rbitton: identity module loaded`. Self-aware but not winking too hard. The kernel version in the `Linux version` line and `uname -a` output is **polled from GitHub's mirror of Greg KH's stable tree** at page load (kernel.org doesn't serve CORS), with a hardcoded fallback — so the site always reflects the current stable patchlevel, tagged as a custom build (`<version>-rbitton-zfs`).
3. **Login** — `rbitton.com login:` auto-fills with `guest`, password `****` auto-types, shell drops to `$`. The `Last login: … from <host>` line shows the **visitor's real IPv4** (via a free IP-echo service behind a short timeout), falling back to `skylantix.lan` if the lookup stalls or is blocked.
4. **MOTD** — the tagline, a fortune-style quote picked at random from a curated pool on each load (same pool as the `fortune` command in §5).
5. **Auto-help** — the shell auto-types `help` and prints a human-labeled command menu. This is the landing affordance: the visitor sees exactly what they can do without having to know terminal conventions.

Then the REPL: a blinking prompt waiting for input. Typed commands print their output inline, directly below where the user typed. Scrolling within the pane reveals scrollback; it doesn't trigger anything. See §5 for the command set.

### 4.2 Why this works for the stated goal

Most personal sites look like each other. This one looks like a machine. That alone does most of the distinctive-on-first-impression work before the visitor has read a word.

It's also honest: I use Linux and tmux daily. A tmux pane on a site is the truest possible presentation of how I actually spend my time. And it's efficient — one surface, one way in, zero navigation chrome. Visitors aren't learning a site; they're using a shell. That reads as taste and competence faster than any amount of styled copy could.

The single-pane constraint is also what lets easter eggs land: a `sudo` that gets you permission-denied, a `fortune` that actually rolls, a `theme` that swaps palettes live. They're in the same surface as everything else, which makes them feel like they *belong*, not like bolted-on gimmicks.

### 4.3 Alternatives considered (and rejected)

- **Scroll-driven multi-section** — each "command" as its own scroll-anchored section, auto-playing as the user scrolls past. Prototyped and dropped: requires ~100vh of scroll runway per section, which creates overscroll, gap-management problems, and two competing interaction models (scroll and type) fighting each other. The single pane is simpler in every way.
- **Morphing terminal states (boot → different apps)** — too abstract; hard to map content to. Saved as a fallback concept.
- **Terminal as hero only, normal site below** — safe but wastes the concept. Rejected.

## 5. Interaction model

Exactly one way in: typing. No sections, no scroll-triggered reveals, no clickable menus on top of the terminal. The auto-help menu at the end of boot makes the command set discoverable without the visitor needing prior terminal knowledge; everything else works like a real shell.

### 5.1 Auto-help (the landing affordance)

Immediately after MOTD, the shell auto-types `help` and prints a human-labeled command menu — no user action required. Plain-English descriptions on the right so it reads as navigation even to visitors who don't know terminal conventions:

```
$ help
  whoami              about me
  projects            what I've built
  now                 what I'm up to this season
  writing             essays and technical pieces
  cv                  long-form résumé
  mail                get in touch
  theme <name>        switch color scheme
```

### 5.2 REPL commands

- `help` — reprints the menu above.
- `whoami`, `projects`, `now`, `writing`, `cv`, `mail` — print their output inline. Unix-y aliases also accepted: `ls ~/projects/`, `man rbitton`, `cat ~/now.txt`.
- `clear` — wipe the pane, fresh prompt at top. Same as **Ctrl+L**.
- `theme <name>` — switch color scheme (gruvbox, nord, solarized-dark, tokyo-night, matrix).
- `sudo <anything>` — "Permission denied. This incident will be reported." (easter egg)
- `uname -a` — real-looking output referencing the actual stack the site runs on.
- `fortune` — random quote from a curated list (same pool that feeds the MOTD line at load).
- Anything else: `command not found: <x>. Try 'help'.`

**Keyboard shortcuts** match a real terminal: **Ctrl+L** clears the pane, **Ctrl+C** aborts the currently-printing command (or discards the current input line if nothing's running).

### 5.3 Mobile

Tapping anywhere focuses a hidden `<input>`, which surfaces the on-screen keyboard. As the keyboard opens, the pane physically shrinks to match `visualViewport.height` — the prompt stays visible right above the keyboard instead of being hidden behind it. Autocorrect, suggestions, autocomplete, and the OS keyboard's own UI all keep working because typing is handled natively by the hidden input; the visible pane just mirrors its value.

### 5.4 Plain version escape hatch

The site serves a plain semantic HTML fallback for no-JS visitors and screen readers (§7.5, §8). To make that fallback accessible to *anyone* overwhelmed by the terminal theater, surface a visible link to it: one dim line, footer or top-right corner, copy like `"not into the terminal? → plain version"`. Points at `/plain/` (or `?plain=1`), which serves the same content as the no-JS render. No JS, no theater, no third-party calls. A one-to-one reader for the entire site, always reachable.

## 6. Design & aesthetic

- **Typography.** Monospace throughout. My preference: **Berkeley Mono** if I'm willing to pay, otherwise **IBM Plex Mono** or **JetBrains Mono**. Fallback to system monospace. Single weight primarily; bold for emphasis only.
- **Color.** Default theme is a dark terminal palette — leaning gruvbox-dark or a custom variant. Theme-switchable via the `theme` command. Respect `prefers-color-scheme` for first paint.
- **Layout.** One fixed pane filling the visual viewport. No visible scrollbar — content that overflows scrolls internally (newest at the bottom, oldest falls into scrollback, exactly like a real TTY). No separate sections, no cards, no gradients, no glassmorphism. Long-form content (writing pieces, the full CV) lives at its own permalinked URL so it can be shared and read comfortably outside the pane.
- **No wrap on the terminal.** The terminal font scales dynamically so the widest printed line always fits the viewport — monospace makes this straightforward. On tight mobile the text shrinks rather than wrapping a dmesg line in half, which would break the illusion completely.
- **Motion.** Typing animation for commands (realistic, with a slight random jitter on keystroke timing). Output streams character-by-character fast enough to read, slow enough to feel alive. Cursor blink. Subtle scanline overlay optional (toggleable, off by default — CRT cosplay is a cliché). No parallax.
- **Icons.** None, ideally. If unavoidable (e.g. social links), use Unicode box-drawing or Nerd Font glyphs.

## 7. Architecture

### 7.1 Stack

Hand-coded. No SSG, no framework, no build step beyond maybe minification.

- **HTML.** Plain, semantic, hand-written. One `index.html` for the landing experience; separate pages for writing pieces and project deep-dives.
- **CSS.** Plain CSS. Custom properties for theme variables so `theme <n>` just swaps a `data-theme` attribute on `<html>`. No Tailwind, no preprocessor.
- **JS.** Plain JS, or plain TypeScript compiled with a one-shot `esbuild` step on deploy if I want the state machine typed. No bundler, no framework — ES modules served directly.
- **Terminal component.** Hand-rolled. Plain DOM + a state machine for the boot sequence and a small REPL dispatch table. No xterm.js — way too heavy for what this is.
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

- **Reduced motion.** With `prefers-reduced-motion`, the boot sequence renders instantly (no per-line pacing), output prints whole-line instead of character-by-character, and the cursor doesn't blink.
- **Plain version.** All content is reachable at `/plain/` as semantic HTML (§5.4, §7.5). Same document serves as the no-JS fallback.
- **Color contrast.** WCAG AA minimum in all themes.
- **Keyboard.** The hidden input is the focus target; typing works as expected. Scrolling the scrollback via `PageUp`/`PageDown` and arrow keys.
- **Screen reader.** The animated boot sequence is `aria-hidden` (decorative). Command output prints into an `aria-live` region so new text is announced as it streams.

## 9. Decisions and remaining questions

**Decided:**

- **Domain.** `rbitton.com` canonical. `rabitton.com`, `raphaelbitton.com`, and any other variants 301-redirect to it.
- **Writing section, not a blog.** No dates, no feed, no comments.
- **No analytics.** No JS for tracking, no self-hosted Plausible, nothing. I don't want the data.
- **No guestbook.** Excessive, spam target.
- **No music on the site.** Dropped from scope. If it comes back later it's a separate subdomain or a single linked-out page, not part of v1.
- **Single pane, tmux-style.** One fixed pane fills the visual viewport. No multi-section scroll, no visible scrollbar. See §4.1, §6.
- **Typing is the only interaction.** Auto-help makes the command set discoverable; scrolling inside the pane just reveals scrollback.
- **Boot auto-plays on load**, ending with auto-typed `help` and a blinking REPL prompt.
- **Ctrl+L and Ctrl+C work** like a real terminal (clear / abort).
- **Mobile: tap anywhere focuses the hidden input**; the pane resizes above the on-screen keyboard via `visualViewport.height`.
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

1. Static scaffold — single `index.html` serving the pane, no boot yet, just a static prompt.
2. Boot sequence auto-play: POST → kernel → login → MOTD → auto-help → blinking prompt.
3. REPL: `help`, `whoami`, `projects`, `now`, `writing`, `cv`, `mail`, `clear`, `uname -a`, `fortune`, `sudo`, `theme` (stub), plus Ctrl+L and Ctrl+C.
4. Real content — bios, project entries, now page, writing pieces at their permalinked URLs.
5. Theme switching (wired up end-to-end).
6. `/plain/` page serving the full content as semantic HTML.
7. Polish — colophon, remaining easter eggs, copy pass.

v1 ships when 1–4 are solid. 5–7 can trickle in.
