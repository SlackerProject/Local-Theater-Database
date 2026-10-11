"use client";

import { useEffect, useRef, useState } from "react";

// The home page's large search. "Find your name" (in the performer band)
// focuses it and switches it to searching people only.
export const FIND_YOUR_NAME = "find-your-name";

export function HeroSearch() {
  const input = useRef<HTMLInputElement>(null);
  const [peopleOnly, setPeopleOnly] = useState(false);

  useEffect(() => {
    const onFind = () => {
      setPeopleOnly(true);
      input.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      input.current?.focus({ preventScroll: true });
    };
    window.addEventListener(FIND_YOUR_NAME, onFind);
    return () => window.removeEventListener(FIND_YOUR_NAME, onFind);
  }, []);

  return (
    <form action="/search" role="search" className="flex max-w-[640px] flex-wrap gap-2 md:flex-nowrap">
      <div className="flex h-14 min-w-0 flex-[1_1_260px] items-center gap-2.5 rounded-[10px] border-[1.5px] border-field bg-soft px-[18px] focus-within:border-2 focus-within:border-ink">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5E5E5E" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <label htmlFor="home-search" className="sr-only">
          {peopleOnly ? "Search people by name" : "Search people, shows and companies"}
        </label>
        <input
          ref={input}
          id="home-search"
          name="q"
          type="search"
          placeholder={peopleOnly ? "Type your name" : "Search a friend, a show, or yourself"}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[17px] outline-none"
        />
        {peopleOnly && <input type="hidden" name="only" value="people" />}
      </div>
      <button type="submit" className="h-14 flex-none cursor-pointer rounded-[10px] border-[1.5px] border-ink bg-page px-[22px] font-bold text-ink">
        Search
      </button>
    </form>
  );
}

export function FindYourNameButton() {
  return (
    <a
      href="/search?only=people"
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new Event(FIND_YOUR_NAME));
      }}
      className="link-quiet inline-flex h-[52px] flex-none items-center justify-center rounded-lg bg-page px-6 font-bold text-ink"
    >
      Find your name
    </a>
  );
}
