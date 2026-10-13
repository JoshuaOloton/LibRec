"use client";

import { useState } from "react";
import { StarRating } from "@/components/star-rating";

export function RatingDemo() {
  const [value, setValue] = useState(0);
  return (
    <div>
      <StarRating value={value} onChange={setValue} label="Rate this book" />
      <p className="text-sm text-ink-muted" aria-live="polite">
        {value ? `Rated ${value}★. Your shelf will update.` : "Click a star, or Tab in and use the arrow keys."}
      </p>
    </div>
  );
}
