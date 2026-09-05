import { useEffect, useState } from 'react';
import type { WebsiteProject } from '@markfix/contracts';
import { MessageSquareText } from '@markfix/ui/icons';

export function MarkFixGlyph(): React.JSX.Element {
  return (
    <span className="markfix-glyph" aria-hidden="true">
      <MessageSquareText />
    </span>
  );
}

export function WebsiteLogo({ project }: { project: WebsiteProject }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [project.faviconUrl]);
  return (
    <span className="website-logo" aria-hidden="true">
      {!failed && project.faviconUrl ? (
        <img src={project.faviconUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        <MarkFixGlyph />
      )}
    </span>
  );
}
