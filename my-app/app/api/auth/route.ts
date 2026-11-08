import { NextResponse } from "next/server";
import {
  AuthRequestError,
  clearSession,
  getCurrentUser,
  getUserForCredentials,
  registerAccount,
  setSession,
} from "@/src/lib/auth";

type JsonObject = Record<string, unknown>;

async function readBody(request: Request): Promise<JsonObject> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new AuthRequestError("Permintaan tidak valid.");
    }
    return body as JsonObject;
  } catch {
    throw new AuthRequestError("Permintaan tidak valid.");
  }
}

function errorResponse(error: unknown) {
  const status =
    error instanceof AuthRequestError ? error.status : 500;
  if (!(error instanceof AuthRequestError)) console.error("Authentication request failed.", error);
  return NextResponse.json(
    { error: error instanceof AuthRequestError ? error.message : "Permintaan autentikasi gagal." },
    { status },
  );
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sesi tidak berlaku." }, { status: 401 });
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Could not verify the current user.", error);
    return NextResponse.json({ error: "Sesi tidak dapat diverifikasi." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (body.action === "register") {
      const { user, accountType } = await registerAccount(body);
      await setSession(user, accountType);
      return NextResponse.json({ user }, { status: 201 });
    }
    if (body.action === "login") {
      if (typeof body.email !== "string" || typeof body.password !== "string") {
        return NextResponse.json({ error: "Email dan kata sandi wajib diisi." }, { status: 400 });
      }
      if (body.email.length > 254 || body.password.length > 72) {
        return NextResponse.json({ error: "Email atau kata sandi tidak valid." }, { status: 400 });
      }
      const credentials = await getUserForCredentials(body.email.trim().toLocaleLowerCase("en"), body.password);
      if (!credentials) {
        return NextResponse.json({ error: "Email atau kata sandi salah." }, { status: 401 });
      }
      if (body.selectedRole !== credentials.user.role) {
        return NextResponse.json({ error: "Pilih peran yang sesuai dengan akun Anda." }, { status: 403 });
      }
      await setSession(credentials.user, credentials.accountType);
      return NextResponse.json({ user: credentials.user });
    }
    return NextResponse.json({ error: "Tindakan autentikasi tidak dikenal." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await clearSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Could not end the session.", error);
    return NextResponse.json({ error: "Sesi tidak dapat diakhiri." }, { status: 500 });
  }
}
