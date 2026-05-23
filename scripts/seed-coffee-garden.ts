#!/usr/bin/env tsx
/**
 * Seeds Coffee Garden menu products and categories.
 * Run: npx tsx scripts/seed-coffee-garden.ts
 */

import 'dotenv/config'
import { withTenant } from '../src/lib/db/tenant-db'
import { categories, products } from '../src/lib/db/schema/tenant'
import { pool } from '../src/lib/db/pool'

const TENANT_SCHEMA = 'tenant_coffee_garden'

const CATEGORIES = [
  { name: 'Bebidas Calientes', emoji: '☕', sortOrder: 1 },
  { name: 'Aromática', emoji: '🍵', sortOrder: 2 },
  { name: 'Con Leche', emoji: '🥛', sortOrder: 3 },
  { name: 'Métodos', emoji: '⚗️', sortOrder: 4 },
  { name: 'Bebidas Frías', emoji: '❄️', sortOrder: 5 },
  { name: 'Nevados', emoji: '🍧', sortOrder: 6 },
  { name: 'Malteadas', emoji: '🥤', sortOrder: 7 },
  { name: 'Sodas', emoji: '🫧', sortOrder: 8 },
  { name: 'Limonadas', emoji: '🍋', sortOrder: 9 },
  { name: 'Jugos', emoji: '🍹', sortOrder: 10 },
  { name: 'Smoothie', emoji: '🥤', sortOrder: 11 },
  { name: 'Cocteles', emoji: '🍸', sortOrder: 12 },
  { name: 'Contienen Dulce', emoji: '🍰', sortOrder: 13 },
  { name: 'Waffles', emoji: '🧇', sortOrder: 14 },
  { name: 'Desayunos', emoji: '🍳', sortOrder: 15 },
  { name: 'Sandwich', emoji: '🥪', sortOrder: 16 },
]

type ProductDef = { name: string; price: number; description?: string; sortOrder?: number }

const PRODUCTS_BY_CATEGORY: Record<string, ProductDef[]> = {
  'Bebidas Calientes': [
    { name: 'Espresso sencillo', price: 2500, sortOrder: 1 },
    { name: 'Espresso doble', price: 4500, sortOrder: 2 },
    { name: 'Americano', price: 3500, sortOrder: 3 },
    { name: 'Campesino', price: 5000, sortOrder: 4 },
    { name: 'Café bombón', price: 4500, sortOrder: 5 },
  ],
  'Aromática': [
    { name: 'Aromática sencilla', price: 3000, sortOrder: 1 },
    { name: 'Infusión de frutas', price: 5000, sortOrder: 2 },
  ],
  'Con Leche': [
    { name: 'Latte', price: 7000, sortOrder: 1 },
    { name: 'Capuccino', price: 6500, sortOrder: 2 },
    { name: 'Capuccino moka', price: 8000, sortOrder: 3 },
    { name: 'Capuccino caramelo', price: 8000, sortOrder: 4 },
    { name: 'Capuccino baileys', price: 11000, sortOrder: 5 },
    { name: 'Capuccino vienes', price: 8000, sortOrder: 6 },
    { name: 'Té chai', price: 8000, sortOrder: 7 },
    { name: 'Capuccino té chai', price: 9000, sortOrder: 8 },
    { name: 'Milo', price: 7000, sortOrder: 9 },
    { name: 'Chocolate agua', price: 6000, sortOrder: 10 },
    { name: 'Chocolate leche', price: 7000, sortOrder: 11 },
  ],
  'Métodos': [
    { name: 'Chemex (2 tazas)', price: 14000, sortOrder: 1 },
    { name: 'V-60 (2 tazas)', price: 14000, sortOrder: 2 },
    { name: 'Prensa francesa (2 tazas)', price: 14000, sortOrder: 3 },
    { name: 'Sifón japonés (2 tazas)', price: 17000, sortOrder: 4 },
    { name: 'Migao de la abuela', price: 16000, description: 'Chocolate en leche, acompañado de galletas ducales, pan de maíz, achiras, cuajada y almojábana', sortOrder: 5 },
  ],
  'Bebidas Frías': [
    { name: 'Cold brew', price: 7000, sortOrder: 1 },
    { name: 'Orange cold brew', price: 9000, sortOrder: 2 },
    { name: 'Tonic coffe', price: 8000, sortOrder: 3 },
    { name: 'Iced capuccino', price: 8000, sortOrder: 4 },
    { name: 'Iced capuccino moka', price: 10000, sortOrder: 5 },
    { name: 'Iced capuccino caramelo', price: 10000, sortOrder: 6 },
    { name: 'Ice capuccino Baileys', price: 12000, sortOrder: 7 },
    { name: 'Granizado café + té chai', price: 12000, sortOrder: 8 },
    { name: 'Granizado té chai', price: 10000, sortOrder: 9 },
    { name: 'Granizado café', price: 9000, sortOrder: 10 },
    { name: 'Granizado Garden', price: 13000, sortOrder: 11 },
    { name: 'Granizado café + Cholupa', price: 11000, sortOrder: 12 },
    { name: 'Milo frío', price: 7000, sortOrder: 13 },
  ],
  'Nevados': [
    { name: 'Nevado café', price: 11000, sortOrder: 1 },
    { name: 'Nevado caramelo', price: 13000, sortOrder: 2 },
    { name: 'Nevado brownie', price: 13000, sortOrder: 3 },
    { name: 'Nevado oreo', price: 13000, sortOrder: 4 },
    { name: 'Nevado moka', price: 13000, sortOrder: 5 },
    { name: 'Nevado Baileys', price: 15000, sortOrder: 6 },
  ],
  'Malteadas': [
    { name: 'Malteada sencilla', price: 10000, description: 'Sabores: vainilla, chocolate, café, frutos rojos, vino tinto', sortOrder: 1 },
    { name: 'Malteada con Chantilly', price: 13000, description: 'Sabores: vainilla, chocolate, café, frutos rojos, vino tinto', sortOrder: 2 },
  ],
  'Sodas': [
    { name: 'Soda cítricos', price: 11000, sortOrder: 1 },
    { name: 'Soda Jamaica', price: 11000, sortOrder: 2 },
    { name: 'Soda frutos rojos', price: 11000, sortOrder: 3 },
    { name: 'Soda campesina', price: 11000, sortOrder: 4 },
    { name: 'Soda cereza', price: 11000, sortOrder: 5 },
    { name: 'Soda mango biche', price: 11000, sortOrder: 6 },
    { name: 'Soda sandía', price: 11000, sortOrder: 7 },
    { name: 'Soda arándanos y hierbabuena', price: 11000, sortOrder: 8 },
    { name: 'Soda infantil', price: 5000, sortOrder: 9 },
  ],
  'Limonadas': [
    { name: 'Limonada natural', price: 6000, sortOrder: 1 },
    { name: 'Limonada de cítricos', price: 8000, sortOrder: 2 },
    { name: 'Limonada de Jamaica', price: 8000, sortOrder: 3 },
    { name: 'Limonada de café', price: 9000, sortOrder: 4 },
    { name: 'Limonada de sandía', price: 9000, sortOrder: 5 },
    { name: 'Limonada de hierbabuena', price: 9000, sortOrder: 6 },
    { name: 'Limonada de cereza', price: 9000, sortOrder: 7 },
    { name: 'Limonada de liche', price: 9000, sortOrder: 8 },
    { name: 'Limonada de verano', price: 9000, sortOrder: 9 },
    { name: 'Limonada de coco', price: 10000, sortOrder: 10 },
    { name: 'Piña colada', price: 10000, sortOrder: 11 },
  ],
  'Jugos': [
    { name: 'Jugo en agua (guanábana, mango y mora)', price: 6000, sortOrder: 1 },
    { name: 'Jugo en leche (guanábana, mango y mora)', price: 7000, sortOrder: 2 },
    { name: 'Jugo en agua (cholupa, maracuyá y fresa)', price: 7000, sortOrder: 3 },
    { name: 'Jugo en leche (cholupa, maracuyá y fresa)', price: 8000, sortOrder: 4 },
    { name: 'Zumo de naranja', price: 5000, sortOrder: 5 },
  ],
  'Smoothie': [
    { name: 'Smoothie mango-maracuyá', price: 10000, sortOrder: 1 },
    { name: 'Smoothie banano-fresa-chía', price: 12000, sortOrder: 2 },
  ],
  'Cocteles': [
    { name: 'Michelada básica', price: 7000, sortOrder: 1 },
    { name: 'Michelada mango biche', price: 10000, sortOrder: 2 },
    { name: 'Michelada cereza', price: 10000, sortOrder: 3 },
    { name: 'Daiquiri', price: 12000, description: 'Cholupa, maracuyá, mora, fresa, mango-maracuyá, hierbabuena y mango', sortOrder: 4 },
    { name: 'Tentación Tropical', price: 16000, sortOrder: 5 },
    { name: 'Sangría', price: 12000, sortOrder: 6 },
    { name: 'Bandera martini', price: 14000, sortOrder: 7 },
    { name: 'Tequila sunrise', price: 12000, sortOrder: 8 },
    { name: 'Gin Tonic', price: 14000, description: 'Café, mango biche, cereza, cítricos, Jamaica y arándanos', sortOrder: 9 },
    { name: 'Mojito', price: 10000, description: 'Mango biche, cereza, cítricos, Jamaica, sandía y arándanos', sortOrder: 10 },
    { name: 'Coronita', price: 6000, sortOrder: 11 },
  ],
  'Contienen Dulce': [
    { name: 'Affogato', price: 6000, sortOrder: 1 },
    { name: 'Affogato Baileys', price: 10000, sortOrder: 2 },
    { name: 'Helado con brownie', price: 5000, sortOrder: 3 },
    { name: 'Torta del día', price: 5000, sortOrder: 4 },
    { name: 'Torta + helado', price: 7000, sortOrder: 5 },
    { name: 'Ensalada de frutas', price: 13000, description: 'Fruta de temporada, yogurt, granola, helado de vainilla, cono de galleta y queso', sortOrder: 6 },
  ],
  'Waffles': [
    { name: 'Waffle dulce tradición', price: 13000, description: 'Masa tradicional con fruta de temporada, helado, cono de galleta y salsa de chocolate', sortOrder: 1 },
    { name: 'Waffle pan de yuca', price: 15000, description: 'Acompañado con fruta de temporada, helado, cono de galleta y salsa de chocolate', sortOrder: 2 },
    { name: 'Waffle choclo sencillo', price: 8000, description: 'Acompañado de miel', sortOrder: 3 },
    { name: 'Waffle choclo', price: 11000, description: 'Acompañado de queso y caramelo', sortOrder: 4 },
  ],
  'Desayunos': [
    { name: 'Omelette pollo', price: 12000, description: 'Tortilla de huevo, pollo desmechado y queso. Acompañado de pan y fruta de temporada', sortOrder: 1 },
    { name: 'Omelette jamón y queso', price: 10000, description: 'Tortilla de huevo, jamón y queso. Acompañado de pan y fruta de temporada', sortOrder: 2 },
    { name: 'Huevos ropa vieja', price: 12000, description: 'Carne desmechada y maíz tierno, salsa criolla, coronilla de huevo frito. Acompañado de pan y fruta', sortOrder: 3 },
    { name: 'Huevos pericos', price: 8000, description: 'Huevos con cebolla y tomate, acompañado de pan y fruta de temporada', sortOrder: 4 },
    { name: 'Huevos paisa', price: 9000, description: 'Arepa de maíz, queso fundido y coronilla de huevo frito. Con salsa criolla y fruta de temporada', sortOrder: 5 },
    { name: 'Waffles Garden', price: 16000, description: 'Waffles de pan de yuca, queso fundido, coronilla de huevo frito, tocineta, salsa de maíz y fruta', sortOrder: 6 },
    { name: 'Waffles de la casa', price: 11000, description: 'Masa de waffle tradicional, coronilla de huevo frito, tocineta y miel', sortOrder: 7 },
    { name: 'Waffle campestre', price: 11000, description: 'Masa de choclo, coronilla de huevo frito, tocineta y miel', sortOrder: 8 },
    { name: 'Tazón de frutas', price: 9000, description: 'Fruta de temporada, yogurt griego y semillas de chía', sortOrder: 9 },
    { name: 'Parfait', price: 10000, description: 'Fruta de temporada, granola, kumis y semillas de chía', sortOrder: 10 },
  ],
  'Sandwich': [
    { name: 'Sandwich jamón + queso', price: 9000, description: 'Pan artesanal, lechuga, salsa, jamón y queso', sortOrder: 1 },
    { name: 'Sandwich hawaiano', price: 9000, description: 'Pan artesanal, lechuga, jamón, piña, salsa y queso', sortOrder: 2 },
    { name: 'Sandwich ropa vieja', price: 11000, description: 'Pan artesanal, lechuga, carne desmechada, maíz tierno, salsa criolla y queso', sortOrder: 3 },
    { name: 'Sandwich de pollo', price: 11000, description: 'Pan artesanal, lechuga, pollo desmechado, salsa, jamón y queso', sortOrder: 4 },
    { name: 'Sandwich cubano', price: 11000, description: 'Pan artesanal, lechuga, jamón, salchichón cervecero, salsa y queso', sortOrder: 5 },
    { name: 'Sandwich atún', price: 12500, description: 'Pan artesanal, lechuga, atún, salsa y queso', sortOrder: 6 },
    { name: 'Sandwich mixto', price: 14000, description: 'Pan artesanal, carne desmechada, maíz tierno, pollo desmechado, salsa criolla, jamón y queso', sortOrder: 7 },
  ],
}

async function main() {
  console.log(`\n🌱 Seeding Coffee Garden menu into schema: ${TENANT_SCHEMA}\n`)

  await withTenant(TENANT_SCHEMA, async (db) => {
    // Insert categories
    console.log('Creating categories...')
    const createdCats: Record<string, string> = {}

    for (const cat of CATEGORIES) {
      const existing = await db.select().from(categories)
      const found = existing.find((c) => c.name === cat.name)

      if (found) {
        console.log(`  skip  ${cat.emoji} ${cat.name}`)
        createdCats[cat.name] = found.id
        continue
      }

      const [inserted] = await db.insert(categories).values({
        name: cat.name,
        emoji: cat.emoji,
        sortOrder: cat.sortOrder,
        isActive: true,
      }).returning({ id: categories.id })

      createdCats[cat.name] = inserted.id
      console.log(`  ✓     ${cat.emoji} ${cat.name}`)
    }

    // Insert products
    console.log('\nCreating products...')
    let count = 0

    for (const [catName, prods] of Object.entries(PRODUCTS_BY_CATEGORY)) {
      const catId = createdCats[catName]
      if (!catId) {
        console.warn(`  WARNING: category "${catName}" not found, skipping`)
        continue
      }

      for (const prod of prods) {
        const existing = await db.select().from(products)
        const found = existing.find((p) => p.name === prod.name && p.categoryId === catId)

        if (found) {
          console.log(`  skip  ${prod.name}`)
          continue
        }

        await db.insert(products).values({
          categoryId: catId,
          name: prod.name,
          description: prod.description ?? null,
          price: String(prod.price),
          sortOrder: prod.sortOrder ?? 0,
          isAvailable: true,
        })
        count++
        console.log(`  ✓     ${prod.name} — $${prod.price.toLocaleString('es-CO')}`)
      }
    }

    console.log(`\n✅ Done! Created ${count} product(s).`)
  })

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
