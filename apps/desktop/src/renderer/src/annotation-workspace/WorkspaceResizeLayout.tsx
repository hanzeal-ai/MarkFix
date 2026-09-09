import { useLayoutEffect, useRef, type PointerEvent } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizablePanelRef,
} from '@markfix/ui';
import { sidebarMinWidth, sidebarMaxWidth, websiteMinWidth } from '../../../sidebar-layout';

export function WorkspaceResizeLayout({
  leftWidth,
  rightWidth,
  workspaceVisible,
  onLeftResize,
  onRightResize,
}: {
  leftWidth: number;
  rightWidth: number;
  workspaceVisible: boolean;
  onLeftResize: (width: number, dragStartWidth?: number) => void;
  onRightResize: (width: number, dragStartWidth?: number) => void;
}) {
  const left = useResizablePanelRef();
  const right = useResizablePanelRef();
  // Changing defaultSize re-registers the panel and interrupts an active drag.
  const initialWidths = useRef({ left: leftWidth, right: rightWidth });
  const reportedWidths = useRef({ left: leftWidth, right: rightWidth });
  const dragStartWidths = useRef<{ left?: number; right?: number }>({});
  const capturePointer = (side: 'left' | 'right', event: PointerEvent<HTMLDivElement>) => {
    // Capture before the pointer can cross into the native website view.
    if (event.button === 0) {
      dragStartWidths.current[side] = reportedWidths.current[side];
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const releasePointer = (side: 'left' | 'right') => {
    delete dragStartWidths.current[side];
  };

  useLayoutEffect(() => {
    // Only external toggles resize the panels; their own size notifications are echoes.
    if (leftWidth !== reportedWidths.current.left) left.current?.resize(leftWidth);
    if (rightWidth !== reportedWidths.current.right) right.current?.resize(rightWidth);
  }, [left, right, leftWidth, rightWidth]);

  // The website is a native Electron view; these panels drive its reserved space.
  return (
    <ResizablePanelGroup orientation="horizontal" className="workspace-resize-layout">
      <ResizablePanel
        id="projects"
        panelRef={left}
        defaultSize={initialWidths.current.left}
        minSize={sidebarMinWidth}
        maxSize={sidebarMaxWidth}
        collapsible
        groupResizeBehavior="preserve-pixel-size"
        onResize={({ inPixels }) => {
          reportedWidths.current.left = Math.round(inPixels);
          onLeftResize(
            reportedWidths.current.left,
            reportedWidths.current.left === 0 ? dragStartWidths.current.left : undefined,
          );
        }}
      />
      <ResizableHandle
        className="sidebar-resize-handle"
        aria-label="调整项目侧边栏宽度"
        onPointerDown={(event) => capturePointer('left', event)}
        onPointerUp={() => releasePointer('left')}
        onPointerCancel={() => releasePointer('left')}
      />
      <ResizablePanel id="website" minSize={websiteMinWidth} />
      <ResizableHandle
        className="annotation-panel-resize-handle"
        data-collapsed={rightWidth === 0}
        aria-label="调整批注栏宽度"
        onPointerDown={(event) => capturePointer('right', event)}
        onPointerUp={() => releasePointer('right')}
        onPointerCancel={() => releasePointer('right')}
        disabled={!workspaceVisible}
      />
      <ResizablePanel
        key={workspaceVisible ? 'workspace-annotations' : 'inactive-annotations'}
        id="annotations"
        panelRef={right}
        defaultSize={initialWidths.current.right}
        minSize={sidebarMinWidth}
        maxSize={sidebarMaxWidth}
        collapsible
        disabled={!workspaceVisible}
        groupResizeBehavior="preserve-pixel-size"
        onResize={({ inPixels }) => {
          reportedWidths.current.right = Math.round(inPixels);
          onRightResize(
            reportedWidths.current.right,
            reportedWidths.current.right === 0 ? dragStartWidths.current.right : undefined,
          );
        }}
      />
    </ResizablePanelGroup>
  );
}
