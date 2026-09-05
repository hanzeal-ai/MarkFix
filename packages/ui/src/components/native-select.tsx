import * as React from 'react';
import { cn } from '../lib/cn.js';

export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<'select'>): React.JSX.Element {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-1 pr-8 text-sm shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}
