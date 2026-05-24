# CoCanvas

A local-first collaborative canvas between you and your AI agent for reviewing
and editing Markdown and HTML documents on your machine.

> CoCanvas is inspired by — and derived from — [Roughdraft](https://github.com/Lex-Inc/roughdraft)
> by Nathan Baschez. It keeps Roughdraft's CriticMarkup-based Markdown review
> workflow and extends it with experimental HTML review support
> (inline comments, suggestions, and round-trip persistence as annotations in
> the HTML file itself). See [NOTICE](./NOTICE) for full attribution and
> [LICENSE](./LICENSE) for the MIT license that covers both upstream and new
> work.

## What is CoCanvas?

CoCanvas opens a single Markdown or HTML file on your machine and lets you:

- Read it in a clean local editor at `http://localhost:7373`.
- Leave inline comments and suggested changes.
- Hand the document back to an AI agent so it can read your feedback and
  respond — all without leaving the file on disk.

Everything stays as a normal `.md` or `.html` file you can also edit in VS Code,
Vim, Cursor, or anywhere else. No cloud, no account, no telemetry.

### Markdown review

Comments and suggested edits are stored in the Markdown file itself using
[CriticMarkup](https://criticmarkup.com), extended with compact attribute
blocks (`{id="…" by="…" at="…" re="…"}`) so review threads round-trip cleanly:

```markdown
Please revisit {==this sentence==}{>>Needs a source<<}{id="c1" by="user" at="2026-04-28T12:00:00.000Z"}.
```

The canonical Roughdraft Flavored Markdown spec — which CoCanvas inherits — is
published at
[roughdraft.md/spec/roughdraft-flavored-markdown.md](https://roughdraft.md/spec/roughdraft-flavored-markdown.md).

### HTML review (MVP)

CoCanvas opens annotated HTML documents directly:

```bash
cocanvas open ./path/to/page.html
```

HTML review uses the annotation contract recorded in
[`docs/adr/0005-html-review-annotation-contract.md`](./docs/adr/0005-html-review-annotation-contract.md):

- Comment anchors are a single `<mark data-rd-comment-ids="…">…</mark>` with one
  or more space-separated ids.
- Comment records live in an `<aside class="rd-review" hidden>` at the end of
  `<body>` as `<rd-comment id="…">…</rd-comment>` elements.
- Suggestions are `<ins>` / `<del>` (or both with a shared
  `data-rd-suggestion-id`) for insertion, deletion, and substitution.
- Protected zones — `<script>`, `<style>`, `<pre>`, `<code>`, and
  `data-rd-literal` — are never rewritten.

MCP tools that operate on annotated HTML files: `roughdraft_read_html_document`,
`roughdraft_add_comment`, `roughdraft_accept_suggestion`,
`roughdraft_reject_suggestion`. (Tool names keep the `roughdraft_` prefix for
agent-compatibility.) A captured end-to-end transcript lives at
`.context/mcp-evidence/G6.4-agent-flow.transcript.md`.

## Install and run

The CLI is published (or will be published) as `cocanvas`. A `roughdraft`
alias is also installed for compatibility with existing agent prompts.

```bash
npm i -g cocanvas
cocanvas start
```

Want Claude Code to install CoCanvas for you? Share the raw URL of
[`INSTALL_WITH_CLAUDE.md`](./INSTALL_WITH_CLAUDE.md) with Claude Code and ask
it to read the file and install CoCanvas — that guide is written so Claude
Code can handle prerequisites, install, and a smoke test in one go.

`cocanvas start` runs the server in the background, reuses or chooses a free
localhost port, writes server state to `~/.roughdraft/server.json`, prints the
active URL, and exits while the server keeps running. (The on-disk state
directory keeps the `.roughdraft` name to remain compatible with the upstream
state format.)

Open a specific file:

```bash
cocanvas open ./path/to/draft.md
cocanvas open ./path/to/page.html
```

For scripts and agents that need a URL without launching a browser:

```bash
cocanvas open ./path/to/draft.md --print-url
cocanvas status --json
```

Check or stop the background server:

```bash
cocanvas status
cocanvas stop
```

`cocanvas open` reuses the running server and auto-starts it if needed. You can
also use `cocanvas ./path/to/file.md` as a shortcut when the input clearly
looks like a path.

If the local server is already running, you can also open a file directly by
URL:

```text
http://localhost:7373/?path=/absolute/path/to/draft.md
```

That makes an agent-friendly workflow possible:

1. Your AI writes or updates a Markdown or HTML file on disk.
2. You tell it to open the file in CoCanvas.
3. CoCanvas opens locally on your machine.
4. You read, edit, leave comments, and suggest changes.
5. You click **I'm done**, and the agent picks up where you left off.

Agents can watch that handoff directly:

```bash
cocanvas open ./path/to/draft.md --json
```

`cocanvas open` starts or reuses the local server, opens the document,
registers a fresh watcher, blocks until the next `review.completed` event,
then prints event JSON with the document path, file version, and feedback
counts. Pass `--timeout <seconds>` to bound the wait. Use `--no-watch` to
return immediately.

Experimental MCP clients can start the stdio server with:

```bash
cocanvas mcp
```

The MCP server exposes tools to read the review index, list pending feedback,
watch review events, append replies, and mark items resolved. CriticMarkup
(for Markdown) and the HTML annotation contract (for HTML) remain the durable
sources of truth.

## Local development

```bash
./scripts/setup.sh
./scripts/run.sh
```

`./scripts/setup.sh` installs workspace dependencies and builds the app and
server. `./scripts/run.sh` serves the built app at `http://localhost:7373`.

The two scripts coordinate through a lock file, so it's safe to start
`./scripts/run.sh` while `./scripts/setup.sh` is still in progress. `run` will
wait for setup to finish, or trigger setup itself if nothing has been built
yet.

If you prefer package scripts, the same commands are available as `pnpm setup`
and `pnpm start`.

Running `pnpm setup` also installs a per-worktree dev CLI wrapper into
`~/.local/bin` by default, using the current worktree directory name. For
example, this checkout might install `roughdraft-dev-lyon-v2`, which points at
this worktree's local code while leaving any globally installed CoCanvas
binary untouched. The dev wrapper name keeps the `roughdraft-dev-` prefix to
stay compatible with the per-worktree dev CLI documented in `AGENTS.md`.

You can refresh that wrapper manually with:

```bash
pnpm dev:install-cli
pnpm dev:install-cli --name api-redesign
```

Quality checks:

```bash
pnpm lint
pnpm test
pnpm check
```

`pnpm check` is the same command the pull request workflow runs before merge.

## CLI reference

```text
cocanvas [flags] <command> [args]
cocanvas <path>
```

Commands:

```text
open <path>        Open one Markdown or HTML file and wait for I'm done
start              Start or reuse the background server
status             Show server status
stop               Stop the managed background server
watch <path>       Wait for an I'm done event
mcp                Start the experimental stdio MCP server
doctor [path]      Diagnose setup or validate a document
help agent         Print the agent setup prompt
help criticmarkup  Show CriticMarkup examples
```

Global flags:

```text
-h, --help         Show help
--version          Print version
--json             Print JSON for supported commands
--no-color         Disable color
```

Useful command flags:

```text
cocanvas open <path> --no-open
cocanvas open <path> --print-url
cocanvas open <path> --json
cocanvas open <path> --no-watch
cocanvas start --port <port>
cocanvas status --json
cocanvas stop --all
cocanvas watch ./draft.md --json
cocanvas doctor --json
cocanvas doctor ./draft.md
```

Usage errors return exit code `2`. Runtime failures return exit code `1`.
`cocanvas status --json` returns exit code `0` even when the JSON says
`"running": false`.

Supported environment variables (the `ROUGHDRAFT_*` names are kept for
backward compatibility with existing scripts and agents):

```text
ROUGHDRAFT_PORT          Preferred server port.
PORT                     Legacy preferred server port. Used only when
                         ROUGHDRAFT_PORT is unset.
ROUGHDRAFT_NO_OPEN=1     Disable browser/app opening.
ROUGHDRAFT_STATE_FILE    Exact path to the server state JSON file.
ROUGHDRAFT_STATE_DIR     Directory containing server.json.
```

Development-only environment variables:

```text
ROUGHDRAFT_DEV_FRONTEND_STATE_FILE
ROUGHDRAFT_DEV_BIN_DIR
ROUGHDRAFT_DEV_STATE_BASE_DIR
ROUGHDRAFT_DEV_WRAPPER_NAME
ROUGHDRAFT_DEV_WRAPPER_PATH
ROUGHDRAFT_DEV_WRAPPER_REPO_ROOT
```

## Roughdraft Flavored Markdown

CoCanvas uses [CriticMarkup](https://criticmarkup.com) as the readable review
layer inside normal Markdown files, with the Roughdraft attribute-block
extension for ids, authors, timestamps, and reply links.

```markdown
This is {--deleted--} text.
This is {++inserted++} text.
This is {~~old~>new~~} substituted text.
This is {>>a comment<<} in the margin.
This is {==highlighted==} text.
```

Replies are stored as additional comment blocks that point at the parent id:

```markdown
Please revisit {==this sentence==}{>>Needs a source<<}{id="c1" by="user" at="2026-04-28T12:00:00.000Z"}{>>I can add one from the intro.<<}{id="c2" by="AI" at="2026-04-28T12:05:00.000Z" re="c1"}.
```

Suggested changes can also carry ids and discussion:

```markdown
Add {++one concrete example++}{id="s1" by="AI" at="2026-04-28T12:10:00.000Z"}{>>Use the customer story here.<<}{id="c3" by="user" at="2026-04-28T12:12:00.000Z" re="s1"}.
Remove {--vague phrasing--}{id="s2" by="user" at="2026-04-28T12:13:00.000Z"}.
Use {~~rough~>specific~~}{id="s3" by="AI" at="2026-04-28T12:14:00.000Z"} wording.
```

CriticMarkup inside inline code and fenced code blocks is treated as literal
example text, not live review feedback.

## Project status

CoCanvas is an MVP. Markdown review is the stable surface. HTML review is
experimental and tracked by `docs/adr/0005-html-review-annotation-contract.md`
and the granular plan under `.context/`.

## Credits

CoCanvas is built by Ananth Dabhi on top of the original
[Roughdraft](https://github.com/Lex-Inc/roughdraft) project by
[Nathan Baschez](https://twitter.com/nbashaw) at Lex Inc. The CriticMarkup
review syntax and the Roughdraft Flavored Markdown spec are upstream work and
are used here under the terms of the MIT license.

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
