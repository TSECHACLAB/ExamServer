import { NextRequest } from "next/server";
import {
  formatBugReportIssue,
  validateBugReportPayload,
  type BugReportPayload,
} from "@/lib/bug-report";
import { createIssue } from "@/lib/github";

export async function POST(request: NextRequest) {
  const expectedOrigin = request.nextUrl.origin;
  const originError = validateRequestOrigin(request, expectedOrigin);
  if (originError) return originError;

  let payload: BugReportPayload;
  try {
    payload = (await request.json()) as BugReportPayload;
  } catch {
    return Response.json({ error: "JSON が不正です" }, { status: 400 });
  }

  const validation = validateBugReportPayload(payload, expectedOrigin);
  if (!validation.ok || !validation.report) {
    return Response.json(
      { error: validation.error || "入力内容が不正です" },
      { status: validation.status }
    );
  }

  const issue = formatBugReportIssue(validation.report);

  try {
    const created = await createIssue(issue);
    return Response.json({ ok: true, issueUrl: created.url });
  } catch (err: unknown) {
    console.error("Bug report issue creation failed", githubErrorSummary(err));
    const message =
      process.env.NODE_ENV === "development" && err instanceof Error
        ? err.message
        : "送信できませんでした";
    return Response.json({ error: message }, { status: 500 });
  }
}

function validateRequestOrigin(
  request: NextRequest,
  expectedOrigin: string
): Response | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== expectedOrigin) {
    return Response.json({ error: "送信元が不正です" }, { status: 403 });
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin !== expectedOrigin) {
        return Response.json({ error: "送信元が不正です" }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "送信元が不正です" }, { status: 403 });
    }
  }

  return null;
}

function githubErrorSummary(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      status:
        typeof err === "object" && "status" in err
          ? (err as { status: unknown }).status
          : undefined,
    };
  }

  return { message: "Unknown error" };
}
