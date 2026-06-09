import type { Metadata } from 'next';
import { faqs } from '@/lib/content';
import { faqJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Common questions about prescriptions, branches, delivery, and how Lanyard works.',
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
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-none text-ink-900 sm:text-6xl">
          The questions that usually stand between curiosity and checkout.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-ink-700/80">
          Great marketing sites remove friction with clarity. The FAQ should make that feel easy,
          fast, and visibly trustworthy.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {faqs.map((faq, index) => (
          <article key={faq.question} className="surface-card p-7">
            <div className="pill bg-brand-50 text-brand-800">Q0{index + 1}</div>
            <h2 className="mt-5 font-display text-3xl text-ink-900">{faq.question}</h2>
            <p className="mt-4 text-sm leading-7 text-ink-700/80">{faq.answer}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
