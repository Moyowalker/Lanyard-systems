import type { Metadata } from 'next';
import { faqs } from '@/lib/content';
import { faqJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers about Lanyard Pharmacy delivery, pickup, prescriptions, payment, and branch stock.',
};

export default function FaqPage() {
  return (
    <div className="space-y-16 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(faqs)) }}
      />

      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">Frequently asked questions</div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
          Before you order, here are the basics.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-900/70">
          Quick answers about prescriptions, delivery, pickup, prices, and payment.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {faqs.map((faq, index) => (
          <article key={faq.question} className="surface-card hover-lift p-7">
            <div
              className={`pill ${index % 2 === 0 ? 'bg-brand-50 text-brand-800' : 'bg-seal-100 text-ink-900'}`}
            >
              Q0{index + 1}
            </div>
            <h2 className="mt-5 text-xl font-semibold text-ink-900">{faq.question}</h2>
            <p className="mt-4 text-sm leading-7 text-ink-900/70">{faq.answer}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
