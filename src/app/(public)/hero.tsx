'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function Hero() {
  const [rotationX, setRotationX] = useState(10); // The current, smoothed rotation
  const targetRotationX = useRef(10); // The target rotation based on scroll
  const animationFrameId = useRef<number | null>(null);

  // This effect handles both scroll listening and the animation loop
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const scrollThreshold = 500; // Straightens out over ~500px for a gentler animation
      targetRotationX.current = Math.max(0, 10 - (scrollY / scrollThreshold) * 10);
    };

    window.addEventListener('scroll', handleScroll);

    const animate = () => {
      // Smoothly interpolate the rotation to create a subtle lag/delay effect
      setRotationX(currentRotation => {
        const newRotation = currentRotation + (targetRotationX.current - currentRotation) * 0.05;
        // Stop animating if we're close enough to the target to save resources
        if (Math.abs(targetRotationX.current - newRotation) < 0.01) {
          return targetRotationX.current;
        }
        return newRotation;
      });
      animationFrameId.current = requestAnimationFrame(animate);
    };
    // Start the animation loop
    animationFrameId.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []); // Only run this effect once on mount

  return (
    <section className="relative overflow-hidden pt-40 pb-20 text-center">
      {/* Hero-specific grid background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* 80px squares */}
        <div className="absolute inset-0 bg-transparent [background-image:linear-gradient(to_right,#d1d5db_1px,transparent_1px),linear-gradient(to_bottom,#d1d5db_1px,transparent_1px)] [background-size:80px_80px] opacity-30"></div>
        {/* Radial mask that keeps center completely clear */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,1)_0%,rgba(255,255,255,0.95)_25%,rgba(255,255,255,0.85)_40%,rgba(255,255,255,0)_60%)]"></div>
        {/* Bottom-half fade so grid disappears toward bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/80 to-white"></div>
      </div>
      <div className="container mx-auto max-w-4xl px-6">
        {/* Waitlist micro–interaction */}
        <div className="mb-6 flex items-center justify-center gap-4">
          {/* Avatars */}
          <div className="-space-x-3">
            {[1, 2, 3, 4].map((i) => (
              <Image
                key={i}
                src="/landing/temp.jpeg"
                alt="avatar"
                width={32}
                height={32}
                className="inline-block h-8 w-8 rounded-full border-2 border-white object-cover"
              />
            ))}
          </div>
          <span className="text-sm font-medium text-gray-700">Join 3k+ members</span>
          <Link
            href="#"
            className="inline-flex items-center gap-1 rounded-full bg-yellow-400/90 px-4 py-1.5 text-sm font-semibold text-gray-900 shadow hover:bg-yellow-400/95 active:scale-95 transition-transform"
          >
            Join Waitlist <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <h1 className="font-heading mb-5 text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl lg:text-7xl">
          A Simple Template for Your SaaS Success
        </h1>
        <p className="mb-10 text-lg text-gray-600">
          Ready-made sections, interactive layouts, and modern design—all in one template to elevate your SaaS landing page.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="#"
            className="rounded-full bg-gradient-to-r from-blue-500 to-blue-600 px-8 py-3 text-base font-semibold text-white shadow-[0_4px_14px_rgba(0,118,255,0.39)] transition-transform hover:scale-105 active:scale-100"
          >
            Buy Template
          </Link>
          <Link
            href="#"
            className="rounded-full border border-gray-200 bg-white px-8 py-3 text-base font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            See Solution
          </Link>
        </div>
      </div>
      <div className="container mx-auto mt-16 max-w-7xl px-6 [perspective:2000px]">
        <div
          className="hero-image-container relative origin-bottom rounded-2xl bg-white p-2 shadow-2xl shadow-blue-500/30"
          style={{ transform: `rotateX(${rotationX}deg)` }}
        >
          <div className="absolute inset-0 -m-2 rounded-2xl bg-white/50 backdrop-blur-sm"></div>
          <Image
            src="/landing/temp.png"
            alt="SaaS Dashboard"
            width={2400}
            height={1600}
            className="relative rounded-lg border border-gray-100"
          />
        </div>
      </div>
    </section>
  );
} 