import { useEffect } from "react";

/**
 * Reusable SEO Component for SPARKZ.TV
 * Dynamically injects and manages meta tags in the document head on client-side navigation.
 * 
 * @param {Object} props
 * @param {string} [props.title] - Page title (appended with SPARKZ.TV)
 * @param {string} [props.description] - Meta description for search engines and social cards
 * @param {string} [props.image] - Custom Open Graph and Twitter image url (supports absolute and relative paths)
 * @param {string} [props.url] - Canonical URL of the current page
 * @param {string} [props.type] - OG Type (e.g. "website", "profile", "video")
 * @param {boolean} [props.isLive] - Prepend [LIVE] to title and add live context to metadata
 * @param {string} [props.category] - Stream genre/category for search enrichment
 */
export default function SEO({
  title,
  description,
  image,
  url,
  type = "website",
  isLive = false,
  category,
}) {
  const defaultTitle = "SPARKZ.TV // Your Stream, Your Mix, Your Rules";
  const defaultDesc = "Decentralized broadcast protocol. No censorship. Full control. Watch live streams from the world's best underground DJs.";
  const defaultImage = "/og-image.jpg";

  // Use primitive dependencies to avoid infinite re-renders
  useEffect(() => {
    // 1. Title handling
    let finalTitle = defaultTitle;
    if (title) {
      const livePrefix = isLive ? "🔴 [LIVE] " : "";
      const categorySuffix = category ? ` (${category})` : "";
      finalTitle = `${livePrefix}${title}${categorySuffix} // SPARKZ.TV`;
    }
    document.title = finalTitle;

    // Helper to get or create a meta tag
    const updateOrCreateMeta = (attrName, attrValue, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[${attrName}="${attrValue}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attrName, attrValue);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    // 2. Description handling
    const finalDesc = description || defaultDesc;
    updateOrCreateMeta("name", "description", finalDesc);
    updateOrCreateMeta("property", "og:description", finalDesc);
    updateOrCreateMeta("name", "twitter:description", finalDesc);

    // 3. Social & dynamic titles
    updateOrCreateMeta("property", "og:title", finalTitle);
    updateOrCreateMeta("name", "twitter:title", finalTitle);

    // 4. URL / Canonical handling
    const currentUrl = url || window.location.href;
    updateOrCreateMeta("property", "og:url", currentUrl);
    updateOrCreateMeta("name", "twitter:url", currentUrl);

    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement("link");
      canonicalEl.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute("href", currentUrl);

    // 5. OG Type
    updateOrCreateMeta("property", "og:type", type);

    // 6. Image handling
    let finalImage = image || defaultImage;
    // Resolve relative image paths to absolute URLs using current origin
    if (finalImage && !finalImage.startsWith("http")) {
      const origin = window.location.origin || "https://sparkztv.live";
      finalImage = `${origin}${finalImage.startsWith("/") ? "" : "/"}${finalImage}`;
    }
    
    // Strip query parameters to prevent cache/crawler issues
    const cleanImage = finalImage ? finalImage.split("?")[0].split("#")[0] : "";
    updateOrCreateMeta("property", "og:image", cleanImage);
    updateOrCreateMeta("name", "twitter:image", cleanImage);

    // Add explicit Open Graph image dimensions for better social preview rendering
    updateOrCreateMeta("property", "og:image:width", "1200");
    updateOrCreateMeta("property", "og:image:height", "630");

  }, [title, description, image, url, type, isLive, category]);

  return null; // Component does not render any visual UI elements itself
}
