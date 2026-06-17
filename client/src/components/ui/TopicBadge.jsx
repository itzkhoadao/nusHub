const TOPIC_STYLES = {
  Modules: "bg-primary-fixed text-primary",
  Housing: "bg-secondary-fixed text-secondary",
  Food: "bg-emerald-50 text-emerald-700",
  Buses: "bg-sky-50 text-sky-700",
  Facilities: "bg-amber-50 text-amber-700",
  General: "bg-surface-low text-app-muted",
};

export default function TopicBadge({ topic = "General" }) {
  return (
    <span className={`app-badge ${TOPIC_STYLES[topic] || TOPIC_STYLES.General}`}>
      {topic}
    </span>
  );
}
