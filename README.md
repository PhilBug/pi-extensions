# pi-extensions

Personal extensions for the [pi](https://pi.dev) coding agent.

| Extension | What it does |
| --- | --- |
| [prompt-stash](#prompt-stash) | Stash the prompt draft with <kbd>Ctrl</kbd>+<kbd>S</kbd> and restore it later, like Claude Code |

## Install

```bash
pi install git:github.com/PhilBug/pi-extensions
```

Run `/reload` in pi afterwards. To install a single extension, copy its file from [`extensions/`](extensions/) into `~/.pi/agent/extensions/`.

Update with `pi update`.

---

## prompt-stash

Set a half-written prompt aside, ask something else, then bring the draft back.

| Editor state | <kbd>Ctrl</kbd>+<kbd>S</kbd> does |
| --- | --- |
| Has text | Stashes the text and clears the editor |
| Empty, draft stashed | Restores the draft |
| Empty, nothing stashed | Nothing |

While a draft is stashed, a dim marker shows above the editor, on the right:

```text
                                                     › stashed
────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────
```

> [!NOTE]
> - There is one slot. A second stash overwrites the first.
> - The stash lives in memory. `/reload` or a restart drops it.
> - <kbd>Ctrl</kbd>+<kbd>S</kbd> replaces pi's built-in `app.thinking.save` in the main editor. pi warns about this on load.
