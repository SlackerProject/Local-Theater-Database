# Design v2: the quiet frame

The site is a quiet black-and-white frame. Each production's poster supplies its color.
The reference HTML files in this folder are the source of truth for look and feel; this
document covers the rules behind them and the pages that have no mockup yet.

Reference files:
- `production-little-women.html`: production page, light cream poster
- `production-leading-ladies.html`: the same template with a pink poster
- `production-little-women-mobile.html`: production page at phone width
- `person-michael.html`: person page (visitor view of a verified person)
- `calendar.html`, `calendar-mobile.html`: the signed-in calendar
- `contributor-profile.html`: an account's public profile with badges and shows seen
- `badges.html`: the five contributor medals, in color and grayscale, and levels I-III

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
`color_accent`, `color_edge`; this needs a migration):

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

**A show's identifying color is its ground, everywhere.** Anywhere a production is
represented by a swatch outside its own page, use ground, never accent, so the show looks
the same on every screen:
- calendar run bars, the "going" chip, and the day dots on the phone calendar;
- the dot beside that production's credit sentence on person pages;
- list swatches (e.g. "Running this month");
- the background behind that production's poster wherever it is shown as a tile.

Light grounds (cream, pink) disappear on white, so every swatch gets a 1px **edge**: ground
darkened until it reaches at least 3:1 against white (store it as `color_edge`). Examples:
Little Women edge `#978B7C`, Leading Ladies edge `#9E8488`, no-poster edge `#949494`.

"Going" is distinguished by shape, not a different color: the going chip and the circled
going date use ground with a 2px ink border and a check mark.

Accent appears only on the production's own page: the year in the title and the 2px rule
under its section headings. The hero band uses ground, ground_2, ink and soft.

The site chrome (header, nav, notification dot, forms, moderation) never takes show color.

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

## Badges and points

**Points** come only from approved contributions: 10 per production submission, 3 per poster,
2 per photo, 0.5 per correction (an approved edit to a production, person, company, show or
venue), 2 per audition dates or award entry. A submission earns points the first time it is
approved (partial approval counts); resubmissions earn nothing extra. Self-reported activity
(Want to see, Seen) never earns points.

**Contributor medal** (the most important badge). Five metals, each a different *shape* so they
work without color (see `badges.html`): Bronze plain coin, Silver ringed coin, Gold serrated
medal, Platinum ribboned rosette, Diamond faceted gem with rays. Bronze to Platinum have levels
I, II, III, shown as one to three dots under the medal. Thresholds:
Bronze 10 / 25 / 50, Silver 100 / 150 / 225, Gold 300 / 400 / 550,
Platinum 750 / 1,000 / 1,300, Diamond 2,000. Always pair the medal with its text name.

**Collectible badges**: smaller, black and white, on a `soft` tile: Moderator (shield),
Verified performer (mask), Founding member (flag), Shows seen 10 / 25 / 50 / 100 / 250
(ticket stubs printed with the number), Photos added 10 / 50 (camera). Unearned ones appear
grayed out on the profile ("Badges collected, 5 of 12").

**Where badges appear**: the full medal, progress bar, ladder and collection only on the
account profile (`contributor-profile.html`). Elsewhere, only a small (22px) medal beside a
contributor's name in contribution contexts: "Added by", edit history, moderation. At this size
the level dots are drawn larger so I / II / III stays readable; the name and points show on
hover. In moderation, accounts without a medal yet get a dashed gray outline. Never on
cast lists, production pages, person pages or search results. When someone earns a new level
or badge, show one brief, dismissible message ("You reached Silver III") once, then never again.

**Shows seen** on the profile is hidden by default; the owner can choose to show it. Going and
Want to see are never public.

## Hotlist page

Two ranked lists side by side on desktop (stacked on phones): **People** and **Productions**,
ranked by unique visitors over the last 7 days (the existing `hotlist_7d` view), top 25 each.
Each row: a large rank number (800 weight, muted), the headshot or poster tile (poster tile uses
the show's ground and edge), the name, and one muted line (people: their most recent credit;
productions: company and dates). A small "New" or up/down marker compared with last week if
that history exists; otherwise nothing. A one-line explainer at the top: "The most-visited
pages this week, counted once per visitor per day." Hidden people never appear.

## Awards (EMACT)

**Awards page** (`/awards`): pick a year (newest first). For each category, list the nominees
as rows: the person (linked), their role, and the production (linked, with its poster swatch).
Winners are marked with the word "Winner" in 700 weight beside the name, plus a small ink check;
never by color alone.

**On person and production pages**, the existing Awards sections list nominations and wins as
sentences: "Nominated, [Category], EMACT awards [Year]" / "Won, ...".

**Entering awards**: trusted editors and moderators get an "Add awards" form: award body,
year, category (type-ahead, add new), production (type-ahead), optional person and the credit
being honored, and Nominated or Won. It goes through the normal review rules.
