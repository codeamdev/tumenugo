import { describe, it, expect } from 'vitest'
import {
  round2,
  calcItemTotal,
  calcOrderTotals,
  calcChange,
  type CalcModifier,
} from './order-calc'

// ─── round2 ──────────────────────────────────────────────────────────────────

describe('round2', () => {
  it('rounds down to 2 decimal places', () => {
    expect(round2(1.004)).toBe(1)
    expect(round2(2.554)).toBe(2.55)
  })

  it('rounds up to 2 decimal places', () => {
    expect(round2(1.006)).toBe(1.01)
    expect(round2(2.556)).toBe(2.56)
    expect(round2(1.235)).toBe(1.24)
  })

  it('is identity for already-rounded values', () => {
    expect(round2(10)).toBe(10)
    expect(round2(0.50)).toBe(0.5)
    expect(round2(1234.56)).toBe(1234.56)
  })

  it('handles zero', () => {
    expect(round2(0)).toBe(0)
  })

  it('handles negative values', () => {
    // -1.005 stored as -1.00499... in IEEE 754 → rounds to -1
    expect(round2(-1.005)).toBe(-1)
    // Use values clearly above 0.5 to avoid the IEEE 754 .x05 / .x55 edge case
    expect(round2(-1.006)).toBe(-1.01)
    expect(round2(-2.556)).toBe(-2.56)
  })

  it('x.x05 edge case: stored as x.x0499... so rounds down (expected IEEE 754 behavior)', () => {
    // 1.005 → 1.00499... in memory → Math.round gives 100 → 1.00
    expect(round2(1.005)).toBe(1)
  })

  it('handles large COP prices (thousands) without loss of precision', () => {
    expect(round2(150000)).toBe(150000)
    expect(round2(99999.99)).toBe(99999.99)
  })
})

// ─── calcItemTotal ────────────────────────────────────────────────────────────

describe('calcItemTotal', () => {
  const baseItem = {
    id: 'test-id',
    productId: 'prod-1',
    productName: 'Café',
    unitPrice: 5000,
    quantity: 1,
    modifiers: [] as CalcModifier[],
    notes: '',
  }

  it('item sin modificadores: unitPrice * quantity', () => {
    expect(calcItemTotal(baseItem)).toBe(5000)
  })

  it('multiplica por cantidad', () => {
    expect(calcItemTotal({ ...baseItem, quantity: 3 })).toBe(15000)
  })

  it('quantity 0 devuelve 0', () => {
    expect(calcItemTotal({ ...baseItem, quantity: 0 })).toBe(0)
  })

  it('suma modificadores positivos al precio base', () => {
    const item = {
      ...baseItem,
      modifiers: [
        { groupName: 'Tamaño', modifierName: 'Grande', priceDelta: 1000 },
        { groupName: 'Extra', modifierName: 'Leche extra', priceDelta: 500 },
      ],
    }
    // (5000 + 1000 + 500) * 1 = 6500
    expect(calcItemTotal(item)).toBe(6500)
  })

  it('modificador negativo (descuento en ítem)', () => {
    const item = {
      ...baseItem,
      unitPrice: 10000,
      modifiers: [{ groupName: 'Desc', modifierName: 'Sin queso', priceDelta: -1000 }],
    }
    expect(calcItemTotal(item)).toBe(9000)
  })

  it('modificadores positivos y negativos combinados', () => {
    const item = {
      ...baseItem,
      unitPrice: 10000,
      modifiers: [
        { groupName: 'Tamaño', modifierName: 'Grande', priceDelta: 2000 },
        { groupName: 'Sin', modifierName: 'Sin azúcar', priceDelta: -500 },
      ],
    }
    // (10000 + 2000 - 500) * 1 = 11500
    expect(calcItemTotal(item)).toBe(11500)
  })

  it('(unitPrice + modificadores) * quantity', () => {
    const item = {
      ...baseItem,
      unitPrice: 10000,
      quantity: 2,
      modifiers: [{ groupName: 'Add', modifierName: 'Syrup', priceDelta: 2000 }],
    }
    // (10000 + 2000) * 2 = 24000
    expect(calcItemTotal(item)).toBe(24000)
  })

  it('precio unitario 0 (ítem gratis)', () => {
    expect(calcItemTotal({ ...baseItem, unitPrice: 0 })).toBe(0)
  })

  it('redondea correctamente precios decimales', () => {
    // 3.33 * 3 = 9.99 exacto en punto flotante
    const item = { ...baseItem, unitPrice: 3.33, quantity: 3 }
    expect(calcItemTotal(item)).toBe(9.99)
  })

  it('precios en COP realistas con varios modificadores y cantidad', () => {
    // Hamburguesa $18.000 + adición $2.500 + bebida $3.000, qty 2
    // (18000 + 2500 + 3000) * 2 = 47000
    const item = {
      ...baseItem,
      unitPrice: 18000,
      quantity: 2,
      modifiers: [
        { groupName: 'Adición', modifierName: 'Queso extra', priceDelta: 2500 },
        { groupName: 'Bebida', modifierName: 'Jugo natural', priceDelta: 3000 },
      ],
    }
    expect(calcItemTotal(item)).toBe(47000)
  })
})

// ─── calcOrderTotals — fixtures ───────────────────────────────────────────────

const P_NO_TAX = { id: 'p1', taxRateId: null,      taxRate: null, taxName: null      }
const P_IVA_19 = { id: 'p2', taxRateId: 'tax-iva', taxRate: 19,   taxName: 'IVA 19%' }
const P_INC_8  = { id: 'p3', taxRateId: 'tax-inc', taxRate: 8,    taxName: 'INC 8%'  }

function makeItem(
  productId: string,
  unitPrice: number,
  quantity = 1,
  modifiers: CalcModifier[] = [],
) {
  return { id: productId, productId, productName: '', unitPrice, quantity, modifiers, notes: '' }
}

// ─── calcOrderTotals — carrito vacío ─────────────────────────────────────────

describe('calcOrderTotals — carrito vacío', () => {
  it('devuelve todos los totales en cero', () => {
    const result = calcOrderTotals([], [])
    expect(result).toEqual({
      subtotal:    0,
      discount:    0,
      taxLines:    [],
      taxTotal:    0,
      tip:         0,
      deliveryFee: 0,
      total:       0,
    })
  })
})

// ─── calcOrderTotals — sin impuestos ─────────────────────────────────────────

describe('calcOrderTotals — sin impuestos', () => {
  it('subtotal y total sin impuesto, un ítem', () => {
    const result = calcOrderTotals([makeItem('p1', 10000, 2)], [P_NO_TAX])
    expect(result.subtotal).toBe(20000)
    expect(result.taxTotal).toBe(0)
    expect(result.taxLines).toHaveLength(0)
    expect(result.total).toBe(20000)
  })

  it('suma múltiples ítems sin impuesto', () => {
    const result = calcOrderTotals(
      [makeItem('p1', 5000, 1), makeItem('p1', 3000, 2)],
      [P_NO_TAX],
    )
    // 5000 + 6000 = 11000
    expect(result.subtotal).toBe(11000)
    expect(result.total).toBe(11000)
  })

  it('producto no encontrado en la lista de productos: sin impuesto', () => {
    const result = calcOrderTotals([makeItem('prod-inexistente', 8000)], [])
    expect(result.subtotal).toBe(8000)
    expect(result.taxTotal).toBe(0)
    expect(result.total).toBe(8000)
  })

  it('productId null (ítem personalizado): sin impuesto', () => {
    const customItem = {
      id: 'custom-1',
      productId: null,
      productName: 'Ítem personalizado',
      unitPrice: 12000,
      quantity: 1,
      modifiers: [] as CalcModifier[],
      notes: 'sin cebolla',
    }
    const result = calcOrderTotals([customItem], [P_IVA_19])
    expect(result.taxTotal).toBe(0)
    expect(result.taxLines).toHaveLength(0)
    expect(result.total).toBe(12000)
  })
})

// ─── calcOrderTotals — con un impuesto ───────────────────────────────────────

describe('calcOrderTotals — un impuesto', () => {
  it('aplica IVA 19% sobre el itemTotal', () => {
    const result = calcOrderTotals([makeItem('p2', 10000)], [P_IVA_19])
    expect(result.subtotal).toBe(10000)
    expect(result.taxTotal).toBe(1900)
    expect(result.taxLines).toHaveLength(1)
    expect(result.taxLines[0]).toMatchObject({
      taxRateId: 'tax-iva',
      name:      'IVA 19%',
      rate:      19,
      base:      10000,
      amount:    1900,
    })
    expect(result.total).toBe(11900)
  })

  it('aplica INC 8% correctamente', () => {
    const result = calcOrderTotals([makeItem('p3', 5000)], [P_INC_8])
    expect(result.subtotal).toBe(5000)
    expect(result.taxTotal).toBe(400)
    expect(result.taxLines[0]).toMatchObject({ rate: 8, base: 5000, amount: 400 })
    expect(result.total).toBe(5400)
  })

  it('agrupa varios ítems bajo el mismo taxRateId', () => {
    const result = calcOrderTotals(
      [makeItem('p2', 10000), makeItem('p2', 5000)],
      [P_IVA_19],
    )
    expect(result.taxLines).toHaveLength(1)
    expect(result.taxLines[0].base).toBe(15000)
    expect(result.taxLines[0].amount).toBe(2850)
    expect(result.total).toBe(17850)
  })

  it('mezcla ítems con y sin impuesto en el mismo pedido', () => {
    const result = calcOrderTotals(
      [makeItem('p1', 10000), makeItem('p2', 5000)],
      [P_NO_TAX, P_IVA_19],
    )
    expect(result.subtotal).toBe(15000)
    // Solo p2 tiene IVA: 5000 * 0.19 = 950
    expect(result.taxTotal).toBe(950)
    expect(result.taxLines).toHaveLength(1)
    expect(result.total).toBe(15950)
  })

  it('ignora producto con taxRate = 0 (exento)', () => {
    const P_EXENTO = { id: 'px', taxRateId: 'tax-z', taxRate: 0, taxName: 'Exento' }
    const result = calcOrderTotals([makeItem('px', 10000)], [P_EXENTO])
    expect(result.taxLines).toHaveLength(0)
    expect(result.taxTotal).toBe(0)
    expect(result.total).toBe(10000)
  })
})

// ─── calcOrderTotals — dos impuestos distintos ────────────────────────────────

describe('calcOrderTotals — dos impuestos distintos', () => {
  it('genera taxLines separados para IVA 19% e INC 8%', () => {
    const result = calcOrderTotals(
      [makeItem('p2', 10000), makeItem('p3', 5000)],
      [P_IVA_19, P_INC_8],
    )
    expect(result.taxLines).toHaveLength(2)
    // 10000 * 0.19 + 5000 * 0.08 = 1900 + 400 = 2300
    expect(result.taxTotal).toBe(2300)
    expect(result.subtotal).toBe(15000)
    expect(result.total).toBe(17300)
  })

  it('taxLines contiene los datos correctos de cada tasa', () => {
    const result = calcOrderTotals(
      [makeItem('p2', 10000), makeItem('p3', 5000)],
      [P_IVA_19, P_INC_8],
    )
    const ivaLine = result.taxLines.find((l) => l.taxRateId === 'tax-iva')
    const incLine = result.taxLines.find((l) => l.taxRateId === 'tax-inc')

    expect(ivaLine).toMatchObject({ rate: 19, base: 10000, amount: 1900 })
    expect(incLine).toMatchObject({ rate: 8,  base: 5000,  amount: 400  })
  })

  it('agrupa correctamente múltiples ítems de cada tasa', () => {
    // 2 ítems IVA: 10000 + 8000 = 18000 → tax 3420
    // 2 ítems INC: 5000  + 3000 = 8000  → tax 640
    const result = calcOrderTotals(
      [
        makeItem('p2', 10000),
        makeItem('p2', 8000),
        makeItem('p3', 5000),
        makeItem('p3', 3000),
      ],
      [P_IVA_19, P_INC_8],
    )
    expect(result.subtotal).toBe(26000)
    expect(result.taxTotal).toBe(round2(18000 * 0.19 + 8000 * 0.08))
    expect(result.taxTotal).toBe(4060)
    expect(result.total).toBe(30060)
  })
})

// ─── calcOrderTotals — modificadores en base imponible ───────────────────────

describe('calcOrderTotals — modificadores y base imponible', () => {
  it('incluye el priceDelta del modificador en la base del impuesto', () => {
    const items = [{
      id: 'item-1',
      productId: 'p2',
      productName: 'Hamburguesa',
      unitPrice: 10000,
      quantity: 1,
      modifiers: [{ groupName: 'Tamaño', modifierName: 'Grande', priceDelta: 2000 }],
      notes: '',
    }]
    const result = calcOrderTotals(items, [P_IVA_19])
    // itemTotal = 12000, tax = 12000 * 0.19 = 2280
    expect(result.subtotal).toBe(12000)
    expect(result.taxLines[0].base).toBe(12000)
    expect(result.taxTotal).toBe(2280)
    expect(result.total).toBe(14280)
  })

  it('modificador negativo reduce la base imponible', () => {
    const items = [{
      id: 'item-2',
      productId: 'p2',
      productName: 'Combo',
      unitPrice: 20000,
      quantity: 1,
      modifiers: [{ groupName: 'Sin', modifierName: 'Sin postre', priceDelta: -3000 }],
      notes: '',
    }]
    const result = calcOrderTotals(items, [P_IVA_19])
    // itemTotal = 17000, tax = 17000 * 0.19 = 3230
    expect(result.subtotal).toBe(17000)
    expect(result.taxLines[0].base).toBe(17000)
    expect(result.taxTotal).toBe(3230)
    expect(result.total).toBe(20230)
  })

  it('sin modificadores la base imponible es igual al unitPrice * quantity', () => {
    const result = calcOrderTotals([makeItem('p2', 5000, 2)], [P_IVA_19])
    expect(result.taxLines[0].base).toBe(10000)
    expect(result.taxTotal).toBe(1900)
  })
})

// ─── calcOrderTotals — opciones (descuento, propina, domicilio) ───────────────

describe('calcOrderTotals — descuento coupon', () => {
  it('aplica descuento sobre el total', () => {
    const result = calcOrderTotals([makeItem('p1', 10000)], [P_NO_TAX], { couponDiscount: 2000 })
    expect(result.discount).toBe(2000)
    expect(result.total).toBe(8000)
  })

  it('discount = 0 cuando no se pasa couponDiscount', () => {
    const result = calcOrderTotals([makeItem('p1', 10000)], [P_NO_TAX])
    expect(result.discount).toBe(0)
  })
})

describe('calcOrderTotals — propina porcentual', () => {
  it('aplica propina 10% sobre el subtotal', () => {
    const result = calcOrderTotals([makeItem('p1', 10000)], [P_NO_TAX], { tipPercent: 10 })
    expect(result.tip).toBe(1000)
    expect(result.total).toBe(11000)
  })

  it('aplica propina 8% (porcentaje no estándar)', () => {
    const result = calcOrderTotals([makeItem('p1', 50000)], [P_NO_TAX], { tipPercent: 8 })
    expect(result.tip).toBe(4000)
    expect(result.total).toBe(54000)
  })

  it('propina se calcula sobre subtotal, no sobre total con impuesto', () => {
    // subtotal=10000, tax=1900, tip=10% of subtotal=1000
    const result = calcOrderTotals([makeItem('p2', 10000)], [P_IVA_19], { tipPercent: 10 })
    expect(result.tip).toBe(1000)
    expect(result.total).toBe(12900) // 10000 + 1900 + 1000
  })

  it('tip = 0 cuando no se pasa tipPercent', () => {
    const result = calcOrderTotals([makeItem('p1', 10000)], [P_NO_TAX])
    expect(result.tip).toBe(0)
  })
})

describe('calcOrderTotals — delivery fee', () => {
  it('suma delivery fee al total', () => {
    const result = calcOrderTotals([makeItem('p1', 10000)], [P_NO_TAX], { deliveryFee: 5000 })
    expect(result.deliveryFee).toBe(5000)
    expect(result.total).toBe(15000)
  })

  it('deliveryFee = 0 cuando no se pasa', () => {
    const result = calcOrderTotals([makeItem('p1', 10000)], [P_NO_TAX])
    expect(result.deliveryFee).toBe(0)
  })
})

describe('calcOrderTotals — combinación de todas las opciones', () => {
  it('IVA + propina + domicilio + descuento', () => {
    // subtotal=10000, tax=1900, tip=5% of 10000=500, delivery=3000, discount=1000
    // total = 10000 + 1900 + 500 + 3000 - 1000 = 14400
    const result = calcOrderTotals(
      [makeItem('p2', 10000)],
      [P_IVA_19],
      { tipPercent: 5, deliveryFee: 3000, couponDiscount: 1000 },
    )
    expect(result.subtotal).toBe(10000)
    expect(result.taxTotal).toBe(1900)
    expect(result.tip).toBe(500)
    expect(result.deliveryFee).toBe(3000)
    expect(result.discount).toBe(1000)
    expect(result.total).toBe(14400)
  })

  it('dos tasas + propina + domicilio + descuento', () => {
    // subtotal = 10000 + 5000 = 15000
    // IVA = 1900, INC = 400, taxTotal = 2300
    // tip = 5% of 15000 = 750
    // delivery = 2000, discount = 500
    // total = 15000 + 2300 + 750 + 2000 - 500 = 19550
    const result = calcOrderTotals(
      [makeItem('p2', 10000), makeItem('p3', 5000)],
      [P_IVA_19, P_INC_8],
      { tipPercent: 5, deliveryFee: 2000, couponDiscount: 500 },
    )
    expect(result.subtotal).toBe(15000)
    expect(result.taxTotal).toBe(2300)
    expect(result.tip).toBe(750)
    expect(result.deliveryFee).toBe(2000)
    expect(result.discount).toBe(500)
    expect(result.total).toBe(19550)
  })
})

// ─── calcOrderTotals — redondeo y punto flotante ──────────────────────────────

describe('calcOrderTotals — redondeo y punto flotante', () => {
  it('subtotal y total redondeados a 2 decimales', () => {
    // 3 * 3.33 = 9.99
    const result = calcOrderTotals([makeItem('p1', 3.33, 3)], [P_NO_TAX])
    expect(result.subtotal).toBe(9.99)
    expect(result.total).toBe(9.99)
    expect(Number.isInteger(result.subtotal * 100)).toBe(true)
    expect(Number.isInteger(result.total * 100)).toBe(true)
  })

  it('taxLines.amount redondeado a 2 decimales', () => {
    // base = 100/3 ≈ 33.33, amount = 33.33 * 0.19 ≈ 6.33
    const result = calcOrderTotals([makeItem('p2', 100 / 3)], [P_IVA_19])
    const amount = result.taxLines[0].amount
    expect(amount).toBe(round2(amount))
    expect(Number.isInteger(amount * 100)).toBe(true)
  })

  it('acumular múltiples ítems no produce error de punto flotante en subtotal', () => {
    // 3.33 + 3.33 + 3.34 = 10.00
    const result = calcOrderTotals(
      [makeItem('p1', 3.33, 1), makeItem('p1', 3.33, 1), makeItem('p1', 3.34, 1)],
      [P_NO_TAX],
    )
    expect(result.subtotal).toBe(10)
    expect(result.total).toBe(10)
  })

  it('total es múltiplo exacto de centavo', () => {
    const result = calcOrderTotals(
      [makeItem('p2', 33333)],
      [P_IVA_19],
      { tipPercent: 10, deliveryFee: 5000, couponDiscount: 1500 },
    )
    expect(Number.isInteger(result.total * 100)).toBe(true)
  })
})

// ─── calcChange ──────────────────────────────────────────────────────────────

describe('calcChange', () => {
  it('cambio positivo cuando se paga de más', () => {
    expect(calcChange(20000, 15000)).toBe(5000)
  })

  it('cambio cero cuando se paga el valor exacto', () => {
    expect(calcChange(10000, 10000)).toBe(0)
  })

  it('cambio negativo cuando el pago es insuficiente', () => {
    expect(calcChange(5000, 10000)).toBe(-5000)
  })

  it('maneja montos con decimales (centavos)', () => {
    expect(calcChange(100.50, 99.99)).toBe(0.51)
  })

  it('redondea a 2 decimales', () => {
    expect(calcChange(10.005, 5)).toBe(5.01)
  })

  it('pagando con billete COP de $50.000, total $38.500', () => {
    expect(calcChange(50000, 38500)).toBe(11500)
  })

  it('pagando con billete COP de $100.000, total $94.300', () => {
    expect(calcChange(100000, 94300)).toBe(5700)
  })
})
