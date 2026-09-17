// src/utils/useMedia.js
// True while a CSS media query matches, e.g. useMedia("(max-width: 600px)").
import { useEffect, useState } from "react";

export default function useMedia(query) {
  const [on, setOn] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches
  );
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setOn(mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);            // older Safari
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [query]);
  return on;
}
