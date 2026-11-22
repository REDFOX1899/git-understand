'use client';

import React, { useId, type SVGProps } from 'react';

export interface BrandMarkProps extends SVGProps<SVGSVGElement> {
  /** Width and height in pixels (defaults to 24) */
  size?: number | string;
  /** Whether to apply an ethereal ambient cobalt glow filter */
  glow?: boolean;
}

/**
 * GitUnderstandPrismMark — The core brand emblem of GitUnderstand.
 * Visualizes codebase intelligence as a multifaceted 3D cobalt prism
 * refracting raw repository source trees into clean structural strata.
 */
export function GitUnderstandPrismMark({
  size = 24,
  glow = false,
  className = '',
  style,
  ...props
}: BrandMarkProps) {
  const rawId = useId();
  const id = rawId.replace(/[:]/g, '_');

  const gradFacetTopLeft = `prism-tl-${id}`;
  const gradFacetTopRight = `prism-tr-${id}`;
  const gradFacetBottomLeft = `prism-bl-${id}`;
  const gradFacetBottomRight = `prism-br-${id}`;
  const gradSpine = `prism-spine-${id}`;
  const gradGlow = `prism-glow-${id}`;
  const filterGlow = `prism-filter-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="GitUnderstand Prism"
      className={`inline-block select-none transition-transform duration-200 ${className}`}
      style={{
        filter: glow ? `drop-shadow(0 0 10px var(--cobalt-bright))` : undefined,
        ...style,
      }}
      {...props}
    >
      <defs>
        {/* Glow Filter */}
        <filter id={filterGlow} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Facet Top-Left Gradient (Light source reflection) */}
        <linearGradient id={gradFacetTopLeft} x1="16" y1="2" x2="4" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--cobalt-ice)" stopOpacity="0.95" />
          <stop offset="45%" stopColor="var(--cobalt-bright)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--cobalt-core)" stopOpacity="0.70" />
        </linearGradient>

        {/* Facet Top-Right Gradient (Refracted depth) */}
        <linearGradient id={gradFacetTopRight} x1="16" y1="2" x2="28" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--cobalt-ice)" stopOpacity="0.90" />
          <stop offset="50%" stopColor="var(--cobalt-bright)" stopOpacity="0.75" />
          <stop offset="100%" stopColor="var(--cobalt-deep)" stopOpacity="0.85" />
        </linearGradient>

        {/* Facet Bottom-Left Gradient (Dispersion field) */}
        <linearGradient id={gradFacetBottomLeft} x1="4" y1="18" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--cobalt-core)" stopOpacity="0.85" />
          <stop offset="60%" stopColor="var(--cyan-layer, var(--cobalt-bright))" stopOpacity="0.65" />
          <stop offset="100%" stopColor="var(--cobalt-deep)" stopOpacity="0.90" />
        </linearGradient>

        {/* Facet Bottom-Right Gradient (Obsidian shadow baseline) */}
        <linearGradient id={gradFacetBottomRight} x1="28" y1="18" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--cobalt-deep)" stopOpacity="0.90" />
          <stop offset="50%" stopColor="var(--cobalt-core)" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#0B214D" stopOpacity="0.95" />
        </linearGradient>

        {/* Central Spine Ray Gradient */}
        <linearGradient id={gradSpine} x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--ink-primary)" stopOpacity="0.95" />
          <stop offset="35%" stopColor="var(--cobalt-ice)" stopOpacity="0.80" />
          <stop offset="70%" stopColor="var(--cobalt-bright)" stopOpacity="0.70" />
          <stop offset="100%" stopColor="var(--cobalt-core)" stopOpacity="0.30" />
        </linearGradient>

        {/* Core Focal Orb Radial Glow */}
        <radialGradient id={gradGlow} cx="16" cy="17" r="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--cobalt-ice)" stopOpacity="0.80" />
          <stop offset="40%" stopColor="var(--cobalt-bright)" stopOpacity="0.40" />
          <stop offset="100%" stopColor="var(--cobalt-core)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient Radial Core Light */}
      <circle cx="16" cy="17" r="7" fill={`url(#${gradGlow})`} opacity="0.8" />

      {/* Prism Outer Geometry / Facets */}
      {/* Top Left Facet */}
      <path
        d="M 16 3 L 5 17.5 L 16 16.5 Z"
        fill={`url(#${gradFacetTopLeft})`}
      />

      {/* Top Right Facet */}
      <path
        d="M 16 3 L 27 17.5 L 16 16.5 Z"
        fill={`url(#${gradFacetTopRight})`}
      />

      {/* Bottom Left Facet */}
      <path
        d="M 5 17.5 L 16 29 L 16 16.5 Z"
        fill={`url(#${gradFacetBottomLeft})`}
      />

      {/* Bottom Right Facet */}
      <path
        d="M 27 17.5 L 16 29 L 16 16.5 Z"
        fill={`url(#${gradFacetBottomRight})`}
      />

      {/* Internal Strata Refraction Lines */}
      <path
        d="M 10.5 10.25 L 16 16.5 L 21.5 10.25"
        stroke="var(--cobalt-ice)"
        strokeWidth="1"
        strokeOpacity="0.55"
        strokeLinecap="round"
      />
      <path
        d="M 10.5 23.25 L 16 16.5 L 21.5 23.25"
        stroke="var(--cobalt-ice)"
        strokeWidth="1"
        strokeOpacity="0.40"
        strokeLinecap="round"
      />

      {/* Central Prism Keel Spine Line */}
      <line
        x1="16"
        y1="3"
        x2="16"
        y2="29"
        stroke={`url(#${gradSpine})`}
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      {/* Equator Ridge */}
      <line
        x1="5"
        y1="17.5"
        x2="27"
        y2="17.5"
        stroke="var(--cobalt-ice)"
        strokeWidth="0.8"
        strokeOpacity="0.45"
      />

      {/* Exterior Precision Crystal Edges */}
      <path
        d="M 16 3 L 27 17.5 L 16 29 L 5 17.5 Z"
        stroke="var(--cobalt-border, rgba(138, 180, 248, 0.45))"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Apex & Git Node Light Anchor Points */}
      <circle cx="16" cy="3" r="1.2" fill="var(--ink-primary)" opacity="0.9" />
      <circle cx="5" cy="17.5" r="1" fill="var(--cobalt-ice)" opacity="0.85" />
      <circle cx="27" cy="17.5" r="1" fill="var(--cobalt-ice)" opacity="0.85" />
      <circle cx="16" cy="29" r="1" fill="var(--cobalt-core)" opacity="0.85" />

      {/* Central Focal Apex Sparkle (Core Refraction Point) */}
      <circle cx="16" cy="16.5" r="1.5" fill="var(--ink-primary)" />
    </svg>
  );
}

/**
 * GeminiSparkleMark — Official Google Gemini 4 Astroid Sparkle Mark.
 * Renders the distinctive 4-pointed primary star and companion accent sparkle
 * with rich Cobalt Core, Bright, and Ice gradient tokens.
 */
export function GeminiSparkleMark({
  size = 24,
  glow = false,
  className = '',
  style,
  ...props
}: BrandMarkProps) {
  const rawId = useId();
  const id = rawId.replace(/[:]/g, '_');

  const gradSparklePrimary = `gemini-sparkle-pri-${id}`;
  const gradSparkleAccent = `gemini-sparkle-acc-${id}`;
  const gradGlow = `gemini-glow-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Google Gemini"
      className={`inline-block select-none transition-transform duration-200 ${className}`}
      style={{
        filter: glow ? `drop-shadow(0 0 8px var(--cobalt-bright))` : undefined,
        ...style,
      }}
      {...props}
    >
      <defs>
        {/* Primary Sparkle Gradient (diagonal cobalt-bright to cobalt-ice) */}
        <linearGradient id={gradSparklePrimary} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--cobalt-bright)" />
          <stop offset="50%" stopColor="var(--cobalt-ice)" />
          <stop offset="100%" stopColor="var(--cobalt-core)" />
        </linearGradient>

        {/* Accent Sparkle Gradient */}
        <linearGradient id={gradSparkleAccent} x1="16" y1="2" x2="22" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--cobalt-ice)" />
          <stop offset="100%" stopColor="var(--cobalt-bright)" />
        </linearGradient>

        {/* Ambient Halo Radial Gradient */}
        <radialGradient id={gradGlow} cx="12" cy="12" r="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--cobalt-ice)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--cobalt-core)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Subtle Ambient Radial Glow */}
      <circle cx="11" cy="13" r="9" fill={`url(#${gradGlow})`} />

      {/* Primary Four-Pointed Gemini Star (Astroid curvature) */}
      <path
        d="M 11 1.5 C 11 7.299 6.299 12 0.5 12 C 6.299 12 11 16.701 11 22.5 C 11 16.701 15.701 12 21.5 12 C 15.701 12 11 7.299 11 1.5 Z"
        fill={`url(#${gradSparklePrimary})`}
      />

      {/* Companion Accent Sparkle (Top-Right) */}
      <path
        d="M 19 2 C 19 3.657 17.657 5 16 5 C 17.657 5 19 6.343 19 8 C 19 6.343 20.343 5 22 5 C 20.343 5 19 3.657 19 2 Z"
        fill={`url(#${gradSparkleAccent})`}
        opacity="0.9"
      />
    </svg>
  );
}

/**
 * GitHubMark — Iconic GitHub Invertocat Mark.
 * Precision SVG path rendered with theme-aware ink and subtle cobalt highlights.
 */
export function GitHubMark({
  size = 24,
  glow = false,
  className = '',
  style,
  ...props
}: BrandMarkProps) {
  const rawId = useId();
  const id = rawId.replace(/[:]/g, '_');

  const gradGitHub = `github-mark-grad-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="GitHub"
      className={`inline-block select-none transition-opacity duration-200 ${className}`}
      style={{
        filter: glow ? `drop-shadow(0 0 6px var(--cobalt-border))` : undefined,
        ...style,
      }}
      {...props}
    >
      <defs>
        <linearGradient id={gradGitHub} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--ink-primary, #F1F3F4)" />
          <stop offset="100%" stopColor="var(--ink-secondary, #9AA0A6)" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M 12 2 C 6.477 2 2 6.484 2 12.017 C 2 16.425 4.865 20.156 8.839 21.479 C 9.339 21.572 9.522 21.261 9.522 20.997 C 9.522 20.762 9.513 19.99 9.508 19.155 C 6.726 19.759 6.139 17.94 6.139 17.94 C 5.685 16.786 5.029 16.478 5.029 16.478 C 4.122 15.858 5.098 15.871 5.098 15.871 C 6.101 15.941 6.629 16.902 6.629 16.902 C 7.521 18.428 8.97 17.988 9.54 17.732 C 9.631 17.085 9.889 16.644 10.175 16.394 C 7.954 16.141 5.62 15.281 5.62 11.448 C 5.62 10.355 6.01 9.462 6.65 8.761 C 6.547 8.508 6.204 7.489 6.748 6.113 C 6.748 6.113 7.588 5.845 9.497 7.138 C 10.295 6.916 11.149 6.805 12 6.801 C 12.851 6.805 13.705 6.916 14.505 7.138 C 16.412 5.845 17.25 6.113 17.25 6.113 C 17.796 7.489 17.453 8.508 17.351 8.761 C 17.993 9.462 18.38 10.355 18.38 11.448 C 18.38 15.291 16.041 16.138 13.813 16.386 C 14.172 16.696 14.492 17.31 14.492 18.249 C 14.492 19.593 14.48 20.675 14.48 20.997 C 14.48 21.264 14.66 21.578 15.168 21.477 C 19.138 20.151 22 16.423 22 12.017 C 22 6.484 17.522 2 12 2 Z"
        fill={`url(#${gradGitHub})`}
      />
    </svg>
  );
}
