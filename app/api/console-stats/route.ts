import { NextResponse } from "next/server"

import { COSAVU_ENDPOINTS } from "@/lib/cosavu-api"

const DEFAULT_STATS_API_KEY =
  process.env.COSAVU_STATS_API_KEY || "csvu_uI9LaCznAFg1ynGSF1N6yeA5uw6OWYJR"

type DataBucketResponse = {
  name?: string
  system?: string
  total_chunks?: number
}

function getKeyFingerprint(apiKey: string) {
  if (apiKey.length <= 12) return apiKey

  return `${apiKey.slice(0, 9)}...${apiKey.slice(-6)}`
}

function sumChunks(buckets: DataBucketResponse[]) {
  return buckets.reduce((sum, bucket) => {
    const chunks = Number(bucket.total_chunks)
    return sum + (Number.isFinite(chunks) ? chunks : 0)
  }, 0)
}

export async function GET() {
  const apiKey = DEFAULT_STATS_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: "COSAVU_STATS_API_KEY is not configured." },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(COSAVU_ENDPOINTS.data.buckets, {
      headers: {
        "X-API-Key": apiKey,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          source: "unavailable",
          apiKeyFingerprint: getKeyFingerprint(apiKey),
          activeKeys: 1,
          latestIssue: null,
          monthlyUsagePercent: null,
          requestsUsed: null,
          requestLimit: null,
          currentBillUsd: 0,
          paidInvoices: 0,
          buckets: [],
          bucketCount: 0,
          chunksIndexed: 0,
          filesSynced: 0,
          connectedWarehouses: 0,
          tokenSavingsPercent: null,
          tokensBeforeFilter: null,
          tokensSaved: null,
          ledger: [],
          error: `DataAPI stats request failed with ${response.status}.`,
        },
        { status: 200 }
      )
    }

    const buckets = (await response.json()) as DataBucketResponse[]
    const bucketList = Array.isArray(buckets) ? buckets : []
    const chunksIndexed = sumChunks(bucketList)

    return NextResponse.json({
      source: "live",
      apiKeyFingerprint: getKeyFingerprint(apiKey),
      activeKeys: 1,
      latestIssue: null,
      monthlyUsagePercent: null,
      requestsUsed: null,
      requestLimit: null,
      currentBillUsd: 0,
      paidInvoices: 0,
      buckets: bucketList,
      bucketCount: bucketList.length,
      chunksIndexed,
      filesSynced: 0,
      connectedWarehouses: 0,
      tokenSavingsPercent: null,
      tokensBeforeFilter: null,
      tokensSaved: null,
      ledger: [],
      updatedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unable to load live stats."

    return NextResponse.json(
      {
        source: "unavailable",
        apiKeyFingerprint: getKeyFingerprint(apiKey),
        activeKeys: 1,
        latestIssue: null,
        monthlyUsagePercent: null,
        requestsUsed: null,
        requestLimit: null,
        currentBillUsd: 0,
        paidInvoices: 0,
        buckets: [],
        bucketCount: 0,
        chunksIndexed: 0,
        filesSynced: 0,
        connectedWarehouses: 0,
        tokenSavingsPercent: null,
        tokensBeforeFilter: null,
        tokensSaved: null,
        ledger: [],
        error: message,
      },
      { status: 200 }
    )
  }
}
