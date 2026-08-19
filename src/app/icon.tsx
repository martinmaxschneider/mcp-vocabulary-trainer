import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: ink-blue speech bubble with a white play triangle on cahier paper. */
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
          background: "#eef4fa",
          borderRadius: 8,
          borderLeft: "3px solid #d45d5d",
        }}
      >
        <div
          style={{
            width: 21,
            height: 17,
            borderRadius: 6,
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
              borderTop: "5px solid transparent",
              borderBottom: "5px solid transparent",
              borderLeft: "8px solid #ffffff",
              marginLeft: 2,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
