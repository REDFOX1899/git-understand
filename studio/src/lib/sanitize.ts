/**
 * Modern Web HTML & SVG Sanitizer
 * Following modern-web-guidance `sanitize-untrusted-html`
 *
 * Uses native Sanitizer API (Element.prototype.setHTML) when available in modern browsers,
 * code-splitting and dynamically importing DOMPurify strictly as a fallback.
 * Provides specialized SVG sanitization for Mermaid diagrams with SVG profile protection.
 */

export interface SafeSanitizeConfig {
  elements?: string[];
  attributes?: string[];
  allowAria?: boolean;
  allowData?: boolean;
  keepContent?: boolean;
}

type DOMPurifyInstance = {
  sanitize: (input: string, config?: unknown) => string;
};

let domPurifyPromise: Promise<DOMPurifyInstance> | null = null;

/**
 * Dynamically loads DOMPurify only when native Sanitizer API is unavailable or for SVG profiles.
 * Code-split with the bundler so DOMPurify is only downloaded when needed.
 */
async function loadDOMPurify(): Promise<DOMPurifyInstance> {
  if (!domPurifyPromise) {
    domPurifyPromise = (async () => {
      const mod = await import('dompurify');
      const exported = mod.default ?? mod;

      // In browser runtime with active DOM window
      if (typeof window !== 'undefined') {
        if (typeof exported === 'function') {
          return exported(window) as unknown as DOMPurifyInstance;
        }
        return exported as unknown as DOMPurifyInstance;
      }

      // In case window is present on globalThis (e.g. test environments)
      const globalWithWin = globalThis as unknown as { window?: unknown };
      if (globalWithWin.window && typeof exported === 'function') {
        return (exported as (w: unknown) => unknown)(globalWithWin.window) as unknown as DOMPurifyInstance;
      }

      if (typeof (exported as unknown as { sanitize?: unknown }).sanitize === 'function') {
        return exported as unknown as DOMPurifyInstance;
      }

      // Safe fallback for SSR / headless execution
      return {
        sanitize: (input: string): string => {
          return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
            .replace(/javascript:/gi, 'blocked:');
        },
      };
    })();
  }
  return domPurifyPromise;
}

/**
 * Safely inserts untrusted HTML into a DOM Element.
 * Feature-detects `'setHTML' in Element.prototype`, dynamically importing DOMPurify
 * ONLY as a fallback for browsers without native Sanitizer API support.
 */
export async function safeSetHTML(
  el: Element,
  html: string,
  config?: SafeSanitizeConfig
): Promise<void> {
  if (!el) return;

  // Feature detection: native Element.prototype.setHTML
  if (typeof Element !== 'undefined' && 'setHTML' in Element.prototype) {
    const elWithSetHTML = el as unknown as {
      setHTML: (input: string, options?: { sanitizer?: unknown }) => void;
    };
    if (typeof elWithSetHTML.setHTML === 'function') {
      if (config?.elements || config?.attributes) {
        elWithSetHTML.setHTML(html, {
          sanitizer: {
            ...(config.elements ? { elements: config.elements } : {}),
            ...(config.attributes ? { attributes: config.attributes } : {}),
          },
        });
      } else {
        elWithSetHTML.setHTML(html);
      }
      return;
    }
  }

  // Fallback: Dynamically import DOMPurify
  const DOMPurify = await loadDOMPurify();

  if (config?.elements || config?.attributes) {
    el.innerHTML = DOMPurify.sanitize(html, {
      ...(config.elements ? { ALLOWED_TAGS: [...config.elements, '#text'] } : {}),
      ...(config.attributes ? { ALLOWED_ATTR: config.attributes } : {}),
      ALLOW_ARIA_ATTR: config.allowAria ?? false,
      ALLOW_DATA_ATTR: config.allowData ?? false,
      KEEP_CONTENT: config.keepContent ?? false,
      RETURN_TRUSTED_TYPE: false,
    });
  } else {
    el.innerHTML = DOMPurify.sanitize(html, {
      RETURN_TRUSTED_TYPE: false,
    });
  }
}

/**
 * Sanitizes Mermaid-generated SVG markup safely using DOMPurify SVG profile.
 * Strips script tags, inline event handlers, and malicious protocols while
 * preserving SVG diagram paths, shapes, typography, styles, foreignObject labels,
 * and diagram interaction links.
 */
export async function sanitizeMermaidSvg(svgMarkup: string): Promise<string> {
  if (!svgMarkup || typeof svgMarkup !== 'string') {
    return '';
  }

  const DOMPurify = await loadDOMPurify();
  return DOMPurify.sanitize(svgMarkup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: [
      'foreignObject',
      'div',
      'span',
      'p',
      'br',
      'b',
      'i',
      'strong',
      'em',
      'code',
      'pre',
      'a',
      'style',
    ],
    ADD_ATTR: [
      'target',
      'rel',
      'dominant-baseline',
      'text-anchor',
      'transform-origin',
      'alignment-baseline',
    ],
    RETURN_TRUSTED_TYPE: false,
  });
}
