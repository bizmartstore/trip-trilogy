import { useEffect, useState } from "react";

import { generateBookingQrDataUrl } from "@/lib/booking-receipt";
import { Skeleton } from "@/components/ui/skeleton";

export function BookingQrCode({
  reference,
  size = 112,
  className,
}: {
  reference: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void generateBookingQrDataUrl(reference).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [reference]);

  if (!src) {
    return <Skeleton className={className} style={{ width: size, height: size }} />;
  }

  return (
    <img
      src={src}
      alt={`QR code for booking ${reference}`}
      width={size}
      height={size}
      className={className}
    />
  );
}
