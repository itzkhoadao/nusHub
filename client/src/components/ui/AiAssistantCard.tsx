import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../Icon";

type AiAssistantCardProps = {
  title?: string;
  description?: string;
};

export default function AiAssistantCard({
  title = "Ask the module assistant",
  description = "Get grounded answers from current NUSMods module information.",
}: AiAssistantCardProps) {
  const [question, setQuestion] = useState("");
  const navigate = useNavigate();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const initialQuestion = question.trim();
    navigate("/assistant", {
      state: initialQuestion ? { initialQuestion } : undefined,
    });
  }

  return (
    <section className="app-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-fixed text-secondary">
          <Icon name="bot" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-primary">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-app-muted">{description}</p>
        </div>
      </div>

      <form className="relative" onSubmit={handleSubmit}>
        <input
          className="app-input bg-surface-low pr-12"
          maxLength={2000}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about an NUS module..."
          type="text"
          value={question}
        />
        <button
          aria-label="Ask AI"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-secondary-container text-white transition-transform hover:scale-105"
          type="submit"
        >
          <Icon name="send" className="h-4 w-4" />
        </button>
      </form>
      <p className="mt-3 text-xs leading-5 text-app-muted">
        Questions are processed by Google Gemini. Verify important details in
        the cited source.
      </p>
    </section>
  );
}
