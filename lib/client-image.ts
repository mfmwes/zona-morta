"use client";

export const storedImageMaxLength = 12_000;

export function normalizeImageReference(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;
  if (trimmed.startsWith("data:image/")) return trimmed.length <= storedImageMaxLength ? trimmed : undefined;
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


export const presentationImageMaxLength = 60_000;

export async function encodePresentationImage(file: File, maxDimension = 1200, maxLength = presentationImageMaxLength) {
  if (!file.type.startsWith("image/") || file.size > 12_000_000)
    throw new Error("Escolha uma imagem de até 12 MB.");

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível abrir essa imagem."));
      image.src = url;
    });

    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const baseScale = Math.min(1, maxDimension / Math.max(1, longest));
    for (const reduction of [1, .86, .72, .58, .46]) {
      const scale = baseScale * reduction;
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.drawImage(image, 0, 0, width, height);
      for (const quality of [.82, .7, .58, .46]) {
        const encoded = canvas.toDataURL("image/webp", quality);
        if (encoded.length <= maxLength) return encoded;
      }
    }
    throw new Error("A imagem não pôde ser reduzida o suficiente. Tente outra ou use um link.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Preserve the entire NPC image within the existing campaign storage budget. */
export function encodeNpcPortrait(file: File) {
  return encodePresentationImage(file, 640, storedImageMaxLength);
}
