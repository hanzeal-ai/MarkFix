import { Button } from '@markfix/ui';
import { PanelLeftClose, PanelLeftOpen, SquarePen } from '@markfix/ui/icons';

export function HeaderNavigationControls({
  expanded,
  onToggle,
  onNew,
  onPeek,
  onEndPeek,
}: {
  expanded: boolean;
  onToggle: () => void;
  onNew: () => void;
  onPeek: () => void;
  onEndPeek: () => void;
}): React.JSX.Element {
  return (
    <div className="header-navigation-controls" aria-label="项目快捷操作">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={expanded ? '收起项目侧边栏' : '展开项目侧边栏'}
        aria-keyshortcuts="Meta+B"
        title={expanded ? '收起侧边栏（⌘B）' : '展开侧边栏（⌘B）'}
        onClick={onToggle}
        onMouseEnter={expanded ? undefined : onPeek}
        onMouseLeave={onEndPeek}
        onFocus={expanded ? undefined : onPeek}
        onBlur={onEndPeek}
      >
        {expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>
      {!expanded && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="新标注"
          title="新标注（⌘N）"
          aria-keyshortcuts="Meta+N"
          onClick={onNew}
          onMouseEnter={onPeek}
          onMouseLeave={onEndPeek}
          onFocus={onPeek}
          onBlur={onEndPeek}
        >
          <SquarePen />
        </Button>
      )}
    </div>
  );
}
