import Icon from "../Icon";

export default function AiAssistantCard({
  title = "Ask AI Assistant",
  description = "Get a quick summary, find related discussions, or ask about campus life.",
}) {
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

      <div className="relative">
        <input
          className="app-input bg-surface-low pr-12"
          placeholder="Ask anything about NUSHub..."
          type="text"
        />
        <button
          aria-label="Ask AI"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-secondary-container text-white transition-transform hover:scale-105"
          type="button"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
