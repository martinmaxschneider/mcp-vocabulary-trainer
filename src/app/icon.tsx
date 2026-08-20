import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: navy listen bubble with a white play mark on white cahier paper. */
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
          borderRadius: 8,
          borderLeft: "5px solid #d07a7a",
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
