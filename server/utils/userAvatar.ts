import { createDownloadUrl, getPublicFileUrl } from "./r2Storage";

type AvatarRow = {
  avatar_storage_key?: string | null;
  avatar_url?: string | null;
};

export async function resolveAvatarUrl(row: AvatarRow) {
  if (row.avatar_storage_key) {
    const publicAvatarUrl = getPublicFileUrl(row.avatar_storage_key);

    if (publicAvatarUrl) {
      return publicAvatarUrl;
    }

    return createDownloadUrl(row.avatar_storage_key);
  }

  return row.avatar_url || null;
}

export async function addResolvedAvatarUrl<T extends AvatarRow>(row: T) {
  return {
    ...row,
    avatar_url: await resolveAvatarUrl(row),
  };
}

export async function addResolvedAvatarUrls<T extends AvatarRow>(rows: T[]) {
  return Promise.all(rows.map((row) => addResolvedAvatarUrl(row)));
}
