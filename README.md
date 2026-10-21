# pi-extensions

Personal extensions for the [pi](https://pi.dev) coding agent.

| Extension | What it does |
| --- | --- |
| [prompt-stash](#prompt-stash) | Stash the prompt draft with <kbd>Ctrl</kbd>+<kbd>S</kbd> and restore it later, like Claude Code |
| [save-default-model](#save-default-model) | `/model-default` opens the `/model` picker and saves the choice as the default for new sessions |

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
| Has text | Stashes the text, clears the editor, and shows `› stashed` above it |
| Empty, draft stashed | Restores the draft |
| Empty, nothing stashed | Nothing |

> [!NOTE]
> - There is one slot. A second stash overwrites the first.
> - The stash lives in memory. `/reload` or a restart drops it.
> - <kbd>Ctrl</kbd>+<kbd>S</kbd> replaces pi's built-in `app.thinking.save` in the main editor. pi warns about this on load.

---

## save-default-model

`/model` changes the model for the current session only. `/model-default` opens the same fuzzy picker, switches to the selected model, and saves it with the current thinking level to global `settings.json`, so new sessions start with them. `/model-default <search>` prefills the search.

This does the same as <kbd>Ctrl</kbd>+<kbd>S</kbd> in the `/model` and `/thinking` pickers, without needing that shortcut.
