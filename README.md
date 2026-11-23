# Projectboard

A personal project management app: Kanban boards per project, whiteboards for
brainstorming and an ideas inbox.
It is a PWA that stores everything as plain files in a folder on your PC, so the
data stays local and can also be edited by hand or by tools.

## Requirements

- Microsoft Edge or Google Chrome. The app uses the File System Access API to read and
  write the data folder; Firefox and Safari do not support it.
- Node.js 22 for development.

## Use

1. Open the app in Edge and install it (address bar → install icon).
2. Choose an empty data folder outside this repository. The app creates
   `settings.json`, `inbox.md`, `README.md` and `projects/` there.

## Data format

- `projects/<id>/`: one folder per project, named by the project id (it never changes).
  - `<id>.json`: the board. Columns in board order, each with its cards in order.
  - `Notes_<id>.md`: the project's notes in Markdown, created when notes are first written.
    The "Notes" button between the project header and the board shows and edits them.

Data folders from before project folders existed (`projects/<id>.json`) are moved to the
new layout automatically when the app opens them.
- `settings.json`: shared labels.
- `inbox.md`: ideas, one per line as `- YYYY-MM-DD text`.
- `whiteboards/<name>.canvas`: one file per whiteboard, in the open
  [JSON Canvas](https://jsoncanvas.org) format, so boards also open in other canvas tools.
  The file name is the board name; renaming a board renames the file. Archived boards are
  moved to `whiteboards/archived/`. Cards are text nodes with Markdown; node types the app
  does not edit (file, link, group) are kept and shown as placeholders.

The schemas live in `src/domain/schema.ts` and `src/domain/canvas.ts`. Files changed outside the app are picked up
when the app window gets focus; if the app was saving the same project at that moment,
the version on disk wins.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/Projectboard/
npm test           # unit tests (Vitest)
npm run build      # type check + production build
```

In development, `http://localhost:5173/Projectboard/?memory` runs the app with an
in-memory folder (nothing is saved), which is handy for trying the UI.

`docs/prototype/board.html` is the original single-file prototype used as design reference.
