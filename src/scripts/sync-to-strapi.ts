/**
 * Manual sync script: push all Medusa products, categories, and collections to Strapi.
 *
 * Run with: npx medusa exec ./src/scripts/sync-to-strapi.ts
 *
 * This is useful when the initial seed's subscriber events
 * completed before the async Strapi calls finished.
 */

import type { ExecArgs } from "@medusajs/framework/types"
import type { IProductModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

async function strapiRequest(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
) {
  const strapiUrl = process.env.STRAPI_URL || "http://localhost:1337"
  const strapiToken = process.env.STRAPI_API_TOKEN

  if (!strapiToken) {
    console.error("[Sync] STRAPI_API_TOKEN not set!")
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
    console.error(`[Sync] ${method} ${path} failed (${res.status}):`, errorText)
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
    return { documentId: result.data[0].documentId || result.data[0].id }
  }
  return null
}

export default async function syncToStrapi({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const productService: IProductModuleService = container.resolve(Modules.PRODUCT)

  logger.info("Starting manual sync to Strapi...")

  // ─── Sync Categories ────────────────────────────────────────────
  const categories = await productService.listProductCategories(
    {},
    { select: ["id", "name", "handle", "description", "metadata"], take: 100 }
  )
  logger.info(`Found ${categories.length} categories to sync`)

  for (const cat of categories) {
    const catName = (cat as any).name ?? (cat as any).title ?? ""
    const catHandle = (cat as any).handle ?? ""
    logger.info(`  Processing category: ${JSON.stringify({ id: cat.id, name: catName, handle: catHandle })}`)

    const existing = await findStrapiEntry("medusa-product-categories", cat.id)
    const data = {
      medusa_id: cat.id,
      name: catName,
      handle: catHandle,
      description: (cat as any).description || "",
      metadata: (cat as any).metadata || {},
    }

    if (existing) {
      await strapiRequest(
        `/api/medusa-product-categories/${existing.documentId}`,
        "PUT",
        { data }
      )
      logger.info(`  Updated category: ${catName}`)
    } else {
      await strapiRequest("/api/medusa-product-categories", "POST", { data })
      logger.info(`  Created category: ${catName}`)
    }
  }

  // ─── Sync Products ──────────────────────────────────────────────
  const products = await productService.listProducts(
    {},
    {
      relations: [
        "variants",
        "images",
        "categories",
        "collection",
        "tags",
      ],
      take: 100,
    }
  )
  logger.info(`Found ${products.length} products to sync`)

  // Get pricing data via the pricing module
  const pricingService = container.resolve(Modules.PRICING)

  for (const product of products) {
    // Fetch prices for each variant separately
    const variantsData: { medusa_id: string; title: string; sku: string; prices: { amount: number; currency_code: string }[]; manage_inventory: boolean }[] = []
    for (const v of (product.variants || [])) {
      let prices: any[] = []
      try {
        // Try to get price sets linked to this variant
        const priceSets = await pricingService.listPriceSets(
          { id: (v as any).price_set?.id ? [(v as any).price_set.id] : undefined },
          { relations: ["prices"] }
        )
        if (priceSets.length > 0) {
          prices = (priceSets[0] as any).prices?.map((p: any) => ({
            amount: p.amount,
            currency_code: p.currency_code,
          })) || []
        }
      } catch {
        // pricing lookup failed, continue without prices
      }

      variantsData.push({
        medusa_id: v.id,
        title: v.title,
        sku: v.sku || "",
        prices,
        manage_inventory: v.manage_inventory ?? true,
      })
    }
    const existing = await findStrapiEntry("medusa-products", product.id)

    // Extract cheapest price for top-level price fields
    let priceAmount = 0
    let priceCurrency = "usd"
    for (const vd of variantsData) {
      for (const p of vd.prices || []) {
        if (p.amount != null && (priceAmount === 0 || p.amount < priceAmount)) {
          priceAmount = p.amount
          priceCurrency = p.currency_code || "usd"
        }
      }
    }
    const priceDisplay = priceAmount > 0
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: priceCurrency.toUpperCase() }).format(priceAmount / 100)
      : ""

    const data = {
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
      variants: variantsData,
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
      price_amount: priceAmount,
      price_currency: priceCurrency,
      price_display: priceDisplay,
    }

    if (existing) {
      await strapiRequest(
        `/api/medusa-products/${existing.documentId}`,
        "PUT",
        { data }
      )
      logger.info(`  Updated product: ${product.title}`)
    } else {
      await strapiRequest("/api/medusa-products", "POST", { data })
      logger.info(`  Created product: ${product.title}`)
    }
  }

  logger.info("Manual sync to Strapi complete!")
}
