import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, BrainCircuit, Medal, Swords } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import heroAsset from "@/assets/ustad-yusuf-hero.png.asset.json";
import { FutureAiCore } from "@/components/FutureAiCore";
import { CinematicEntry, markCinematicReveal } from "@/components/entry/CinematicEntry";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "USTAD AI — The Future of Learning" },
      { name: "description", content: "Enter USTAD AI, Yusuf Ali's intelligent learning experience for AI education, challenges, tournaments and achievements." },
      { property: "og:title", content: "USTAD AI — The Future of Learning" },
      { property: "og:description", content: "A premium AI-powered learning experience by Yusuf Ali." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  { title: "AI Learning", text: "Personal guidance that turns curiosity into clear, confident understanding.", icon: BrainCircuit },
  { title: "Challenges & Tournaments", text: "Put knowledge into action through intelligent challenges and live competition.", icon: Swords },
  { title: "Achievements", text: "Build momentum with meaningful progress, certificates, cups and recognition.", icon: Medal },
];

function LandingPage() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset['revealed'] = "true";
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-orbit" aria-hidden="true" />
        <div className="landing-brand" aria-hidden="true"><span className="landing-brand-mark" /><span>USTAD AI</span></div>
        <h1 id="landing-title" className="sr-only">USTAD AI by Yusuf Ali</h1>
        <figure className="landing-poster-wrap">
          <div className="landing-light-sweep" aria-hidden="true" />
          <img src={heroAsset.url} alt="Yusuf Ali presenting the USTAD AI logo in a futuristic white technology environment" width={768} height={1152} fetchPriority="high" decoding="async" className="landing-poster" />
        </figure>
        <a className="landing-scroll-cue" href="#about" aria-label="Scroll to learn about USTAD AI"><span>Discover</span><ArrowDown aria-hidden="true" /></a>
      </section>

      <section id="about" className="landing-section landing-about" aria-labelledby="about-title">
        <div className="landing-kicker" data-reveal><span /> Intelligence, evolved</div>
        <h2 id="about-title" data-reveal>About USTAD AI</h2>
        <div className="landing-about-copy" data-reveal>
          <p>USTAD AI is an intelligent learning universe built to make education more personal, engaging and rewarding.</p>
          <p>It brings AI-powered guidance and clear explanations into one focused experience.</p>
          <p>Learners can explore ideas, strengthen concepts and move forward with confidence.</p>
          <p>Smart challenges turn knowledge into action.</p>
          <p>Tournaments bring energy, focus and healthy competition to every journey.</p>
          <p>Events create new ways to participate, discover and grow.</p>
          <p>Achievements recognise real progress through meaningful milestones.</p>
          <p>Every interaction is designed to support curiosity and educational growth.</p>
          <p>Technology works quietly in the background while learning stays at the centre.</p>
          <p>From a first question to a proud achievement, each step belongs to the learner.</p>
          <p>USTAD AI connects intelligence, ambition and opportunity in one future-ready space.</p>
          <p>Created by Yusuf Ali, it is a bold step toward a smarter way to learn.</p>
        </div>
      </section>

      <section className="landing-future" aria-labelledby="future-title">
        <div className="landing-future-copy" data-reveal>
          <div className="landing-kicker landing-kicker-dark"><span /> Interactive intelligence</div>
          <h2 id="future-title">The Future of Learning</h2>
          <p>Where intelligence, learning and technology move together.</p>
        </div>
        <FutureAiCore />
      </section>

      <section className="landing-section landing-features" aria-labelledby="features-title">
        <div className="landing-kicker" data-reveal><span /> Built for progress</div>
        <h2 id="features-title" data-reveal>One intelligent learning world</h2>
        <div className="landing-feature-grid">
          {FEATURES.map(({ title, text, icon: Icon }, index) => (
            <article className="landing-feature-card" data-reveal key={title} style={{ transitionDelay: `${index * 80}ms` }}>
              <div className="landing-feature-icon"><Icon aria-hidden="true" /></div>
              <div><h3>{title}</h3><p>{text}</p></div>
              <span className="landing-card-index">0{index + 1}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="cta-title">
        <div className="landing-cta-ring" aria-hidden="true" />
        <div data-reveal>
          <p className="landing-cta-eyebrow">Your journey starts here</p>
          <h2 id="cta-title">Ready to enter?</h2>
          <p>Experience USTAD AI</p>
          <Button asChild className="landing-open-button"><Link to="/app">Open USTAD AI <ArrowRight aria-hidden="true" /></Link></Button>
        </div>
        <p className="landing-signature">Designed & developed by Yusuf Ali</p>
      </section>
    </main>
  );
}