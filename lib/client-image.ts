"use client";

export const storedImageMaxLength = 12_000;

export function normalizeImageReference(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;
  if (trimmed.startsWith("data:image/")) return trimmed.slice(0, storedImageMaxLength);
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 2_000);
  return undefined;
}

export async function encodeSquareImage(file: File, size = 224) {
  if (!file.type.startsWith("image/") || file.size > 8_000_000)
    throw new Error("Escolha uma imagem de até 8 MB.");

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível abrir essa imagem."));
      image.src = url;
    });

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sizes = [size, 192, 160, 128];
    for (const target of sizes) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = target;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, target, target);
      for (const quality of [0.72, 0.58, 0.44, 0.32]) {
        const encoded = canvas.toDataURL("image/webp", quality);
        if (encoded.length <= storedImageMaxLength) return encoded;
      }
    }
    throw new Error("A imagem não pôde ser reduzida o suficiente. Tente outra.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
