import type { BranchSummaryDto } from '@lanyard/contracts';

import { SITE_URL, STORE_URL } from './config';

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
      'Public-facing pharmacy brand site for services, branch discovery, FAQs, and contact handoff into the customer store.',
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
