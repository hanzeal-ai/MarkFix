import { useEffect, useState } from 'react';
import type { WebsiteProject } from '@markfix/contracts';
import { MarkFixMark } from '@markfix/ui';

export function MarkFixGlyph(): React.JSX.Element {
  return <MarkFixMark className="markfix-glyph" size={30} />;
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
