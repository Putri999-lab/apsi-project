import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { Prisma } from "@/src/generated/prisma/client";
import { prisma } from "@/src/lib/db";

const SESSION_COOKIE = "dapur_abita_session";
const SESSION_SECONDS = 60 * 60 * 12;

export type AppRole = "CUSTOMER" | "EMPLOYEE" | "OWNER" | "ADMIN";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

type SessionClaims = {
  sub: string;
  accountType: "customer" | "staff";
  exp: number;
};

export class AuthRequestError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

function sessionSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 bytes.");
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest();
}

function encodeSession(claims: SessionClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

function roleFromDatabase(value: string): AppRole | null {
  switch (value.toLocaleLowerCase("en")) {
    case "admin":
      return "ADMIN";
    case "owner":
      return "OWNER";
    case "employee":
    case "karyawan":
      return "EMPLOYEE";
    default:
      return null;
  }
}

export function roleLabel(role: AppRole) {
  switch (role) {
    case "CUSTOMER":
      return "Pelanggan";
    case "EMPLOYEE":
      return "Karyawan Produksi";
    case "OWNER":
      return "Owner";
    case "ADMIN":
      return "Admin";
  }
}

export async function setSession(user: AuthUser, accountType: SessionClaims["accountType"]) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession({
    sub: user.id,
    accountType,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

function readClaims(token: string): SessionClaims | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const actualSignature = Buffer.from(signature, "base64url");
  const expectedSignature = sign(payload);
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof claims !== "object" ||
      claims === null ||
      !("sub" in claims) ||
      typeof claims.sub !== "string" ||
      !("accountType" in claims) ||
      (claims.accountType !== "customer" && claims.accountType !== "staff") ||
      !("exp" in claims) ||
      typeof claims.exp !== "number" ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return claims as SessionClaims;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = readClaims(token);
  if (!claims) return null;

  if (claims.accountType === "customer") {
    const customer = await prisma.pelanggan.findUnique({
      where: { id_pelanggan: claims.sub },
      select: { id_pelanggan: true, nama_pelanggan: true, email: true },
    });
    if (!customer) return null;
    return {
      id: customer.id_pelanggan,
      name: customer.nama_pelanggan,
      email: customer.email,
      role: "CUSTOMER",
    };
  }

  const staff = await prisma.pengguna.findUnique({
    where: { id_pengguna: claims.sub },
    select: { id_pengguna: true, nama_pengguna: true, email: true, peran: true },
  });
  if (!staff) return null;
  const role = roleFromDatabase(staff.peran);
  return role
    ? { id: staff.id_pengguna, name: staff.nama_pengguna, email: staff.email, role }
    : null;
}

export async function getUserForCredentials(email: string, password: string) {
  const { default: bcrypt } = await import("bcryptjs");
  const customer = await prisma.pelanggan.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id_pelanggan: true,
      nama_pelanggan: true,
      email: true,
      password: true,
    },
  });
  if (customer?.password && await bcrypt.compare(password, customer.password)) {
    return {
      user: {
        id: customer.id_pelanggan,
        name: customer.nama_pelanggan,
        email: customer.email,
        role: "CUSTOMER" as const,
      },
      accountType: "customer" as const,
    };
  }

  const staff = await prisma.pengguna.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id_pengguna: true,
      nama_pengguna: true,
      email: true,
      password: true,
      peran: true,
    },
  });
  if (staff?.password && await bcrypt.compare(password, staff.password)) {
    const role = roleFromDatabase(staff.peran);
    if (role) {
      return {
        user: { id: staff.id_pengguna, name: staff.nama_pengguna, email: staff.email, role },
        accountType: "staff" as const,
      };
    }
  }
  return null;
}

export function secureCodeMatches(candidate: unknown, configured: string | undefined) {
  if (typeof candidate !== "string" || !configured) return false;
  const candidateBytes = Buffer.from(candidate);
  const configuredBytes = Buffer.from(configured);
  return candidateBytes.length === configuredBytes.length &&
    timingSafeEqual(candidateBytes, configuredBytes);
}

export async function registerAccount(input: Record<string, unknown>) {
  const { default: bcrypt } = await import("bcryptjs");
  const role: AppRole | null =
    input.role === "CUSTOMER" || input.role === "EMPLOYEE" ||
    input.role === "OWNER" || input.role === "ADMIN"
      ? input.role
      : null;
  if (!role) throw new AuthRequestError("Pilih peran yang valid.");

  const name = requiredText(input.name, "Nama", 50);
  const email = requiredText(input.email, "Email", 40).toLocaleLowerCase("en");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthRequestError("Format email tidak valid.");
  }
  const password = requiredText(input.password, "Kata sandi", 72);
  if (Buffer.byteLength(password) < 8) throw new AuthRequestError("Kata sandi minimal 8 byte.");
  if (Buffer.byteLength(password) > 72) throw new AuthRequestError("Kata sandi maksimal 72 byte.");
  const gender = requiredText(input.gender, "Jenis kelamin", 10);
  if (!["Perempuan", "Laki-laki"].includes(gender)) {
    throw new AuthRequestError("Jenis kelamin tidak valid.");
  }
  const phone = requiredText(input.phone, "Nomor telepon", 16);
  const passwordHash = await bcrypt.hash(password, 12);

  let street: string | undefined;
  let number: string | undefined;
  let city: string | undefined;
  if (role === "CUSTOMER") {
    street = requiredText(input.street, "Nama jalan", 50);
    number = requiredText(input.number, "Nomor alamat", 10);
    city = requiredText(input.city, "Kota", 15);
  } else {
    const codeName = role === "EMPLOYEE"
      ? "EMPLOYEE_REGISTRATION_CODE"
      : role === "OWNER"
        ? "OWNER_REGISTRATION_CODE"
        : "ADMIN_REGISTRATION_CODE";
    if (!secureCodeMatches(input.invitationCode, process.env[codeName])) {
      throw new AuthRequestError("Kode undangan tidak valid atau belum dikonfigurasi.", 403);
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${email}))`);
    const [existingCustomer, existingStaff] = await Promise.all([
      tx.pelanggan.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id_pelanggan: true },
      }),
      tx.pengguna.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id_pengguna: true },
      }),
    ]);
    if (existingCustomer || existingStaff) {
      throw new AuthRequestError("Email sudah digunakan.", 409);
    }

    const id = await generateId(tx, role === "CUSTOMER" ? "PL" : "PG");
    if (role === "CUSTOMER") {
      await tx.pelanggan.create({
        data: {
          id_pelanggan: id,
          nama_pelanggan: name,
          jenis_kelamin: gender,
          no_telepon: phone,
          email,
          password: passwordHash,
          nama_jalan: street!,
          nomor: number!,
          kota: city!,
        },
      });
      return {
        user: { id, name, email, role: "CUSTOMER" as const },
        accountType: "customer" as const,
      };
    }

    const dbRole = role === "EMPLOYEE" ? "Karyawan" : role === "OWNER" ? "Owner" : "Admin";
    await tx.pengguna.create({
      data: {
        id_pengguna: id,
        nama_pengguna: name,
        jenis_kelamin: gender,
        no_telepon: phone,
        email,
        password: passwordHash,
        peran: dbRole,
        tanggal_bergabung: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
      },
    });
    return { user: { id, name, email, role }, accountType: "staff" as const };
  });
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AuthRequestError(`${label} wajib diisi.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new AuthRequestError(`${label} maksimal ${maxLength} karakter.`);
  }
  return normalized;
}

async function generateId(
  client: Prisma.TransactionClient,
  prefix: string,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `${prefix}${randomBytes(4).toString("hex").toUpperCase()}`;
    const existing = prefix === "PL"
      ? await client.pelanggan.findUnique({ where: { id_pelanggan: id }, select: { id_pelanggan: true } })
      : await client.pengguna.findUnique({ where: { id_pengguna: id }, select: { id_pengguna: true } });
    if (!existing) return id;
  }
  throw new Error("ID akun tidak dapat dibuat. Coba lagi.");
}
