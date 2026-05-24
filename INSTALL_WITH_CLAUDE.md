# Install CoCanvas with Claude Code

This file is the one-link onboarding guide for [CoCanvas](https://github.com/am10dabhi-hermes/cocanvas).
It is written for **Claude Code as the primary reader**. A human can give Claude
Code the raw URL of this file and a short prompt, and Claude Code should be able
to install and verify CoCanvas without further hand-holding.

> **Product name:** CoCanvas. **CLI command:** `cocanvas`. Do not call it
> "GoCanvas". A `roughdraft` alias is also installed for compatibility with
> existing agent prompts that predate the rename — only use that alias when
> documentation explicitly requires it.

---

## What CoCanvas is (one paragraph for Claude Code)

CoCanvas is a local-first CLI + web app that opens a single Markdown or HTML
file on the user's machine at `http://localhost:7373` so the user can leave
inline comments and suggested edits that round-trip back as
[CriticMarkup](https://criticmarkup.com) (for Markdown) or HTML annotations.
Everything stays on disk as a normal `.md` or `.html` file. No cloud, no
telemetry. It is meant to be used as the human-review step in an agent loop.

---

## Suggested user prompt

The human shares the raw URL of this file with Claude Code and pastes a prompt
like the one below. Both copies (URL + prompt) are what closes the loop.

```text
Read this file and follow it to install CoCanvas on this machine:

https://raw.githubusercontent.com/am10dabhi-hermes/cocanvas/main/INSTALL_WITH_CLAUDE.md

Then verify the install by opening a small local sample document with
cocanvas, and at the end tell me the exact command I should run from now on
to open a file for review.
```

Claude Code: when you see that prompt, follow this file end-to-end, then in
your final message report (1) the final command the user should use and (2)
which install path you took (published npm package or source checkout).

---

## Step 1 — Prerequisite check (quick, not scary)

Run these checks. Report what you find. If something is missing, tell the
user what to install and stop — do not try to install Node or Git for them.

```bash
node --version     # expect v20+ (v22 LTS is ideal)
npm --version      # expect 10+
pnpm --version     # expect 9+; only required for the source-checkout path
git --version      # any modern version is fine
```

Claude Code authentication is assumed (you are already running). If the user
is not signed in, point them at `https://claude.com/claude-code` and stop.

**Decision rule:**

- Node + npm present → try the **published package path** first.
- If that fails (package not yet published, network issue, permissions error
  on global install), fall back to the **source checkout path**.

---

## Step 2a — Published package path (try this first)

```bash
npm i -g cocanvas
```

If the global install needs elevated permissions on this system, prefer one of
these over `sudo npm i -g`:

- Use a Node version manager (nvm, fnm, volta) so global installs go into the
  user directory.
- Or set an npm prefix the user owns: `npm config get prefix` and confirm it
  is writable.

Do not run `sudo npm i -g` without asking the user first.

Verify the binary is on `PATH`:

```bash
cocanvas --version
cocanvas help agent
```

`cocanvas help agent` prints the canonical agent setup prompt — it is a good
signal that the CLI is wired up correctly.

If `cocanvas --version` fails with "command not found" after a successful
`npm i -g`, tell the user the install directory (`npm prefix -g` + `/bin`)
and ask them to add it to `PATH`. Do not silently edit shell rc files.

Then jump to **Step 3 — Smoke test**.

---

## Step 2b — Source checkout fallback path

Use this when `npm i -g cocanvas` fails, when the package is not yet
published, or when the user explicitly wants the development build.

```bash
git clone https://github.com/am10dabhi-hermes/cocanvas.git
cd cocanvas
pnpm setup
```

`pnpm setup` installs workspace dependencies, builds the app and server, and
installs a per-worktree dev CLI wrapper into `~/.local/bin` named
`roughdraft-dev-<worktree-name>` (the wrapper keeps the `roughdraft-dev-`
prefix for compatibility with internal docs).

Derive the wrapper name for this checkout:

```bash
worktree_root="$(git rev-parse --show-toplevel)"
worktree_name="$(basename "$worktree_root")"
cocanvas_cmd="roughdraft-dev-$worktree_name"
echo "$cocanvas_cmd"
```

Verify the dev CLI runs:

```bash
"$cocanvas_cmd" --version
"$cocanvas_cmd" help agent
```

If `~/.local/bin` is not on `PATH`, point that out to the user; do not modify
their shell rc files unless they explicitly ask.

Optional but recommended once in a fresh checkout: run the same checks CI
runs before a PR merges.

```bash
pnpm check
```

`pnpm check` runs lint, the test-selector check, the unit tests, and a
production build. It can take a few minutes — skip it if the user just wants
to try CoCanvas, and run it before any code change.

---

## Step 3 — Smoke test with a local sample document

Create a tiny sample on disk and open it. This proves the binary, the
background server, and the editor all work end-to-end.

```bash
SAMPLE_DIR="$(mktemp -d)"
SAMPLE_FILE="$SAMPLE_DIR/cocanvas-smoke.md"
cat > "$SAMPLE_FILE" <<'EOF'
# CoCanvas smoke test

Welcome to {==CoCanvas==}{>>If you can read this comment in the editor, the install is working.<<}.

Try the suggested change: {~~rough~>polished~~} draft.
EOF
echo "Sample at: $SAMPLE_FILE"
```

Open the sample (use whichever command worked above — `cocanvas` for the
published path, or `"$cocanvas_cmd"` for the source-checkout path):

```bash
cocanvas open "$SAMPLE_FILE" --print-url
```

`--print-url` returns the local URL without trying to open a browser, which is
the right mode for an agent shell. The expected output is a single
`http://localhost:7373/?path=…` URL on stdout. Tell the user to open that URL
in their browser, leave a comment, and click **Done Reviewing**.

You can also block the agent until the user finishes reviewing:

```bash
cocanvas open "$SAMPLE_FILE" --json
```

That command exits with JSON describing the document path, file version, and
feedback counts after the user clicks **Done Reviewing**. Use `--timeout
<seconds>` to bound the wait.

Optional sanity check:

```bash
cocanvas status --json
cocanvas doctor
```

---

## Step 4 — Final command to report back to the user

In your final message to the user, tell them the **one command** they should
use to open a file for review from now on. Pick the right form based on which
install path succeeded:

- Published package path:
  ```bash
  cocanvas open ./path/to/file.md
  ```
- Source checkout path (substitute the wrapper name you derived):
  ```bash
  roughdraft-dev-<worktree-name> open ./path/to/file.md
  ```

Also remind the user that `cocanvas open` works on `.html` files too, and
that `cocanvas status` / `cocanvas stop` manage the background server.

---

## What to do if something goes wrong

- **`cocanvas: command not found` after `npm i -g`** — the global npm prefix
  is not on `PATH`. Run `npm prefix -g`, append `/bin`, and ask the user to
  add that directory to their shell `PATH`.
- **`EACCES` on `npm i -g`** — recommend a Node version manager (nvm, fnm,
  volta) instead of `sudo`.
- **Port 7373 is busy** — pass `--port` to `cocanvas start`, or stop the
  conflicting process. `cocanvas status --json` reports the active port.
- **`pnpm setup` fails on the source path** — run `pnpm install` and then
  `pnpm build` separately; report the first failing step verbatim and stop.
- **`cocanvas help agent` prints nothing** — the install is incomplete. Try
  the source checkout path instead and report what you saw.

---

## Notes for Claude Code

- Do not publish, deploy, or change package config as part of this flow. This
  guide is install + verify only.
- Do not edit the user's shell rc files unless they explicitly ask.
- Do not run `sudo` without asking.
- Do not invent commands that are not in this file. The canonical CLI surface
  is documented in [`README.md`](./README.md#cli-reference).
- When you finish, return a concise summary: which path you used, what you
  verified, the final command the user should run, and any unresolved
  blockers.
