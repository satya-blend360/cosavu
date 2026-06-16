"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { signInWithPopup } from "firebase/auth"
import { auth, googleProvider } from "@/lib/firebase"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { watchConsoleAuth } from "@/lib/console-auth"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = watchConsoleAuth((user) => {
      if (user) {
        router.push("/")
      }
    })
    return () => unsubscribe()
  }, [router])

  const handleGoogleSignup = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
      router.push("/")
    } catch (error) {
      console.error("Google signup failed", error)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Create an account</h1>
                <p className="text-balance text-muted-foreground">
                  Get started with Cosavu today
                </p>
              </div>
              <Field>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="firstName" className="mb-2 block">
                      First name
                    </FieldLabel>
                    <Input id="firstName" placeholder="Jane" required />
                  </div>
                  <div>
                    <FieldLabel htmlFor="lastName" className="mb-2 block">
                      Last name
                    </FieldLabel>
                    <Input id="lastName" placeholder="Doe" required />
                  </div>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" type="password" required />
              </Field>
              <Field>
                <Button
                  type="button"
                  onClick={() => router.push("/")}
                  className="w-full"
                >
                  Sign Up
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
              </FieldSeparator>
              <Field className="grid grid-cols-1 gap-4">
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleGoogleSignup}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    className="mr-2 h-4 w-4"
                  >
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  Sign up with Google
                </Button>
              </Field>
              <FieldDescription className="text-center">
                Already have an account? <a href="/login">Login</a>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="relative hidden bg-muted md:block">
            <Image
              src="/login.png"
              alt="Signup Image"
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover brightness-105 contrast-105 saturate-125"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
