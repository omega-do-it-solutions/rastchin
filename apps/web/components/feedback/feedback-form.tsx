"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/content/dictionaries/types";
import {
  ArrowIcon,
  CheckIcon,
  CloseIcon,
  GridIcon,
  ShieldIcon,
} from "@/components/ui/icons";

type FeedbackType = "suggestion" | "bug" | "support" | "other";

const TYPE_VALUES: FeedbackType[] = ["suggestion", "bug", "support", "other"];

const inputClass =
  "w-full rounded-lg border border-hairline bg-surface px-4 py-3 text-text outline-none transition placeholder:text-muted/55 focus:border-crimson";

const SERVER_ERROR_CODES = new Set([
  "missing_server_config",
  "curl_missing",
  "sendgrid_transport_failed",
  "sendgrid_unauthorized",
  "sendgrid_forbidden",
  "sendgrid_rejected",
  "rate_limit_unavailable",
]);

function normalizeType(value: string | null): FeedbackType {
  return TYPE_VALUES.includes(value as FeedbackType) ? (value as FeedbackType) : "suggestion";
}

function getFeedbackTypeIcon(type: FeedbackType) {
  switch (type) {
    case "suggestion":
      return <ArrowIcon className="size-4" />;
    case "bug":
      return <CloseIcon className="size-4" />;
    case "support":
      return <ShieldIcon className="size-4" />;
    case "other":
      return <GridIcon className="size-4" />;
  }
}

export function FeedbackForm({
  labels,
}: {
  labels: Dictionary["feedbackPage"];
}) {
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("website");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setType(normalizeType(params.get("type")));
    setSource(params.get("source") || "website");
  }, []);

  async function submitRequest() {
    setSubmitting(true);
    setStatus(labels.status.sending);

    try {
      const response = await fetch("/api/feedback.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          name,
          email,
          message,
          source,
          company,
        }),
      });

      const result = await response.json().catch(() => ({ ok: false }));

      if (!response.ok || !result.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "feedback_failed");
      }

      setStatus(labels.status.sent);
      setName("");
      setEmail("");
      setMessage("");
      setCompany("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "feedback_failed";
      let statusText = labels.status.failed;

      if (message === "invalid_email") {
        statusText = labels.status.invalidEmail;
      } else if (message === "rate_limited") {
        statusText = labels.status.rateLimited;
      } else if (SERVER_ERROR_CODES.has(message)) {
        statusText = labels.status.serverIssue;
      }

      setStatus(statusText);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-10 space-y-6" onSubmit={(event) => event.preventDefault()}>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{labels.title}</legend>
        {TYPE_VALUES.map((value) => {
          const selected = type === value;

          return (
            <label
              key={value}
              className={[
                "group relative flex min-h-[5.25rem] cursor-pointer rounded-xl border p-4 text-start transition",
                selected
                  ? "border-crimson bg-crimson/[0.08] text-text shadow-[0_0_0_1px_rgb(var(--crimson)/0.08)]"
                  : "border-hairline bg-surface text-muted hover:border-crimson/40 hover:bg-surface/80 hover:text-text",
              ].join(" ")}
            >
              <span className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  className={[
                    "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition",
                    selected
                      ? "border-crimson/30 bg-crimson text-crimson-content"
                      : "border-hairline bg-bg text-muted group-hover:border-crimson/25 group-hover:text-text",
                  ].join(" ")}
                  aria-hidden
                >
                  {getFeedbackTypeIcon(value)}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-text">{labels.types[value]}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted">
                    {labels.typeHints[value]}
                  </span>
                </span>
              </span>
              <span
                className={[
                  "absolute left-4 top-4 inline-flex size-5 items-center justify-center rounded-full border transition",
                  selected
                    ? "border-crimson bg-crimson text-crimson-content"
                    : "border-hairline bg-bg text-transparent",
                ].join(" ")}
                aria-hidden
              >
                <CheckIcon className="size-3" />
              </span>
              <input
                type="radio"
                name="feedbackType"
                value={value}
                checked={selected}
                onChange={() => setType(value)}
                className="sr-only"
              />
            </label>
          );
        })}
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-muted">{labels.fields.name}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
            autoComplete="name"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-muted">{labels.fields.email}</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`${inputClass} ltr-token`}
            dir="ltr"
            inputMode="email"
            autoComplete="email"
          />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-muted">{labels.fields.message}</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className={`${inputClass} min-h-44 resize-y leading-relaxed`}
          required
        />
      </label>

      <label className="hidden">
        <span>Company</span>
        <input
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          autoComplete="organization"
          tabIndex={-1}
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={submitRequest}
          disabled={submitting || message.trim() === ""}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-crimson px-5 py-3 font-medium text-crimson-content transition hover:bg-crimson-pressed hover:text-crimson-pressed-content disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none sm:px-10"
        >
          {labels.actions.submit}
        </button>
      </div>

      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </form>
  );
}
