"use client"

import { onAuthStateChanged, signOut, type User } from "firebase/auth"

import { auth } from "@/lib/firebase"

const CONSOLE_SESSION_STORAGE_KEY = "cosavu:console-session"
const CONSOLE_AUTH_CHANGE_EVENT = "cosavu-console-auth-change"

export type ConsoleUser = {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  provider: "firebase" | "console"
}

function normalizeFirebaseUser(user: User): ConsoleUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    provider: "firebase",
  }
}

function readStoredConsoleUser() {
  if (typeof window === "undefined") return null

  try {
    const rawSession = window.localStorage.getItem(CONSOLE_SESSION_STORAGE_KEY)
    if (!rawSession) return null

    const parsedSession = JSON.parse(rawSession) as Partial<ConsoleUser>
    if (!parsedSession.email || !parsedSession.uid) return null

    return {
      uid: parsedSession.uid,
      email: parsedSession.email,
      displayName: parsedSession.displayName || null,
      photoURL: parsedSession.photoURL || null,
      provider: parsedSession.provider === "firebase" ? "firebase" : "console",
    } satisfies ConsoleUser
  } catch {
    return null
  }
}

function writeStoredConsoleUser(user: ConsoleUser) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(CONSOLE_SESSION_STORAGE_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event(CONSOLE_AUTH_CHANGE_EVENT))
}

export function clearConsoleSession() {
  if (typeof window === "undefined") return

  window.localStorage.removeItem(CONSOLE_SESSION_STORAGE_KEY)
  window.dispatchEvent(new Event(CONSOLE_AUTH_CHANGE_EVENT))
}

export async function signOutConsole() {
  clearConsoleSession()

  if (auth.currentUser) {
    await signOut(auth)
  }
}

export async function signInWithConsolePassword(
  email: string,
  password: string
) {
  const response = await fetch("/api/console-auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  })

  const payload = (await response.json().catch(() => ({}))) as {
    user?: ConsoleUser
    error?: string
  }

  if (!response.ok || !payload.user) {
    throw new Error(payload.error || "Unable to sign in.")
  }

  writeStoredConsoleUser(payload.user)
  return payload.user
}

export function getCurrentConsoleUser() {
  if (auth.currentUser) return normalizeFirebaseUser(auth.currentUser)

  return readStoredConsoleUser()
}

export function watchConsoleAuth(callback: (user: ConsoleUser | null) => void) {
  const emitCurrentUser = () => callback(getCurrentConsoleUser())

  const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      callback(normalizeFirebaseUser(firebaseUser))
      return
    }

    callback(readStoredConsoleUser())
  })

  window.addEventListener("storage", emitCurrentUser)
  window.addEventListener(CONSOLE_AUTH_CHANGE_EVENT, emitCurrentUser)
  emitCurrentUser()

  return () => {
    unsubscribe()
    window.removeEventListener("storage", emitCurrentUser)
    window.removeEventListener(CONSOLE_AUTH_CHANGE_EVENT, emitCurrentUser)
  }
}
