import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-static"; // required for the static export (output: 'export')
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RastChin";

// Static weight-700 instance (satori cannot parse variable fonts).
const vazirmatn = readFileSync(join(process.cwd(), "lib/og/Vazirmatn-700.ttf"));

export default function OpengraphImage() {
  const title = "راست‌چین";
  const tagline = "پایانِ به‌هم‌ریختگی متن فارسی";
  const pill = "افزونهٔ رایگان مرورگر";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "linear-gradient(135deg, #b42345 0%, #811936 100%)",
          color: "#ffffff",
          fontFamily: "Vazirmatn",
          direction: "rtl",
        }}
      >
        {/* steps mark */}
        <div style={{ position: "relative", width: 132, height: 132, display: "flex" }}>
          <div style={{ position: "absolute", left: 32, top: 83, width: 30, height: 15, background: "#fff" }} />
          <div style={{ position: "absolute", left: 60, top: 69, width: 13, height: 15, background: "#fff" }} />
          <div style={{ position: "absolute", left: 72, top: 29, width: 15, height: 41, background: "#fff" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 128, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: 44, opacity: 0.92, marginTop: 8 }}>{tagline}</div>
          <div
            style={{
              marginTop: 28,
              display: "flex",
              alignSelf: "flex-start",
              fontSize: 28,
              padding: "10px 24px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
            }}
          >
            {pill}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Vazirmatn", data: vazirmatn, style: "normal", weight: 700 }],
    },
  );
}
