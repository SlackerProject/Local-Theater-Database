// The site's name and how it introduces itself. Change the name here when
// the real one is chosen; page titles, link previews and the header follow.
export const SITE_NAME = "Local Theater Database";
export const TAGLINE = "Follow local theater.";
export const DESCRIPTION =
  "Every community theater show near you: who’s in it, when it runs, and everything the cast has done before. Follow your friends and never miss their next show.";
// Where the site's theater companies are; new companies must be in it
export const SERVICE_AREA = "Eastern Massachusetts";
// Used for absolute links in link previews
// (|| rather than ??: a build setting left blank counts as not set)
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://local-theater-database.vercel.app";
