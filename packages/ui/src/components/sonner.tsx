import * as React from 'react';
import { CheckCircle2, Info, Loader2, OctagonX, TriangleAlert, X } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
        close: <X className="size-4" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast border bg-background text-foreground shadow-lg group-[.toaster]:rounded-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { toast } from 'sonner';
