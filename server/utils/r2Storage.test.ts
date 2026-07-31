import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_GROUP_POST_ATTACHMENT_SIZE_BYTES,
  validateAttachmentMetadata,
} from "./r2Storage";

const supportedFile = {
  mime_type: "application/pdf",
  original_name: "study-notes.pdf",
};

test("group post attachment validation accepts files up to 15 MB", () => {
  assert.doesNotThrow(() =>
    validateAttachmentMetadata(
      {
        ...supportedFile,
        file_size: MAX_GROUP_POST_ATTACHMENT_SIZE_BYTES,
      },
      {
        maxFileSizeBytes: MAX_GROUP_POST_ATTACHMENT_SIZE_BYTES,
        maxFileSizeLabel: "15 MB",
      },
    ),
  );
});

test("group post attachment validation rejects files over 15 MB", () => {
  assert.throws(
    () =>
      validateAttachmentMetadata(
        {
          ...supportedFile,
          file_size: MAX_GROUP_POST_ATTACHMENT_SIZE_BYTES + 1,
        },
        {
          maxFileSizeBytes: MAX_GROUP_POST_ATTACHMENT_SIZE_BYTES,
          maxFileSizeLabel: "15 MB",
        },
      ),
    /15 MB or smaller/,
  );
});
