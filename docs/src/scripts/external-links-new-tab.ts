const HTTP_HREF = /^https?:\/\//i;

function isExternalLink(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || !HTTP_HREF.test(href)) return false;

  try {
    return new URL(href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function applyExternalLinksNewTab(root: ParentNode = document): void {
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (anchor.target === "_blank" || !isExternalLink(anchor)) continue;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
}

applyExternalLinksNewTab();
document.addEventListener("astro:page-load", () => applyExternalLinksNewTab());
