import type { ReactNode } from "react";

export function MobileDisclosure({ mobile, title, summary, open, children }: { mobile: boolean; title: string; summary?: string; open?: boolean; children: ReactNode }) {
  return mobile ? <details className="mobile-disclosure" open={open}><summary><span>{title}</span>{summary && <small>{summary}</small>}</summary><div>{children}</div></details> : <>{children}</>;
}
