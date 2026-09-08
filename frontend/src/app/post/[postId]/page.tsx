import { PostPageClient } from "@/components/post-page-client";

export default async function PostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <PostPageClient postId={postId} />;
}
