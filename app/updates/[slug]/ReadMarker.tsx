"use client";

import { useEffect } from "react";
import { markUpdateRead } from "../actions";

// Reading a post clears its "New update" notification for this member
export function ReadMarker({ postId }: { postId: string }) {
  useEffect(() => {
    void markUpdateRead(postId);
  }, [postId]);
  return null;
}
