# LibRec: UI & Style Guide

**Who it's for:** students and staff of a Nigerian polytechnic library, mostly on phones and often on slow
connections. Library staff use the admin side on desktops.
**The UI's job:** get a student to a book they want quickly, and make it obvious *why* each book was suggested
(NFR1: perceived usefulness; NFR2: ease of use).
**Feel:** a well-run reading room, calm and orderly, with the books themselves as the colour. It should be academic
without being stuffy, and it should not look like a generic SaaS dashboard.

## Colour tokens

Define these once as CSS variables in `globals.css`, mapped into the Tailwind/shadcn theme. Never hard-code hex values
in components.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F6F7F4` | Page background (a cool, slightly grey paper, not warm cream) |
| `--surface` | `#FFFFFF` | Raised surfaces: dialogs, the admin table background |
| `--ink` | `#1C2422` | Body text, headings |
| `--ink-muted` | `#5D6A65` | Secondary text, metadata |
| `--rule` | `#DCE1DD` | Borders, dividers |
| `--shelf` | `#1E5B45` | **Primary:** library green for buttons, links, focus rings and the reason slip edge |
| `--shelf-deep` | `#15412F` | Hover/pressed state of primary |
| `--brass` | `#B9832A` | Rating stars and the "top pick" marker **only**. Use it sparingly. |
| `--danger` | `#A23B2A` | Destructive admin actions, errors |

- Book covers provide most of the colour on screen. Keep the UI chrome quiet around them.
- Contrast: text tokens must meet WCAG AA on `--paper` and `--surface`. Verify `--ink-muted` and `--brass` when using
  them for text.
- Light mode only for the prototype. Keep everything token-based so a dark theme can be added later.

## Typography

| Role | Typeface | Notes |
|---|---|---|
| Book titles, page headings | **Literata** (Google Fonts) | A serif designed for long-form reading (it's the Google Play Books typeface), so it fits a books product. Use weights 500/600. |
| UI, body, forms, admin | **Atkinson Hyperlegible** (Google Fonts) | Designed for legibility, which suits an educational, accessibility-minded audience. Use weights 400/700. |

- Load both with `next/font` (self-hosted, no layout shift).
- Scale (rem): 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.25. Body is 1rem with 1.6 line-height; Literata headings get 1.25.
- Keep line length at 70 characters or less for descriptions on the book page.
- Use sentence case everywhere. **No all-caps labels**, no eyebrow text above headings, and no single highlighted word in
  a heading.

## The signature element: the reason slip

Spend the design's boldness **here**, and keep everything else restrained.

Every recommended book shows a **reason slip** under its cover. It's styled like the paper slip tucked into a library
book: a narrow strip with a 3px `--shelf` left edge, the `--surface` background, and Atkinson text at 0.875rem.

```
┌──────────┐
│          │
│  cover   │
│  (2:3)   │
│          │
└──────────┘
▌ Because you rated Things Fall Apart
  The Famished Road
  Ben Okri
```

Reason copy is generated from the source component:
- Content-based: "Because you rated *{book}*", or "Similar to *{book}* you borrowed"
- Collaborative: "Readers with similar taste rated this {n}★"
- Hybrid: show the stronger of the two reasons
- Cold-start/onboarding: "Matches your interest in {genre}"

This satisfies NFR1 visibly. It is the thing the students should point to in the demo.

## Layout and screens

Content is left-aligned throughout. Use a max content width of 1200px with 16px side gutters on mobile.

**Recommendations ("Your shelf"), the patron's home after login**
```
Your shelf                                    [Refresh]
Picked from 7 books you've rated or borrowed.

┌────────────┐  ┌──────┐ ┌──────┐ ┌──────┐
│            │  │      │ │      │ │      │  ← horizontal shelf on mobile (scroll-snap),
│ top pick   │  │      │ │      │ │      │    grid on desktop
│ (larger)   │  └──────┘ └──────┘ └──────┘
└────────────┘  ▌slip    ▌slip    ▌slip
▌ reason slip
Title / author / [Borrow] [Rate]
```
- The top pick is shown larger, with a small brass marker. The rest form an even row (a shelf), not a card grid with
  shadows.
- Covers sit directly on `--paper`, with no card boxes, borders or drop shadows. A 2px radius on covers only.

**Catalogue:** a search bar at the top (title / author / genre), genre filter chips, and a cover grid
(2 columns on mobile, 4–6 on desktop). Pagination or "Load more", not infinite scroll.

**Book detail:** cover on the left (it stacks above on mobile); title in Literata; author, year and genres; the
description at a comfortable width; and the actions **Borrow** and **Rate** (5 stars). Below that, a "More like this"
shelf using content-based results with reason slips.

**Onboarding (new patron, 0 interactions):** one screen. "Pick 3 or more subjects you enjoy" (genre chips), *or*
"Rate a few popular books". Then go straight to Your shelf. This keeps the first recommendation within 3 interactions
(TC15).

**Admin:** functional and dense. A left sidebar (Books, Statistics), tables on `--surface`, and charts in `--shelf`
tints plus one `--brass` highlight. Statistics: most borrowed and rated books, interactions over time, books never
interacted with ("unread holdings"), and the recommendation source mix (content / collaborative / hybrid).

## Fallback covers (3,332 books have none)

Generate a typographic cover in-component: a solid colour picked deterministically from the book's primary genre (a
small set of muted, distinct tones that harmonise with `--shelf`), with the title in Literata and the author in Atkinson,
both in white or `--ink` according to contrast. It must look intentional, not like a broken image.

## Components and states

- **Buttons:** primary = `--shelf` fill with white text; secondary = text plus a `--rule` border. Labels name the action:
  "Borrow", "Rate this book", "Save changes", "Delete book". A confirmation uses the same verb: "Borrowed".
- **Rating:** 5 stars in `--brass`, keyboard accessible (arrow keys), with a toast after rating: "Rated 4★. Your shelf
  will update."
- **Empty states give direction:** "No books match 'quantum'. Try an author's name or a broader subject."
- **Errors** say what happened and what to do, with no apologies.
- **Loading:** cover-shaped skeletons, not spinners.

## Motion and quality floor

- One deliberate motion: when Your shelf refreshes after a rating, the new picks fade in. Nothing else animates on
  load, and there are no hover lifts on every cover.
- Respect `prefers-reduced-motion`.
- Visible focus rings: a 2px `--shelf` outline with offset.
- Touch targets of at least 44px. Test at 360px width (common Android phones).
- Lazy-load covers with `next/image`. Keep pages light, since many users are on mobile data.
