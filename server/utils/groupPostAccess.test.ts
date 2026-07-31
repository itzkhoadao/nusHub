import assert from "node:assert/strict";
import test from "node:test";
import {
  canCommentOnPost,
  canViewPost,
  postLinkPath,
} from "./groupPostAccess";

test("forum posts retain normal visibility and commenting", () => {
  const access = {
    group_id: null,
    group_privacy: null,
    is_member: false,
  } as const;

  assert.equal(canViewPost(access), true);
  assert.equal(canCommentOnPost(access), true);
});

test("public group posts are readable but not commentable by non-members", () => {
  const access = {
    group_id: "group-1",
    group_privacy: "public",
    is_member: false,
  } as const;

  assert.equal(canViewPost(access), true);
  assert.equal(canCommentOnPost(access), false);
});

test("private group posts are hidden from non-members", () => {
  const access = {
    group_id: "group-1",
    group_privacy: "private",
    is_member: false,
  } as const;

  assert.equal(canViewPost(access), false);
  assert.equal(canCommentOnPost(access), false);
});

test("members can read and comment on private group posts", () => {
  const access = {
    group_id: "group-1",
    group_privacy: "private",
    is_member: true,
  } as const;

  assert.equal(canViewPost(access), true);
  assert.equal(canCommentOnPost(access), true);
});

test("group notifications link back to the group detail page", () => {
  assert.equal(
    postLinkPath("post-1", "group-1"),
    "/groups/group-1?post=post-1",
  );
  assert.equal(postLinkPath("post-1", null), "/posts/post-1");
});
