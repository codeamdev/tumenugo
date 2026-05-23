import 'dotenv/config'
import postgres from 'postgres'

async function run() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

  for (const schema of ['tenant_coffee_garden', 'tenant_demo']) {
    const [row] = await sql`
      SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schema}
    `
    if (!row) {
      console.log(`${schema}: esquema no existe, omitido`)
      continue
    }
    // Delete in FK order
    const r1 = await sql.unsafe(`DELETE FROM "${schema}".order_items`)
    const r2 = await sql.unsafe(`DELETE FROM "${schema}".orders`)
    const r3 = await sql.unsafe(`DELETE FROM "${schema}".products`)
    const r4 = await sql.unsafe(`DELETE FROM "${schema}".categories`)
    console.log(`${schema}: ${r1.count} order_items, ${r2.count} pedidos, ${r3.count} productos, ${r4.count} categorías eliminados`)
  }

  console.log('\n✅ Seeds eliminados.')
  await sql.end()
}

run().catch((err) => { console.error(err); process.exit(1) })
