"use client";

import { FileTextIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Brand } from "@/components/layout/brand";
import { PublicLegalFooter } from "@/components/layout/public-legal-links";

/** A signing link's end state: a heading and one line, with no document. */
export function SigningStateScreen({
  description,
  focusHeading = false,
  title,
}: {
  description: string;
  /**
   * Moves focus to the heading when the screen appears in place of
   * something the person was using (a dialog), so a screen reader reads
   * the outcome out.
   */
  focusHeading?: boolean;
  title: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusHeading) {
      headingRef.current?.focus();
    }
  }, [focusHeading]);

  return (
    <div className="flex min-h-screen flex-col">
      <header>
        <div className="page-width flex items-center py-4">
          <Brand href="/" />
        </div>
      </header>
      <main className="page-width flex flex-1 items-center justify-center py-10">
        <section
          className="panel w-full max-w-[640px] px-6 py-12 text-center sm:px-12 sm:py-14"
          data-animate="enter"
        >
          <span
            aria-hidden="true"
            className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-(--accent-soft) text-(--accent)"
          >
            <FileTextIcon className="size-6" strokeWidth={2.2} />
          </span>
          <h1
            className="mt-6 text-[clamp(1.625rem,4vw,2.125rem)] font-extrabold leading-tight tracking-[-0.03em] text-(--fg) outline-none"
            ref={headingRef}
            tabIndex={-1}
          >
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-[460px] text-base leading-7 text-(--secondary)">
            {description}
          </p>
        </section>
      </main>
      <PublicLegalFooter />
    </div>
  );
}
