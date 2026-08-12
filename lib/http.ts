import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: "入力内容を確認してください。", code: "INVALID_INPUT" }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "処理に失敗しました。少し待ってからもう一度お試しください。" }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "入力内容を確認してください。", "INVALID_JSON");
  }
}
