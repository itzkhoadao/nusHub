import { useEffect, useState } from "react";

type UserAvatarProps = {
  avatarUrl?: string | null;
  className?: string;
  name?: string | null;
  rounded?: "full" | "lg" | "xl" | "2xl" | "3xl";
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
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = (name || "N").charAt(0).toUpperCase();
  const roundedClass = roundedClasses[rounded];
  const canShowImage = Boolean(avatarUrl && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  // avatar element
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden ${roundedClass} bg-primary-fixed font-bold text-primary shadow-sm ring-2 ring-white ${className}`}
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
  );
}
