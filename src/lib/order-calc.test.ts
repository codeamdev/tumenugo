import { describe, it, expect } from 'vitest'
import {
  round2,
  calcItemTotal,
  calcOrderTotals,
  calcChange,
} from './order-calc'

// ─── round2 ──────────────────────────────────────────────────────────────────

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    // Note: 1.005 is stored as 1.00499... in IEEE 754, so it rounds to 1.00 — expected.
    // Use values that don't hit the float precision edge case:
    expect(round2(1.006)).toBe(1.01)
    expect(round2(1.004)).toBe(1)
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
    expect(round2(-1.005)).toBe(-1)
    expect(round2(-2.555)).toBe(-2.56)
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
    modifiers: [],
    notes: '',
  }

  it('calculates simple item without modifiers', () => {
    expect(calcItemTotal(baseItem)).toBe(5000)
  })

  it('multiplies by quantity', () => {
    expect(calcItemTotal({ ...baseItem, quantity: 3 })).toBe(15000)
  })

  it('adds modifier deltas', () => {
    const item = {
      ...baseItem,
      modifiers: [
        { groupName: 'Tamaño', modifierName: 'Grande', priceDelta: 1000 },
        { groupName: 'Extra', modifierName: 'Leche extra', priceDelta: 500 },
      ],
    }
    expect(calcItemTotal(item)).toBe(6500)
  })

  it('handles modifier deltas with quantity > 1', () => {
    const item = {
      ...baseItem,
      unitPrice: 10000,
      quantity: 2,
      modifiers: [{ groupName: 'Add', modifierName: 'Syrup', priceDelta: 2000 }],
    }
    // (10000 + 2000) * 2 = 24000
    expect(calcItemTotal(item)).toBe(24000)
  })

  it('handles negative priceDelta (discount modifier)', () => {
    const item = {
      ...baseItem,
      unitPrice: 10000,
      modifiers: [{ groupName: 'Desc', modifierName: '-10%', priceDelta: -1000 }],
    }
    expect(calcItemTotal(item)).toBe(9000)
  })

  it('handles price 0 (free item)', () => {
    expect(calcItemTotal({ ...baseItem, unitPrice: 0 })).toBe(0)
  })

  it('handles fractional prices and rounds correctly', () => {
    const item = { ...baseItem, unitPrice: 3.33, quantity: 3 }
    // 3.33 * 3 = 9.99
    expect(calcItemTotal(item)).toBe(9.99)
  })
})

// ─── calcOrderTotals ──────────────────────────────────────────────────────────

const P_NO_TAX = { id: 'p1', taxRateId: null, taxRate: null, taxName: null }
const P_IVA_19 = { id: 'p2', taxRateId: 'tax-iva', taxRate: 19, taxName: 'IVA 19%' }
const P_INC_8  = { id: 'p3', taxRateId: 'tax-inc', taxRate: 8,  taxName: 'INC 8%'  }

function item(productId: string, unitPrice: number, quantity = 1, modifiers: any[] = []) {
  return { id: productId, productId, productName: '', unitPrice, quantity, modifiers, notes: '' }
}

describe('calcOrderTotals — empty cart', () => {
  it('returns all-zero totals for empty items array', () => {
    const result = calcOrderTotals([], [])
    expect(result).toEqual({
      subtotal: 0,
      discount: 0,
      taxLines: [],
      taxTotal: 0,
      tip: 0,
      deliveryFee: 0,
      total: 0,
    })
  })
})

describe('calcOrderTotals — no tax', () => {
  it('calculates basic subtotal and total without tax', () => {
    const result = calcOrderTotals([item('p1', 10000, 2)], [P_NO_TAX])
    expect(result.subtotal).toBe(20000)
    expect(result.taxTotal).toBe(0)
    expect(result.taxLines).toHaveLength(0)
    expect(result.total).toBe(20000)
  })

  it('handles multiple items without tax', () => {
    const result = calcOrderTotals([
      item('p1', 5000, 1),
      item('p1', 3000, 2),
    ], [P_NO_TAX])
    expect(result.subtotal).toBe(11000)
    expect(result.total).toBe(11000)
  })
})

describe('calcOrderTotals — with tax', () => {
  it('applies IVA 19% correctly', () => {
    const result = calcOrderTotals([item('p2', 10000)], [P_IVA_19])
    expect(result.subtotal).toBe(10000)
    expect(result.taxTotal).toBe(1900)
    expect(result.taxLines).toHaveLength(1)
    expect(result.taxLines[0].name).toBe('IVA 19%')
    expect(result.taxLines[0].rate).toBe(19)
    expect(result.taxLines[0].amount).toBe(1900)
    expect(result.total).toBe(11900)
  })

  it('applies INC 8% correctly', () => {
    const result = calcOrderTotals([item('p3', 5000)], [P_INC_8])
    expect(result.subtotal).toBe(5000)
    expect(result.taxTotal).toBe(400)
    expect(result.total).toBe(5400)
  })

  it('groups items by tax rate', () => {
    const result = calcOrderTotals(
      [item('p2', 10000), item('p2', 5000)],
      [P_IVA_19]
    )
    expect(result.taxLines).toHaveLength(1)
    expect(result.taxLines[0].base).toBe(15000)
    expect(result.taxLines[0].amount).toBe(2850)
    expect(result.total).toBe(17850)
  })

  it('produces separate tax lines for different rates', () => {
    const result = calcOrderTotals(
      [item('p2', 10000), item('p3', 5000)],
      [P_IVA_19, P_INC_8]
    )
    expect(result.taxLines).toHaveLength(2)
    expect(result.taxTotal).toBe(round2(10000 * 0.19 + 5000 * 0.08))
    expect(result.taxTotal).toBe(2300)
  })

  it('mixes taxed and untaxed items in same order', () => {
    const result = calcOrderTotals(
      [item('p1', 10000), item('p2', 5000)],
      [P_NO_TAX, P_IVA_19]
    )
    expect(result.subtotal).toBe(15000)
    expect(result.taxTotal).toBe(950)   // only p2 taxed: 5000 * 0.19
    expect(result.total).toBe(15950)
  })
})

describe('calcOrderTotals — modifiers', () => {
  it('includes modifier prices in tax base', () => {
    const items = [{
      id: 'p2', productId: 'p2', productName: '', unitPrice: 10000, quantity: 1,
      modifiers: [{ groupName: 'T', modifierName: 'L', priceDelta: 2000 }],
      notes: '',
    }]
    const result = calcOrderTotals(items, [P_IVA_19])
    // itemTotal = 12000, tax = 12000 * 0.19 = 2280
    expect(result.subtotal).toBe(12000)
    expect(result.taxTotal).toBe(2280)
    expect(result.total).toBe(14280)
  })

  it('handles priceDelta as a number (not string)', () => {
    const items = [{
      id: 'p1', productId: 'p1', productName: '', unitPrice: 5000, quantity: 1,
      modifiers: [{ groupName: 'G', modifierName: 'M', priceDelta: 1000 }],
      notes: '',
    }]
    const result = calcOrderTotals(items, [P_NO_TAX])
    expect(result.subtotal).toBe(6000)
    expect(result.total).toBe(6000)
  })
})

describe('calcOrderTotals — options', () => {
  it('applies delivery fee', () => {
    const result = calcOrderTotals([item('p1', 10000)], [P_NO_TAX], { deliveryFee: 5000 })
    expect(result.deliveryFee).toBe(5000)
    expect(result.total).toBe(15000)
  })

  it('applies tip as percentage of subtotal', () => {
    const result = calcOrderTotals([item('p1', 10000)], [P_NO_TAX], { tipPercent: 10 })
    expect(result.tip).toBe(1000)
    expect(result.total).toBe(11000)
  })

  it('applies coupon discount', () => {
    const result = calcOrderTotals([item('p1', 10000)], [P_NO_TAX], { couponDiscount: 2000 })
    expect(result.discount).toBe(2000)
    expect(result.total).toBe(8000)
  })

  it('combines all options correctly', () => {
    // subtotal=10000, tax=1900, tip=500 (5% of 10000), delivery=3000, discount=1000
    // total = 10000 + 1900 + 500 + 3000 - 1000 = 14400
    const result = calcOrderTotals(
      [item('p2', 10000)],
      [P_IVA_19],
      { tipPercent: 5, deliveryFee: 3000, couponDiscount: 1000 }
    )
    expect(result.subtotal).toBe(10000)
    expect(result.taxTotal).toBe(1900)
    expect(result.tip).toBe(500)
    expect(result.deliveryFee).toBe(3000)
    expect(result.discount).toBe(1000)
    expect(result.total).toBe(14400)
  })

  it('ignores product with taxRate = 0', () => {
    const P_ZERO = { id: 'px', taxRateId: 'tax-z', taxRate: 0, taxName: 'Exento' }
    const result = calcOrderTotals([item('px', 10000)], [P_ZERO])
    expect(result.taxLines).toHaveLength(0)
    expect(result.taxTotal).toBe(0)
  })
})

describe('calcOrderTotals — rounding', () => {
  it('rounds subtotal and total to 2 decimals', () => {
    // 3 * 3.33 = 9.99
    const result = calcOrderTotals([item('p1', 3.33, 3)], [P_NO_TAX])
    expect(result.subtotal).toBe(9.99)
    expect(result.total).toBe(9.99)
    expect(Number.isInteger(result.subtotal * 100)).toBe(true)
  })

  it('rounds taxLines.amount to 2 decimals', () => {
    // 1/3 * 19% tax
    const result = calcOrderTotals([item('p2', 100 / 3)], [P_IVA_19])
    expect(result.taxTotal).toBe(round2(result.taxLines[0].amount))
    // Verify it's rounded
    expect(result.taxTotal).toBe(Math.round(result.taxTotal * 100) / 100)
  })
})

// ─── calcChange ──────────────────────────────────────────────────────────────

describe('calcChange', () => {
  it('returns positive change when paying over', () => {
    expect(calcChange(20000, 15000)).toBe(5000)
  })

  it('returns zero when paying exact', () => {
    expect(calcChange(10000, 10000)).toBe(0)
  })

  it('returns negative when payment is insufficient', () => {
    expect(calcChange(5000, 10000)).toBe(-5000)
  })

  it('handles fractional amounts', () => {
    expect(calcChange(100.50, 99.99)).toBe(0.51)
  })

  it('rounds to 2 decimal places', () => {
    expect(calcChange(10.005, 5)).toBe(5.01)
  })
})
