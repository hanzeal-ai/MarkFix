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

function MarkFixSymbol({ maskId }: { maskId: string }): React.JSX.Element {
  return (
    <g transform="scale(.96)">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="white" />
          <path
            d="M82 76V40C82 18 60 16 50 39L38 60"
            fill="none"
            stroke="black"
            strokeWidth="22"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 76V40C18 18 40 16 50 39L62 60" mask={`url(#${maskId})`} />
        <path d="M82 76V40C82 18 60 16 50 39L38 60" />
      </g>
    </g>
  );
}

export function MarkFixMark({ size = 32, title, ...props }: MarkFixMarkProps): React.JSX.Element {
  const maskId = useId();
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
      <MarkFixSymbol maskId={maskId} />
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
  const maskId = useId();
  const titleId = useId();
  return (
    <svg
      color={variant === 'reversed' ? '#ffffff' : '#000000'}
      {...props}
      aria-labelledby={titleId}
      className={['markfix-logo-horizontal', props.className].filter(Boolean).join(' ')}
      focusable="false"
      height={height}
      role="img"
      viewBox="0 0 300 96"
      width={width}
    >
      <title id={titleId}>{title}</title>
      <MarkFixSymbol maskId={maskId} />
      <text
        x="108"
        y="62"
        fill="currentColor"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="44"
        fontWeight="700"
        letterSpacing="-1.6"
      >
        MarkFix
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
  const maskId = useId();
  const titleId = useId();
  return (
    <svg
      color="#000000"
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
      <g transform="translate(72 4)">
        <MarkFixSymbol maskId={maskId} />
      </g>
      <text
        x="120"
        y="154"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="43"
        fontWeight="700"
        letterSpacing="-1.6"
      >
        MarkFix
      </text>
      <text
        x="120"
        y="184"
        textAnchor="middle"
        fill="#71717a"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="12"
        fontWeight="500"
        letterSpacing="2.2"
      >
        MARK IT. FIX IT.
      </text>
    </svg>
  );
}
