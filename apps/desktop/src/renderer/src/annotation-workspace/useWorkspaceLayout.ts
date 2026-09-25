import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  sidebarMinWidth,
  isSidebarWidth,
  annotationPanelDefaultWidth,
  annotationPanelWidth,
} from '../../../sidebar-layout';
import {
  browserModeFromSession,
  browserModeSessionKey,
  shouldCollapseSidebarForMode,
} from './workspace-session';

export function useWorkspaceLayout(workspaceVisible: boolean, previewVisible: boolean) {
  const [sidebarExpanded, setSidebarExpanded] = useState(
    () =>
      !shouldCollapseSidebarForMode(
        browserModeFromSession(window.sessionStorage.getItem(browserModeSessionKey)),
      ) && window.localStorage.getItem('markfix:sidebar-expanded') !== 'false',
  );
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showSidebarPeek = () => {
    clearTimeout(peekTimer.current);
    if (!sidebarExpanded) setSidebarPeek(true);
  };
  const endSidebarPeek = () => {
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setSidebarPeek(false), 180);
  };
  useEffect(() => () => clearTimeout(peekTimer.current), []);
  useEffect(() => {
    if (sidebarExpanded) setSidebarPeek(false);
  }, [sidebarExpanded]);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem('markfix:sidebar-width'));
    return isSidebarWidth(saved) && saved > 0 ? saved : sidebarMinWidth;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem('markfix:annotation-panel-width'));
    return isSidebarWidth(saved) && saved > 0 ? saved : annotationPanelDefaultWidth;
  });
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useLayoutEffect(() => {
    window.localStorage.setItem('markfix:sidebar-expanded', String(sidebarExpanded));
    window.localStorage.setItem('markfix:sidebar-width', String(sidebarWidth));
    window.localStorage.setItem('markfix:annotation-panel-width', String(rightPanelWidth));
    void window.markfix.setWorkspaceLayout(
      sidebarExpanded ? sidebarWidth : 0,
      workspaceVisible,
      sidebarMenuOpen || (!sidebarExpanded && sidebarPeek) ? sidebarWidth : 0,
      previewVisible ? rightPanelWidth : 0,
    );
  }, [
    workspaceVisible,
    sidebarExpanded,
    sidebarWidth,
    sidebarPeek,
    sidebarMenuOpen,
    rightPanelWidth,
    previewVisible,
  ]);

  const shellStyle = {
    '--annotation-panel-width': `${previewVisible ? annotationPanelWidth(rightPanelWidth, sidebarExpanded ? sidebarWidth : 0, viewportWidth) : 0}px`,
    '--sidebar-peek-width': `${sidebarWidth}px`,
    '--sidebar-width': `${sidebarExpanded ? sidebarWidth : 0}px`,
  } as CSSProperties;
  const closeSidebarPeek = () => {
    clearTimeout(peekTimer.current);
    setSidebarPeek(false);
  };
  return {
    sidebarExpanded,
    setSidebarExpanded,
    sidebarPeek,
    setSidebarMenuOpen,
    showSidebarPeek,
    endSidebarPeek,
    closeSidebarPeek,
    sidebarWidth,
    setSidebarWidth,
    rightPanelWidth,
    setRightPanelWidth,
    shellStyle,
  };
}
