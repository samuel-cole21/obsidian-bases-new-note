# CLAUDE.md

## Before Making Changes

This is an Obsidian plugin that manipulates the DOM of a closed-source Electron app. The DOM structure is undocumented and can change between Obsidian versions.

**Before planning or writing any code changes, you MUST:**

1. **Research Obsidian plugin best practices** — search the web for current patterns, especially around DOM manipulation, event handling, and the plugin lifecycle. Check the [official docs](https://docs.obsidian.md/), the [sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin), and the [API types](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).

2. **Research the Obsidian DOM structure** — the Bases toolbar classes (`.bases-toolbar`, `.bases-toolbar-item`, `.bases-toolbar-new-item-menu`, etc.) are not part of any public API. Before changing selectors or DOM manipulation logic:
   - Search for other plugins that interact with the Bases DOM (e.g., `obsidian-bases-lock`, `obsidian-bases-new-with-template`)
   - Search the Obsidian forum for CSS customization threads that document current class names
   - Check if the user can provide DevTools output or connect via `--remote-debugging-port=9222`

3. **Check the existing plugin source for reference** — the `bases-new-with-template` plugin (installed at the user's vault) has working Templater integration code worth referencing.

## Project Structure

- `src/main.ts` — Plugin entry point, lifecycle
- `src/types.ts` — Shared interfaces
- `src/base-file-manager.ts` — Read/write `.base` YAML files, settings CRUD
- `src/filter-parser.ts` — Parse filter expressions to extract pre-fill values
- `src/note-creator.ts` — Orchestrator: merges template + filters + settings, creates the file
- `src/template-applier.ts` — Core Templates + Templater integration
- `src/button-replacer.ts` — DOM manipulation: intercepts the "New" button, injects gear icon
- `src/settings-modal.ts` — Settings modal UI and note name prompt
- `src/suggest-modals.ts` — FuzzySuggestModal for template and folder pickers

## Key DOM Selectors (as of Obsidian 1.10.x)

- `.bases-toolbar` — toolbar container
- `.bases-toolbar-item` — each toolbar item wrapper
- `.bases-toolbar-new-item-menu` — the "New" button specifically
- `.bases-toolbar-views-menu` — view tab selector
- `.bases-toolbar-sort-menu`, `.bases-toolbar-filter-menu`, `.bases-toolbar-properties-menu` — other toolbar items

These WILL break eventually. When they do, inspect the DOM and update.

## Build & Install

```bash
npm install
npm run build                    # typecheck + bundle to main.js
# Copy to vault:
cp main.js manifest.json styles.css ~/Obsidian/Theology/.obsidian/plugins/obsidian-bases-new-note/
```

## How Settings Work

Settings are stored in `.base` files as `newNoteSettings` at two levels:
- **Base-level**: applies to all views
- **View-level**: overrides base-level for a specific view tab

View settings cascade from base settings (each field overrides independently).

## How Filter Pre-fill Works

Equality filters (`==`) in `and` groups are parsed into frontmatter values:
- `type == "excerpt"` → `type: excerpt`
- `book == link("All God's People")` → `book: "[[All God's People]]"`
- `file.folder == "..."` → used as location fallback, not a note property
- Non-equality operators are skipped
