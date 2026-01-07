import { createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../../context/theme"
import { useSync } from "@tui/context/sync"
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

  const handleToggle = async () => {
    if (!props.expanded) {
      await loadRootDir()
    }
    props.onToggle()
  }

  function TreeNode(nodeProps: { entry: FileEntry; depth: number }) {
    const isActive = createMemo(() => props.openFiles?.includes(nodeProps.entry.path) ?? false)
    const indent = nodeProps.depth * 2

    if (nodeProps.entry.type === "directory") {
      const dirState = createMemo(() => dirs[nodeProps.entry.path])
      const isExpanded = createMemo(() => dirState()?.expanded ?? false)
      const isLoading = createMemo(() => dirState()?.loading ?? false)
      const children = createMemo(() => dirState()?.entries ?? [])

      return (
        <box>
          <box flexDirection="row" gap={1} paddingLeft={indent} onMouseUp={() => toggleDir(nodeProps.entry.path)}>
            <text fg={theme.text}>{isExpanded() ? "v" : ">"}</text>
            <text fg={theme.text} wrapMode="char">
              {nodeProps.entry.name}/
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

    return (
      <box
        flexDirection="row"
        paddingLeft={indent + 2}
        onMouseUp={() => props.onFileClick(nodeProps.entry.path)}
        backgroundColor={isActive() ? theme.backgroundElement : undefined}
      >
        <text fg={isActive() ? theme.text : theme.textMuted} wrapMode="char">
          {nodeProps.entry.name}
        </text>
      </box>
    )
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
            <For each={rootEntries()}>{(entry) => <TreeNode entry={entry} depth={0} />}</For>
          </box>
        </Show>
      </Show>
    </box>
  )
}
