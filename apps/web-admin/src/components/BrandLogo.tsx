type BrandLogoProps = {
  className?: string;
  label?: string;
};

/**
 * The Lanyard Pharmacy logo (raster PNG, transparent background).
 * Size it by height in headers (e.g. `h-10 w-auto`). The wordmark is dark, so on dark
 * surfaces place it on a light chip (see SiteFooter / AppShell).
 */
export function BrandLogo({ className, label = 'Lanyard Pharmacy' }: BrandLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt={label} width={196} height={184} className={className} />
  );
}
