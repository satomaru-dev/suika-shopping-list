import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "買い物リスト",
    short_name: "買い物リスト",
    description: "声とSiriで追加できる、家族の買い物リスト",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf2",
    theme_color: "#2f7d4a",
    orientation: "portrait",
    lang: "ja",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
