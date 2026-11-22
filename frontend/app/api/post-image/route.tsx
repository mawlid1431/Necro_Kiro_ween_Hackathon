import { ImageResponse } from "next/og";
import { auth } from "@clerk/nextjs/server";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { verifyImage } from "@backend/lib/social/imageSig";

// The 1080×1080 image for Instagram and TikTok posts. The Resurrect preview shows this exact image, the share
// button downloads it, and "Post now" hands Instagram/TikTok a signed link to it (`sig`, valid 1 hour),
// because their servers fetch the picture themselves. Instagram and TikTok accept JPEG, not PNG: `format=jpg`.

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const title = (q.get("title") ?? "").slice(0, 200);
  const source = (q.get("source") ?? "").slice(0, 80);
  const sig = q.get("sig");

  let signed = false;
  if (sig) {
    try {
      signed = verifyImage(title, source, Number(q.get("exp")), sig);
    } catch {
      signed = false; // POST_IMAGE_SECRET missing on this server
    }
    if (!signed) return new Response("This image link expired.", { status: 403 });
  } else {
    const { userId } = await auth();
    if (!userId) return new Response("Sign in first.", { status: 401 });
  }

  const size = title.length > 120 ? 58 : title.length > 70 ? 68 : 80;
  const png = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 110,
          textAlign: "center",
          backgroundImage: "linear-gradient(135deg, #14161c 0%, #1f2a24 50%, #2b4a37 100%)",
        }}
      >
        {source ? <div style={{ color: "#9be8a8", fontSize: 30, fontWeight: 700, letterSpacing: 5, textTransform: "uppercase" }}>{source}</div> : null}
        <div style={{ marginTop: 44, color: "#ffffff", fontSize: size, fontWeight: 700, lineHeight: 1.18 }}>{title}</div>
        <div style={{ marginTop: 56, color: "rgba(255,255,255,0.7)", fontSize: 30 }}>Link in bio</div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );

  const cache = signed ? "public, max-age=3600" : "private, max-age=86400";
  if (q.get("format") !== "jpg") {
    return new Response(png.body, { headers: { "content-type": "image/png", "cache-control": cache } });
  }
  const decoded = PNG.sync.read(Buffer.from(await png.arrayBuffer()));
  const out = jpeg.encode({ data: decoded.data, width: decoded.width, height: decoded.height }, 92);
  return new Response(new Uint8Array(out.data), { headers: { "content-type": "image/jpeg", "cache-control": cache } });
}
