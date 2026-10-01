import type { BranchSummaryDto } from '@lanyard/contracts';
import type { Metadata } from 'next';

import { SITE_URL, STORE_URL } from './config';

const brandName = 'Lanyard Pharmacy';
const socialImagePath = '/opengraph-image';

type MarketingPageMetadataOptions = {
  title: string;
  description: string;
  path: `/${string}`;
};

type BreadcrumbItem = {
  name: string;
  path: `/${string}`;
};

function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

export function marketingPageMetadata({
  title,
  description,
  path,
}: MarketingPageMetadataOptions): Metadata {
  const pageTitle = title === brandName ? title : `${title} | ${brandName}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      url: absoluteUrl(path),
      title: pageTitle,
      description,
      siteName: brandName,
      images: [{ url: socialImagePath, width: 1200, height: 630, alt: brandName }],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
      images: [socialImagePath],
    },
  };
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
      ...items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 2,
        name: item.name,
        item: absoluteUrl(item.path),
      })),
    ],
  };
}

function toPostalAddress(branch: BranchSummaryDto) {
  return {
    '@type': 'PostalAddress',
    streetAddress: branch.address.line1,
    addressLocality: branch.address.city,
    addressRegion: branch.address.state,
    addressCountry: 'NG',
  };
}

export function marketingWebsiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Lanyard Pharmacy',
    url: SITE_URL,
    description:
      'Order genuine medicines from Lanyard Pharmacy for delivery in Lagos or free pickup at your branch.',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${STORE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function marketingOrganizationJsonLd(branches: BranchSummaryDto[]) {
  const primaryBranch = branches[0];
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Pharmacy',
    name: 'Lanyard Pharmacy',
    url: SITE_URL,
    areaServed: { '@type': 'Country', name: 'Nigeria' },
    isRelatedTo: {
      '@type': 'WebSite',
      name: 'Lanyard Pharmacy Store',
      url: STORE_URL,
    },
    availableService: [
      { '@type': 'MedicalBusiness', name: 'Prescription verification' },
      { '@type': 'Service', name: 'Pickup orders' },
      { '@type': 'Service', name: 'Delivery fulfilment' },
    ],
  };

  if (primaryBranch) {
    data.address = toPostalAddress(primaryBranch);
  }

  if (branches.length > 0) {
    data.department = branches.map((branch) => ({
      '@type': 'Pharmacy',
      name: branch.name,
      identifier: branch.code,
      address: toPostalAddress(branch),
    }));
  }

  return data;
}

export function branchListJsonLd(branches: BranchSummaryDto[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Lanyard Pharmacy branch locations',
    itemListElement: branches.map((branch, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/branches#${branch.code.toLowerCase()}`,
      item: {
        '@type': 'Pharmacy',
        name: branch.name,
        identifier: branch.code,
        address: toPostalAddress(branch),
      },
    })),
  };
}

export function faqJsonLd(
  entries: ReadonlyArray<{
    question: string;
    answer: string;
  }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
  };
}
