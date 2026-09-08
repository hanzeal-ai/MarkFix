import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './button.js';
import { Input } from './input.js';
import { cn } from '../lib/cn.js';

export function PasswordInput({
  className,
  wrapperClassName,
  toggleClassName,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'type'> & {
  wrapperClassName?: string;
  toggleClassName?: string;
}): React.JSX.Element {
  const [visible, setVisible] = React.useState(false);
  return (
    <span data-slot="password-field" className={cn('relative block', wrapperClassName)}>
      <Input className={cn('pr-10', className)} type={visible ? 'text' : 'password'} {...props} />
      <Button
        className={cn('password-visibility-toggle', toggleClassName)}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={visible ? '隐藏密码' : '显示密码'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </span>
  );
}
