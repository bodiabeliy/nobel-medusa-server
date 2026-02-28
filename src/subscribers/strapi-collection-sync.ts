/**
 * Medusa → Strapi Product Collection Sync Subscriber
 *
 * Syncs product collections from Medusa to Strapi CMS.
 */

import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"

// ─── Helper: call Strapi REST API ────────────────────────────────
async function strapiRequest(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
) {
  const strapiUrl = process.env.STRAPI_URL || "http://localhost:1337"
  const strapiToken = process.env.STRAPI_API_TOKEN

  if (!strapiToken) {
    console.warn("[Strapi Sync] STRAPI_API_TOKEN not set – skipping sync")
    return null
  }

  const res = await fetch(`${strapiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${strapiToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const errorText = await res.text()
    console.error(
      `[Strapi Sync] ${method} ${path} failed (${res.status}):`,
      errorText
    )
    return null
  }

  if (res.status === 204) return { success: true }
  return res.json()
}

async function findStrapiEntry(
  contentType: string,
  medusaId: string
): Promise<{ documentId: string } | null> {
  const result = await strapiRequest(
    `/api/${contentType}?filters[medusa_id][$eq]=${medusaId}`
  )
  if (result?.data?.length > 0) {
    return {
      documentId: result.data[0].documentId || result.data[0].id,
    }
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════
// COLLECTION SYNC
// ═══════════════════════════════════════════════════════════════════
export default async function collectionSyncHandler({
  event: { data, name },
  container,
}: SubscriberArgs<{ id: string }>) {
  console.log(`[Strapi Sync] Received event: ${name}`)

  if (name === "product-collection.deleted") {
    try {
      const existing = await findStrapiEntry(
        "medusa-product-collections",
        data.id
      )
      if (existing) {
        await strapiRequest(
          `/api/medusa-product-collections/${existing.documentId}`,
          "DELETE"
        )
        console.log(
          `[Strapi Sync] Deleted collection ${data.id} from Strapi`
        )
      }
    } catch (error) {
      console.error(
        `[Strapi Sync] Error deleting collection ${data.id}:`,
        error
      )
    }
    return
  }

  // For created/updated, we receive the full data in the event
  try {
    const query = container.resolve("query")
    const { data: collections } = await query.graph({
      entity: "product_collection",
      filters: { id: data.id },
      fields: ["id", "title", "handle", "metadata"],
    })

    if (!collections?.length) return

    const collection = collections[0]
    const collectionData = {
      medusa_id: collection.id,
      title: collection.title,
      handle: collection.handle,
      metadata: collection.metadata || {},
    }

    const existing = await findStrapiEntry(
      "medusa-product-collections",
      collection.id
    )

    if (existing) {
      await strapiRequest(
        `/api/medusa-product-collections/${existing.documentId}`,
        "PUT",
        { data: collectionData }
      )
      console.log(
        `[Strapi Sync] Updated collection "${collection.title}" (${collection.id})`
      )
    } else {
      await strapiRequest("/api/medusa-product-collections", "POST", {
        data: collectionData,
      })
      console.log(
        `[Strapi Sync] Created collection "${collection.title}" (${collection.id})`
      )
    }
  } catch (error) {
    console.error(
      `[Strapi Sync] Error syncing collection ${data.id}:`,
      error
    )
  }
}

export const config: SubscriberConfig = {
  event: [
    "product-collection.created",
    "product-collection.updated",
    "product-collection.deleted",
  ],
}
