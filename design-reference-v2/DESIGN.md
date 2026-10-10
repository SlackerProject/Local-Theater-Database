# Design v2: the quiet frame

The site is a quiet black-and-white frame. Each production's poster supplies its color.
The reference HTML files in this folder are the source of truth for look and feel; this
document covers the rules behind them and the pages that have no mockup yet.

Reference files:
- `production-little-women.html`: production page, light cream poster
- `production-leading-ladies.html`: the same template with a pink poster
- `production-little-women-mobile.html`: production page at phone width
- `person-michael.html`: person page (visitor view of a verified person)

## Principles

1. The frame stays quiet; content (posters, photos, names) carries the character.
2. Search is the primary way in. It appears prominently on every page.
3. Every name, show, company and venue is a link.
4. Empty sections explain what will appear there once data exists.
5. Mobile is designed first, then expanded for desktop.

## Remove from the current build

These read as generic or AI-generated and are retired:
- The warm cream page background (`#F7F5F0`). Pages are white.
- DM Serif Display and Instrument Sans. Use one family: Schibsted Grotesk.
- The red accent `#8E1B2C` and marquee yellow `#F2C230` as site-wide colors.
- Small uppercase letter-spaced labels. Use sentence case everywhere.
- Rounded bordered "card" boxes around sections. Separate sections with spacing and rules.
- Pill-shaped (fully rounded) buttons.

## Tokens

| Token | Value | Use |
|---|---|---|
| `ink` | `#141414` | Text, primary buttons, link color |
| `muted` | `#5E5E5E` | Secondary text (6.4:1 on white) |
| `rule` | `#E5E5E5` | Dividers, list separators |
| `soft` | `#F5F5F4` | Search field, empty poster tiles, avatar fallback |
| `field-border` | `#CFCFCF` | Form inputs at rest |
| `page` | `#FFFFFF` | Page background |

Actions are ink: primary buttons are ink with white text; secondary buttons are a 1.5px
ink outline. Links are ink with an underline (offset 3px) in body text; in lists and nav,
no underline until hover.

Radius: buttons and inputs 8px, search field 10px, posters 4px, photos 6px. Nothing pill-shaped.

## Typography

Schibsted Grotesk from Google Fonts, weights 400, 500, 600, 700, 800.

| Role | Size / weight | Notes |
|---|---|---|
| Production title | 72px / 800, mobile 42px | letter-spacing -0.03em, line-height 0.98 |
| Person name | 60px / 800, mobile 40px | letter-spacing -0.03em |
| Section heading | 22px / 800 | letter-spacing -0.01em |
| Sidebar heading | 15px / 800 | |
| Body | 16px / 400, line-height 1.5 | inputs are 16px minimum (prevents phone zoom) |
| Small / meta | 13-14px | muted |

The year in a production title is weight 400 in the show's accent color:
"Little Women **(2026)**".

## Header

Desktop: wordmark (800, 22px) · wide search field (max 560px, `soft` background) ·
Shows, People, Companies · Sign in (ink button). When signed in, Sign in becomes the
user's menu; keep the header to at most five items.

Mobile: row 1 is the wordmark and a menu button (44px); row 2 is a full-width search field.
Nav links live in the menu. No hover-only menus anywhere.

## Show color system

Every production with a poster gets a palette computed once, on upload, and stored on the
production (new columns, e.g. `color_ground`, `color_ground_2`, `color_ink`, `color_soft`,
`color_accent`; this needs a migration):

- **ground**: the dominant large-area color of the poster.
- **ground_2**: ground darkened about 6%; the hero is a vertical gradient ground to ground_2.
- **ink**: `#141414` or `#FFFFFF`, whichever reaches at least 4.5:1 against ground.
- **soft**: ink mixed about 25% toward ground, for secondary hero text; must stay at least 4.5:1.
- **accent**: the most prominent saturated color in the poster. It must reach at least 3:1
  against ground and against white (it is used for large text and rules). If it does not,
  darken it until it does. If the poster has no saturated color, derive the accent by
  darkening ground's hue.

Examples from the references: Little Women is ground `#F3E0C8`, ink `#18140F`, accent
`#D7282F`. Leading Ladies is ground `#FFD5DB`, ink `#100F12`, accent `#B4465E`.

Where show color appears, and nowhere else:
- the production hero band (background, text, and the hero buttons, which use ink on ground);
- the year in the production title;
- the 2px rule under section headings on that production's page;
- the dot beside that production's credit sentence on person pages;
- the background behind that production's poster wherever it is shown as a tile.

The site chrome (header, nav, forms, moderation) never takes show color.

**No poster:** the hero is white with ink text, the accent is ink, and poster tiles are a
`soft` box with a 1px `rule` border and the title in muted 800 weight. It should still look finished.

Posters come in any aspect ratio. In tiles, show them `object-fit: contain` inside a fixed
4:5 box filled with the poster's ground color, so square posters do not get cropped.

## Production page

Follow the reference files. The order is hero (poster, company link, title with year,
show type and authors, dates and venue, Want to see and All performances), then photos,
cast, creative team; sidebar: other productions of the same show, awards.

## Person page

Follow `person-michael.html`. Two signature pieces:

**On stage**: a shelf of poster tiles for every production the person is credited in, newest
first, with the role under each tile.

**Credits as sentences**, each with every name linked:
- Cast: "Played **{role}** in {Company}'s production of **{Show} ({Year})** at {Venue}."
- Crew: "**{Job}** for {Company}'s production of **{Show} ({Year})** at {Venue}."
- Omit "at {Venue}" when the venue is unknown. Add "Added by {name}" in muted text for
  credits the owner added. Credits the owner has hidden do not appear.

Sidebar: Frequent collaborators (people sharing two or more productions, via the
`frequent_collaborators()` function), then Awards.

## Pages without mockups yet

Build these in the same frame, using the same section headings, rules and tiles.

**Show page** (the work, e.g. Little Women the Musical): title (72px/800), type and authors
in muted text. Then "Productions", a poster-tile grid of every production of this show,
newest first, each captioned "{Company} · {Year}". Then "Characters", a list where each
character links to the people who have played them, with a count. No show color in the
frame; the posters carry it.

**Company page**: name, town, website link, and a Follow button (ink). Then productions
grouped by year (year as a section heading, poster-tile grid beneath, newest year first).
Sidebar: venues the company uses, and Awards.

**Venue page**: name, address with a "Map" link that opens the address in the user's map
app, and seating capacity if known. No Follow button (venues are not followable). Then
productions staged there, grouped by year, as poster tiles. Sidebar: companies that perform there.

## Forms and moderation

Restyle the Add a production form and the moderation screens with the tokens. Keep the
structure that is built; change only the look.
- Inputs: 48px tall, 1.5px `field-border`, radius 8px, 16px text; focus is a 2px ink border.
- Section groups: a 22px/800 heading and a `rule` divider, not a bordered box.
- "New show" / "New person" tags: `soft` background, ink text, 13px/700, radius 4px.
- "Did you mean…?" prompt: `soft` background with a 3px ink left border.
- Required 18+ checkboxes keep their exact wording.

## Empty states

Keep the current voice: a short muted sentence under the section heading saying what will
appear and when, e.g. "People who share two or more productions will appear here."
No box around it.

## Accessibility

- Text contrast at least 4.5:1; large text and rules at least 3:1 (the palette rules above enforce this).
- Every tap target at least 44 by 44px.
- Every input has a visible label.
- Poster images have alt text: "{Show} poster".
