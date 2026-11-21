import { ImageResponse } from "next/og";

export const alt = "AI Job Hunter: scored CV review, ranked job matches and cover letters";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#f7f8fc",
        color: "#14172e",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "#3a4fd6",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 38,
          }}
        >
          <svg width="34" height="34" viewBox="0 0 32 32">
            <path
              d="M7 17l6 6 12-13"
              fill="none"
              stroke="#fff"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        AI Job Hunter
      </div>
      <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, maxWidth: 960 }}>
        Know where your CV stands, then apply to jobs that fit.
      </div>
      <div style={{ fontSize: 32, color: "#3a4fd6" }}>CV score, job matches, cover letters</div>
    </div>,
    size,
  );
}
