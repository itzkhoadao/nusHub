import { useState } from "react";
import Icon from "../Icon";

const TOPICS = {
  Modules: [
    { label: "Plan your next semester", detail: "Prerequisites, explained clearly", question: "What are the prerequisites for CS2040S in AY2026/27?", icon: "file" },
    { label: "Get to know a module", detail: "Content, units and workload", question: "Tell me about IS1108 in AY2026/27.", icon: "explore" },
  ],
  Calendar: [
    { label: "Find your breathing room", detail: "Regular Semester 1 reading week", question: "When is regular Semester 1 reading week in the NUS AY2026/27 academic calendar?", icon: "file" },
    { label: "Check another academic year", detail: "Dates stay tied to their year", question: "When is regular Semester 1 reading week in AY2024/25?", icon: "search" },
  ],
  Campus: [
    { label: "Find a quiet corner", detail: "Library spaces and access", question: "Which NUS library study spaces are open 24/7?", icon: "explore" },
    { label: "Get around campus", detail: "Official shuttle guidance", question: "What NUS shuttle bus services are listed for Kent Ridge Campus?", icon: "groups" },
  ],
  Support: [
    { label: "Get the right support", detail: "Official student support routes", question: "Where can I find the NUS student support directory for counselling?", icon: "message" },
    { label: "Sort out account access", detail: "Safe NUS IT guidance", question: "How do I reset my NUS password?", icon: "file" },
  ],
} as const;

export default function AssistantWelcome({ onChoose, disabled }: { onChoose: (question: string) => void; disabled: boolean }) {
  const [topic, setTopic] = useState<keyof typeof TOPICS>("Modules");
  return <section className="assistant-welcome" aria-labelledby="assistant-welcome-title">
    <div className="assistant-orbit" aria-hidden="true"><span /><span /><div><Icon name="bot" /></div><i>✦</i></div>
    <p className="assistant-eyebrow">LESS SEARCHING, MORE LIVING</p>
    <h2 id="assistant-welcome-title">What’s on your mind?</h2>
    <p>From your next module to your next study break.<br />Start with a question. We’ll help you find the source.</p>
    <div className="assistant-topic-tabs" role="group" aria-label="Choose a question topic">
      {(Object.keys(TOPICS) as (keyof typeof TOPICS)[]).map(name =>
        <button key={name} type="button" aria-pressed={topic === name} className={topic === name ? "is-active" : ""} onClick={() => setTopic(name)}>{name}</button>)}
    </div>
    <div className="assistant-prompt-grid" key={topic}>
      {TOPICS[topic].map(prompt => <button type="button" disabled={disabled} key={prompt.question} onClick={() => onChoose(prompt.question)}>
        <span className="assistant-prompt-icon"><Icon name={prompt.icon} /></span>
        <span><strong>{prompt.label}</strong><small>{prompt.detail}</small></span>
        <span className="assistant-prompt-arrow" aria-hidden="true">↗</span>
      </button>)}
    </div>
    <small className="assistant-coverage-note">Topic coverage is growing. Some questions may have no verified answer yet.</small>
  </section>;
}
