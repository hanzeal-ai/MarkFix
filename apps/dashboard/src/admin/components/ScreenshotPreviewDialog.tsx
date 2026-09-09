import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@markfix/ui';
import { resolveAdminAssetUrl } from '../api';

export function ScreenshotPreviewDialog({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="annotation-image-preview-dialog">
        <DialogHeader>
          <DialogTitle>截图预览</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        <div className="annotation-image-preview-canvas">
          <img src={resolveAdminAssetUrl(url)} alt={`${title}完整截图`} />
        </div>
        <Button variant="outline" onClick={onClose}>
          关闭预览
        </Button>
      </DialogContent>
    </Dialog>
  );
}
