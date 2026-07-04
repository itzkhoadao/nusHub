import { useEffect, useState } from "react";
import campusHousing from "../../assets/auth/campus-housing.jpg";
import nusBuilding from "../../assets/auth/nus-building.jpg";
import nusSignage from "../../assets/auth/nus-signage.jpg";
import rvrcExterior from "../../assets/auth/rvrc-exterior.webp";
import utownResidence from "../../assets/auth/utown-residence.jpg";
import ventus from "../../assets/auth/ventus.webp";
import Logo from "../Logo";

const SLIDES = [
  {
    image: nusSignage,
    kicker: "Campus conversations",
    title: "Find the right NUS advice faster.",
    description: "Modules, housing, food, buses, and student life in one focused community.",
  },
  {
    image: nusBuilding,
    kicker: "NUS spaces",
    title: "Bring campus questions into one place.",
    description: "Keep practical answers easy to find instead of buried across chats.",
  },
  {
    image: utownResidence,
    kicker: "Student living",
    title: "Stay close to what is happening around campus.",
    description: "Ask questions, join study groups, and keep useful threads within reach.",
  },
  {
    image: rvrcExterior,
    kicker: "Study together",
    title: "Turn scattered chats into organized knowledge.",
    description: "Build discussions that future students can actually search and reuse.",
  },
  {
    image: ventus,
    kicker: "NUSHub",
    title: "A cleaner home for campus updates.",
    description: "Share what you know, learn from others, and come back to recent activity anytime.",
  },
  {
    image: campusHousing,
    kicker: "Campus homes",
    title: "Make student living easier to navigate.",
    description: "Compare experiences, ask housing questions, and learn from other students.",
  },
];

export default function AuthLayout({ children }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = SLIDES[activeSlide];

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((currentSlide) => (currentSlide + 1) % SLIDES.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <main className="auth-page min-h-screen bg-surface text-app-text lg:grid lg:h-screen lg:min-h-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(30rem,0.95fr)] lg:overflow-hidden">
      <section className="relative hidden min-h-screen overflow-hidden bg-primary lg:block lg:min-h-0">
        {SLIDES.map((item, index) => (
          <img
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ${
              index === activeSlide ? "scale-100 opacity-100" : "scale-105 opacity-0"
            }`}
            key={item.title}
            src={item.image}
          />
        ))}

        <div className="absolute inset-0 bg-gradient-to-br from-primary/85 via-primary/35 to-secondary-container/35" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />

        <div className="relative z-10 flex h-screen flex-col justify-between p-10 xl:p-12">
          <Logo
            iconClassName="h-12 w-12 drop-shadow"
            showTagline
            taglineClassName="text-xs font-semibold uppercase tracking-[0.2em] text-white/70"
            variant="inverse"
          />

          <div className="max-w-xl">
            <p className="mb-4 inline-flex rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur">
              {slide.kicker}
            </p>
            <h1 className="auth-display text-5xl font-black leading-[1.05] text-white xl:text-6xl">
              {slide.title}
            </h1>
            <p className="mt-5 max-w-lg text-lg font-medium leading-8 text-white/90 drop-shadow">
              {slide.description}
            </p>

            <div className="mt-8 flex gap-2">
              {SLIDES.map((item, index) => (
                <button
                  aria-label={`Show ${item.kicker}`}
                  className={`h-2.5 rounded-full transition-all ${
                    index === activeSlide ? "w-10 bg-white" : "w-2.5 bg-white/40"
                  }`}
                  key={item.title}
                  onClick={() => setActiveSlide(index)}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:h-screen lg:min-h-0 lg:px-10 lg:py-4">
        <div className="w-full max-w-md">
          <Logo
            className="mb-8 flex items-center gap-3 lg:hidden"
            iconClassName="h-11 w-11"
            showTagline
          />

          {children}
        </div>
      </section>
    </main>
  );
}
