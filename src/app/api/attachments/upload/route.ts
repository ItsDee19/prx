import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/auth";
import { ALLOWED_UPLOAD_CONTENT_TYPES, ATTACHMENT_PATH_PREFIX, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { isBlobEnabled } from "@/lib/data/attachments";
import { getProjectSummary } from "@/lib/data/projects";
import { getTaskAccess } from "@/lib/data/tasks";
import { uploadClientPayloadSchema } from "@/lib/schemas/attachments";

export const dynamic = "force-dynamic";

/** Client tokens stay valid for 15 minutes (enough for a 25 MB upload on a slow link). */
const TOKEN_TTL_MS = 15 * 60 * 1000;

/** Errors thrown inside onBeforeGenerateToken that are safe to show to the uploader. */
class UploadRefused extends Error {}

function json(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function isUploadBody(value: unknown): value is HandleUploadBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string" &&
    "payload" in value
  );
}

/**
 * Vercel Blob client-upload handshake (SPEC.md section 19.2). Issues a client
 * token for `upload()` from `@vercel/blob/client` after checking the session,
 * the project (and task) and the pathname prefix; the token pins the allowed
 * content types, the size limit and a random suffix. Upload-completed
 * callbacks are not used (they never fire on localhost): the client records
 * the file with `createFileAttachmentAction` once `upload()` resolves.
 */
export async function POST(request: Request) {
  if (!isBlobEnabled()) {
    return json(501, "File uploads are not configured. Set BLOB_READ_WRITE_TOKEN to enable them, or add a link instead.");
  }

  const user = await getCurrentUser();
  if (!user) return json(401, "Sign in to upload files.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, "The upload request was not valid JSON.");
  }
  if (!isUploadBody(body) || body.type !== "blob.generate-client-token") {
    return json(400, "Unsupported upload request.");
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: unknown;
        try {
          payload = JSON.parse(clientPayload ?? "");
        } catch {
          throw new UploadRefused("Choose a project for the upload.");
        }
        const parsed = uploadClientPayloadSchema.safeParse(payload);
        if (!parsed.success) throw new UploadRefused("Choose a project for the upload.");
        const { projectId, taskId } = parsed.data;

        const project = await getProjectSummary(projectId);
        if (!project) throw new UploadRefused("This project no longer exists.");
        if (taskId) {
          const task = await getTaskAccess(taskId);
          if (!task || task.project_id !== projectId) throw new UploadRefused("This task no longer exists.");
        }
        const prefix = `${ATTACHMENT_PATH_PREFIX}${projectId}/`;
        if (!pathname.startsWith(prefix) || pathname.length <= prefix.length || pathname.includes("..")) {
          throw new UploadRefused("The upload path does not belong to this project.");
        }

        return {
          allowedContentTypes: [...ALLOWED_UPLOAD_CONTENT_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + TOKEN_TTL_MS,
          tokenPayload: JSON.stringify({ userId: user.id, projectId, taskId: taskId ?? null }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadRefused) return json(400, error.message);
    console.error("Upload token request failed", error);
    return json(500, "Could not start the upload. Please try again.");
  }
}
