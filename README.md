# pi-extensions

Personal extensions for [pi](https://pi.dev).

## Install

```bash
pi install git:github.com/PhilBug/pi-extensions
```

Or copy a single file into `~/.pi/agent/extensions/`.

## Extensions

### prompt-stash

Claude Code style prompt stash. `ctrl+s` with text in the editor stashes it and clears the editor. A dim `› stashed` widget shows above the editor. `ctrl+s` on an empty editor restores the draft.

One slot: a second stash overwrites the first. The stash lives in memory and is lost on `/reload` or restart. `ctrl+s` shadows pi's built-in `app.thinking.save`.
