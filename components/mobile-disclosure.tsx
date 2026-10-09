import type { ReactNode } from "react";

export function MobileDisclosure({ mobile, title, summary, children }: { mobile: boolean; title: string; summary?: string; children: ReactNode }) {
  return mobile ? <details className="mobile-disclosure"><summary><span>{title}</span>{summary && <small>{summary}</small>}</summary><div>{children}</div></details> : <>{children}</>;
}
