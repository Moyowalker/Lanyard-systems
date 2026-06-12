import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { buildStoreHandoffUrl } from '@/lib/store-handoff';

type StoreLinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & {
  children: ReactNode;
  source: string;
  branchId?: string;
  intent?: 'shop' | 'prescription';
  path?: string;
};

export function StoreLink({ children, source, branchId, intent, path, ...props }: StoreLinkProps) {
  return (
    <a href={buildStoreHandoffUrl({ source, branchId, intent, path })} {...props}>
      {children}
    </a>
  );
}
