import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: cream speech bubble with a teal play triangle on teal. */
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
          background: "linear-gradient(135deg, #14B8A6 0%, #0F766E 100%)",
          borderRadius: 8,
        }}
      >
        <div
          style={{
            width: 22,
            height: 17,
            borderRadius: 6,
            background: "#FDF6E9",
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
              borderLeft: "8px solid #0F766E",
              marginLeft: 2,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
