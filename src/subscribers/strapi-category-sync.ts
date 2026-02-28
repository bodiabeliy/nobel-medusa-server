/**
 * Medusa → Strapi Product Category Sync Subscriber
 *
 * Syncs product categories from Medusa to Strapi CMS.
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
// CATEGORY SYNC
// ═══════════════════════════════════════════════════════════════════
export default async function categorySyncHandler({
  event: { data, name },
  container,
}: SubscriberArgs<{ id: string }>) {
  console.log(`[Strapi Sync] Received event: ${name}`)

  if (name === "product-category.deleted") {
    try {
      const existing = await findStrapiEntry(
        "medusa-product-categories",
        data.id
      )
      if (existing) {
        await strapiRequest(
          `/api/medusa-product-categories/${existing.documentId}`,
          "DELETE"
        )
        console.log(
          `[Strapi Sync] Deleted category ${data.id} from Strapi`
        )
      }
    } catch (error) {
      console.error(
        `[Strapi Sync] Error deleting category ${data.id}:`,
        error
      )
    }
    return
  }

  // For created/updated
  try {
    const query = container.resolve("query")
    const { data: categories } = await query.graph({
      entity: "product_category",
      filters: { id: data.id },
      fields: ["id", "name", "handle", "description", "metadata"],
    })

    if (!categories?.length) return

    const category = categories[0]
    const categoryData = {
      medusa_id: category.id,
      name: category.name,
      handle: category.handle,
      description: category.description || "",
      metadata: category.metadata || {},
    }

    const existing = await findStrapiEntry(
      "medusa-product-categories",
      category.id
    )

    if (existing) {
      await strapiRequest(
        `/api/medusa-product-categories/${existing.documentId}`,
        "PUT",
        { data: categoryData }
      )
      console.log(
        `[Strapi Sync] Updated category "${category.name}" (${category.id})`
      )
    } else {
      await strapiRequest("/api/medusa-product-categories", "POST", {
        data: categoryData,
      })
      console.log(
        `[Strapi Sync] Created category "${category.name}" (${category.id})`
      )
    }
  } catch (error) {
    console.error(
      `[Strapi Sync] Error syncing category ${data.id}:`,
      error
    )
  }
}

export const config: SubscriberConfig = {
  event: [
    "product-category.created",
    "product-category.updated",
    "product-category.deleted",
  ],
}
