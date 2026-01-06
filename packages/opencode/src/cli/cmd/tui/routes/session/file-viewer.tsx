import { createEffect, createMemo, createSignal, on, onMount, Show, untrack } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "@tui/context/sync"
import { useToast } from "../../ui/toast"
import { useDialog } from "../../ui/dialog"
import { DialogConfirm } from "../../ui/dialog-confirm"
import { useKeyboard } from "@opentui/solid"
import { useKV } from "../../context/kv"
import { useViBasic } from "../../lib/vi-basic-core"
import path from "path"
import { createTwoFilesPatch } from "diff"
import type {
  TextareaRenderable,
  BoxRenderable,
  ScrollBoxRenderable,
  MouseEvent,
  LineNumberRenderable,
} from "@opentui/core"

interface FileViewerProps {
  filePath: string
  sessionID: string
  focused: boolean
  onFocus: () => void
  onClose: () => void
  onFileChange?: (filePath: string) => void
  onEnterEdit?: () => void
  onExitEdit?: () => void
}

export function FileViewer(props: FileViewerProps) {
  const { theme, syntax } = useTheme()
  const sync = useSync()
  const toast = useToast()
  const dialog = useDialog()
  const kv = useKV()
  const [content, setContent] = createSignal("")
  const [originalContent, setOriginalContent] = createSignal("")
  const [currentFile, setCurrentFile] = createSignal(props.filePath)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [showDiff, setShowDiff] = createSignal(true)
  const [editMode, setEditMode] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [mouseDownPos, setMouseDownPos] = createSignal<{ x: number; y: number } | null>(null)
  const [savedScrollPercent, setSavedScrollPercent] = createSignal(0)
  const [pendingScrollRestore, setPendingScrollRestore] = createSignal(false)

  let textareaRef: TextareaRenderable | undefined
  let containerRef: BoxRenderable | undefined
  let scrollRef: ScrollBoxRenderable | undefined
  let lineNumberRef: LineNumberRenderable | undefined

  // Editor mode (standard or vi)
  const editorMode = () => kv.get("editor_mode", "standard") as "standard" | "vi"
  const setEditorMode = (mode: "standard" | "vi") => kv.set("editor_mode", mode)

  // Vi mode hook
  const viMode = useViBasic({
    textarea: () => textareaRef,
    onContentChange: () => setContent(textareaRef?.plainText ?? ""),
    lineNumbers: () => lineNumberRef,
  })

  // Blur textarea when focus is lost
  createEffect(() => {
    if (!props.focused && textareaRef) {
      textareaRef.blur()
    }
  })

  // Manual click routing for header buttons when hit grid is broken by scroll
  const handleContainerClick = (e: MouseEvent) => {
    if (!containerRef) return
    const localY = e.y - containerRef.y
    if (localY === 0) {
      const localX = e.x - containerRef.x
      const w = containerRef.width
      const xFromRight = w - localX
      if (xFromRight <= 3) {
        if (editMode() && hasChanges()) {
          toast.show({ message: "edit canceled", variant: "info" })
        }
        discardChanges()
        props.onClose()
        e.stopPropagation()
      } else if (xFromRight <= 10) {
        if (!editMode()) toggleEdit()
        e.stopPropagation()
      } else if (xFromRight <= 17) {
        if (fileDiff() && !editMode()) setShowDiff(!showDiff())
        e.stopPropagation()
      } else if (xFromRight <= 24) {
        if (!editMode()) openFile()
        e.stopPropagation()
      }
    }
  }

  const directory = createMemo(() => sync.data.path.directory || process.cwd())
  const worktree = createMemo(() => sync.data.path.worktree || directory())

  const fullPath = createMemo(() => {
    const file = currentFile()
    if (path.isAbsolute(file)) return file
    return path.join(directory(), file)
  })

  const relativePath = createMemo(() => {
    const full = fullPath()
    const root = worktree()
    if (full.startsWith(root)) return full.slice(root.length + 1)
    return currentFile()
  })

  const fileDiff = createMemo(() => {
    const diffs = sync.data.session_diff[props.sessionID] ?? []
    return diffs.find((d) => d.file === relativePath())
  })

  createEffect(() => {
    currentFile()
    if (fileDiff()) setShowDiff(true)
  })

  const diffContent = createMemo(() => {
    const fd = fileDiff()
    if (!fd) return null
    return createTwoFilesPatch(currentFile(), currentFile(), fd.before, fd.after)
  })

  const hasChanges = createMemo(() => content() !== originalContent())

  const filetype = createMemo(() => {
    const ext = path.extname(currentFile()).slice(1).toLowerCase()
    const name = path.basename(currentFile()).toLowerCase()

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

    return nameMap[name] || extMap[ext] || ext || undefined
  })

  const loadFile = async () => {
    setLoading(true)
    setError(null)
    setEditMode(false)
    const file = Bun.file(fullPath())
    const exists = await file.exists()
    if (!exists) {
      setError("File not found")
      setLoading(false)
      return
    }
    const text = await file.text().catch(() => null)
    if (text === null) {
      setError("Failed to read file")
      setLoading(false)
      return
    }
    setContent(text)
    setOriginalContent(text)
    setLoading(false)
  }

  onMount(() => {
    props.onFileChange?.(props.filePath)
  })

  const saveFile = async () => {
    if (!hasChanges() || saving()) return
    setSaving(true)
    const result = await Bun.write(fullPath(), content()).catch(() => null)
    if (result === null) {
      toast.show({ message: "failed to save file", variant: "error" })
      setSaving(false)
      return
    }
    setOriginalContent(content())
    setSaving(false)
    if (textareaRef) {
      const maxScroll = textareaRef.editorView.getTotalVirtualLineCount() - textareaRef.height
      setSavedScrollPercent(maxScroll > 0 ? textareaRef.scrollY / maxScroll : 0)
    }
    setPendingScrollRestore(true)
    setEditMode(false)
    props.onExitEdit?.()
  }

  const toggleEdit = () => {
    const newEditMode = !editMode()
    if (newEditMode) {
      if (scrollRef) {
        const maxScroll = Math.max(0, scrollRef.scrollHeight - scrollRef.height)
        setSavedScrollPercent(maxScroll > 0 ? scrollRef.scrollTop / maxScroll : 0)
      }
      setEditMode(true)
      props.onEnterEdit?.()
      queueMicrotask(() => {
        try {
          if (textareaRef) {
            textareaRef.focus()
            const viewport = textareaRef.editorView.getViewport()
            const maxScroll = textareaRef.editorView.getTotalVirtualLineCount() - viewport.height
            const targetY = Math.round(savedScrollPercent() * Math.max(0, maxScroll))
            textareaRef.editorView.setViewport(viewport.offsetX, targetY, viewport.width, viewport.height, true)
          }
        } catch {
          // EditorView may be destroyed if component unmounted
        }
      })
    } else {
      if (textareaRef) {
        const maxScroll = textareaRef.editorView.getTotalVirtualLineCount() - textareaRef.height
        setSavedScrollPercent(maxScroll > 0 ? textareaRef.scrollY / maxScroll : 0)
      }
      setPendingScrollRestore(true)
      setEditMode(false)
      props.onExitEdit?.()
    }
  }

  const discardChanges = () => {
    if (editMode() && textareaRef) {
      const maxScroll = textareaRef.editorView.getTotalVirtualLineCount() - textareaRef.height
      setSavedScrollPercent(maxScroll > 0 ? textareaRef.scrollY / maxScroll : 0)
      setPendingScrollRestore(true)
      props.onExitEdit?.()
    }
    setContent(originalContent())
    setEditMode(false)
  }

  const openFile = () => {
    const file = fullPath()
    const opts = { stdout: "ignore" as const, stderr: "ignore" as const }
    if (process.platform === "darwin") {
      Bun.spawn(["open", file], opts)
    } else if (process.platform === "win32") {
      Bun.spawn(["cmd", "/c", "start", "", file], opts)
    } else {
      Bun.spawn(["xdg-open", file], opts)
    }
  }

  createEffect(
    on(
      () => props.filePath,
      (newFile) => {
        if (newFile === untrack(currentFile)) {
          loadFile()
          return
        }
        if (untrack(editMode) && untrack(hasChanges)) {
          DialogConfirm.show(dialog, "Unsaved Changes", "Discard changes and open file?").then((confirmed) => {
            if (confirmed) {
              setCurrentFile(newFile)
              props.onFileChange?.(newFile)
              loadFile()
            }
          })
          return
        }
        setCurrentFile(newFile)
        props.onFileChange?.(newFile)
        loadFile()
      },
    ),
  )

  useKeyboard((evt) => {
    if (!props.focused) return

    // ctrl+c: if editing, cancel edit; if viewing, close panel
    if (evt.name === "c" && evt.ctrl) {
      evt.preventDefault()
      if (editMode()) {
        discardChanges()
      } else {
        props.onClose()
      }
      return
    }

    // Edit mode handling
    if (editMode() && textareaRef) {
      // ctrl+/: toggle editor mode (standard/vi)
      // Some terminals send \u001f, others send "/" with ctrl flag
      if (evt.name === "\u001f" || evt.sequence === "\u001f" || (evt.name === "/" && evt.ctrl)) {
        evt.preventDefault()
        const newMode = editorMode() === "vi" ? "standard" : "vi"
        setEditorMode(newMode)
        viMode.reset()
        return
      }

      // ctrl+s: save (works in both standard and vi mode)
      if (evt.name === "s" && evt.ctrl) {
        evt.preventDefault()
        saveFile()
        return
      }

      // Vi mode handling - only when textarea is focused
      if (editorMode() === "vi" && textareaRef.focused) {
        if (viMode.handleKey(evt)) return
      }

      // Regular edit mode (standard) - only when textarea is focused
      // Enter key inserts newline
      if (evt.name === "return" && textareaRef.focused) {
        evt.preventDefault()
        textareaRef.insertText("\n")
        return
      }

      const pageSize = textareaRef.height - 2
      if (evt.name === "up" && evt.ctrl) {
        for (let i = 0; i < pageSize; i++) textareaRef.moveCursorUp()
        return
      }
      if (evt.name === "down" && evt.ctrl) {
        for (let i = 0; i < pageSize; i++) textareaRef.moveCursorDown()
        return
      }
      if (evt.name === "o" && evt.ctrl) {
        openFile()
        return
      }
    }

    // View mode shortcuts
    if (!editMode()) {
      if (evt.name === "e" && evt.ctrl) {
        toggleEdit()
        return
      }
      if (evt.name === "o" && evt.ctrl) {
        openFile()
        return
      }
      if (evt.name === "d" && evt.ctrl && fileDiff()) {
        setShowDiff(!showDiff())
        return
      }
      if (scrollRef) {
        const pageSize = scrollRef.height - 2
        if (evt.name === "up" && evt.ctrl) {
          scrollRef.scrollBy(-pageSize)
          return
        }
        if (evt.name === "down" && evt.ctrl) {
          scrollRef.scrollBy(pageSize)
          return
        }
        if (evt.name === "home") {
          scrollRef.scrollTo(0)
          return
        }
        if (evt.name === "end") {
          scrollRef.scrollTo(scrollRef.scrollHeight)
          return
        }
      }
    }
  })

  return (
    <box
      ref={(r) => (containerRef = r)}
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
      onMouseDown={props.onFocus}
      onMouseUp={handleContainerClick}
    >
      {/* Header */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={2}
        paddingRight={2}
        backgroundColor={theme.backgroundElement}
        borderColor={props.focused ? theme.accent : theme.border}
        border={["left"]}
        flexShrink={0}
      >
        <box flexGrow={1} flexShrink={1}>
          <text fg={theme.text}>
            <b>{relativePath()}</b>
            <Show when={hasChanges()}>
              <span style={{ fg: theme.warning }}> [modified]</span>
            </Show>
          </text>
        </box>
        <box flexDirection="row" gap={1} flexShrink={0}>
          <text
            fg={hasChanges() ? theme.success : theme.textMuted}
            onMouseUp={(e: MouseEvent) => {
              e.stopPropagation()
              saveFile()
            }}
            visible={editMode()}
          >
            {saving() ? "[saving...]" : "[save]"}
          </text>
          <text
            fg={theme.warning}
            onMouseUp={(e: MouseEvent) => {
              e.stopPropagation()
              discardChanges()
            }}
            visible={editMode()}
          >
            [cancel]
          </text>
          <Show when={fileDiff()}>
            <text fg={theme.diffAdded}>+{fileDiff()!.additions}</text>
            <text fg={theme.diffRemoved}>-{fileDiff()!.deletions}</text>
          </Show>
          <text
            fg={editMode() ? theme.textMuted : theme.text}
            onMouseUp={(e: MouseEvent) => {
              e.stopPropagation()
              if (!editMode()) openFile()
            }}
          >
            [open]
          </text>
          <text
            fg={!fileDiff() || editMode() ? theme.textMuted : showDiff() ? theme.accent : theme.text}
            onMouseUp={(e: MouseEvent) => {
              e.stopPropagation()
              if (fileDiff() && !editMode()) setShowDiff(!showDiff())
            }}
          >
            [diff]
          </text>
          <text
            fg={editMode() ? theme.textMuted : theme.text}
            onMouseUp={(e: MouseEvent) => {
              e.stopPropagation()
              if (!editMode()) toggleEdit()
            }}
          >
            [edit]
          </text>
          <text
            fg={theme.textMuted}
            onMouseUp={(e: MouseEvent) => {
              e.stopPropagation()
              if (editMode() && hasChanges()) {
                toast.show({ message: "edit canceled", variant: "info" })
              }
              discardChanges()
              props.onClose()
            }}
          >
            [x]
          </text>
        </box>
      </box>

      {/* Content */}
      <Show when={loading()}>
        <box
          flexGrow={1}
          paddingLeft={2}
          paddingTop={1}
          borderColor={props.focused ? theme.accent : theme.border}
          border={["left"]}
        >
          <text fg={theme.textMuted}>Loading...</text>
        </box>
      </Show>

      <Show when={error()}>
        <box
          flexGrow={1}
          paddingLeft={2}
          paddingTop={1}
          borderColor={props.focused ? theme.accent : theme.border}
          border={["left"]}
        >
          <text fg={theme.error}>{error()}</text>
        </box>
      </Show>

      <Show when={!loading() && !error()}>
        <Show when={editMode()}>
          <box
            flexGrow={1}
            flexDirection="column"
            borderColor={props.focused ? theme.accent : theme.border}
            border={["left"]}
            onMouseDown={() => textareaRef?.focus()}
          >
            <line_number
              flexGrow={1}
              fg={theme.textMuted}
              bg={theme.background}
              ref={(r: LineNumberRenderable) => {
                lineNumberRef = r
                import("@opentui/core").then(({ TextareaRenderable }) => {
                  const ctx = (r as any).ctx
                  const textarea = new TextareaRenderable(ctx, {
                    id: "file-editor-textarea",
                    initialValue: content(),
                    backgroundColor: theme.background,
                    textColor: theme.text,
                    wrapMode: "word",
                    showCursor: true,
                    cursorColor: theme.accent,
                    flexGrow: 1,
                    keyBindings: [
                      { name: "return", action: "newline" as const },
                      { name: "s", ctrl: true, action: "submit" as const },
                    ],
                    onSubmit: saveFile,
                    onContentChange: () => {
                      setContent(textarea.plainText)
                    },
                  })
                  textareaRef = textarea
                  r.add(textarea)
                  r.setLineNumbers(new Map([[textarea.lineCount - 1, textarea.lineCount]]))
                  if (props.focused) textarea.focus()
                })
              }}
            />
            <Show when={editorMode() === "vi" && viMode.searchMode()}>
              <box flexShrink={0} paddingLeft={1} backgroundColor={theme.background}>
                <text>
                  <span style={{ fg: theme.accent }}>/</span>
                  <span style={{ fg: theme.text }}>{viMode.searchBuffer()}</span>
                  <span style={{ fg: theme.accent }}>_</span>
                </text>
              </box>
            </Show>
            <box
              flexShrink={0}
              flexDirection="row"
              backgroundColor="#000000"
              justifyContent="space-between"
              paddingLeft={2}
              paddingRight={2}
            >
              <box flexDirection="row" gap={2}>
                <Show when={editorMode() === "vi"} fallback={<text fg={theme.textMuted}>standard</text>}>
                  <text fg={theme.accent}>vi</text>
                </Show>
                <text>
                  <span style={{ fg: theme.text }}>ctrl+/</span>
                  <span style={{ fg: theme.textMuted }}>{editorMode() === "vi" ? " use standard" : " use vi"}</span>
                </text>
                <Show when={editorMode() === "vi"}>
                  <text
                    style={{
                      fg: viMode.state() === "insert" ? "#000000" : "#888888",
                      bg: viMode.state() === "insert" ? "#98c379" : "#333333",
                    }}
                  >
                    {viMode.state() === "insert"
                      ? " INSERT "
                      : viMode.command()
                        ? ` ${viMode.command().padEnd(7, " ")} `
                        : " NORMAL "}
                  </text>
                </Show>
              </box>
              <box flexDirection="row" gap={2}>
                <text fg={theme.text}>ctrl+{"\u2191\u2193"}</text>
                <text>
                  <span style={{ fg: theme.text }}>ctrl+s</span>
                  <span style={{ fg: theme.textMuted }}>ave</span>
                </text>
                <text>
                  <span style={{ fg: theme.text }}>ctrl+c</span>
                  <span style={{ fg: theme.textMuted }}>ancel</span>
                </text>
              </box>
            </box>
          </box>
        </Show>
        <Show when={!editMode()}>
          <box
            flexGrow={1}
            flexDirection="column"
            borderColor={props.focused ? theme.accent : theme.border}
            border={["left"]}
          >
            <scrollbox
              ref={(r) => {
                scrollRef = r
                if (r && pendingScrollRestore()) {
                  setPendingScrollRestore(false)
                  setTimeout(() => {
                    const maxScroll = Math.max(0, r.scrollHeight - r.height)
                    r.scrollTo(Math.round(savedScrollPercent() * maxScroll))
                  }, 0)
                }
              }}
              flexGrow={1}
              paddingLeft={1}
              paddingRight={1}
              onMouseDown={(e: MouseEvent) => setMouseDownPos({ x: e.x, y: e.y })}
              onMouseUp={(e: MouseEvent) => {
                const down = mouseDownPos()
                setMouseDownPos(null)
                if (down && down.x === e.x && down.y === e.y) {
                  toggleEdit()
                }
              }}
            >
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
            <box
              flexShrink={0}
              flexDirection="row"
              backgroundColor="#000000"
              justifyContent="flex-end"
              paddingRight={2}
              gap={2}
            >
              <text fg={theme.text}>ctrl+{"\u2191\u2193"}</text>
              <text>
                <span style={{ fg: theme.text }}>ctrl+e</span>
                <span style={{ fg: theme.textMuted }}>dit</span>
              </text>
              <text>
                <span style={{ fg: theme.text }}>ctrl+o</span>
                <span style={{ fg: theme.textMuted }}>pen</span>
              </text>
              <text>
                <span style={{ fg: theme.text }}>ctrl+d</span>
                <span style={{ fg: theme.textMuted }}>iff</span>
              </text>
              <text>
                <span style={{ fg: theme.text }}>ctrl+c</span>
                <span style={{ fg: theme.textMuted }}>lose</span>
              </text>
            </box>
          </box>
        </Show>
      </Show>
    </box>
  )
}
