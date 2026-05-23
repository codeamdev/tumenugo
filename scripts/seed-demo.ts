#!/usr/bin/env tsx
/**
 * Seeds a complete demo cafeteria tenant for testing.
 *
 * Usage: npm run tenant:seed-demo
 */

import 'dotenv/config'
import { pool } from '../src/lib/db/pool'
import { provisionTenant } from '../src/lib/provisioning'
import { withTenant } from '../src/lib/db/tenant-db'
import {
  categories,
  products,
  taxRates,
  tables,
  modifierGroups,
  modifiers,
} from '../src/lib/db/schema/tenant'
import { publicDb } from '../src/lib/db/public-db'
import { tenants } from '../src/lib/db/schema/public'
import { eq } from 'drizzle-orm'

const DEMO_SLUG = 'demo'
const DEMO_SCHEMA = 'tenant_demo'

async function main() {
  console.log('\n🌱 Seeding demo cafeteria...\n')

  // Check if demo tenant already exists
  const [existing] = await publicDb
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEMO_SLUG))
    .limit(1)

  if (!existing) {
    await provisionTenant({
      name: 'Café Demo',
      slug: DEMO_SLUG,
      businessType: 'cafeteria',
      adminEmail: 'admin@demo.com',
      adminName: 'Admin Demo',
      adminPassword: 'Demo1234!',
      primaryColor: '#8b5cf6',
    })
  }

  await withTenant(DEMO_SCHEMA, async (db) => {
    // Get existing categories and tax rates (seeded by provisioning)
    const cats = await db.select().from(categories)
    const taxes = await db.select().from(taxRates)

    const catMap = Object.fromEntries(cats.map((c) => [c.name, c.id]))
    const ivaId = taxes.find((t) => t.type === 'IVA')?.id
    const noTaxId = taxes.find((t) => t.type === 'none')?.id

    // Mesas
    await db.insert(tables).values([
      { name: 'Mesa 1', capacity: 2, zone: 'Salón', posX: 100, posY: 100 },
      { name: 'Mesa 2', capacity: 4, zone: 'Salón', posX: 250, posY: 100 },
      { name: 'Mesa 3', capacity: 4, zone: 'Salón', posX: 400, posY: 100 },
      { name: 'Mesa 4', capacity: 6, zone: 'Salón', posX: 100, posY: 260 },
      { name: 'Mesa 5', capacity: 6, zone: 'Salón', posX: 250, posY: 260 },
      { name: 'T1', capacity: 2, zone: 'Terraza', posX: 100, posY: 100 },
      { name: 'T2', capacity: 4, zone: 'Terraza', posX: 250, posY: 100 },
    ]).onConflictDoNothing()

    // Products
    const prods = await db.insert(products).values([
      // Bebidas calientes
      {
        categoryId: catMap['Bebidas calientes'],
        name: 'Café Americano',
        description: 'Café negro espresso con agua caliente',
        price: '4500',
        taxRateId: ivaId,
        isAvailable: true,
        sortOrder: 1,
      },
      {
        categoryId: catMap['Bebidas calientes'],
        name: 'Cappuccino',
        description: 'Espresso con leche vaporizada y espuma',
        price: '6500',
        taxRateId: ivaId,
        isAvailable: true,
        sortOrder: 2,
      },
      {
        categoryId: catMap['Bebidas calientes'],
        name: 'Latte',
        description: 'Espresso con leche caliente al vapor',
        price: '7000',
        taxRateId: ivaId,
        isAvailable: true,
        sortOrder: 3,
      },
      {
        categoryId: catMap['Bebidas calientes'],
        name: 'Chocolate Caliente',
        description: 'Chocolate en leche con toppings opcionales',
        price: '5500',
        taxRateId: ivaId,
        isAvailable: true,
        sortOrder: 4,
      },
      // Bebidas frías
      {
        categoryId: catMap['Bebidas frías'],
        name: 'Frappé Café',
        description: 'Café frío con hielo y crema chantilly',
        price: '8500',
        taxRateId: ivaId,
        isAvailable: true,
        sortOrder: 1,
      },
      {
        categoryId: catMap['Bebidas frías'],
        name: 'Limonada Natural',
        description: 'Limón fresco, azúcar y agua con gas',
        price: '5000',
        taxRateId: noTaxId,
        isAvailable: true,
        sortOrder: 2,
      },
      {
        categoryId: catMap['Bebidas frías'],
        name: 'Jugo Natural',
        description: 'Jugo de fruta natural del día',
        price: '6000',
        taxRateId: noTaxId,
        isAvailable: true,
        sortOrder: 3,
      },
      // Alimentos
      {
        categoryId: catMap['Alimentos'],
        name: 'Tostadas con Mermelada',
        description: 'Dos tostadas de pan artesanal con mermelada casera',
        price: '5500',
        taxRateId: noTaxId,
        isAvailable: true,
        sortOrder: 1,
      },
      {
        categoryId: catMap['Alimentos'],
        name: 'Sándwich de Pollo',
        description: 'Pollo a la plancha, lechuga, tomate y salsa',
        price: '13500',
        taxRateId: noTaxId,
        isAvailable: true,
        sortOrder: 2,
      },
      {
        categoryId: catMap['Alimentos'],
        name: 'Wrap Vegetal',
        description: 'Tortilla con vegetales frescos y hummus',
        price: '11000',
        taxRateId: noTaxId,
        isAvailable: true,
        sortOrder: 3,
      },
      // Postres
      {
        categoryId: catMap['Postres'],
        name: 'Brownie Chocolate',
        description: 'Brownie casero con helado de vainilla',
        price: '9000',
        taxRateId: noTaxId,
        isAvailable: true,
        sortOrder: 1,
      },
      {
        categoryId: catMap['Postres'],
        name: 'Cheesecake Maracuyá',
        description: 'Cheesecake cremoso con coulis de maracuyá',
        price: '8500',
        taxRateId: noTaxId,
        isAvailable: true,
        sortOrder: 2,
      },
    ]).returning()

    // Modificadores para Latte y Cappuccino
    const latteId = prods.find((p) => p.name === 'Latte')?.id
    const cappuccinoId = prods.find((p) => p.name === 'Cappuccino')?.id
    const frappe = prods.find((p) => p.name === 'Frappé Café')?.id

    for (const productId of [latteId, cappuccinoId].filter(Boolean) as string[]) {
      const [sizeGroup] = await db.insert(modifierGroups).values({
        productId,
        name: 'Tamaño',
        selectionType: 'single',
        isRequired: true,
        sortOrder: 1,
      }).returning()

      await db.insert(modifiers).values([
        { groupId: sizeGroup.id, name: 'Pequeño (8oz)', priceDelta: '-1000', sortOrder: 1 },
        { groupId: sizeGroup.id, name: 'Mediano (12oz)', priceDelta: '0', isDefault: true, sortOrder: 2 },
        { groupId: sizeGroup.id, name: 'Grande (16oz)', priceDelta: '1500', sortOrder: 3 },
      ])

      const [milkGroup] = await db.insert(modifierGroups).values({
        productId,
        name: 'Tipo de leche',
        selectionType: 'single',
        isRequired: false,
        sortOrder: 2,
      }).returning()

      await db.insert(modifiers).values([
        { groupId: milkGroup.id, name: 'Leche entera', priceDelta: '0', isDefault: true, sortOrder: 1 },
        { groupId: milkGroup.id, name: 'Leche deslactosada', priceDelta: '0', sortOrder: 2 },
        { groupId: milkGroup.id, name: 'Leche de avena', priceDelta: '1500', sortOrder: 3 },
        { groupId: milkGroup.id, name: 'Leche de almendra', priceDelta: '1500', sortOrder: 4 },
      ])
    }

    // Extras para Frappé
    if (frappe) {
      const [extrasGroup] = await db.insert(modifierGroups).values({
        productId: frappe,
        name: 'Extras',
        selectionType: 'multiple',
        isRequired: false,
        sortOrder: 1,
      }).returning()

      await db.insert(modifiers).values([
        { groupId: extrasGroup.id, name: 'Shot extra de espresso', priceDelta: '2000', sortOrder: 1 },
        { groupId: extrasGroup.id, name: 'Crema chantilly extra', priceDelta: '1000', sortOrder: 2 },
        { groupId: extrasGroup.id, name: 'Caramelo', priceDelta: '500', sortOrder: 3 },
      ])
    }
  })

  console.log('✅ Demo cafetería lista!')
  console.log('   URL: http://demo.localhost:3000')
  console.log('   Email: admin@demo.com')
  console.log('   Password: Demo1234!')

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
