/**
 * Medusa → Strapi Product Sync Subscriber
 *
 * Listens for product events in Medusa and syncs data to Strapi CMS.
 * This enables two-way visibility: products created/updated/deleted
 * in Medusa are reflected in the Strapi content manager.
 *
 * Synced entities: Product (with embedded variants, images, prices)
 */

import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import type { IProductModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${strapiToken}`,
  }

  const res = await fetch(`${strapiUrl}${path}`, {
    method,
    headers,
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

  // DELETE may return no content
  if (res.status === 204) return { success: true }

  return res.json()
}

// ─── Helper: find existing Strapi entry by medusa_id ─────────────
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
// PRODUCT SYNC HANDLER
// ═══════════════════════════════════════════════════════════════════
async function syncProductToStrapi(
  productService: IProductModuleService,
  productId: string
) {
  try {
    const product = await productService.retrieveProduct(productId, {
      relations: [
        "variants",
        "images",
        "categories",
        "collection",
        "tags",
      ],
    })

    const productData = {
      medusa_id: product.id,
      title: product.title,
      handle: product.handle,
      description: product.description || "",
      subtitle: product.subtitle || "",
      status: product.status || "draft",
      thumbnail: product.thumbnail || "",
      images: (product.images || []).map((img: any) => ({
        url: img.url,
        alt: img.metadata?.alt || "",
      })),
      variants: (product.variants || []).map((v: any) => ({
        medusa_id: v.id,
        title: v.title,
        sku: v.sku || "",
        prices: (v.prices || []).map((p: any) => ({
          amount: p.amount,
          currency_code: p.currency_code,
        })),
        manage_inventory: v.manage_inventory ?? true,
      })),
      collection_title: product.collection?.title || "",
      collection_handle: product.collection?.handle || "",
      categories: (product.categories || []).map((c: any) => ({
        name: c.name,
        handle: c.handle,
      })),
      tags: (product.tags || []).map((t: any) => ({
        value: t.value,
      })),
      metadata: product.metadata || {},
    }

    // Check if product already exists in Strapi
    const existing = await findStrapiEntry("medusa-products", product.id)

    if (existing) {
      // Update existing product
      await strapiRequest(
        `/api/medusa-products/${existing.documentId}`,
        "PUT",
        { data: productData }
      )
      console.log(
        `[Strapi Sync] Updated product "${product.title}" (${product.id})`
      )
    } else {
      // Create new product
      await strapiRequest("/api/medusa-products", "POST", {
        data: productData,
      })
      console.log(
        `[Strapi Sync] Created product "${product.title}" (${product.id})`
      )
    }
  } catch (error) {
    console.error(`[Strapi Sync] Error syncing product ${productId}:`, error)
  }
}

// ═══════════════════════════════════════════════════════════════════
// PRODUCT CREATED / UPDATED
// ═══════════════════════════════════════════════════════════════════
export default async function productSyncHandler({
  event: { data, name },
  container,
}: SubscriberArgs<{ id: string }>) {
  console.log(`[Strapi Sync] Received event: ${name}`)

  const productService: IProductModuleService = container.resolve(
    Modules.PRODUCT
  )

  if (name === "product.deleted") {
    // Delete from Strapi
    try {
      const existing = await findStrapiEntry("medusa-products", data.id)
      if (existing) {
        await strapiRequest(
          `/api/medusa-products/${existing.documentId}`,
          "DELETE"
        )
        console.log(`[Strapi Sync] Deleted product ${data.id} from Strapi`)
      }
    } catch (error) {
      console.error(
        `[Strapi Sync] Error deleting product ${data.id}:`,
        error
      )
    }
    return
  }

  // Created or Updated → sync full product data
  await syncProductToStrapi(productService, data.id)
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
}
