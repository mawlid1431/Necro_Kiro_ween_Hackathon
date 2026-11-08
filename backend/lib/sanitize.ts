import sanitizeHtml from "sanitize-html";

// Article HTML is untrusted. Keep reading markup, drop everything active.
export function sanitizeArticle(html: string, baseUrl: string): string {
  const abs = (u: string | undefined): string | undefined => {
    if (!u) return undefined;
    try {
      const url = new URL(u, baseUrl);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  };

  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
      "ul", "ol", "li", "dl", "dt", "dd", "strong", "b", "em", "i", "u", "s", "sub", "sup",
      "a", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td", "span",
    ],
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      img: ["src", "alt", "title", "width", "height", "loading", "referrerpolicy"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "noscript", "iframe", "object", "embed", "form", "textarea", "svg", "math"],
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href?.startsWith("mailto:") ? attribs.href : abs(attribs.href);
        return {
          tagName,
          attribs: {
            ...(href ? { href } : {}),
            ...(attribs.title ? { title: attribs.title } : {}),
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        };
      },
      img: (tagName, attribs) => {
        const src = abs(attribs.src ?? attribs["data-src"]);
        return {
          tagName,
          attribs: {
            ...(src ? { src } : {}),
            alt: attribs.alt ?? "",
            ...(attribs.width ? { width: attribs.width } : {}),
            ...(attribs.height ? { height: attribs.height } : {}),
            loading: "lazy",
            referrerpolicy: "no-referrer",
          },
        };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src, // drop images with no safe src
  });
}
