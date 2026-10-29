import type { ReactNode } from 'react';

export function Sidebar(props: { children: ReactNode }) {
  return <aside className="lf-inspector">{props.children}</aside>;
}
