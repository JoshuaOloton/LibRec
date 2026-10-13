"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

const TONES = 8;

/** Stable tone per primary genre (djb2 hash), so a genre always gets the same colour. */
function toneFor(seed: string) {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return (Math.abs(h) % TONES) + 1;
}

/** Keep in step with images.remotePatterns in next.config.ts. */
function isOptimisable(url: string) {
  try {
    return new URL(url).hostname === "images.gr-assets.com";
  } catch {
    return false;
  }
}

type Props = {
  title: string;
  author: string;
  /** Primary genre; picks the fallback tone. */
  genre?: string;
  coverUrl?: string | null;
  priority?: boolean;
  /** Sizes hint for next/image, matching the layout slot the cover sits in. */
  sizes?: string;
  className?: string;
};

/**
 * 2:3 cover. Shows the real image when there is one; otherwise (no URL, or the image fails to
 * load) a typographic cover so the shelf never shows a broken image. Sits directly on the page
 * with only a 2px radius (STYLE.md).
 */
export function BookCover({
  title,
  author,
  genre,
  coverUrl,
  priority = false,
  sizes = "(min-width: 1024px) 180px, 45vw",
  className,
}: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = !!coverUrl && !failed;

  return (
    <div className={cn("relative aspect-[2/3] w-full overflow-hidden rounded-cover bg-rule", className)}>
      {showImage ? (
        <Image
          src={coverUrl}
          alt={`Cover of ${title}`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          // next/image only optimises configured hosts; admin-entered cover links may be anywhere.
          unoptimized={!isOptimisable(coverUrl)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          role="img"
          aria-label={`Cover of ${title} by ${author}`}
          className="@container flex h-full flex-col justify-between p-[8%] text-surface"
          style={{ background: `var(--cover-${toneFor(genre ?? title)})` }}
        >
          <span className="line-clamp-5 font-serif text-[clamp(0.8rem,4.2cqw,1.25rem)] leading-tight font-semibold">
            {title}
          </span>
          <span className="line-clamp-2 text-[clamp(0.7rem,3.2cqw,0.875rem)] opacity-90">{author}</span>
        </div>
      )}
    </div>
  );
}
