import { createEffect, createMemo, createSignal, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useKV } from "../../context/kv"
import { FileViewer } from "./file-viewer"
import type { MouseEvent } from "@opentui/core"

interface ContentPanelProps {
  filePath: string | null
  sessionID: string
  totalWidth: number
  onClose: () => void
  onActiveFileChange?: (filePath: string | null) => void
  onFocusChange?: (focused: boolean) => void
  onWidthChange?: (width: number) => void
  onEnterEdit?: () => void
  onExitEdit?: () => void
}

export function ContentPanel(props: ContentPanelProps) {
  const { theme } = useTheme()
  const kv = useKV()
  const [focused, setFocused] = createSignal(false)
  const [width, setWidth] = createSignal<number>(kv.get("content_panel_width", 60))
  const [dragging, setDragging] = createSignal(false)
  const [displayedFile, setDisplayedFile] = createSignal<string | null>(null)

  const clampedWidth = createMemo(() => {
    const minWidth = 65
    const maxWidth = props.totalWidth - 30
    return Math.max(minWidth, Math.min(maxWidth, width()))
  })

  // Auto-focus when a file is opened
  createEffect(() => {
    if (props.filePath) {
      setFocused(true)
      props.onFocusChange?.(true)
    }
  })

  // Notify parent of width changes
  createEffect(() => {
    const w = props.filePath ? clampedWidth() + 1 : 0
    props.onWidthChange?.(w)
  })

  // Notify parent of displayed file changes
  createEffect(() => {
    props.onActiveFileChange?.(displayedFile())
  })

  const handleFocus = () => {
    setFocused(true)
    props.onFocusChange?.(true)
  }

  const handleClose = () => {
    setFocused(false)
    setDisplayedFile(null)
    props.onFocusChange?.(false)
    props.onClose()
  }

  return (
    <Show when={props.filePath}>
      <box
        width={1}
        backgroundColor={dragging() ? theme.accent : theme.border}
        onMouseDown={() => setDragging(true)}
        onMouseDrag={(e: MouseEvent) => {
          if (dragging()) {
            const newWidth = Math.max(20, Math.min(props.totalWidth - 30, props.totalWidth - e.x))
            setWidth(newWidth)
          }
        }}
        onMouseDragEnd={() => {
          setDragging(false)
          kv.set("content_panel_width", width())
        }}
      />
      <box width={clampedWidth()}>
        <FileViewer
          filePath={props.filePath!}
          sessionID={props.sessionID}
          focused={focused()}
          onFocus={handleFocus}
          onClose={handleClose}
          onFileChange={(file: string) => setDisplayedFile(file)}
          onEnterEdit={props.onEnterEdit}
          onExitEdit={props.onExitEdit}
        />
      </box>
    </Show>
  )
}
