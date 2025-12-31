# Project Files Feature - Requirements & Implementation

## Status: IMPLEMENTED

## Overview

A "Project Files" panel in the OpenCode TUI sidebar that displays the project's file tree, allows clicking to open files in a center panel for viewing with syntax highlighting, and shows diffs for modified files.

---

## Implemented Features

### Sidebar: Project Files Section

**Location:** `packages/opencode/src/cli/cmd/tui/routes/session/project-files.tsx`

- Collapsible/expandable tree view of project files
- Skips common folders: `node_modules`, `.git`, `.svn`, `.hg`, `dist`, `build`, `.next`, `.turbo`, `.cache`, `__pycache__`, `.opencode`
- Skips hidden files (except `.env`)
- Folders sorted before files, then alphabetically
- Click on file to open in viewer panel
- Visual highlight for active file
- Shows file count when collapsed
- Positioned above Todo and Modified Files sections

### Sidebar: Modified Files (Enhanced)

**Location:** `packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx`

- Files are now clickable to open in viewer panel
- Visual highlight for active file
- Shows additions/deletions counts
- Opens with diff view by default

### Center Panel: File Viewer

**Location:** `packages/opencode/src/cli/cmd/tui/routes/session/file-viewer.tsx` (257 lines)

**Features:**

- Syntax highlighting via `<code>` component (tree-sitter based)
- 50+ file types supported via extension mapping
- Extensionless file support (Dockerfile, Makefile, Gemfile, etc.)
- Scrollable content
- Header with relative file path (clickable to open in external app)
- Diff view toggle `[diff]` for modified files
- Shows `+N -M` counts for modified files
- Close button `[x]`
- Read-only display
- Handles both absolute and relative file paths

**Interaction:**

- Click `[x]` or press Escape (when focused) to close
- Click `[diff]` to toggle between diff and file view
- Click on file path in header to open in external editor
- Click on different file replaces content without closing panel
- Diff view auto-enables when switching to a modified file

### Panel Layout

**Side-by-side layout:**

- Left: Agent response view (narrowed when file open)
- Center: Draggable divider (1 char wide, highlights on drag)
- Right of divider: File viewer panel
- Far Right: Sidebar (unchanged)

**Draggable Divider:**

- 1-character wide divider between agent and file panels
- Drag to resize (highlights with accent color on drag)
- Fixed pixel width preserved on file switch (no jitter)
- Width persisted to KV storage (`file_viewer_width`, default 60)
- Clamped to available space on terminal resize (min 20, max totalWidth - 30)

---

## Implementation Details

### Files Created

| File                | Lines | Description                                                    |
| ------------------- | ----- | -------------------------------------------------------------- |
| `file-viewer.tsx`   | 257   | FileViewer component with syntax highlighting and diff support |
| `project-files.tsx` | 183   | ProjectFiles sidebar component with tree view                  |

### Files Modified

| File          | Changes | Description                                                           |
| ------------- | ------- | --------------------------------------------------------------------- |
| `index.tsx`   | ~100    | File viewer state, layout, divider drag handling, escape key handler  |
| `sidebar.tsx` | ~30     | Props for file click, Project Files integration, Modified Files click |

### State Management

```typescript
// In Session component (index.tsx)
const [activeFile, setActiveFile] = createSignal<string | null>(null)
const [fileViewerFocused, setFileViewerFocused] = createSignal(false)
const [fileViewerWidth, setFileViewerWidth] = createSignal<number>(kv.get("file_viewer_width", 60))
const [isDraggingDivider, setIsDraggingDivider] = createSignal(false)

// Computed
const clampedFileViewerWidth = createMemo(() => {
  const totalWidth = dimensions().width - (sidebarVisible() ? 42 : 0) - 4
  const minWidth = 20
  const maxWidth = totalWidth - 30
  return Math.max(minWidth, Math.min(maxWidth, fileViewerWidth()))
})
```

### Data Structures

```typescript
// FileTreeNode (project-files.tsx)
export interface FileTreeNode {
  name: string
  path: string // Relative to project root
  type: "file" | "directory"
  children: FileTreeNode[]
}

// FileViewerProps (file-viewer.tsx)
interface FileViewerProps {
  filePath: string
  sessionID: string
  onClose: () => void
  focused: boolean
  onFocus: () => void
}
```

### Diff Integration

- Uses `sync.data.session_diff[sessionID]` for modified file data
- Looks up diff by relative path: `diffs.find((d) => d.file === relativePath())`
- Creates unified diff with `createTwoFilesPatch()` from `diff` package
- Renders with `<diff>` component from opentui
- Auto-resets `showDiff` to true when switching to a file with a diff

### File Type Detection

Supports 50+ file types via extension mapping plus extensionless files:

```typescript
// Extensionless files
const nameMap = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  gemfile: "ruby",
  rakefile: "ruby",
  // ...
}

// Extension mapping
const extMap = {
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  // ... 50+ mappings
}
```

---

## Command Palette Commands

| Command             | Description                 |
| ------------------- | --------------------------- |
| "Close file viewer" | Close the file viewer panel |

---

## Keyboard & Mouse Interaction

| Input                        | Context             | Action                                  |
| ---------------------------- | ------------------- | --------------------------------------- |
| Escape                       | File viewer focused | Close panel                             |
| Click file in Project Files  | Any                 | Open/switch file in viewer              |
| Click file in Modified Files | Any                 | Open/switch file in viewer (shows diff) |
| Click `[diff]`               | Modified file open  | Toggle diff/file view                   |
| Click `[x]`                  | File viewer open    | Close panel                             |
| Click file path in header    | File viewer open    | Open file in external editor            |
| Drag divider                 | File viewer open    | Resize panels                           |

---

## Technical Decisions

### Why not Ripgrep for file listing?

The TUI runs in a separate process from the server. `Ripgrep.files()` uses `Instance` context which isn't available in the TUI. Instead, we use native `fs.readdir()` with a simple skip list (`SKIP_FOLDERS`).

### Why fixed width instead of percentage?

Fixed pixel width prevents layout jitter when switching files. When the terminal resizes, the file panel maintains its width and the agent panel adjusts, which is the expected IDE behavior.

### Why TreeNode is a component not a function?

The `TreeNode` inner component uses `createMemo` for `isExpanded` and `isActive`. This ensures proper Solid.js reactivity when expanding/collapsing directories or switching active files.

### Path handling

FileViewer handles both absolute and relative paths:

- `fullPath`: Converts to absolute for file reading
- `relativePath`: Converts to relative for diff lookup and display

---

## Future Enhancements

1. **File editing** - Allow editing files directly in the viewer
2. **Keyboard navigation** - Arrow keys to navigate file tree
3. **Search/filter** - Filter files in Project Files tree
4. **Git status indicators** - Show modified/staged/untracked status
5. **File watcher integration** - Real-time tree updates (requires solving TUI/server context issue)
6. **Lazy loading** - Load subdirectories on expand for large projects
7. **Binary file handling** - Show "binary file" message or hex view
8. **Full panel mode** - Option to expand file viewer to full width

---

## Dependencies

All existing - no new dependencies added:

- `@opentui/core` - CodeRenderable, DiffRenderable
- `@opentui/solid` - JSX elements, hooks
- `diff` - createTwoFilesPatch for unified diff generation
- `fs/promises` - Native file system access
