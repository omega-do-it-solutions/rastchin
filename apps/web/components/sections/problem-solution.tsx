import { Eyebrow } from "@/components/ui/section";

const sampleText = "سلام، این متن فارسی است mixed با English و لینک example.com";

function TextDemo({
  tone,
  children,
}: {
  tone: "problem" | "solution";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "problem"
      ? "border-red/30 bg-red/[0.06]"
      : "border-green/30 bg-green/[0.06]";

  return (
    <div
      data-reveal={tone === "problem" ? "slide-end" : "slide-start"}
      className={`overflow-hidden rounded-2xl border ${toneClass}`}
    >
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-2 px-4 py-3" dir="ltr">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <span className="ms-3 h-2 w-40 rounded-full bg-hairline" />
      </div>
      <div className="p-6 md:p-8">{children}</div>
    </div>
  );
}

export function ProblemSolution() {
  return (
    <>
      <section id="problem" className="scroll-mt-24 py-20 md:py-28">
        <div className="mx-auto grid max-w-content items-center gap-10 px-6 md:px-10 lg:grid-cols-2">
          <div data-reveal-stagger="fade-up">
            <div data-reveal>
              <Eyebrow>چالش اصلی</Eyebrow>
            </div>
            <h2 data-reveal className="mt-4 max-w-xl font-display text-3xl font-bold md:text-4xl">
              کابوسِ متن فارسی در محیط‌های چپ‌چین
            </h2>
            <p data-reveal className="mt-4 max-w-xl text-lg text-muted text-pretty">
              مشکل فقط جهت متن نیست؛ کد، لینک و کلمات انگلیسی هم نظم جمله را به‌هم می‌زنند.
            </p>
            <ul data-reveal className="mt-7 space-y-3.5">
              {[
                "جمله‌های دوزبانه تکه‌تکه خوانده می‌شوند.",
                "کد و URL رشتهٔ کلام را قطع می‌کنند.",
                "فونت‌های غیراستاندارد چشم را خسته می‌کنند.",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-muted">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-crimson" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <TextDemo tone="problem">
            <p
              className="rounded-2xl rounded-tl-sm bg-surface-2/70 px-5 py-4 text-muted"
              style={{
                direction: "ltr",
                textAlign: "left",
                fontFamily: "system-ui, sans-serif",
              }}
            >
              {sampleText}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["چپ‌چین", "فونت نامناسب", "متن ترکیبی سخت‌خوان"].map((label) => (
                <span key={label} className="rounded-full bg-red/[0.12] px-3 py-1 text-xs font-medium text-red">
                  {label}
                </span>
              ))}
            </div>
          </TextDemo>
        </div>
      </section>

      <section id="fix" className="scroll-mt-24 border-y border-hairline bg-surface/40 py-20 md:py-28">
        <div className="mx-auto grid max-w-content items-center gap-10 px-6 md:px-10 lg:grid-cols-2">
          <TextDemo tone="solution">
            <p
              className="rounded-2xl rounded-tl-sm bg-surface-2/70 px-5 py-4 font-vazir text-text"
              dir="rtl"
              style={{ unicodeBidi: "plaintext" }}
            >
              {sampleText}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["راست‌چین", "فونت خوانا", "کد و لینک سالم"].map((label) => (
                <span key={label} className="rounded-full bg-green/[0.12] px-3 py-1 text-xs font-medium text-green">
                  {label}
                </span>
              ))}
            </div>
          </TextDemo>

          <div data-reveal-stagger="fade-up">
            <div data-reveal>
              <Eyebrow>راهکار راست‌چین</Eyebrow>
            </div>
            <h2 data-reveal className="mt-4 max-w-xl font-display text-3xl font-bold md:text-4xl">
              هر کلمه، درست همان‌جا که باید باشد
            </h2>
            <p data-reveal className="mt-4 max-w-xl text-lg text-muted text-pretty">
              متن فارسی مرتب می‌شود و ساختار کد، لینک و کلمات انگلیسی سالم می‌ماند.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
