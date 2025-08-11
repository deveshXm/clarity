"use client";

import { useRef, useState, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Image, Text, Title } from "@/components/ui";

const FEATURE_ITEMS: { title: string; desc: string; img: string; tint: string }[] = [
  {
    title: "Instant, private suggestions",
    desc: "Clarity flags tone and clarity issues before you hit send—visible only to you.",
    img: "/landing/temp.png",
    tint:
      "linear-gradient(180deg, rgba(56,189,248,0.14) 0%, rgba(96,165,250,0.12) 100%)",
  },
  {
    title: "Context-aware rephrase",
    desc: "When allowed, Clarity uses recent messages to suggest rewrites that fit the thread.",
    img: "/landing/temp.png",
    tint:
      "linear-gradient(180deg, rgba(99,102,241,0.14) 0%, rgba(34,211,238,0.12) 100%)",
  },
  {
    title: "One‑tap message replace",
    desc: "Swap your draft with a clearer version, keeping your voice intact.",
    img: "/landing/temp.png",
    tint:
      "linear-gradient(180deg, rgba(34,211,238,0.14) 0%, rgba(56,189,248,0.12) 100%)",
  },
];

export default function FeatureScroller() {
  const items = FEATURE_ITEMS;

  const [index, setIndex] = useState<number>(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const currentIndexRef = useRef<number>(0);
  const isAnimatingRef = useRef<boolean>(false);
  const isActiveRef = useRef<boolean>(false);
  const accumulatedDeltaRef = useRef<number>(0);
  const lastTouchYRef = useRef<number | null>(null);
  const edgeAccumulatedRef = useRef<number>(0);
  const edgeReleasedRef = useRef<boolean>(false);
  const lastIndexChangeAtRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );

  const THRESHOLD_PX = 100; // gesture distance to trigger a slide
  const SLIDE_DURATION_S = 0.32; // fixed-duration snap
  const SLIDE_EASE = "power3.out"; // crisp, consistent feel
  const EDGE_RELEASE_THRESHOLD_PX = 12; // smaller nudge to exit at edges
  const EDGE_ARM_DELAY_MS = 160; // wait after landing on edge before allowing release

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const wrapper = wrapperRef.current;
    const sticky = stickyRef.current;
    const track = trackRef.current;
    if (!wrapper || !sticky || !track) return;

    const total = items.length;
    gsap.set(track, { willChange: "transform", xPercent: 0 });
    currentIndexRef.current = 0;
    setIndex(0);
    lastIndexChangeAtRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const goToIndex = (nextIndex: number) => {
      if (!track) return;
      if (isAnimatingRef.current) return;
      if (nextIndex < 0 || nextIndex >= total) return;

      isAnimatingRef.current = true;
      gsap.to(track, {
        xPercent: -100 * nextIndex,
        duration: SLIDE_DURATION_S,
        ease: SLIDE_EASE,
        onComplete: () => {
          currentIndexRef.current = nextIndex;
          setIndex(nextIndex);
          isAnimatingRef.current = false;
          lastIndexChangeAtRef.current =
            typeof performance !== "undefined" ? performance.now() : Date.now();
        },
      });
    };

    const st = ScrollTrigger.create({
      trigger: wrapper,
      start: "top top",
      end: () => "+=" + window.innerHeight * (total - 1),
      pin: sticky,
      scrub: false,
      invalidateOnRefresh: true,
      onToggle: (self) => {
        const root = document.documentElement;
        isActiveRef.current = self.isActive;
        if (self.isActive) root.classList.add("features-active");
        else root.classList.remove("features-active");
        if (!self.isActive) {
          edgeAccumulatedRef.current = 0;
          edgeReleasedRef.current = false;
          accumulatedDeltaRef.current = 0;
        }
      },
    });

    const releaseScrollAtEdge = (direction: "up" | "down") => {
      requestAnimationFrame(() => {
        try {
          const target = direction === "down" ? st.end + 2 : st.start - 2;
          window.scrollTo({ top: target, behavior: "auto" });
        } catch {
          // no-op
        }
      });
    };

    const handleWheel = (e: WheelEvent) => {
      if (!isActiveRef.current) return;

      const atFirst = currentIndexRef.current === 0;
      const atLast = currentIndexRef.current === total - 1;
      const deltaY = e.deltaY;

      const goingDown = deltaY > 0;
      const goingUp = deltaY < 0;

      const outwardAtEdge = (atFirst && goingUp) || (atLast && goingDown);

      if (outwardAtEdge) {
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastIndexChangeAtRef.current < EDGE_ARM_DELAY_MS) {
          e.preventDefault();
          return;
        }
        if (edgeReleasedRef.current) {
          accumulatedDeltaRef.current = 0;
          edgeAccumulatedRef.current = 0;
          return; // allow native scroll
        }

        edgeAccumulatedRef.current += Math.abs(deltaY);
        if (edgeAccumulatedRef.current >= EDGE_RELEASE_THRESHOLD_PX) {
          edgeReleasedRef.current = true;
          edgeAccumulatedRef.current = 0;
          accumulatedDeltaRef.current = 0;
          releaseScrollAtEdge(goingDown ? "down" : "up");
          return;
        }

        e.preventDefault();
        return;
      } else {
        edgeAccumulatedRef.current = 0;
        edgeReleasedRef.current = false;
      }

      e.preventDefault();
      if (isAnimatingRef.current) return;

      accumulatedDeltaRef.current += deltaY;
      if (Math.abs(accumulatedDeltaRef.current) >= THRESHOLD_PX) {
        const direction = accumulatedDeltaRef.current > 0 ? 1 : -1;
        const target = currentIndexRef.current + direction;
        accumulatedDeltaRef.current = 0;
        if (target >= 0 && target < total) {
          goToIndex(target);
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!isActiveRef.current) return;
      if (e.touches.length > 0) lastTouchYRef.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isActiveRef.current) return;
      const touch = e.touches[0];
      if (!touch || lastTouchYRef.current === null) return;

      const deltaY = lastTouchYRef.current - touch.clientY; // swipe up => positive
      const atFirst = currentIndexRef.current === 0;
      const atLast = currentIndexRef.current === total - 1;
      const goingDown = deltaY > 0;
      const goingUp = deltaY < 0;
      const outwardAtEdge = (atFirst && goingUp) || (atLast && goingDown);

      if (outwardAtEdge) {
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastIndexChangeAtRef.current < EDGE_ARM_DELAY_MS) {
          e.preventDefault();
          lastTouchYRef.current = touch.clientY;
          return;
        }
        if (edgeReleasedRef.current) {
          accumulatedDeltaRef.current = 0;
          edgeAccumulatedRef.current = 0;
          lastTouchYRef.current = touch.clientY;
          return;
        }

        edgeAccumulatedRef.current += Math.abs(deltaY);
        if (edgeAccumulatedRef.current >= EDGE_RELEASE_THRESHOLD_PX) {
          edgeReleasedRef.current = true;
          edgeAccumulatedRef.current = 0;
          accumulatedDeltaRef.current = 0;
          lastTouchYRef.current = touch.clientY;
          releaseScrollAtEdge(goingDown ? "down" : "up");
          return;
        }

        e.preventDefault();
        lastTouchYRef.current = touch.clientY;
        return;
      } else {
        edgeAccumulatedRef.current = 0;
        edgeReleasedRef.current = false;
      }

      e.preventDefault();
      if (isAnimatingRef.current) {
        lastTouchYRef.current = touch.clientY;
        return;
      }

      accumulatedDeltaRef.current += deltaY;
      lastTouchYRef.current = touch.clientY;

      if (Math.abs(accumulatedDeltaRef.current) >= THRESHOLD_PX) {
        const direction = accumulatedDeltaRef.current > 0 ? 1 : -1;
        const target = currentIndexRef.current + direction;
        accumulatedDeltaRef.current = 0;
        if (target >= 0 && target < total) {
          goToIndex(target);
        }
      }
    };

    const onResize: EventListener = () => ScrollTrigger.refresh();
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("wheel", handleWheel as EventListener, { passive: false });
    window.addEventListener("touchstart", handleTouchStart as EventListener, { passive: false });
    window.addEventListener("touchmove", handleTouchMove as EventListener, { passive: false });

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", handleWheel as EventListener);
      window.removeEventListener("touchstart", handleTouchStart as EventListener);
      window.removeEventListener("touchmove", handleTouchMove as EventListener);
      st.kill();
      document.documentElement.classList.remove("features-active");
    };
  }, [items.length]);

  return (
    <div className="mx-auto max-w-6xl px-2">
      <div ref={wrapperRef} className="relative" style={{ height: `${items.length * 100}svh` }}>
        <div ref={stickyRef} className="sticky top-0 z-[5] flex min-h-[100svh] flex-col items-center justify-center">
          <div className="mb-6 text-center">
            <Title order={2} size="h2" fw={900} style={{ color: "#0F172A", fontSize: "clamp(24px, 5.5vw, 36px)" }}>
              What Clarity does
            </Title>
            <Text size="lg" style={{ color: "#475569", fontSize: "clamp(14px, 4vw, 20px)" }}>
              Scroll to reveal three core abilities—one at a time.
            </Text>
          </div>
          <div className="relative w-full overflow-hidden rounded-2xl" style={{ boxShadow: "0 18px 60px rgba(2,6,23,0.08)", border: "1px solid rgba(2,6,23,0.06)" }}>
            <div ref={trackRef} className="relative flex w-full feature-card">
              {items.map((item) => (
                <div key={item.title} className="relative h-full w-full flex-shrink-0" style={{ width: "100%" }}>
                  <div className="absolute inset-0" style={{ background: item.tint }} />
                  <Image src={item.img} alt={item.title} width={1600} height={1000} className="relative block h-full w-full object-contain md:object-cover object-center" />
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] hidden md:block">
              <div className="bg-white/90 p-6 md:p-8 backdrop-blur">
                <div className="flex items-end justify-between">
                  <Title key={`meta-title-${index}`} order={3} size="h3" fw={900} className="[transition:opacity_200ms_cubic-bezier(0.16,1,0.3,1)] opacity-0 data-[show=true]:opacity-100" style={{ color: "#0F172A", fontSize: "clamp(20px, 2vw, 28px)" }} data-show>
                    {items[index].title}
                  </Title>
                  <span className="text-sm" style={{ color: "#94A3B8" }}>{String(index + 1).padStart(2, "0")}/0{items.length}</span>
                </div>
                <Text key={`meta-desc-${index}`} size="lg" className="leading-snug [transition:opacity_220ms_cubic-bezier(0.16,1,0.3,1)] opacity-0 data-[show=true]:opacity-100" style={{ color: "#334155", fontSize: "clamp(14px, 1.6vw, 16px)" }} data-show>
                  {items[index].desc}
                </Text>
              </div>
            </div>
          </div>
          <div className="mt-3 w-full md:hidden">
            <div className="flex items-end justify-between">
              <Title key={`meta-title-${index}`} order={3} size="h3" fw={900} className="[transition:opacity_200ms_cubic-bezier(0.16,1,0.3,1)]" style={{ color: "#0F172A", fontSize: "clamp(20px, 5.5vw, 24px)" }}>
                {items[index].title}
              </Title>
              <span className="text-xs" style={{ color: "#94A3B8" }}>{String(index + 1).padStart(2, "0")}/0{items.length}</span>
            </div>
            <Text key={`meta-desc-${index}`} size="lg" className="leading-snug" style={{ color: "#334155", fontSize: "clamp(14px, 4vw, 16px)" }}>
              {items[index].desc}
            </Text>
          </div>
        </div>
        <div id="feature-live" aria-live="polite" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
          {items[index].title}
        </div>
      </div>
    </div>
  );
}


