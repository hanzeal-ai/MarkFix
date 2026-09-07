import { useId, type SVGProps } from 'react';

export type MarkFixMarkProps = Omit<SVGProps<SVGSVGElement>, 'height' | 'width'> & {
  size?: number | string;
  title?: string;
};

export type MarkFixLogoProps = SVGProps<SVGSVGElement> & {
  title?: string;
  variant?: 'default' | 'reversed';
};

export type MarkFixStackedLogoProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

function MarkFixSymbol({ gradientId }: { gradientId: string }): React.JSX.Element {
  return (
    <>
      <rect x="8" y="8" width="80" height="80" rx="23" fill={`url(#${gradientId})`} />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M27 25h42a8 8 0 0 1 8 8v27a8 8 0 0 1-8 8H56l-9.7 8.1A3.2 3.2 0 0 1 41 73.6V68H27a8 8 0 0 1-8-8V33a8 8 0 0 1 8-8Zm34.8 12.7a4 4 0 0 0-5.6.5L43.7 53.1l-5.9-5a4 4 0 1 0-5.2 6.1l9 7.6a4 4 0 0 0 5.7-.5l15-18a4 4 0 0 0-.5-5.6Z"
      />
      <circle cx="76" cy="22" r="6" fill="#bdb8ff" stroke="#fff" strokeWidth="3" />
    </>
  );
}

export function MarkFixMark({ size = 32, title, ...props }: MarkFixMarkProps): React.JSX.Element {
  const gradientId = useId();
  const titleId = useId();

  return (
    <svg
      {...props}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      className={['markfix-logo-mark', props.className].filter(Boolean).join(' ')}
      focusable="false"
      height={size}
      role={title ? 'img' : undefined}
      viewBox="0 0 96 96"
      width={size}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <defs>
        <linearGradient
          id={gradientId}
          x1="18"
          y1="14"
          x2="79"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#756df2" />
          <stop offset="1" stopColor="#4238d4" />
        </linearGradient>
      </defs>
      <MarkFixSymbol gradientId={gradientId} />
    </svg>
  );
}

export function MarkFixLogo({
  height = 36,
  title = 'MarkFix',
  variant = 'default',
  width = 134,
  ...props
}: MarkFixLogoProps): React.JSX.Element {
  const gradientId = useId();
  const titleId = useId();

  return (
    <svg
      {...props}
      aria-labelledby={titleId}
      className={['markfix-logo-horizontal', props.className].filter(Boolean).join(' ')}
      focusable="false"
      height={height}
      role="img"
      viewBox="0 0 356 96"
      width={width}
    >
      <title id={titleId}>{title}</title>
      <defs>
        <linearGradient
          id={gradientId}
          x1="18"
          y1="14"
          x2="79"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#756df2" />
          <stop offset="1" stopColor="#4238d4" />
        </linearGradient>
      </defs>
      <MarkFixSymbol gradientId={gradientId} />
      <text
        x="111"
        y="61"
        fill={variant === 'reversed' ? '#f6f5ff' : '#191a1d'}
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        fontSize="43"
        fontWeight="750"
        letterSpacing="-1.8"
      >
        Mark
        <tspan fill={variant === 'reversed' ? '#bdb8ff' : '#5b52e8'}>Fix</tspan>
      </text>
    </svg>
  );
}

export function MarkFixStackedLogo({
  height = 174,
  title = 'MarkFix — Mark it. Fix it.',
  width = 190,
  ...props
}: MarkFixStackedLogoProps): React.JSX.Element {
  const gradientId = useId();
  const titleId = useId();

  return (
    <svg
      {...props}
      aria-labelledby={titleId}
      className={['markfix-logo-stacked', props.className].filter(Boolean).join(' ')}
      focusable="false"
      height={height}
      role="img"
      viewBox="0 0 240 220"
      width={width}
    >
      <title id={titleId}>{title}</title>
      <defs>
        <linearGradient
          id={gradientId}
          x1="18"
          y1="14"
          x2="79"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#756df2" />
          <stop offset="1" stopColor="#4238d4" />
        </linearGradient>
      </defs>
      <g transform="translate(72 4)">
        <MarkFixSymbol gradientId={gradientId} />
      </g>
      <text
        x="120"
        y="154"
        textAnchor="middle"
        fill="#191a1d"
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        fontSize="43"
        fontWeight="750"
        letterSpacing="-1.8"
      >
        Mark
        <tspan fill="#5b52e8">Fix</tspan>
      </text>
      <text
        x="120"
        y="184"
        textAnchor="middle"
        fill="#61656f"
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif"
        fontSize="12"
        fontWeight="650"
        letterSpacing="2.2"
      >
        MARK IT. FIX IT.
      </text>
    </svg>
  );
}
