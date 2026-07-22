import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import Logo from "../components/Logo";
import { apiUrl } from "../utils/api";
import {
  getAuthToken,
  getStoredUser,
  updateStoredUser,
} from "../utils/authStorage";

const YEARS = [
  "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Master", "PhD", "None",
];
const AGE_RANGES = [
  "Below 20", "20 - 25", "25 - 30", "30 - 40", "Above 40", "Not shared",
];
const FACULTIES = [
  "Faculty of Arts & Social Sciences",
  "NUS Business School",
  "School of Computing",
  "School of Continuing & Lifelong Education",
  "Faculty of Dentistry",
  "College of Design and Engineering",
  "Duke-NUS Medical School",
  "College of Humanities and Sciences",
  "NUS College",
  "NUS Graduate School",
  "Faculty of Law",
  "Yong Loo Lin School of Medicine (including Nursing)",
  "Yong Siew Toh Conservatory of Music",
  "Saw Swee Hock School of Public Health",
  "Lee Kuan Yew School of Public Policy",
  "Faculty of Science",
  "Institute of Systems Science",
];
const STEPS = [
  { eyebrow: "Your studies", label: "Academic home", short: "Academic" },
  { eyebrow: "Your roles", label: "How you contribute", short: "Roles" },
  { eyebrow: "Your context", label: "Campus life", short: "Community" },
  { eyebrow: "Private details", label: "Finish your profile", short: "Finish" },
];

type Answer = boolean | null;

type ChoiceCardProps = {
  active: boolean;
  description?: string;
  label: string;
  onClick: () => void;
};

function ChoiceCard({ active, description, label, onClick }: ChoiceCardProps) {
  return (
    <button
      aria-pressed={active}
      className={`onboarding-choice group ${active ? "is-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0 text-left">
        <span className="block text-sm font-bold">{label}</span>
        {description && (
          <span className="mt-1 block text-xs leading-5 opacity-65">{description}</span>
        )}
      </span>
      <span className="onboarding-choice-check" aria-hidden="true">
        {active && <span>✓</span>}
      </span>
    </button>
  );
}

function BinaryCard({
  answer,
  description,
  icon,
  label,
  onChange,
}: {
  answer: Answer;
  description: string;
  icon: string;
  label: string;
  onChange: (answer: boolean) => void;
}) {
  return (
    <article className={`onboarding-role-card ${answer !== null ? "is-answered" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f5ff] text-[#0b4b91]">
          <Icon className="h-5 w-5" name={icon} />
        </span>
        <div>
          <h3 className="text-sm font-extrabold text-[#10233e]">{label}</h3>
          <p className="mt-1 text-xs leading-5 text-[#6b7789]">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-[#f4f6f9] p-1.5">
        {[false, true].map((value) => (
          <button
            aria-pressed={answer === value}
            className={`rounded-lg px-3 py-2 text-xs font-extrabold transition-all duration-200 ${
              answer === value
                ? "bg-white text-[#06366b] shadow-[0_4px_14px_rgba(16,35,62,0.10)]"
                : "text-[#8791a0] hover:text-[#10233e]"
            }`}
            key={String(value)}
            onClick={() => onChange(value)}
            type="button"
          >
            {value ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </article>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [academicYear, setAcademicYear] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [faculty, setFaculty] = useState("");
  const [nusnetId, setNusnetId] = useState("");
  const [nusEmail, setNusEmail] = useState("");
  const [isTeachingAssistant, setIsTeachingAssistant] = useState<Answer>(null);
  const [isProfessor, setIsProfessor] = useState<Answer>(null);
  const [isStaff, setIsStaff] = useState<Answer>(null);
  const [staysOnCampus, setStaysOnCampus] = useState<Answer>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!getAuthToken() || !user) navigate("/login", { replace: true });
    else if (user.onboarding_completed) navigate("/", { replace: true });
  }, [navigate]);

  const progress = ((step + 1) / STEPS.length) * 100;
  const usesNusEmail = isProfessor === true || isStaff === true;

  const validateStep = () => {
    if (step === 0 && (!academicYear || !faculty)) {
      return "Choose your academic year and NUS academic unit.";
    }
    if (
      step === 1 &&
      [isTeachingAssistant, isProfessor, isStaff].some((answer) => answer === null)
    ) {
      return "Answer each role question to continue.";
    }
    if (step === 2 && (!ageRange || staysOnCampus === null)) {
      return "Choose your age range and campus-living status.";
    }
    if (step === 3 && usesNusEmail) {
      if (!/^[^\s@]+@(?:[a-z0-9-]+\.)*nus\.edu\.sg$/i.test(nusEmail.trim())) {
        return "Enter a valid NUS email ending in nus.edu.sg.";
      }
    } else if (step === 3 && !/^E\d{7}$/i.test(nusnetId.trim())) {
      return "Enter your NUSNET ID in the format E1234567.";
    }
    return "";
  };

  const goNext = () => {
    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setDirection("forward");
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setError("");
    setDirection("back");
    setStep((current) => Math.max(current - 1, 0));
  };

  const handleSubmit = async () => {
    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/users/me/background"), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          academic_year: academicYear,
          age_range: ageRange,
          faculty,
          is_professor: isProfessor,
          is_staff: isStaff,
          is_teaching_assistant: isTeachingAssistant,
          nus_email: usesNusEmail ? nusEmail : null,
          nusnet_id: usesNusEmail ? null : nusnetId,
          stays_on_campus: staysOnCampus,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your details");

      updateStoredUser(data.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your details");
    } finally {
      setSaving(false);
    }
  };

  const stepContent = [
    <div key="academic">
      <div className="onboarding-question-head">
        <span className="onboarding-kicker">01 · Find your place</span>
        <h2>Where do you fit into NUS?</h2>
        <p>Start with your academic home. You can update this later as your journey changes.</p>
      </div>

      <div className="mt-8">
        <label className="onboarding-label" htmlFor="faculty">Faculty, school, or college</label>
        <div className="relative mt-2">
          <select
            className={`onboarding-select ${faculty ? "has-value" : ""}`}
            id="faculty"
            onChange={(event) => { setFaculty(event.target.value); setError(""); }}
            value={faculty}
          >
            <option value="">Choose your academic home</option>
            {FACULTIES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <Icon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#718096]" name="chevronDown" />
        </div>
      </div>

      <fieldset className="mt-7">
        <legend className="onboarding-label">Current year or programme</legend>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {YEARS.map((year) => (
            <ChoiceCard
              active={academicYear === year}
              key={year}
              label={year === "None" ? "Not applicable" : year}
              onClick={() => { setAcademicYear(year); setError(""); }}
            />
          ))}
        </div>
      </fieldset>
    </div>,

    <div key="roles">
      <div className="onboarding-question-head">
        <span className="onboarding-kicker">02 · Shape your profile</span>
        <h2>Which hats do you wear?</h2>
        <p>Roles can overlap. A postgraduate student can be a teaching assistant, and a professor can also be staff.</p>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <BinaryCard answer={isTeachingAssistant} description="I help teach an NUS course." icon="groups" label="Teaching assistant" onChange={setIsTeachingAssistant} />
        <BinaryCard
          answer={isProfessor}
          description="I hold an academic appointment."
          icon="post"
          label="Professor"
          onChange={(value) => {
            setIsProfessor(value);
            if (value) setAcademicYear("None");
          }}
        />
        <BinaryCard answer={isStaff} description="I work for NUS in a staff role." icon="file" label="NUS staff" onChange={setIsStaff} />
      </div>
    </div>,

    <div key="community">
      <div className="onboarding-question-head">
        <span className="onboarding-kicker">03 · Community context</span>
        <h2>What does campus life look like?</h2>
        <p>These broad details help people understand the perspective behind a post—without oversharing.</p>
      </div>

      <fieldset className="mt-8">
        <legend className="onboarding-label">Do you currently live on campus?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ChoiceCard active={staysOnCampus === true} description="Hall, residential college, or student residence" label="Yes, on campus" onClick={() => { setStaysOnCampus(true); setError(""); }} />
          <ChoiceCard active={staysOnCampus === false} description="I commute or live elsewhere" label="No, off campus" onClick={() => { setStaysOnCampus(false); setError(""); }} />
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="onboarding-label">Age range</legend>
        <p className="mt-1 text-xs text-[#8791a0]">Prefer not to say? That is completely fine.</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {AGE_RANGES.map((age) => (
            <ChoiceCard active={ageRange === age} key={age} label={age} onClick={() => { setAgeRange(age); setError(""); }} />
          ))}
        </div>
      </fieldset>
    </div>,

    <div key="finish">
      <div className="onboarding-question-head">
        <span className="onboarding-kicker">04 · Secure the details</span>
        <h2>{usesNusEmail ? "Your NUS email." : "One private identifier."}</h2>
        <p>
          {usesNusEmail
            ? "Because you selected Professor or NUS staff, please provide your official NUS email. It is never shown on your public profile."
            : "Your NUSNET ID is stored for future account features. It is never shown on your public profile."}
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-[#dce5f0] bg-[#f8fbff] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e5effc] text-[#06457f]">
            <Icon className="h-5 w-5" name={usesNusEmail ? "message" : "flag"} />
          </span>
          <div className="min-w-0 flex-1">
            <label className="onboarding-label" htmlFor="nus-identity">
              {usesNusEmail ? "NUS email" : "NUSNET ID"}
            </label>
            <input
              autoCapitalize={usesNusEmail ? "none" : "characters"}
              autoComplete="off"
              className={`onboarding-text-input mt-2 ${usesNusEmail ? "normal-case tracking-normal" : "uppercase"}`}
              id="nus-identity"
              inputMode={usesNusEmail ? "email" : "text"}
              maxLength={usesNusEmail ? 254 : 8}
              onChange={(event) => {
                if (usesNusEmail) setNusEmail(event.target.value);
                else setNusnetId(event.target.value.toUpperCase());
                setError("");
              }}
              placeholder={usesNusEmail ? "name@nus.edu.sg" : "E1234567"}
              type={usesNusEmail ? "email" : "text"}
              value={usesNusEmail ? nusEmail : nusnetId}
            />
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#66758a]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Private · not visible to other members
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <div className="onboarding-review-item"><span>Academic</span><strong>{academicYear} · {faculty}</strong></div>
        <div className="onboarding-review-item"><span>Community</span><strong>{staysOnCampus ? "Lives on campus" : "Lives off campus"} · {ageRange}</strong></div>
      </div>
    </div>,
  ];

  return (
    <main className="onboarding-shell auth-page">
      <div className="onboarding-orb onboarding-orb-one" />
      <div className="onboarding-orb onboarding-orb-two" />
      <div className="onboarding-grid" />

      <section className="onboarding-frame">
        <aside className="onboarding-rail">
          <div>
            <Logo
              className="flex items-center gap-3"
              iconClassName="h-11 w-11"
              textClassName="text-lg font-black tracking-[0.08em] text-white"
              variant="inverse"
            />
            <p className="mt-12 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-200/70">Profile setup</p>
            <h1 className="mt-3 max-w-xs text-3xl font-black leading-[1.12] tracking-[-0.04em] text-white">A profile that feels like you.</h1>
            <p className="mt-4 max-w-xs text-sm leading-6 text-blue-100/75">Four quick steps. Thoughtful context, better conversations, zero public oversharing.</p>
          </div>

          <nav aria-label="Onboarding progress" className="mt-10 space-y-1.5">
            {STEPS.map((item, index) => {
              const status = index < step ? "complete" : index === step ? "current" : "upcoming";
              return (
                <div className={`onboarding-rail-step is-${status}`} key={item.short}>
                  <span className="onboarding-rail-number">{index < step ? "✓" : index + 1}</span>
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-[0.16em] opacity-55">{item.eyebrow}</span>
                    <span className="mt-0.5 block text-sm font-bold">{item.label}</span>
                  </span>
                </div>
              );
            })}
          </nav>

          <div className="mt-auto pt-8 text-[11px] font-semibold text-blue-100/55">Built for the NUS community.</div>
        </aside>

        <div className="onboarding-panel">
          <div className="onboarding-mobile-top">
            <Logo
              className="flex items-center gap-2"
              iconClassName="h-8 w-8"
              textClassName="text-sm font-black tracking-[0.08em] text-[#073b72]"
            />
            <span className="text-xs font-bold text-[#708095]">{step + 1} / {STEPS.length}</span>
          </div>
          <div className="h-1 bg-[#edf1f6] lg:hidden">
            <div className="h-full bg-[linear-gradient(90deg,#07539a,#f58220)] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>

          <div className="onboarding-stage">
            <div className={`onboarding-step-content is-${direction}`} key={`${step}-${direction}`}>
              {stepContent[step]}
            </div>

            <div aria-live="polite" className={`onboarding-error ${error ? "is-visible" : ""}`}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[11px] font-black text-red-700">!</span>
              {error || "Everything looks good."}
            </div>

            <footer className="mt-auto flex items-center justify-between gap-4 pt-7">
              <button className={`onboarding-back ${step === 0 ? "invisible" : ""}`} onClick={goBack} type="button">
                <Icon className="h-4 w-4" name="arrowLeft" />
                Back
              </button>
              <button
                className="onboarding-next"
                disabled={saving}
                onClick={step === STEPS.length - 1 ? handleSubmit : goNext}
                type="button"
              >
                <span>{saving ? "Creating your profile..." : step === STEPS.length - 1 ? "Enter NUSHub" : "Continue"}</span>
                {saving ? <span className="onboarding-spinner" /> : <span className="text-lg leading-none">→</span>}
              </button>
            </footer>
          </div>
        </div>
      </section>
    </main>
  );
}
