import 'dotenv/config'
import postgres from 'postgres'

async function run() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  const cats = await sql`SELECT name, emoji FROM tenant_coffee_garden.categories ORDER BY sort_order`
  const prods = await sql`SELECT count(*)::int as total FROM tenant_coffee_garden.products`
  console.log(`\nCategorías (${cats.length}):`)
  cats.forEach((c: any) => console.log(`  ${c.emoji}  ${c.name}`))
  console.log(`\nTotal productos: ${prods[0].total}`)
  await sql.end()
}

run().catch(console.error)
