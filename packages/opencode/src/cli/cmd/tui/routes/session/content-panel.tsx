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
  // Virtual content mode (for prompt editing)
  virtualContent?: string
  virtualTitle?: string
  onSaveContent?: (content: string) => void
  // Visibility control for stacking
  visible?: boolean
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

  const hasContent = () => !!(props.filePath || props.virtualContent !== undefined)
  const isVisible = () => props.visible !== false
  const isOpen = () => hasContent() && isVisible()

  // Auto-focus when a file or virtual content is opened
  createEffect(() => {
    if (isOpen()) {
      setFocused(true)
      props.onFocusChange?.(true)
    }
  })

  // Notify parent of width changes
  createEffect(() => {
    const w = isOpen() ? clampedWidth() + 1 : 0
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
    <>
      <box
        visible={isOpen()}
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
      <box visible={isOpen()} width={clampedWidth()}>
        <Show when={hasContent()}>
          <FileViewer
            filePath={props.filePath ?? undefined}
            sessionID={props.sessionID}
            focused={focused() && isOpen()}
            onFocus={handleFocus}
            onClose={handleClose}
            onFileChange={(file: string) => setDisplayedFile(file)}
            onEnterEdit={props.onEnterEdit}
            onExitEdit={props.onExitEdit}
            virtualContent={props.virtualContent}
            virtualTitle={props.virtualTitle}
            onSaveContent={props.onSaveContent}
          />
        </Show>
      </box>
    </>
  )
}
