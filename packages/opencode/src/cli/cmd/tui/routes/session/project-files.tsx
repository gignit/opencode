import { createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import path from "path"
import fs from "fs/promises"

export interface FileTreeNode {
  name: string
  path: string
  type: "file" | "directory"
  children: FileTreeNode[]
}

interface ProjectFilesProps {
  expanded: boolean
  onToggle: () => void
  onFileClick: (path: string) => void
  activeFile: string | null
}

// Folders to skip
const SKIP_FOLDERS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
  ".opencode",
])

export function ProjectFiles(props: ProjectFilesProps) {
  const { theme } = useTheme()
  const sync = useSync()
  const [tree, setTree] = createStore<{ root: FileTreeNode | null; loading: boolean; error: string | null }>({
    root: null,
    loading: true,
    error: null,
  })
  const [expandedDirs, setExpandedDirs] = createStore<Record<string, boolean>>({})

  const directory = createMemo(() => sync.data.path.directory || process.cwd())

  const loadDir = async (dirPath: string, relativePath: string): Promise<FileTreeNode[]> => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => [])
    const nodes: FileTreeNode[] = []

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue
      if (SKIP_FOLDERS.has(entry.name)) continue

      const entryRelPath = relativePath ? path.join(relativePath, entry.name) : entry.name

      if (entry.isDirectory()) {
        const children = await loadDir(path.join(dirPath, entry.name), entryRelPath)
        nodes.push({
          name: entry.name,
          path: entryRelPath,
          type: "directory",
          children,
        })
      } else if (entry.isFile()) {
        nodes.push({
          name: entry.name,
          path: entryRelPath,
          type: "file",
          children: [],
        })
      }
    }

    // Sort: directories first, then alphabetically
    nodes.sort((a, b) => {
      if (a.type === "directory" && b.type === "file") return -1
      if (a.type === "file" && b.type === "directory") return 1
      return a.name.localeCompare(b.name)
    })

    return nodes
  }

  const loadFiles = async () => {
    setTree("loading", true)
    setTree("error", null)

    const children = await loadDir(directory(), "")

    const root: FileTreeNode = {
      name: "",
      path: "",
      type: "directory",
      children,
    }

    setTree("root", root)
    setTree("loading", false)
  }

  onMount(() => {
    loadFiles()
  })

  const toggleDir = (dirPath: string) => {
    setExpandedDirs(dirPath, !expandedDirs[dirPath])
  }

  const fileCount = createMemo(() => {
    if (!tree.root) return 0
    const count = (node: FileTreeNode): number => {
      if (node.type === "file") return 1
      return node.children.reduce((sum, child) => sum + count(child), 0)
    }
    return count(tree.root)
  })

  // Use a component for proper reactivity
  function TreeNode(nodeProps: { node: FileTreeNode; depth: number }) {
    const isExpanded = createMemo(() => expandedDirs[nodeProps.node.path] ?? false)
    const isActive = createMemo(() => props.activeFile === nodeProps.node.path)
    const indent = nodeProps.depth * 2

    if (nodeProps.node.type === "directory") {
      return (
        <box>
          <box flexDirection="row" gap={1} paddingLeft={indent} onMouseDown={() => toggleDir(nodeProps.node.path)}>
            <text fg={theme.text}>{isExpanded() ? "▼" : "▶"}</text>
            <text fg={theme.text}>{nodeProps.node.name}/</text>
          </box>
          <Show when={isExpanded()}>
            <For each={nodeProps.node.children}>{(child) => <TreeNode node={child} depth={nodeProps.depth + 1} />}</For>
          </Show>
        </box>
      )
    }

    return (
      <box
        flexDirection="row"
        paddingLeft={indent + 2}
        onMouseDown={() => props.onFileClick(nodeProps.node.path)}
        backgroundColor={isActive() ? theme.backgroundElement : undefined}
      >
        <text fg={isActive() ? theme.text : theme.textMuted}>{nodeProps.node.name}</text>
      </box>
    )
  }

  return (
    <box>
      <box flexDirection="row" gap={1} onMouseDown={props.onToggle} flexShrink={0}>
        <text fg={theme.text}>{props.expanded ? "▼" : "▶"}</text>
        <text fg={theme.text}>
          <b>Project Files</b>
          <Show when={!props.expanded}>
            <span style={{ fg: theme.textMuted }}> ({fileCount()})</span>
          </Show>
        </text>
      </box>
      <Show when={props.expanded}>
        <Show when={tree.loading}>
          <text fg={theme.textMuted} paddingLeft={2}>
            Loading...
          </text>
        </Show>
        <Show when={tree.error}>
          <text fg={theme.error} paddingLeft={2}>
            {tree.error}
          </text>
        </Show>
        <Show when={!tree.loading && !tree.error && tree.root}>
          <box>
            <For each={tree.root!.children}>{(child) => <TreeNode node={child} depth={0} />}</For>
          </box>
        </Show>
      </Show>
    </box>
  )
}
