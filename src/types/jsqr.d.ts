declare module "jsqr" {
  export interface QRPoint {
    x: number;
    y: number;
  }

  export interface QRCode {
    binaryData: number[];
    data: string;
    chunks: unknown[];
    version: number;
    location: {
      topRightCorner: QRPoint;
      topLeftCorner: QRPoint;
      bottomRightCorner: QRPoint;
      bottomLeftCorner: QRPoint;
      topRightFinderPattern: QRPoint;
      topLeftFinderPattern: QRPoint;
      bottomLeftFinderPattern: QRPoint;
      bottomRightAlignmentPattern?: QRPoint;
    };
  }

  export type InversionAttempts = "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst";

  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: InversionAttempts }
  ): QRCode | null;
}
