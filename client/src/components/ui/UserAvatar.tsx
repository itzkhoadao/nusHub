import { useEffect, useState } from "react";
import { useIsUserOnline } from "../../context/PresenceContext";

type UserAvatarProps = {
  avatarUrl?: string | null;
  className?: string;
  name?: string | null;
  rounded?: "full" | "lg" | "xl" | "2xl" | "3xl";
  userId?: string | number | null;
};

const roundedClasses = {
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
  full: "rounded-full",
  lg: "rounded-lg",
  xl: "rounded-xl",
};

export default function UserAvatar({
  avatarUrl,
  className = "h-10 w-10 text-sm",
  name = "NUSHub user",
  rounded = "full",
  userId,
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = (name || "N").charAt(0).toUpperCase();
  const roundedClass = roundedClasses[rounded];
  const canShowImage = Boolean(avatarUrl && !imageFailed);
  const isOnline = useIsUserOnline(userId);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  // avatar element
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span
        className={`flex h-full w-full items-center justify-center overflow-hidden ${roundedClass} bg-primary-fixed font-bold text-primary shadow-sm ring-2 ring-white`}
      >
        {canShowImage ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
            src={avatarUrl}
          />
        ) : (
          initial
        )}
      </span>
      {isOnline && (
        <span
          aria-label="Online"
          className="absolute bottom-0 right-0 h-[24%] min-h-2.5 w-[24%] min-w-2.5 rounded-full border-[3px] border-white bg-emerald-500 shadow-sm"
          role="status"
          title="Online"
        />
      )}
    </span>
  );
}
