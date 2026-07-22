const QR_PREFIX = "SIELISA:";

export function qrUrl(token: string | null, size = 260): string {
  const data = QR_PREFIX + (token ?? "");
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    data
  )}&margin=6&color=0f172a&bgcolor=ffffff&ecc=M`;
}
