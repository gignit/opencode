import { createSignal, createMemo, createEffect, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { createTwoFilesPatch } from "diff"
import path from "path"
import { exec } from "child_process"

function openInExternalApp(filePath: string) {
  const command =
    process.platform === "darwin"
      ? `open "${filePath}"`
      : process.platform === "win32"
        ? `start "" "${filePath}"`
        : `xdg-open "${filePath}"`
  exec(command)
}

interface FileViewerProps {
  filePath: string
  sessionID: string
  onClose: () => void
  focused: boolean
  onFocus: () => void
}

export function FileViewer(props: FileViewerProps) {
  const { theme, syntax } = useTheme()
  const sync = useSync()
  const [content, setContent] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [showDiff, setShowDiff] = createSignal(true)

  const directory = createMemo(() => sync.data.path.directory || process.cwd())

  // Handle both absolute and relative paths
  const fullPath = createMemo(() => {
    if (path.isAbsolute(props.filePath)) {
      return props.filePath
    }
    return path.join(directory(), props.filePath)
  })

  // Convert to relative path for display and diff lookup
  const relativePath = createMemo(() => {
    if (path.isAbsolute(props.filePath)) {
      const dir = directory()
      if (props.filePath.startsWith(dir)) {
        return props.filePath.slice(dir.length + 1) // +1 for the trailing slash
      }
    }
    return props.filePath
  })

  const fileName = createMemo(() => path.basename(props.filePath))

  // Check if file has a diff in this session
  const fileDiff = createMemo(() => {
    const diffs = sync.data.session_diff[props.sessionID] ?? []
    return diffs.find((d) => d.file === relativePath())
  })

  // Reset showDiff to true when file changes and has a diff
  createEffect(() => {
    props.filePath // Track file changes
    if (fileDiff()) {
      setShowDiff(true)
    }
  })

  // Create unified diff string for display
  const diffContent = createMemo(() => {
    const fd = fileDiff()
    if (!fd) return null
    return createTwoFilesPatch(props.filePath, props.filePath, fd.before, fd.after)
  })

  const filetype = createMemo(() => {
    const ext = path.extname(props.filePath).slice(1).toLowerCase()
    const name = path.basename(props.filePath).toLowerCase()

    // Extensionless filename mappings
    const nameMap: Record<string, string> = {
      dockerfile: "dockerfile",
      makefile: "makefile",
      cmakelists: "cmake",
      gemfile: "ruby",
      rakefile: "ruby",
      procfile: "yaml",
      vagrantfile: "ruby",
      brewfile: "ruby",
      justfile: "makefile",
    }

    const extMap: Record<string, string> = {
      ts: "typescript",
      tsx: "tsx",
      js: "javascript",
      jsx: "jsx",
      py: "python",
      rb: "ruby",
      rs: "rust",
      go: "go",
      java: "java",
      c: "c",
      cpp: "cpp",
      h: "c",
      hpp: "cpp",
      cs: "csharp",
      php: "php",
      swift: "swift",
      kt: "kotlin",
      scala: "scala",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      fish: "fish",
      ps1: "powershell",
      sql: "sql",
      html: "html",
      css: "css",
      scss: "scss",
      less: "less",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml",
      md: "markdown",
      mdx: "mdx",
      txt: "text",
      toml: "toml",
      ini: "ini",
      cfg: "ini",
      conf: "ini",
      env: "dotenv",
      dockerfile: "dockerfile",
      makefile: "makefile",
      cmake: "cmake",
      zig: "zig",
      nim: "nim",
      lua: "lua",
      r: "r",
      jl: "julia",
      ex: "elixir",
      exs: "elixir",
      erl: "erlang",
      hs: "haskell",
      ml: "ocaml",
      fs: "fsharp",
      clj: "clojure",
      lisp: "lisp",
      scm: "scheme",
      vue: "vue",
      svelte: "svelte",
      astro: "astro",
    }

    // Check filename first (for extensionless files), then extension
    return nameMap[name] || extMap[ext] || ext || undefined
  })

  const loadFile = async () => {
    setLoading(true)
    setError(null)
    const file = Bun.file(fullPath())
    const exists = await file.exists()
    if (!exists) {
      setError("File not found")
      setLoading(false)
      return
    }
    const text = await file.text()
    setContent(text)
    setLoading(false)
  }

  createEffect(() => {
    props.filePath // Track changes
    loadFile()
  })

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      borderColor={props.focused ? theme.accent : theme.border}
      border={["left"]}
      onMouseDown={props.onFocus}
    >
      {/* Header */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={2}
        paddingRight={2}
        backgroundColor={theme.backgroundElement}
        flexShrink={0}
      >
        <box flexGrow={1} flexShrink={1}>
          <text fg={theme.text} onMouseDown={() => openInExternalApp(fullPath())}>
            <b>{relativePath()}</b>
          </text>
        </box>
        <box flexDirection="row" gap={1} flexShrink={0}>
          <text fg={fileDiff() ? theme.diffAdded : theme.textMuted}>
            {fileDiff() ? `+${fileDiff()!.additions}` : ""}
          </text>
          <text fg={fileDiff() ? theme.diffRemoved : theme.textMuted}>
            {fileDiff() ? `-${fileDiff()!.deletions}` : ""}
          </text>
          <text
            fg={!fileDiff() ? theme.textMuted : showDiff() ? theme.accent : theme.text}
            onMouseDown={() => fileDiff() && setShowDiff(!showDiff())}
          >
            [diff]
          </text>
          <text fg={theme.textMuted} onMouseDown={props.onClose}>
            [x]
          </text>
        </box>
      </box>

      {/* Content */}
      <Show when={loading()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={theme.textMuted}>Loading...</text>
        </box>
      </Show>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={theme.error}>{error()}</text>
        </box>
      </Show>

      <Show when={!loading() && !error()}>
        <scrollbox flexGrow={1} paddingLeft={1} paddingRight={1}>
          <Show
            when={diffContent() && showDiff()}
            fallback={<code content={content()} filetype={filetype()} syntaxStyle={syntax()} />}
          >
            <diff
              diff={diffContent()!}
              filetype={filetype()}
              syntaxStyle={syntax()}
              showLineNumbers={true}
              width="100%"
              fg={theme.text}
              addedBg={theme.diffAddedBg}
              removedBg={theme.diffRemovedBg}
            />
          </Show>
        </scrollbox>
      </Show>
    </box>
  )
}
