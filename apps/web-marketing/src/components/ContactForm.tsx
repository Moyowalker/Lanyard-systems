'use client';

import { useState } from 'react';

type FormState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

const TOPICS = ['General enquiry', 'Branch visit', 'Prescription support', 'Partnership'];

export function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<FormState>({ status: 'idle' });

  async function handleSubmit(formData: FormData, form: HTMLFormElement) {
    setIsSubmitting(true);
    setState({ status: 'idle' });

    const payload = {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      topic: String(formData.get('topic') ?? ''),
      branch: String(formData.get('branch') ?? ''),
      message: String(formData.get('message') ?? ''),
    };

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: { message?: string };
      };

      if (!response.ok || !result.ok) {
        setState({
          status: 'error',
          message:
            result.error?.message ??
            'Contact delivery is unavailable right now. Please use the direct details on this page.',
        });
        return;
      }

      setState({
        status: 'success',
        message: result.message ?? 'Your message has been sent successfully.',
      });
      form.reset();
    } catch {
      setState({
        status: 'error',
        message:
          'The contact form could not reach the server. Please try again or use the support details below.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(new FormData(event.currentTarget), event.currentTarget);
      }}
      className="surface-card space-y-5 p-8"
    >
      <div>
        <div className="eyebrow">Send a message</div>
        <h2 className="mt-3 font-display text-3xl text-ink-900">
          Reach the team without leaving the site.
        </h2>
        <p className="mt-3 text-sm leading-7 text-ink-700/80">
          In local development this delivers through Mailpit when SMTP is available, so the flow is
          testable end to end.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-ink-800">
          <span>Name</span>
          <input
            name="name"
            type="text"
            minLength={2}
            maxLength={80}
            required
            className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-brand-500"
            placeholder="Your full name"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-ink-800">
          <span>Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-brand-500"
            placeholder="you@example.com"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-ink-800">
          <span>Topic</span>
          <select
            name="topic"
            defaultValue="General enquiry"
            className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-brand-500"
          >
            {TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium text-ink-800">
          <span>Preferred branch</span>
          <input
            name="branch"
            type="text"
            className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-brand-500"
            placeholder="Ago Palace, or leave blank"
          />
        </label>
      </div>

      <label className="space-y-2 text-sm font-medium text-ink-800">
        <span>Message</span>
        <textarea
          name="message"
          minLength={20}
          maxLength={4000}
          required
          rows={6}
          className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-brand-500"
          placeholder="Tell the team what you need, the branch you care about, and any timing details."
        />
      </label>

      {state.status === 'success' ? (
        <div className="rounded-[20px] border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {state.message}
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {state.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-6 text-ink-700/60">
          Delivery uses the configured SMTP relay. In local development, Mailpit is typically on
          port 1025 for SMTP and 8025 for inbox review.
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="cta-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Sending...' : 'Send message'}
        </button>
      </div>
    </form>
  );
}
