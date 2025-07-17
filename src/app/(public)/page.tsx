'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, Plus, Minus, Twitter, Instagram, Linkedin, Eye, BarChart3, Star } from 'lucide-react';
import Link from 'next/link';
import { Hero } from './hero';
import { Header } from './header';

// Main Page Component
export default function LandingPage() {
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="font-sans text-gray-800 bg-[#f7f8fa]">
      {/* Removed global grid/background layers; grid will now live only inside hero section */}

      <div className="relative z-10 bg-white">
        <Header />
        <Hero />

        {/* Pain Point Section (Why it works) */}
        <section className="py-24">
          <div className="container mx-auto max-w-7xl px-6">
            <div className="rounded-[32px] bg-white p-[72px] shadow-[0_12px_28px_rgba(0,0,0,0.12)]">
              <div className="grid gap-20 md:grid-cols-2 items-start">
                {/* Left column: label, heading, bullets */}
                <div>
                  <span className="inline-block rounded-full bg-black px-5 py-[12px] text-[10px] font-semibold tracking-[2px] text-white ml-[4px]">Pain Point</span>  
                  <h2 className="font-heading mt-10 max-w-[30rem] text-2xl md:text-4xl font-semibold leading-[1.2] text-gray-900">
                    Your Website Should Be Clear, Not Confusing
                  </h2>
                  <div className="mt-10 space-y-10">
                    <FeatureItem
                      icon={<Eye className="h-6 w-6" />}
                      title="Messy Layouts"
                      description="Your website feels cluttered. Our template's clean sections guide users easily."
                    />
                    <FeatureItem
                      icon={<BarChart3 className="h-6 w-6" />}
                      title="Poor User Experience"
                      description="Navigation is confusing. This template makes everything clear and intuitive."
                    />
                    <FeatureItem
                      icon={<Star className="h-6 w-6" />}
                      title="Boring, Static Design"
                      description="Users lose interest quickly. Add interactive features to keep them engaged."
                    />
                  </div>
                </div>

                {/* Right column: playful pills visual (fills entire height) */}
                <div className="relative flex items-end justify-center overflow-hidden rounded-lg bg-[#eef0f7] p-8 h-full shadow-[inset_0_0_20px_rgba(0,0,0,0.06)]">
                  {/* floor line shadow */}
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-b from-gray-300/40 to-transparent blur-[4px]"></div>
                  <Pill color="from-pink-500 to-rose-500" className="absolute -left-6 bottom-6 -rotate-12 shadow-[0_0_20px_rgba(236,72,153,0.55)]">
                    No Ideas
                  </Pill>
                  <Pill color="from-blue-500 to-sky-500" className="absolute left-[22%] bottom-2 rotate-3 shadow-[0_0_20px_rgba(59,130,246,0.55)]">
                    Poor Analytics
                  </Pill>
                  <Pill color="from-green-400 to-emerald-500" className="absolute bottom-2 rotate-0 shadow-[0_0_20px_rgba(16,185,129,0.55)]">
                    Customer acquisition
                  </Pill>
                  <Pill color="from-violet-500 to-purple-600" className="absolute right-[24%] bottom-4 -rotate-[15deg] shadow-[0_0_20px_rgba(139,92,246,0.55)]">
                    Engaging Contents
                  </Pill>
                  <Pill color="from-purple-500 to-fuchsia-500" className="absolute -right-6 bottom-6 rotate-12 shadow-[0_0_20px_rgba(217,70,239,0.55)]">
                    No Strategy
                  </Pill>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section 2 */}
        <section className="py-24">
          <div className="container mx-auto max-w-7xl px-6">
            <div className="text-center">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
                Features
              </p>
              <h2 className="font-heading text-4xl font-bold text-gray-900">
                A Template Built to Convert
              </h2>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <FeatureCard title="Write & Schedule with Ease">
                <div className="h-full space-y-2 rounded-lg bg-gray-100 p-3">
                  <div className="flex items-center gap-2 rounded bg-white p-2 shadow-sm">
                    <div className="h-6 w-6 rounded-full bg-gray-200"></div>
                    <div className="h-4 flex-grow rounded-full bg-gray-200"></div>
                  </div>
                  <div className="h-10 w-full rounded bg-white shadow-sm"></div>
                  <div className="flex justify-end gap-1">
                    <div className="h-6 w-12 rounded-full bg-gray-200"></div>
                    <div className="h-6 w-12 rounded-full bg-blue-500"></div>
                  </div>
                </div>
              </FeatureCard>
              <FeatureCard title="Data-Driven Decisions">
                <div className="relative flex h-full items-end gap-2 overflow-hidden rounded-lg bg-gray-100 p-3">
                  <div className="absolute left-0 top-2 px-2 text-xs font-bold text-gray-400">100K</div>
                  <div className="absolute left-0 top-0 h-px w-full bg-gray-200" style={{top: '25%'}}></div>
                  <div className="absolute left-0 top-0 h-px w-full bg-gray-200" style={{top: '50%'}}></div>
                  <div className="absolute left-0 top-0 h-px w-full bg-gray-200" style={{top: '75%'}}></div>
                  <div className="h-1/2 w-1/4 rounded-t-sm bg-blue-300"></div>
                  <div className="h-3/4 w-1/4 rounded-t-sm bg-blue-400"></div>
                  <div className="h-1/3 w-1/4 rounded-t-sm bg-blue-300"></div>
                  <div className="h-2/3 w-1/4 rounded-t-sm bg-blue-400"></div>
                </div>
              </FeatureCard>
              <FeatureCard title="Publish Anywhere">
                 <div className="h-full space-y-3 rounded-lg bg-gray-100 p-3">
                    <div className="flex items-center gap-2 rounded bg-white p-2 shadow-sm">
                      <div className="h-6 w-6 rounded-full bg-gray-200"></div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 rounded-full bg-gray-300"></div>
                        <div className="h-2 w-12 rounded-full bg-gray-200"></div>
                      </div>
                    </div>
                    <div className="rounded bg-white p-2 text-xs text-gray-500 shadow-sm">
                      This template is 🔥
                    </div>
                 </div>
              </FeatureCard>
              <FeatureCard title="Get Smarter Content Suggestions">
                <div className="h-full space-y-2 rounded-lg bg-gray-100 p-3">
                   <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-yellow-300"></div>
                    <div className="text-left">
                      <div className="text-sm font-semibold">Profile Score</div>
                      <div className="text-xs text-gray-500">80% complete</div>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div className="h-2 w-4/5 rounded-full bg-yellow-400"></div>
                  </div>
                </div>
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-24">
          <div className="container mx-auto max-w-7xl px-6">
            <div className="text-center">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
                Testimonials
              </p>
              <h2 className="font-heading text-4xl font-bold text-gray-900">
                Trusted by Growing SaaS Brands
              </h2>
            </div>
            <div className="mt-12">
              <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
                <TestimonialCard
                  name="Mike D."
                  handle="@miked"
                  quote="This template is a game-changer. The design is modern, and the code is clean. Highly recommended!"
                  img="https://placehold.co/48x48"
                />
                <TestimonialCard
                  name="Sarah L."
                  handle="@sarahl"
                  quote="I was able to launch my landing page in just a few hours. The components are so easy to use."
                  img="https://placehold.co/48x48"
                />
                <TestimonialCard
                  name="Chris B."
                  handle="@chrisb"
                  quote="The attention to detail in this template is incredible. It's the perfect starting point for any SaaS."
                  img="https://placehold.co/48x48"
                />
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24">
          <div className="container mx-auto max-w-7xl px-6">
            <h2 className="font-heading mb-8 text-center text-4xl font-bold text-gray-900">FAQ</h2>
            <div className="divide-y divide-gray-200">
              <FaqItem
                question="How easy is it to customize this template?"
                answer="Super easy! The template is built with Tailwind CSS and is well-documented, making it straightforward to customize colors, fonts, and layouts to fit your brand."
                isOpen={openFaq === 0}
                onClick={() => toggleFaq(0)}
              />
              <FaqItem
                question="Is the template mobile-responsive?"
                answer="Absolutely. It's designed to be fully responsive and looks great on all devices, from desktops to smartphones."
                isOpen={openFaq === 1}
                onClick={() => toggleFaq(1)}
              />
              <FaqItem
                question="What if I need help customizing the template?"
                answer="We offer dedicated email support to help you with any questions or customizations you might need. Pro plan users get priority support."
                isOpen={openFaq === 2}
                onClick={() => toggleFaq(2)}
              />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-24">
          <div className="container mx-auto max-w-7xl px-6">
            <div className="text-center">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
                Pricing
              </p>
              <h2 className="font-heading mb-8 text-4xl font-bold text-gray-900">
                Simple Plans for Every Need
              </h2>
              <div className="inline-flex rounded-lg bg-gray-100 p-1">
                <button
                  onClick={() => setPlan('monthly')}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                    plan === 'monthly' ? 'bg-white shadow' : 'text-gray-600'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setPlan('yearly')}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                    plan === 'yearly' ? 'bg-white shadow' : 'text-gray-600'
                  }`}
                >
                  Yearly
                </button>
              </div>
            </div>
            <div className="mt-12 grid items-center gap-8 md:grid-cols-2">
              <PricingCard
                planName="Essential"
                price={plan === 'monthly' ? '$29' : '$290'}
                period={plan === 'monthly' ? '/month' : '/year'}
                description="Ideal for startups and individuals getting started with our template."
                features={[
                  'All UI Pages',
                  'Full Components Library',
                  'Documentation',
                  'Email Support',
                ]}
              />
              <PricingCard
                planName="Pro"
                price={plan === 'monthly' ? '$79' : '$790'}
                period={plan === 'monthly' ? '/month' : '/year'}
                description="Perfect for businesses that need advanced features and priority support."
                features={[
                  'Everything in Essential',
                  'Advanced Components',
                  'Priority Email Support',
                  '1-on-1 Onboarding Call',
                ]}
                isPopular
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24">
          <div className="container mx-auto max-w-7xl px-6">
            <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-800 p-12 text-center text-white shadow-2xl shadow-blue-500/20">
              <h2 className="text-4xl font-bold">Ready to Elevate Your SaaS?</h2>
              <p className="mt-4">
                Get started with SaaSwiftie and launch your new landing page in minutes, not months.
              </p>
              <div className="mt-8">
                <Link
                  href="#"
                  className="rounded-lg bg-white px-6 py-3 font-semibold text-blue-600 shadow-lg transition-transform hover:scale-105"
                >
                  Buy Template
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-gray-50 py-12">
          <div className="container mx-auto max-w-7xl px-6">
            <div className="grid gap-8 md:grid-cols-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">SaaSwiftie</h3>
                <p className="mt-2 text-gray-600">
                  The ultimate starting point for your next great idea.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800">Product</h4>
                <ul className="mt-4 space-y-2">
                  <li><Link href="#" className="text-gray-600 hover:text-gray-900">Features</Link></li>
                  <li><Link href="#" className="text-gray-600 hover:text-gray-900">Pricing</Link></li>
                  <li><Link href="#" className="text-gray-600 hover:text-gray-900">Customers</Link></li>
                  <li><Link href="#" className="text-gray-600 hover:text-gray-900">Changelog</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800">Company</h4>
                <ul className="mt-4 space-y-2">
                  <li><Link href="#" className="text-gray-600 hover:text-gray-900">About</Link></li>
                  <li><Link href="#" className="text-gray-600 hover:text-gray-900">Blog</Link></li>
                  <li><Link href="#" className="text-gray-600 hover:text-gray-900">Careers</Link></li>
                  <li><Link href="#" className="text-gray-600 hover:text-gray-900">Contact</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800">Connect</h4>
                <div className="mt-4 flex gap-4">
                  <Link href="#" className="text-gray-500 hover:text-gray-800"><Twitter/></Link>
                  <Link href="#" className="text-gray-500 hover:text-gray-800"><Instagram/></Link>
                  <Link href="#" className="text-gray-500 hover:text-gray-800"><Linkedin/></Link>
                </div>
              </div>
            </div>
            <div className="mt-8 border-t border-gray-200 pt-8 text-center text-sm text-gray-500">
              © 2024 SaaSwiftie. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Helper Components
const FeatureItem = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="flex gap-3">
      {icon}
    <div>
      <h4 className="text-base font-semibold text-gray-900">{title}</h4>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
    </div>
  </div>
);

const Pill = ({ children, color, className = '' }: { children: React.ReactNode, color: string, className?: string }) => (
  <div className={`inline-block rounded-full bg-gradient-to-r px-4 py-2 font-semibold text-white shadow-md ${color} ${className}`}>
    {children}
  </div>
);

const FeatureCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div>
    <div className="mb-4 h-48 rounded-2xl bg-gray-100">{children}</div>
    <h4 className="font-semibold text-gray-900">{title}</h4>
  </div>
);

const TestimonialCard = ({ name, handle, quote, img }: { name: string, handle: string, quote: string, img: string }) => (
  <div className="break-inside-avoid-column mb-6 rounded-2xl bg-white p-6 shadow-lg shadow-gray-200/50">
    <div className="flex items-center gap-4">
      <Image src={img} alt={name} width={48} height={48} className="h-12 w-12 rounded-full" />
      <div>
        <p className="font-semibold text-gray-900">{name}</p>
        <p className="text-sm text-gray-500">{handle}</p>
      </div>
    </div>
    <p className="mt-4 text-gray-700">{quote}</p>
  </div>
);

const FaqItem = ({ question, answer, isOpen, onClick }: { question: string, answer: string, isOpen: boolean, onClick: () => void }) => (
  <div className="p-6">
    <button onClick={onClick} className="flex w-full items-center justify-between text-left">
      <h3 className="text-lg font-medium text-gray-900">{question}</h3>
      {isOpen ? <Minus className="h-6 w-6 text-gray-500" /> : <Plus className="h-6 w-6 text-gray-500" />}
    </button>
    {isOpen && <p className="mt-4 pt-2 text-gray-600">{answer}</p>}
  </div>
);

const PricingCard = ({ planName, price, period, description, features, isPopular = false }: { planName: string, price: string, period: string, description: string, features: string[], isPopular?: boolean }) => {
  const cardClasses = isPopular
    ? 'bg-blue-600 text-white rounded-2xl p-8 shadow-2xl shadow-blue-400/20'
    : 'bg-white text-gray-800 rounded-2xl p-8 border border-gray-200/80 shadow-lg shadow-gray-200/50';

  const buttonClasses = isPopular
    ? 'bg-white text-blue-600 w-full rounded-lg py-3 font-semibold'
    : 'bg-black text-white w-full rounded-lg py-3 font-semibold hover:bg-gray-800';

  return (
    <div className={cardClasses}>
      {isPopular && <span className="mb-4 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-blue-600">Popular</span>}
      <h3 className="text-2xl font-bold">{planName}</h3>
      <p className={`mt-2 ${isPopular ? 'text-blue-100' : 'text-gray-600'}`}>{description}</p>
      <div className="mt-6 flex items-baseline gap-1">
        <p className="text-5xl font-extrabold">{price}</p>
        <p className={`${isPopular ? 'text-blue-200' : 'text-gray-500'}`}>{period}</p>
      </div>
      <ul className="mt-8 space-y-4">
        {features.map(feature => (
          <li key={feature} className="flex items-center gap-3">
            <Check className={`h-5 w-5 ${isPopular ? 'text-white' : 'text-blue-500'}`} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <a href="#" className={`mt-8 block text-center ${buttonClasses} transition-colors`}>
        {isPopular ? 'Go Pro' : 'Get Started'}
      </a>
    </div>
  );
};
