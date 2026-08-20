import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Tab favicon: one navy speech bubble with a white play mark. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            width: 26,
            height: 22,
            borderRadius: 8,
            background: "#1e3a5f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: "7px solid transparent",
              borderBottom: "7px solid transparent",
              borderLeft: "12px solid #ffffff",
              marginLeft: 2,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
