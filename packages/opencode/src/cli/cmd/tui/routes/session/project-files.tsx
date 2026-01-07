import { createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createEffect } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "@tui/context/sync"
import { useDialog } from "../../ui/dialog"
import { DialogConfirm } from "../../ui/dialog-confirm"
import path from "path"
import fs from "fs/promises"

const SKIP_FOLDERS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".vercel",
  ".cache",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  "venv",
  ".venv",
  "target",
  ".cargo",
])

interface FileEntry {
  name: string
  path: string
  type: "file" | "directory" | "error"
}

interface DirState {
  loading: boolean
  entries: FileEntry[]
  expanded: boolean
}

interface ProjectFilesProps {
  expanded: boolean
  onToggle: () => void
  onFileClick: (filePath: string) => void
  openFiles?: string[]
  sessionFiles?: string[]
  modifiedFiles?: Set<string>
  focusedFile?: string | null
  onCreateVirtualPrompt?: () => void
  onDeleteVirtualPrompt?: (filePath: string) => void
  onLoadSessionFiles?: () => void
}

export function ProjectFiles(props: ProjectFilesProps) {
  const { theme } = useTheme()
  const sync = useSync()
  const [dirs, setDirs] = createStore<Record<string, DirState>>({})
  const [rootLoading, setRootLoading] = createSignal(false)
  const [rootEntries, setRootEntries] = createSignal<FileEntry[]>([])

  const directory = createMemo(() => sync.data.path.directory || process.cwd())

  const loadDir = async (dirPath: string, relativePath: string): Promise<FileEntry[]> => {
    const fullPath = relativePath ? path.join(dirPath, relativePath) : dirPath
    const entries = await fs.readdir(fullPath, { withFileTypes: true }).catch(() => null)
    if (entries === null) {
      return [{ name: "(unable to read)", path: "", type: "error" as const }]
    }
    const nodes: FileEntry[] = []

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue
      if (SKIP_FOLDERS.has(entry.name)) continue

      const entryRelPath = relativePath ? path.join(relativePath, entry.name) : entry.name

      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: entryRelPath,
          type: "directory",
        })
      } else if (entry.isFile()) {
        nodes.push({
          name: entry.name,
          path: entryRelPath,
          type: "file",
        })
      }
    }

    nodes.sort((a, b) => {
      if (a.type === "directory" && b.type === "file") return -1
      if (a.type === "file" && b.type === "directory") return 1
      return a.name.localeCompare(b.name)
    })

    return nodes
  }

  const loadRootDir = async () => {
    setRootLoading(true)
    const entries = await loadDir(directory(), "")
    setRootEntries(entries)
    setRootLoading(false)
  }

  const toggleDir = async (dirPath: string) => {
    const current = dirs[dirPath]
    if (current?.expanded) {
      setDirs(dirPath, "expanded", false)
    } else {
      setDirs(dirPath, { loading: true, entries: [], expanded: true })
      const entries = await loadDir(directory(), dirPath)
      setDirs(dirPath, { loading: false, entries, expanded: true })
    }
  }

  // Expand a directory without toggling (for reveal)
  const expandDir = async (dirPath: string) => {
    const current = dirs[dirPath]
    if (current?.expanded) return
    setDirs(dirPath, { loading: true, entries: [], expanded: true })
    const entries = await loadDir(directory(), dirPath)
    setDirs(dirPath, { loading: false, entries, expanded: true })
  }

  // Reveal a file by expanding all parent directories
  const revealFile = async (filePath: string) => {
    if (!filePath) return
    const parts = filePath.split("/")
    // Expand each parent directory
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join("/")
      if (dirPath) await expandDir(dirPath)
    }
  }

  const handleToggle = async () => {
    if (!props.expanded) {
      await loadRootDir()
    }
    props.onToggle()
  }

  function TreeNode(nodeProps: { entry: FileEntry; depth: number }) {
    const isOpen = createMemo(() => props.openFiles?.includes(nodeProps.entry.path) ?? false)
    const isModified = createMemo(() => props.modifiedFiles?.has(nodeProps.entry.path) ?? false)
    const isFocused = createMemo(() => props.focusedFile === nodeProps.entry.path)
    const indent = nodeProps.depth * 2

    if (nodeProps.entry.type === "directory") {
      const dirState = createMemo(() => dirs[nodeProps.entry.path])
      const isExpanded = createMemo(() => dirState()?.expanded ?? false)
      const isLoading = createMemo(() => dirState()?.loading ?? false)
      const children = createMemo(() => dirState()?.entries ?? [])
      // Check if any open file is inside this directory (when collapsed)
      const containsOpenFile = createMemo(() => {
        if (isExpanded()) return false
        const openFiles = props.openFiles ?? []
        return openFiles.some((f) => f.startsWith(nodeProps.entry.path + "/"))
      })

      return (
        <box>
          <box
            flexDirection="row"
            gap={1}
            paddingLeft={indent}
            onMouseUp={() => toggleDir(nodeProps.entry.path)}
            backgroundColor={containsOpenFile() ? theme.backgroundElement : undefined}
          >
            <text fg={theme.text}>{isExpanded() ? "v" : ">"}</text>
            <text fg={theme.text} wrapMode="char">
              <Show when={containsOpenFile()} fallback={<>{nodeProps.entry.name}/</>}>
                <b>{nodeProps.entry.name}/</b>
              </Show>
            </text>
          </box>
          <Show when={isExpanded()}>
            <Show when={isLoading()}>
              <text fg={theme.textMuted} paddingLeft={indent + 4}>
                ...
              </text>
            </Show>
            <Show when={!isLoading()}>
              <For each={children()}>{(child) => <TreeNode entry={child} depth={nodeProps.depth + 1} />}</For>
            </Show>
          </Show>
        </box>
      )
    }

    if (nodeProps.entry.type === "error") {
      return (
        <box flexDirection="row" paddingLeft={indent + 2}>
          <text fg={theme.error}>{nodeProps.entry.name}</text>
        </box>
      )
    }

    // File styling: focused = white + bold, modified + focused = accent + bold, modified = accent, others = muted
    const color = () => {
      if (isModified()) return theme.accent
      if (isFocused()) return theme.text
      return theme.textMuted
    }

    return (
      <box
        flexDirection="row"
        paddingLeft={indent + 2}
        onMouseUp={() => props.onFileClick(nodeProps.entry.path)}
        backgroundColor={isOpen() ? theme.backgroundElement : undefined}
      >
        <text fg={color()} wrapMode="char">
          <Show when={isFocused()} fallback={nodeProps.entry.name}>
            <b>{nodeProps.entry.name}</b>
          </Show>
        </text>
      </box>
    )
  }

  // Get session prompt files from .git/session/
  const virtualFiles = createMemo(() => (props.sessionFiles ?? []).filter((f) => f.includes(".git/session/")))

  // Extract display name from path (just the filename)
  const getDisplayName = (filePath: string) => {
    return filePath.split("/").pop() ?? filePath
  }

  const [sessionExpanded, setSessionExpanded] = createSignal(false)
  const dialog = useDialog()
  const hasFiles = () => virtualFiles().length > 0
  // Check if any open file is a session file (when session folder is collapsed)
  const sessionContainsOpenFile = createMemo(() => {
    if (sessionExpanded()) return false
    const openFiles = props.openFiles ?? []
    return openFiles.some((f) => f.includes(".git/session/"))
  })

  // Load session files when Project Files is expanded
  createEffect(() => {
    if (props.expanded) {
      props.onLoadSessionFiles?.()
    }
  })

  // Track files that have already been revealed (to avoid re-expanding on focus change)
  const revealedFiles = new Set<string>()

  // Reveal focused file by expanding its parent directories (only on first open)
  createEffect(() => {
    const focused = props.focusedFile
    if (!focused || !props.expanded) return
    // Only reveal files that haven't been revealed before
    if (revealedFiles.has(focused)) return
    revealedFiles.add(focused)
    // Session file - expand session folder
    if (focused.includes(".git/session/")) {
      setSessionExpanded(true)
    } else {
      // Regular file - expand parent directories
      revealFile(focused)
    }
  })

  const handleDeleteVirtual = (filePath: string) => {
    DialogConfirm.show(dialog, "Delete Prompt", `Delete "${filePath}"?`).then((confirmed) => {
      if (confirmed) {
        props.onDeleteVirtualPrompt?.(filePath)
      }
    })
  }

  return (
    <box>
      <box flexDirection="row" gap={1} onMouseDown={handleToggle} flexShrink={0}>
        <text fg={theme.text}>{props.expanded ? "▼" : "▶"}</text>
        <text fg={theme.text}>
          <b>Project Files</b>
        </text>
      </box>
      <Show when={props.expanded}>
        <Show when={rootLoading()}>
          <text fg={theme.textMuted} paddingLeft={2}>
            Loading...
          </text>
        </Show>
        <Show when={!rootLoading()}>
          <box>
            {/* Session folder for prompts */}
            <box>
              <box flexDirection="row" gap={1} justifyContent="space-between">
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseUp={() => setSessionExpanded(!sessionExpanded())}
                  backgroundColor={sessionContainsOpenFile() ? theme.backgroundElement : undefined}
                >
                  <text fg={hasFiles() || sessionContainsOpenFile() ? theme.text : theme.textMuted}>
                    {sessionExpanded() ? "-" : "+"}
                  </text>
                  <text fg={hasFiles() || sessionContainsOpenFile() ? theme.text : theme.textMuted}>
                    <Show when={sessionContainsOpenFile()} fallback="session">
                      <b>session</b>
                    </Show>
                  </text>
                </box>
                <Show when={sessionExpanded()}>
                  <text fg={theme.textMuted} onMouseUp={() => props.onCreateVirtualPrompt?.()}>
                    +
                  </text>
                </Show>
              </box>
              <Show when={sessionExpanded() && hasFiles()}>
                <For each={virtualFiles()}>
                  {(filePath) => {
                    const isOpen = createMemo(() => props.openFiles?.includes(filePath) ?? false)
                    const isModified = createMemo(() => props.modifiedFiles?.has(filePath) ?? false)
                    const isFocused = createMemo(() => props.focusedFile === filePath)
                    const color = () => {
                      if (isModified()) return theme.accent
                      if (isFocused()) return theme.text
                      return theme.textMuted
                    }
                    const displayName = getDisplayName(filePath)
                    return (
                      <box
                        flexDirection="row"
                        paddingLeft={2}
                        justifyContent="space-between"
                        backgroundColor={isOpen() ? theme.backgroundElement : undefined}
                      >
                        <text fg={color()} onMouseUp={() => props.onFileClick(filePath)}>
                          <Show when={isFocused()} fallback={displayName}>
                            <b>{displayName}</b>
                          </Show>
                        </text>
                        <text fg={theme.textMuted} onMouseUp={() => handleDeleteVirtual(filePath)}>
                          x
                        </text>
                      </box>
                    )
                  }}
                </For>
              </Show>
            </box>
            <For each={rootEntries()}>{(entry) => <TreeNode entry={entry} depth={0} />}</For>
          </box>
        </Show>
      </Show>
    </box>
  )
}
