export interface NavLink {
  href: string;
  label: string;
}

export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "About" },
  { href: "/workflow", label: "Workflow" },
  { href: "/evidence", label: "Evidence" },
  { href: "/faq", label: "FAQ" },
  { href: "/docs", label: "Docs" },
];

export const WORKSPACE_LINK: NavLink = { href: "/workspace", label: "Open Workspace" };
