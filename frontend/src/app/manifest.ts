import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestión de combustible · Irrigación Malargüe",
    short_name: "Combustible",
    description: "Captura y gestión de tickets de combustible",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#004F8C",
    categories: ["business", "utilities"],
    icons: [
      {
        src: "/icon-irrigacion.png",
        sizes: "32x32",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
