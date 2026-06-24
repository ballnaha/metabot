/**
 * Server-side proxy to the FastAPI backend.
 *
 * The browser calls /api/... ; this route forwards to BACKEND_URL/api/...
 * and injects the X-API-Key header so the secret never reaches the client.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8383";
const API_KEY = process.env.BACKEND_API_KEY ?? "";

async function forward(req: NextRequest, path: string[]) {
  const target = `${BACKEND}/api/${path.join("/")}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  try {
    const res = await fetch(target, init);
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { detail: `Backend unreachable: ${e.message}` },
      { status: 502 }
    );
  }
}

// Next.js 15+/16: route handler `params` is a Promise.
type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}
