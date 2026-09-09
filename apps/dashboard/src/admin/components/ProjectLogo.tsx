import { useState } from 'react';
import { MessageSquareText } from '@markfix/ui/icons';
import type { OverviewProject } from '../model';
export function ProjectLogo({ project }: { project: OverviewProject }) {
  const faviconUrl = project.baseUrl ? new URL('/favicon.ico', project.baseUrl).href : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showFavicon = faviconUrl && faviconUrl !== failedUrl;

  return (
    <span className="project-symbol" aria-hidden="true">
      {showFavicon ? (
        <img src={faviconUrl} alt="" onError={() => setFailedUrl(faviconUrl)} />
      ) : (
        <MessageSquareText />
      )}
    </span>
  );
}
