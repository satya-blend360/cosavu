import { NextResponse } from "next/server"

const COSAVU_DOMAIN_PASSWORD =
  process.env.COSAVU_DOMAIN_PASSWORD || "BDhustler@2798"
const DATAMAN_PASSWORD =
  process.env.DATAMAN_CONSOLE_PASSWORD ||
  "csvu_uI9LaCznAFg1ynGSF1N6yeA5uw6OWYJR"

function getDisplayName(email: string) {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isAllowedCredential(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail.includes("@")) {
    return false
  }

  if (password === COSAVU_DOMAIN_PASSWORD) {
    return true
  }

  if (normalizedEmail === "jayadev@dataman.tech") {
    return password === DATAMAN_PASSWORD
  }

  return false
}

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string
    password?: string
  }

  const normalizedEmail = email?.trim().toLowerCase()

  if (!normalizedEmail || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    )
  }

  if (!isAllowedCredential(normalizedEmail, password)) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    )
  }

  return NextResponse.json({
    user: {
      uid: `console:${normalizedEmail}`,
      email: normalizedEmail,
      displayName: getDisplayName(normalizedEmail),
      photoURL: null,
      provider: "console",
    },
  })
}
