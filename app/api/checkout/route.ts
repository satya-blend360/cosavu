import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { amount, currency, email } = await req.json()
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: "Cosavu Metered Usage",
              description:
                "Usage-based billing for Cosavu API and infrastructure.",
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/billing?success=true`,
      cancel_url: `${req.headers.get("origin")}/billing?canceled=true`,
      customer_email: email,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create checkout session."

    console.error("Stripe Error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
