/**
 * Seed script for Medusa backend.
 *
 * Run with: yarn seed  (or: npx medusa exec ./src/scripts/seed.ts)
 *
 * Creates sample products, collections, categories, and a sales channel
 * so you can immediately test the Strapi sync and storefront.
 */

import type { ExecArgs } from "@medusajs/framework/types"
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"

export default async function seed({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const link = container.resolve("remoteLink")
  const query = container.resolve("query")
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const storeModuleService = container.resolve(Modules.STORE)

  logger.info("Seeding store data...")

  // ─── Store ──────────────────────────────────────────────────────
  const [store] = await storeModuleService.listStores()
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  })

  if (!defaultSalesChannel.length) {
    const { result: salesChannelResult } =
      await createSalesChannelsWorkflow(container).run({
        input: {
          salesChannelsData: [
            {
              name: "Default Sales Channel",
            },
          ],
        },
      })
    defaultSalesChannel = salesChannelResult
  }

  // Update store with default sales channel
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [
          {
            currency_code: "usd",
            is_default: true,
          },
          {
            currency_code: "eur",
          },
        ],
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  })

  logger.info("Store updated with currencies and default sales channel")

  // ─── Categories ─────────────────────────────────────────────────
  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        {
          name: "Business Essentials",
          handle: "business-essentials",
          is_active: true,
        },
        {
          name: "Marketing Materials",
          handle: "marketing-materials",
          is_active: true,
        },
        {
          name: "Branded Apparel",
          handle: "branded-apparel",
          is_active: true,
        },
        {
          name: "Office Supplies",
          handle: "office-supplies",
          is_active: true,
        },
      ],
    },
  })

  logger.info(`Created ${categoryResult.length} product categories`)

  // ─── Products ───────────────────────────────────────────────────
  const { result: productResult } = await createProductsWorkflow(
    container
  ).run({
    input: {
      products: [
        {
          title: "Nobel Branded Business Cards",
          handle: "nobel-business-cards",
          description:
            "Premium business cards featuring the Nobel Realty Group brand. High-quality cardstock with matte or glossy finish options.",
          status: "published",
          category_ids: categoryResult
            .filter((c: any) => c.handle === "business-essentials")
            .map((c: any) => c.id),
          images: [
            {
              url: "https://placehold.co/600x400/1a365d/ffffff?text=Business+Cards",
            },
          ],
          options: [
            {
              title: "Finish",
              values: ["Matte", "Glossy"],
            },
          ],
          variants: [
            {
              title: "Matte - 250 Pack",
              sku: "NOBEL-BC-MATTE-250",
              manage_inventory: true,
              prices: [
                {
                  amount: 2999,
                  currency_code: "usd",
                },
              ],
              options: {
                Finish: "Matte",
              },
            },
            {
              title: "Glossy - 250 Pack",
              sku: "NOBEL-BC-GLOSSY-250",
              manage_inventory: true,
              prices: [
                {
                  amount: 3499,
                  currency_code: "usd",
                },
              ],
              options: {
                Finish: "Glossy",
              },
            },
          ],
          sales_channels: [
            { id: defaultSalesChannel[0].id },
          ],
        },
        {
          title: "Nobel Branded Polo Shirt",
          handle: "nobel-polo-shirt",
          description:
            "Professional polo shirt with embroidered Nobel Realty Group logo. Perfect for open houses and client meetings.",
          status: "published",
          category_ids: categoryResult
            .filter((c: any) => c.handle === "branded-apparel")
            .map((c: any) => c.id),
          images: [
            {
              url: "https://placehold.co/600x400/1a365d/ffffff?text=Polo+Shirt",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL", "XXL"],
            },
          ],
          variants: [
            {
              title: "Small",
              sku: "NOBEL-POLO-S",
              manage_inventory: true,
              prices: [
                {
                  amount: 3999,
                  currency_code: "usd",
                },
              ],
              options: {
                Size: "S",
              },
            },
            {
              title: "Medium",
              sku: "NOBEL-POLO-M",
              manage_inventory: true,
              prices: [
                {
                  amount: 3999,
                  currency_code: "usd",
                },
              ],
              options: {
                Size: "M",
              },
            },
            {
              title: "Large",
              sku: "NOBEL-POLO-L",
              manage_inventory: true,
              prices: [
                {
                  amount: 3999,
                  currency_code: "usd",
                },
              ],
              options: {
                Size: "L",
              },
            },
          ],
          sales_channels: [
            { id: defaultSalesChannel[0].id },
          ],
        },
        {
          title: "Nobel Branded Cap",
          handle: "nobel-cap",
          description:
            "Embroidered cap with the Nobel Realty Group logo. One size fits all with adjustable strap.",
          status: "published",
          category_ids: categoryResult
            .filter((c: any) => c.handle === "branded-apparel")
            .map((c: any) => c.id),
          images: [
            {
              url: "https://placehold.co/600x400/1a365d/ffffff?text=Branded+Cap",
            },
          ],
          options: [
            {
              title: "Color",
              values: ["Navy", "White", "Black"],
            },
          ],
          variants: [
            {
              title: "Navy",
              sku: "NOBEL-CAP-NAVY",
              manage_inventory: true,
              prices: [
                {
                  amount: 2499,
                  currency_code: "usd",
                },
              ],
              options: {
                Color: "Navy",
              },
            },
            {
              title: "White",
              sku: "NOBEL-CAP-WHITE",
              manage_inventory: true,
              prices: [
                {
                  amount: 2499,
                  currency_code: "usd",
                },
              ],
              options: {
                Color: "White",
              },
            },
          ],
          sales_channels: [
            { id: defaultSalesChannel[0].id },
          ],
        },
        {
          title: "Nobel Branded Pen Set",
          handle: "nobel-pen-set",
          description:
            "Premium pen set with Nobel Realty Group branding. Set of 12 ballpoint pens in a presentation box.",
          status: "published",
          category_ids: categoryResult
            .filter((c: any) => c.handle === "office-supplies")
            .map((c: any) => c.id),
          images: [
            {
              url: "https://placehold.co/600x400/1a365d/ffffff?text=Pen+Set",
            },
          ],
          options: [
            {
              title: "Ink Color",
              values: ["Blue", "Black"],
            },
          ],
          variants: [
            {
              title: "Blue Ink - 12 Pack",
              sku: "NOBEL-PEN-BLUE-12",
              manage_inventory: true,
              prices: [
                {
                  amount: 1999,
                  currency_code: "usd",
                },
              ],
              options: {
                "Ink Color": "Blue",
              },
            },
            {
              title: "Black Ink - 12 Pack",
              sku: "NOBEL-PEN-BLACK-12",
              manage_inventory: true,
              prices: [
                {
                  amount: 1999,
                  currency_code: "usd",
                },
              ],
              options: {
                "Ink Color": "Black",
              },
            },
          ],
          sales_channels: [
            { id: defaultSalesChannel[0].id },
          ],
        },
        {
          title: "Nobel Property Flyer Templates",
          handle: "nobel-flyer-templates",
          description:
            "Professional property listing flyer templates in the Nobel Realty Group brand. Digital download with customizable fields.",
          status: "published",
          category_ids: categoryResult
            .filter((c: any) => c.handle === "marketing-materials")
            .map((c: any) => c.id),
          images: [
            {
              url: "https://placehold.co/600x400/1a365d/ffffff?text=Flyer+Templates",
            },
          ],
          options: [
            {
              title: "Format",
              values: ["Digital PDF", "Print-Ready"],
            },
          ],
          variants: [
            {
              title: "Digital PDF - 10 Templates",
              sku: "NOBEL-FLYER-PDF-10",
              manage_inventory: false,
              prices: [
                {
                  amount: 4999,
                  currency_code: "usd",
                },
              ],
              options: {
                Format: "Digital PDF",
              },
            },
            {
              title: "Print-Ready - 10 Templates",
              sku: "NOBEL-FLYER-PRINT-10",
              manage_inventory: false,
              prices: [
                {
                  amount: 7999,
                  currency_code: "usd",
                },
              ],
              options: {
                Format: "Print-Ready",
              },
            },
          ],
          sales_channels: [
            { id: defaultSalesChannel[0].id },
          ],
        },
      ],
    },
  })

  logger.info(
    `Created ${productResult.length} products with variants and pricing`
  )
  logger.info("Seeding complete! Products will sync to Strapi via subscribers.")
}
