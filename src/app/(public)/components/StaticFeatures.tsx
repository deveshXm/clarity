"use client";

import { Card, Text, Title } from "@/components/ui";
import { motion } from "framer-motion";
import Image from "next/image";

const FEATURE_ITEMS = [
  {
    title: "Auto coaching",
    desc: "Private suggestions after you send a message—only you can see them.",
    img: "/auto_coaching.png",
    tint: "linear-gradient(180deg, rgba(56,189,248,0.14) 0%, rgba(96,165,250,0.12) 100%)",
    position: "left"
  },
  {
    title: "Personal feedback",
    desc: "Friendly insights on your patterns with simple ideas to try next.",
    img: "/personal_feedback_command.png",
    tint: "linear-gradient(180deg, rgba(99,102,241,0.14) 0%, rgba(34,211,238,0.12) 100%)",
    position: "right"
  },
  {
    title: "Reports",
    desc: "Clear weekly or monthly summaries with trends and top examples.",
    img: "/weekly_report.png",
    tint: "linear-gradient(180deg, rgba(34,211,238,0.14) 0%, rgba(56,189,248,0.12) 100%)",
    position: "left"
  },
];

export default function StaticFeatures() {
  return (
    <div className="mx-auto max-w-7xl px-4">
      <div className="text-center mb-16">
        <Title order={2} size="h2" fw={900} style={{ color: "#0F172A", fontSize: "clamp(24px, 5.5vw, 36px)" }}>
          What Clarity does
        </Title>
        <Text size="lg" style={{ color: "#475569", fontSize: "clamp(14px, 4vw, 20px)" }}>
          Three core abilities to improve your communication.
        </Text>
      </div>
      
      <div className="space-y-24">
        {FEATURE_ITEMS.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: index * 0.2 }}
            className={`flex flex-col lg:flex-row items-center gap-12 ${
              item.position === 'right' ? 'lg:flex-row-reverse' : ''
            }`}
          >
            {/* Image Section */}
            <div className="flex-1">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 + 0.3 }}
                className="relative"
              >
                <div className="relative overflow-hidden rounded-2xl shadow-2xl" style={{ background: item.tint }}>
                  <Image
                    src={item.img}
                    alt={item.title}
                    width={600}
                    height={400}
                    className="w-full h-auto"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>
              </motion.div>
            </div>

            {/* Content Section */}
            <div className="flex-1">
              <motion.div
                initial={{ opacity: 0, x: item.position === 'right' ? 30 : -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 + 0.4 }}
                className="text-center lg:text-left"
              >
                <Title order={3} size="h3" fw={900} style={{ color: "#0F172A", fontSize: "clamp(24px, 3vw, 32px)" }}>
                  {item.title}
                </Title>
                <Text size="xl" className="leading-relaxed mt-6" style={{ color: "#334155", fontSize: "clamp(16px, 2vw, 18px)" }}>
                  {item.desc}
                </Text>
              </motion.div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
